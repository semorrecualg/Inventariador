
import React, { useState, useMemo, useEffect } from 'react';
import { Asset, TagInventario, TransactionOrigin, AuditLogEntry, DatabaseMode } from '../types';
import BackButton from './BackButton';
import { formatDateBR, formatCurrency } from '../utils/formatUtils';
import { QR_FIELD_ORDER } from '../utils/qrUtils';
import { updateAssetInProtheus } from '../services/protheusService';

import { 
  Edit2, 
  ShieldCheck, 
  Check, 
  MapPin, 
  Building2, 
  FileText, 
  User, 
  Hash, 
  Calendar, 
  AlertCircle, 
  AlertTriangle,
  Lock,
  Info,
  Briefcase,
  Wallet,
  QrCode,
  Loader2,
  Camera,
  X,
  ChevronRight,
  ArrowDown,
  Image as ImageIcon,
  Trash2,
  History
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { deleteAssetPhoto } from '../services/supabaseService';
import { compressImage } from '../utils/imageUtils';
import { addToSyncQueue } from '../services/syncService';
import { saveLocalPhoto, deleteLocalPhoto, getLocalPhoto } from '../services/photoService';
import { createWorker } from 'tesseract.js';

import { reverseGeocode } from '../services/geocodingService';
import { determineAssetTag, getTagMetadata } from '../services/tagService';

const formatReadingTime = (isoStr?: string) => {
  if (!isoStr) return '';
  const date = new Date(isoStr);
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
};

interface AssetDetailProps {
  assets: Asset[];
  onBack: () => void;
  onUpdate: (asset: Asset) => void;
  onDelete?: (id: string) => void;
  onUnitize?: (parentAsset: Asset, numberOfUnits: number, percentages?: number[]) => void;
  onBulkUpdate: (ids: string[], updates?: Partial<Asset>) => void;
  editableFields: string[];
  uniqueEnderecos: string[];
  uniqueCentrosDeCusto: string[];
  qrCodeFields: string[];
  readOnly?: boolean;
  protheusIntegrationEnabled?: boolean;
  protheusApiUrl?: string;
  tenantid?: string;
  mandatoryPhotoOnDivergence?: boolean;
  mandatoryPhotoOnNewItem?: boolean;
  databaseMode: DatabaseMode;
}

const AssetDetail: React.FC<AssetDetailProps> = ({ 
  assets, 
  onBack, 
  onUpdate, 
  onDelete,
  onUnitize,
  onBulkUpdate, 
  editableFields, 
  uniqueEnderecos, 
  uniqueCentrosDeCusto, 
  qrCodeFields, 
  readOnly = false,
  protheusIntegrationEnabled = false,
  protheusApiUrl = '',
  tenantid = '',
  mandatoryPhotoOnDivergence = false,
  mandatoryPhotoOnNewItem = false,
  databaseMode
}) => {
  const isBatch = assets.length > 1;
  const [workingAsset, setWorkingAsset] = useState<Asset>({ ...assets[0] });
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [isSyncingProtheus, setIsSyncingProtheus] = useState(false);
  const [protheusSyncResult, setProtheusSyncResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [isOCRProcessing, setIsOCRProcessing] = useState(false);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [ocrResults, setOcrResults] = useState<string[]>([]);
  const ocrInputRef = React.useRef<HTMLInputElement>(null);
  const [ocrTargetField, setOcrTargetField] = useState<string | null>(null);
  const [isImpairmentModalOpen, setIsImpairmentModalOpen] = useState(false);
  const [isUnitizeModalOpen, setIsUnitizeModalOpen] = useState(false);
  const [unitizeCount, setUnitizeCount] = useState(2);
  const [unitizeMethod, setUnitizeMethod] = useState<'EQUAL' | 'PERCENT'>('EQUAL');
  const [unitizePercentages, setUnitizePercentages] = useState<number[]>([50, 50]);
  const [impairmentData, setImpairmentData] = useState({
    valorJusto: workingAsset._valor_justo || 0,
    valorEmUso: workingAsset._valor_em_uso || 0
  });

  useEffect(() => {
    if (unitizeMethod === 'PERCENT') {
      const currentLen = unitizePercentages.length;
      if (currentLen !== unitizeCount) {
        const newPercentages = [...unitizePercentages];
        if (unitizeCount > currentLen) {
          for (let i = 0; i < unitizeCount - currentLen; i++) {
            newPercentages.push(0);
          }
        } else {
          newPercentages.splice(unitizeCount);
        }
        setUnitizePercentages(newPercentages);
      }
    }
  }, [unitizeCount, unitizeMethod, unitizePercentages.length]);

  const handleOCR = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !ocrTargetField) return;

    setIsOCRProcessing(true);
    setOcrResults([]);
    try {
      // Usar português e inglês para melhor reconhecimento de caracteres
      const worker = await createWorker('por+eng');
      const { data: { text } } = await worker.recognize(file);
      await worker.terminate();

      // 1. Limpeza e Normalização
      const cleanedText = text.replace(/[\n\r]/g, ' ').trim().toUpperCase();
      
      // 2. Extração Inteligente com Regex (Filtro de Ruído)
      const patterns = {
        plaqueta: /\b\d{6}\b/g, // Padrão GBR: 6 dígitos numéricos
        serial: /\b[A-Z0-9-]{6,20}\b/g, // Alfanumérico longo para Seriais
        geral: /\b[A-Z0-9]{4,}\b/g // Qualquer termo com 4+ caracteres (ignora ruídos pequenos)
      };

      const foundMatches: string[] = [];
      
      // Prioridade por contexto do campo alvo
      if (ocrTargetField === 'ETIQUETA') {
        const plaquetaMatches = cleanedText.match(patterns.plaqueta);
        if (plaquetaMatches) foundMatches.push(...plaquetaMatches);
      } else if (ocrTargetField === 'SERIAL') {
        const serialMatches = cleanedText.match(patterns.serial);
        if (serialMatches) foundMatches.push(...serialMatches);
      }

      // Adicionar matches genéricos se não houver específicos ou para dar opções
      const genericMatches = cleanedText.match(patterns.geral);
      if (genericMatches) {
        // Filtrar matches genéricos que já estão na lista ou que parecem ruído excessivo
        genericMatches.forEach(m => {
          if (!foundMatches.includes(m) && m.length < 25) {
            foundMatches.push(m);
          }
        });
      }

      const uniqueMatches = Array.from(new Set(foundMatches));

      if (uniqueMatches.length === 1) {
        // Único resultado: Aplicar direto (Preenchimento Automático)
        const result = uniqueMatches[0];
        const updates = { ...workingAsset };
        updates[ocrTargetField] = result;
        setWorkingAsset(updates);
        if (editingField === ocrTargetField) setEditValue(result);
        setOcrTargetField(null);
      } else if (uniqueMatches.length > 1) {
        // Múltiplos resultados: Abrir interface de escolha
        setOcrResults(uniqueMatches);
      } else {
        // Nenhum padrão: Usar o texto bruto limpo
        const updates = { ...workingAsset };
        updates[ocrTargetField] = cleanedText.substring(0, 50);
        setWorkingAsset(updates);
        if (editingField === ocrTargetField) setEditValue(cleanedText.substring(0, 50));
        setOcrTargetField(null);
      }
    } catch (err) {
      console.error('Erro no OCR:', err);
    } finally {
      setIsOCRProcessing(false);
      if (ocrInputRef.current) ocrInputRef.current.value = '';
    }
  };

  const selectOCRResult = (val: string) => {
    if (!ocrTargetField) return;
    const updates = { ...workingAsset };
    updates[ocrTargetField] = val;
    setWorkingAsset(updates);
    if (editingField === ocrTargetField) setEditValue(val);
    setOcrResults([]);
    setOcrTargetField(null);
  };

  const triggerOCR = (field: string) => {
    setOcrTargetField(field);
    ocrInputRef.current?.click();
  };

  const handleReverseGeocoding = async (field: string) => {
    if (!navigator.geolocation) {
      alert('Geolocalização não suportada pelo seu navegador.');
      return;
    }

    setIsGeocoding(true);
    
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const { latitude, longitude } = position.coords;
          const result = await reverseGeocode(latitude, longitude);
          
          const updates = { ...workingAsset };
          updates[field] = result.address;
          setWorkingAsset(updates);
          
          if (editingField === field) {
            setEditValue(result.address);
          }
          
          // Feedback visual de sucesso (opcional, mas bom para UX)
          console.log('Endereço capturado:', result.address);
        } catch (err) {
          console.error('Erro ao obter endereço:', err);
          alert('Não foi possível obter o endereço automaticamente. Verifique sua conexão.');
        } finally {
          setIsGeocoding(false);
        }
      },
      (err) => {
        console.error('Erro de GPS:', err);
        setIsGeocoding(false);
        alert('Erro ao acessar GPS: ' + err.message);
      },
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 }
    );
  };


  useEffect(() => { setWorkingAsset({ ...assets[0] }); }, [assets]);

  useEffect(() => {
    if (editingField) {
      setTimeout(() => {
        const activeInput = document.activeElement;
        if (activeInput) {
          activeInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);
    }
  }, [editingField]);

  const qrCodeData = useMemo(() => {
    // Criar uma string de texto apenas com os valores dos campos selecionados seguindo a ordem oficial
    const lines: string[] = [];
    
    // Filtra os campos selecionados que existem no ativo e os ordena conforme a regra
    const activeFields = QR_FIELD_ORDER.filter(field => 
      qrCodeFields.includes(field) && 
      workingAsset[field] !== undefined && 
      workingAsset[field] !== null && 
      workingAsset[field] !== ''
    );

    activeFields.forEach(field => {
      let value = String(workingAsset[field]);
      
      // Formatações básicas
      if (field === 'DATAAQUISIC' || field === 'DATABAIXA') value = formatDateBR(value);
      if (field === 'VLRAQUISIC') value = formatCurrency(value);
      
      lines.push(value);
    });

    return lines.join('\n');
  }, [workingAsset, qrCodeFields]);

  const fieldGroups = [
    {
      title: 'IDENTIFICAÇÃO TÉCNICA',
      fields: [
        { key: 'ETIQUETA', label: 'PLAQUETA PATRIMONIAL', icon: FileText },
        { key: 'DESCRICAODOATIVO', label: 'DESCRIÇÃO DO BEM', icon: Info },
        { key: 'QT', label: 'QUANTIDADE', icon: Hash },
        { key: 'SERIAL', label: 'NÚMERO DE SÉRIE', icon: Hash },
        { key: 'REGISTRO', label: 'REGISTRO MESTRE', icon: Hash },
        { key: 'SUBREG', label: 'SUB-REGISTRO', icon: Hash },
        { key: 'PRIMARYKEY', label: 'CHAVE PRIMÁRIA (PK)', icon: Lock }
      ]
    },
    {
      title: 'LOCALIZAÇÃO E CUSTO',
      fields: [
        { key: 'GRUPO_EMPRESARIAL', label: 'GRUPO EMPRESARIAL', icon: Building2 },
        { key: 'UNIDADE_OPERACIONAL', label: 'UNIDADE OPERACIONAL', icon: Building2 },
        { key: 'ENDERECO', label: 'ENDEREÇO FÍSICO', icon: MapPin },
        { key: 'CENTRODECUSTO', label: 'CENTRO DE CUSTO', icon: Briefcase }
      ]
    },
    {
      title: 'DADOS DE AQUISIÇÃO',
      fields: [
        { key: 'VLRAQUISIC', label: 'VALOR DE AQUISIÇÃO', icon: Wallet },
        { key: 'DATAAQUISIC', label: 'DATA DE AQUISIÇÃO', icon: Calendar },
        { key: 'NOTAFISCAL', label: 'NOTA FISCAL (NF)', icon: FileText },
        { key: 'NOMEFORNECEDOR', label: 'FORNECEDOR', icon: User },
        { key: 'CNPJ', label: 'CNPJ FORNECEDOR', icon: Building2 }
      ]
    },
    {
      title: 'CONTROLE CONTÁBIL',
      fields: [
        { key: 'STATUS', label: 'STATUS OPERACIONAL', icon: ShieldCheck },
        { key: 'CONTACONTABIL', label: 'CONTA CONTÁBIL', icon: Briefcase },
        { key: 'DATABAIXA', label: 'DATA DE BAIXA', icon: Calendar },
        { key: 'Sn1_recno', label: 'ID PROTHEUS (SN1)', icon: Hash },
        { key: 'Sn3_recno', label: 'ID PROTHEUS (SN3)', icon: Hash }
      ]
    },
    {
      title: 'DADOS DO INVENTÁRIO',
      fields: [
        { key: '_dataLeitura', label: 'DATA/HORA DO INVENTÁRIO', icon: Calendar },
        { key: '_auditor', label: 'AUDITOR RESPONSÁVEL', icon: User },
        { key: '_localMaster', label: 'LOCAL ONDE FOI ENCONTRADO', icon: MapPin }
      ]
    },
    {
      title: 'GEOLOCALIZAÇÃO',
      fields: [
        { key: '_lat', label: 'LATITUDE', icon: MapPin },
        { key: '_lng', label: 'LONGITUDE', icon: MapPin }
      ]
    }
  ];

  const suggestions = useMemo(() => {
    if (editingField === 'ENDERECO') {
      return uniqueEnderecos.filter(e => e.includes(editValue.toUpperCase())).slice(0, 15);
    }
    if (editingField === 'CENTRODECUSTO') {
      return uniqueCentrosDeCusto.filter(e => e.includes(editValue.toUpperCase())).slice(0, 15);
    }
    return [];
  }, [editingField, editValue, uniqueEnderecos, uniqueCentrosDeCusto]);

  const applyFieldEdit = (val?: string) => {
    if (editingField) {
      const updates: Asset = { ...workingAsset };
      const newValue = (val || editValue).toUpperCase().trim();
      updates[editingField] = newValue;
      setWorkingAsset(updates);
      setEditingField(null);
    }
  };

  const handleFinalize = () => {
    const finalAsset = { ...workingAsset };
    
    // Se o usuário está editando um campo e clicou direto em SALVAR, aplicamos o valor atual
    if (editingField) {
      const newValue = editValue.toUpperCase().trim();
      finalAsset[editingField] = newValue;
    }

    // Validação de foto obrigatória
    const tag = finalAsset.TAG_INVENTARIO;
    const isDivergence = tag === TagInventario.DIVERGENCIA;
    const isNew = tag === TagInventario.NOVO_ITEM;

    if (mandatoryPhotoOnDivergence && isDivergence && !finalAsset._photoUrl) {
      alert('Foto obrigatória para itens com divergência!');
      return;
    }

    if (mandatoryPhotoOnNewItem && isNew && !finalAsset._photoUrl) {
      alert('Foto obrigatória para novos itens!');
      return;
    }

    if (isBatch) {
      // Para lote, se houve alteração em algum campo no finalAsset, aplicamos a todos os itens do lote.
      const manualUpdates: Partial<Asset> = {};
      const original = assets[0];
      
      Object.keys(finalAsset).forEach(key => {
        if (key.startsWith('_') || key === 'id' || key === 'TAG_INVENTARIO') return;
        if (String(finalAsset[key]) !== String(original[key])) {
          (manualUpdates as Record<string, unknown>)[key] = finalAsset[key];
        }
      });

      onBulkUpdate(assets.map(a => String(a.id)), manualUpdates);
    } else {
      onUpdate({ ...finalAsset, _conferido: true });
    }
    onBack();
  };

  const handleDelete = () => {
    if (window.confirm('Deseja realmente excluir este ativo? (Exclusão lógica para auditoria)')) {
      if (onDelete) onDelete(String(workingAsset.id));
    }
  };

  useEffect(() => {
    const loadLocalPhotoIfNeeded = async () => {
      if (!workingAsset._photoUrl) {
        const localBlob = await getLocalPhoto(String(workingAsset.id));
        if (localBlob) {
          const localUrl = URL.createObjectURL(localBlob);
          setWorkingAsset(prev => ({ ...prev, _photoUrl: localUrl }));
        }
      }
    };
    loadLocalPhotoIfNeeded();
  }, [workingAsset.id]);

  const handleProtheusSync = async () => {
    if (!protheusApiUrl || isBatch) return;
    
    setIsSyncingProtheus(true);
    setProtheusSyncResult(null);
    
    try {
      const result = await updateAssetInProtheus(workingAsset, protheusApiUrl);
      setProtheusSyncResult(result);
      
      if (result.success) {
        // Opcional: Atualizar o status local se necessário
        // onUpdate({ ...workingAsset, _protheusSynced: true });
      }
    } catch {
      setProtheusSyncResult({
        success: false,
        message: 'Erro inesperado na comunicação com Protheus.'
      });
    } finally {
      setIsSyncingProtheus(false);
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || isBatch) return;

    setIsUploadingPhoto(true);
    try {
      // Se já existe uma foto, vamos deletar a antiga do storage para economizar espaço
      // Mas apenas se não for uma URL local (blob:)
      if (workingAsset._photoUrl && !workingAsset._photoUrl.startsWith('blob:')) {
        await deleteAssetPhoto(workingAsset._photoUrl);
      }

      // Comprime a imagem antes de subir (Perfil WhatsApp: ~1600px e ~200KB)
      const compressedBlob = await compressImage(file);
      
      // Salva localmente para persistência offline e modo INTERNO
      await saveLocalPhoto(String(workingAsset.id), compressedBlob as Blob);
      
      // Cria URL local para visualização imediata
      const localUrl = URL.createObjectURL(compressedBlob);
      
      // Adiciona à fila de sincronização offline (se não for modo INTERNO)
      if (databaseMode !== DatabaseMode.INTERNAL) {
        await addToSyncQueue(String(workingAsset.id), compressedBlob as Blob, tenantid || '');
      }

      // Atualiza o estado local imediatamente com a URL do blob
      const updated = { ...workingAsset, _photoUrl: localUrl };
      setWorkingAsset(updated);
      onUpdate(updated);
      
    } catch (err) {
      console.error('Erro ao processar foto:', err);
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const removePhoto = async () => {
    if (workingAsset._photoUrl) {
      await deleteAssetPhoto(workingAsset._photoUrl);
      await deleteLocalPhoto(String(workingAsset.id));
    }
    const updated = { ...workingAsset, _photoUrl: undefined };
    setWorkingAsset(updated);
    onUpdate(updated);
  };

  const visualStatus = useMemo(() => {
    return determineAssetTag(workingAsset, workingAsset._localMaster || workingAsset.ENDERECO || "", tenantid);
  }, [workingAsset, tenantid]);

  const meta = getTagMetadata(visualStatus);
  const StatusIcon = meta.icon;
  const headerBg = meta.color.bg.replace('/30', '');

  const calculateImpairment = () => {
    // Fidedignidade: Garantir que o valor contábil seja calculado corretamente (CPC 27 / CPC 01)
    const vlrAquisicao = Number(workingAsset._valor_aquisicao || 0) || 
                         parseFloat(String(workingAsset.VLRAQUISIC || '0').replace(',', '.'));
    const vlrDepreciacao = Number(workingAsset._depreciacao_acumulada || 0);
    const valorContabil = vlrAquisicao - vlrDepreciacao;
    
    const valorRecuperavel = Math.max(Number(impairmentData.valorJusto), Number(impairmentData.valorEmUso));
    const perda = valorContabil > valorRecuperavel ? valorContabil - valorRecuperavel : 0;

    const timestamp = new Date().toISOString();
    
    const auditEntry: AuditLogEntry = {
      action: 'IMPAIRMENT_TEST',
      details: `Teste de Impairment (CPC 01): Vlr Contábil ${formatCurrency(valorContabil)} | Vlr Recuperável ${formatCurrency(valorRecuperavel)} | Perda ${formatCurrency(perda)}`,
      timestamp,
      user: workingAsset._auditor || 'AUDITOR',
      origin: TransactionOrigin.IMPAIRMENT_AUTOMATION
    };

    const updated: Asset = {
      ...workingAsset,
      _valor_justo: Number(impairmentData.valorJusto),
      _valor_em_uso: Number(impairmentData.valorEmUso),
      _valor_recuperavel: valorRecuperavel,
      _perda_impairment: perda,
      _data_impairment: timestamp,
      _history: [...(workingAsset._history || []), auditEntry],
      _origemTransacao: TransactionOrigin.IMPAIRMENT_AUTOMATION
    };

    setWorkingAsset(updated);
    onUpdate(updated);
    setIsImpairmentModalOpen(false);
  };

  return (
    <div className="flex flex-col h-full bg-bg-main animate-fadeIn overflow-hidden">
      {/* KARDEX HEADER */}
      <div className={`px-5 pt-8 pb-6 ${headerBg} text-white relative shadow-md z-20`}>
        <div className="flex items-center justify-between mb-6">
          <BackButton onClick={onBack} label="Voltar" subLabel="Detalhes do Ativo" />
          <div className="flex items-center space-x-3">
            <button onClick={() => setIsQrModalOpen(true)} className="p-3.5 bg-white/10 border border-white/20 rounded-xl active:scale-90 transition-all backdrop-blur-md hover:bg-white/20">
              <QrCode size={22} />
            </button>
            <div className="bg-white/10 px-5 py-2.5 rounded-xl border border-white/20 backdrop-blur-md flex items-center space-x-2">
              {readOnly && <Lock size={14} className="text-white/70" />}
              <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/90">
                {readOnly ? 'MODO CONSULTA' : (isBatch ? 'LOTE' : 'KARDEK v24.50')}
              </span>
            </div>
          </div>
        </div>
        
        <div className="flex flex-col">
          <div className="flex items-center space-x-2 mb-3">
            <div className="bg-white/20 px-3 py-1 rounded-full border border-white/30 backdrop-blur-sm flex items-center space-x-2">
              <StatusIcon size={12} className="text-white" />
              <span className="text-[10px] font-black uppercase tracking-widest text-white">{visualStatus}</span>
            </div>
            {isBaixado && (
              <div className="bg-red-500 px-3 py-1 rounded-full border border-red-400 flex items-center space-x-2 shadow-lg">
                <AlertTriangle size={12} className="text-white" />
                <span className="text-[10px] font-black uppercase tracking-widest text-white">BAIXADO</span>
              </div>
            )}
          </div>

          <h2 className="text-xl font-bold uppercase tracking-tight leading-tight mb-6 text-white line-clamp-2">
            {isBatch ? `LOTE PATRIMONIAL: ${workingAsset.ETIQUETA}` : (workingAsset.DESCRICAODOATIVO || 'ITEM SEM DESCRIÇÃO')}
          </h2>

          {!isBatch && (
            <div className="flex items-center space-x-4 mb-4">
              <div className="relative group">
                <div className="w-24 h-24 bg-white/20 rounded-2xl border border-white/30 backdrop-blur-md overflow-hidden flex items-center justify-center shadow-lg">
                  {workingAsset._photoUrl ? (
                    <img 
                      src={workingAsset._photoUrl} 
                      alt="Ativo" 
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <ImageIcon size={32} className="text-white/40" />
                  )}
                  {isUploadingPhoto && (
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                      <Loader2 size={24} className="text-white animate-spin" />
                    </div>
                  )}
                </div>
                {!readOnly && (
                  <div className="absolute -bottom-2 -right-2 flex space-x-1">
                    <label className="w-8 h-8 bg-white text-slate-900 rounded-lg flex items-center justify-center shadow-lg cursor-pointer active:scale-90 transition-all">
                      <Camera size={16} />
                      <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhotoUpload} />
                    </label>
                    {workingAsset._photoUrl && (
                      <button onClick={removePhoto} className="w-8 h-8 bg-red-500 text-white rounded-lg flex items-center justify-center shadow-lg active:scale-90 transition-all">
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                )}
              </div>
              <div className="flex-1">
                <p className="text-[10px] font-bold text-white/70 uppercase tracking-widest mb-1">Evidência Fotográfica</p>
                <p className="text-[11px] text-white/90 leading-tight">
                  {workingAsset._photoUrl 
                    ? 'Foto registrada com sucesso. Clique para ampliar ou alterar.' 
                    : 'Nenhuma foto registrada para este ativo. Capture uma agora para auditoria.'}
                </p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-black/20 border border-white/10 p-3 rounded-xl backdrop-blur-xl shadow-inner">
              <p className="text-[8px] font-bold text-white/50 uppercase tracking-[0.2em] mb-2">PLAQUETA</p>
              <p className="text-2xl font-bold font-mono tracking-tighter text-white">{workingAsset.ETIQUETA || 'S/ ETQ'}</p>
            </div>
            <div className="bg-black/20 border border-white/10 p-3 rounded-xl backdrop-blur-xl shadow-inner flex flex-col justify-center">
              <p className="text-[8px] font-bold text-white/50 uppercase tracking-[0.2em] mb-2">SITUAÇÃO / TAG</p>
              <div className="flex items-center space-x-2">
                <StatusIcon size={14} className="text-white" />
                <span className="text-[10px] font-black uppercase text-white tracking-widest">
                  {meta.label}
                </span>
              </div>
            </div>
          </div>

          {(workingAsset._localMaster && workingAsset._localMaster !== workingAsset.ENDERECO) && (
            <div className="bg-white/10 border border-white/20 rounded-2xl p-4 backdrop-blur-md mb-2">
              <div className="flex items-center justify-between mb-3 border-b border-white/10 pb-2">
                <span className="text-[10px] font-black text-white uppercase tracking-[0.2em]">Fluxo de Adoção</span>
                <MapPin size={14} className="text-white/60" />
              </div>
              <div className="space-y-3">
                <div className="flex flex-col">
                  <span className="text-[8px] font-bold text-white/50 uppercase tracking-widest">Local de Origem (Base)</span>
                  <span className="text-xs font-bold text-white uppercase mt-0.5">{workingAsset.ENDERECO || 'NÃO INFORMADO'}</span>
                </div>
                <div className="flex flex-col">
                  <div className="flex items-center space-x-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                    <span className="text-[8px] font-bold text-blue-300 uppercase tracking-widest">Novo Local (Inventariado)</span>
                  </div>
                  <span className="text-xs font-black text-white uppercase mt-1 bg-white/10 px-2 py-1.5 rounded-lg border border-white/10">{workingAsset._localMaster}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* REGRA DE OURO: ALERTA DE DIVERGÊNCIA CRÍTICA */}
      {workingAsset._is_divergent_baixa && (
        <div className="bg-red-600 p-4 flex items-center space-x-4 animate-pulse shadow-lg z-10">
          <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center text-white shrink-0">
            <AlertTriangle size={24} strokeWidth={2.5} />
          </div>
          <div className="flex-1">
            <h4 className="text-[11px] font-black text-white uppercase tracking-widest">Divergência Crítica (Regra de Ouro)</h4>
            <p className="text-[9px] font-bold text-white/80 uppercase tracking-tight leading-tight mt-0.5">
              Este item está marcado como <strong className="text-white underline">ATIVO</strong> na base, porém possui <strong className="text-white underline">DATA DE BAIXA</strong> preenchida ({workingAsset.DATABAIXA}).
            </p>
          </div>
        </div>
      )}

      {/* KARDEX BODY */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar pb-[60vh] bg-bg-main">
          {/* SITUAÇÃO DO ATIVO (REGRA DE OURO) */}
          {(isAdopted || workingAsset._is_divergent_baixa || isConferido) && (
            <div className="bg-white border border-border rounded-2xl p-5 shadow-sm space-y-4 animate-slideIn">
              <div className="flex items-center justify-between mb-1">
                <h4 className="text-[10px] font-black text-ink-muted uppercase tracking-[0.2em] flex items-center">
                  <ShieldCheck size={14} className="mr-2 text-accent" /> Situação da Auditoria
                </h4>
                <div className={`px-3 py-1 rounded-lg border ${meta.color.bg} ${meta.color.border}`}>
                  <span className={`text-[10px] font-black uppercase tracking-tight ${meta.color.text}`}>{visualStatus}</span>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3">
                {/* LOCAL DE ORIGEM VS NOVO LOCAL */}
                <div className={`p-4 rounded-2xl border ${isAdopted ? 'bg-blue-50 border-blue-100' : 'bg-slate-50 border-slate-200'}`}>
                  <div className="flex flex-col space-y-3">
                    <div className="flex items-start">
                      <div className="w-8 h-8 rounded-xl bg-slate-200 flex items-center justify-center mr-3 shrink-0">
                        <MapPin size={14} className="text-slate-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[8px] font-bold text-slate-500 uppercase tracking-widest mb-0.5">Local de Origem (Base)</p>
                        <p className="text-xs font-black text-slate-700 uppercase leading-snug break-words">
                          {workingAsset.ENDERECO || 'LOCAL NÃO INFORMADO NA BASE'}
                        </p>
                      </div>
                    </div>

                    {isAdopted && (
                      <div className="flex items-center justify-center h-4 relative">
                        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 border-t border-dashed border-blue-300" />
                        <div className="bg-blue-50 px-2 relative z-10">
                          <ArrowDown size={12} className="text-blue-500 animate-bounce" />
                        </div>
                      </div>
                    )}

                    {(isAdopted || isConferido) && (
                      <div className="flex items-start">
                        <div className="w-8 h-8 rounded-xl bg-blue-500 text-white flex items-center justify-center mr-3 shrink-0 shadow-lg shadow-blue-500/20">
                          <MapPin size={14} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[8px] font-bold text-blue-500 uppercase tracking-widest mb-0.5">Novo Local (Inventariado)</p>
                          <p className="text-xs font-black text-blue-900 uppercase leading-snug break-words">
                            {workingAsset._localMaster || workingAsset.ENDERECO}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* DIVERGÊNCIA DE BAIXA */}
                {workingAsset._is_divergent_baixa && !isAdopted && (
                  <div className="p-4 bg-red-50 border border-red-100 rounded-2xl flex items-center space-x-3">
                    <AlertTriangle className="text-red-500 shrink-0" size={20} />
                    <div>
                      <p className="text-[9px] font-black text-red-600 uppercase tracking-widest">Divergência Crítica</p>
                      <p className="text-[11px] font-bold text-red-900 leading-tight">ATIVO com DATA DE BAIXA ({workingAsset.DATABAIXA})</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          <input 
            type="file" 
            accept="image/*" 
            capture="environment" 
            className="hidden" 
            ref={ocrInputRef} 
            onChange={handleOCR} 
          />
          
          {isOCRProcessing && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex flex-col items-center justify-center p-8 text-center">
              <div className="w-20 h-20 bg-white rounded-3xl flex items-center justify-center mb-6 shadow-2xl animate-pulse">
                <Loader2 size={40} className="text-accent animate-spin" />
              </div>
              <h3 className="text-xl font-bold text-white uppercase tracking-tight mb-2">Processando OCR</h3>
              <p className="text-sm text-white/70 max-w-xs uppercase font-bold tracking-widest">
                Aguarde enquanto nossa IA extrai o texto da imagem...
              </p>
            </div>
          )}

          {ocrResults.length > 0 && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-6">
              <div className="bg-white w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden animate-slideUp">
                <div className="bg-bg-main p-4 border-b border-border flex items-center justify-between">
                  <h3 className="text-xs font-bold text-ink uppercase tracking-widest">Resultados Detectados</h3>
                  <button onClick={() => setOcrResults([])} className="p-1 text-ink-muted"><X size={18} /></button>
                </div>
                <div className="p-4 space-y-2 max-h-[60vh] overflow-y-auto no-scrollbar">
                  <p className="text-[10px] text-ink-muted uppercase font-bold mb-3 tracking-tight">Toque no valor correto para o campo {ocrTargetField === 'ETIQUETA' ? 'PLAQUETA' : 'SERIAL'}:</p>
                  {ocrResults.map((res, i) => (
                    <button 
                      key={i}
                      onClick={() => selectOCRResult(res)}
                      className="w-full p-4 bg-bg-main border border-border rounded-xl text-left flex items-center justify-between active:scale-95 transition-all hover:border-accent group"
                    >
                      <span className="text-sm font-bold font-mono text-ink group-hover:text-accent">{res}</span>
                      <ChevronRight size={16} className="text-ink-muted group-hover:text-accent" />
                    </button>
                  ))}
                </div>
                <div className="p-4 bg-bg-main border-t border-border">
                  <button onClick={() => setOcrResults([])} className="w-full py-3 text-[10px] font-bold text-ink-muted uppercase tracking-widest">Cancelar</button>
                </div>
              </div>
            </div>
          )}

          {isBatch && (
            <div className="bg-white border border-border rounded-xl p-4 shadow-sm modern-card">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[9px] font-bold text-ink-muted uppercase tracking-[0.1em] flex items-center">
                  <AlertCircle size={12} className="mr-1.5 text-warning" /> REGISTROS NO LOTE
                </p>
                <span className="text-[9px] font-bold text-warning bg-warning/10 border border-warning/20 px-2 py-0.5 rounded-full">{assets.length} ITENS</span>
              </div>
              <div className="space-y-2 max-h-40 overflow-y-auto no-scrollbar pr-1">
                {assets.map((a, idx) => (
                  <div key={a.id} className="bg-bg-main border border-border p-3 rounded-lg flex items-center justify-between shadow-sm">
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-bold text-ink truncate uppercase tracking-tight">{a.DESCRICAODOATIVO}</p>
                      <p className="text-[7px] font-bold text-ink-muted uppercase tracking-[0.1em] mt-0.5">REG: {a.REGISTRO} | SUB: {a.SUBREG}</p>
                    </div>
                    <span className="text-[9px] font-bold text-ink-muted/30 font-mono ml-2">#{String(idx + 1).padStart(2, '0')}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {fieldGroups.map((group) => (
            <div key={group.title} className="bg-white border border-border rounded-xl overflow-hidden shadow-sm modern-card">
              <div className="bg-bg-main px-4 py-2 border-b border-border">
                <span className="text-[9px] font-bold text-ink-muted uppercase tracking-[0.2em]">{group.title}</span>
              </div>
              
              <div className="divide-y divide-border">
                {group.fields.map(({ key, label, icon: Icon }) => {
                  const isDateField = key === 'DATAAQUISIC' || key === 'DATABAIXA';
                  const isDateTime = key === '_dataLeitura';
                  const isCurrency = key === 'VLRAQUISIC' || key.startsWith('_valor') || key.includes('perda');
                  const rawVal = workingAsset[key];
                  let displayVal = String(rawVal || '---');
                  if (isDateField) displayVal = formatDateBR(rawVal as string | number | undefined);
                  if (isDateTime) displayVal = formatReadingTime(rawVal as string);
                  if (isCurrency) displayVal = formatCurrency(rawVal as string | number | undefined);

                  const canEdit = !readOnly && editableFields.includes(key);
                  if (!rawVal && (key === 'DATABAIXA' || key === '_dataLeitura' || key === '_auditor')) return null;

                  return (
                    <div 
                      key={key} 
                      onClick={(e) => { e.stopPropagation(); if (canEdit) { setEditingField(key); setEditValue(String(rawVal || '')); } }} 
                      className={`px-4 py-3 flex flex-col transition-all active:bg-bg-main ${editingField === key ? 'bg-accent-soft ring-1 ring-inset ring-accent' : ''}`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center space-x-1.5">
                          {Icon && <Icon size={10} className="text-ink-muted/30" />}
                          <label className="text-[7px] font-bold uppercase tracking-[0.1em] text-ink-muted">{label}</label>
                        </div>
                        {canEdit && <Edit2 size={10} className="text-accent" />}
                      </div>
                      
                      {editingField === key ? (
                        <div className="mt-2 flex flex-col space-y-2">
                          {workingAsset._valoresOriginais?.[key] !== undefined && (
                            <p className="text-[8px] text-danger font-bold uppercase tracking-wider px-1">
                              ORIGINAL (DE): {isDateField ? formatDateBR(workingAsset._valoresOriginais[key] as string) : isCurrency ? formatCurrency(workingAsset._valoresOriginais[key] as string) : String(workingAsset._valoresOriginais[key] || '---')}
                            </p>
                          )}
                          <div className="flex items-center space-x-2">
                            <input 
                              autoFocus 
                              value={editValue} 
                              onChange={(e) => setEditValue(e.target.value)} 
                              onKeyDown={(e) => e.key === 'Enter' && applyFieldEdit()} 
                              className="flex-1 bg-white px-3 py-2 border border-accent/30 rounded-lg text-xs font-bold uppercase text-ink outline-none shadow-sm focus:ring-2 focus:ring-accent/20" 
                              placeholder={`NOVO VALOR (PARA) ${label}`}
                            />
                            {(key === 'SERIAL' || key === 'ETIQUETA') && (
                              <button 
                                onClick={(e) => { e.stopPropagation(); triggerOCR(key); }}
                                className="w-10 h-10 bg-bg-main border border-line text-ink-muted rounded-lg flex items-center justify-center shadow-sm active:scale-95 transition-all hover:text-accent hover:border-accent/30"
                                title="Ler texto da câmera (OCR)"
                              >
                                <Camera size={18} />
                              </button>
                            )}
                            {(key === 'ENDERECO' || key === '_localMaster') && (
                              <button 
                                onClick={(e) => { e.stopPropagation(); handleReverseGeocoding(key); }}
                                disabled={isGeocoding}
                                className="w-10 h-10 bg-bg-main border border-line text-ink-muted rounded-lg flex items-center justify-center shadow-sm active:scale-95 transition-all hover:text-accent hover:border-accent/30 disabled:opacity-50"
                                title="Capturar endereço via GPS"
                              >
                                {isGeocoding ? <Loader2 size={18} className="animate-spin" /> : <MapPin size={18} />}
                              </button>
                            )}
                            <button onClick={() => applyFieldEdit()} className="w-10 h-10 bg-accent text-white rounded-lg flex items-center justify-center shadow-md active:scale-95 transition-all">
                              <Check size={20}/>
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col">
                          {key === 'ENDERECO' && workingAsset.DE_PARA === 'COM ALTERAÇÃO' ? (
                            <>
                              <p className="text-xs font-bold uppercase leading-tight font-mono tracking-tight text-accent">
                                PARA: {workingAsset._localMaster || '---'}
                              </p>
                              <p className="text-[8px] text-danger font-bold uppercase mt-1 tracking-wider">
                                DE: {workingAsset.ENDERECO || '---'}
                              </p>
                            </>
                          ) : (
                            <>
                              <p className={`text-xs font-bold uppercase leading-tight font-mono tracking-tight ${rawVal ? 'text-ink' : 'text-ink-muted/30'}`}>
                                {workingAsset._valoresOriginais?.[key] !== undefined ? `PARA: ${displayVal}` : displayVal}
                              </p>
                              {workingAsset._valoresOriginais?.[key] !== undefined && (
                               <p className="text-[8px] text-danger font-bold uppercase mt-1 tracking-wider">
                                  DE: {isDateField ? formatDateBR(workingAsset._valoresOriginais[key] as string) : isCurrency ? formatCurrency(workingAsset._valoresOriginais[key] as string) : String(workingAsset._valoresOriginais[key] || '---')}
                                </p>
                              )}
                            </>
                          )}
                        </div>
                      )}
                      
                      {editingField === key && suggestions.length > 0 && (
                        <div className="mt-3 p-3 bg-bg-main border border-border rounded-2xl shadow-inner">
                          <div className="flex items-center justify-between mb-2 px-1">
                            <p className="text-[7px] font-bold text-ink-muted uppercase tracking-[0.2em]">Sugestões Disponíveis</p>
                            <span className="text-[7px] font-bold text-accent uppercase">{suggestions.length} encontrados</span>
                          </div>
                          <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto no-scrollbar py-1">
                            {suggestions.map(s => (
                              <button 
                                key={s} 
                                onClick={(e) => { e.stopPropagation(); applyFieldEdit(s); }} 
                                className="px-3 py-1.5 rounded-xl bg-white border border-border text-[10px] font-bold text-ink uppercase active:bg-accent active:text-white active:border-accent transition-all shadow-sm hover:border-accent"
                              >
                                {s}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {/* TESTE DE IMPAIRMENT (CPC 01) */}
          <div className="bg-white border border-border rounded-xl overflow-hidden shadow-sm modern-card">
            <div className="bg-bg-main px-4 py-2 border-b border-border flex items-center justify-between">
              <span className="text-[9px] font-bold text-ink-muted uppercase tracking-[0.2em]">TESTE DE IMPAIRMENT (CPC 01)</span>
              <button 
                onClick={() => setIsImpairmentModalOpen(true)}
                className="text-[8px] font-bold text-accent uppercase tracking-widest bg-accent-soft px-2 py-1 rounded-md border border-accent/10"
              >
                Executar Teste
              </button>
            </div>
            <div className="p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="p-2 rounded-lg bg-slate-50 border border-slate-100">
                  <p className="text-[7px] font-bold text-slate-400 uppercase tracking-widest mb-1">Valor Recuperável</p>
                  <p className="text-xs font-bold text-slate-900">{formatCurrency(workingAsset._valor_recuperavel || 0)}</p>
                </div>
                <div className={`p-2 rounded-lg border ${Number(workingAsset._perda_impairment || 0) > 0 ? 'bg-red-50 border-red-100 text-red-700' : 'bg-emerald-50 border-emerald-100 text-emerald-700'}`}>
                  <p className="text-[7px] font-bold uppercase tracking-widest mb-1 opacity-70">Perda Estimada</p>
                  <p className="text-xs font-bold">{formatCurrency(workingAsset._perda_impairment || 0)}</p>
                </div>
              </div>
              {workingAsset._data_impairment && (
                <p className="text-[7px] font-bold text-slate-400 uppercase tracking-widest text-right italic">
                  Último teste: {new Date(workingAsset._data_impairment).toLocaleDateString('pt-BR')}
                </p>
              )}
            </div>
          </div>
      </div>
      
      {/* AUDIT HISTORY SECTION */}
      {workingAsset._history && workingAsset._history.length > 0 && (
        <div className="mt-6 mb-32 px-4">
          <div className="flex items-center space-x-2 mb-4">
            <div className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center">
              <History size={16} className="text-accent" />
            </div>
            <h3 className="text-[11px] font-black text-ink uppercase tracking-[0.2em]">Histórico de Auditoria</h3>
          </div>
          
          <div className="space-y-3">
            {workingAsset._history.slice().reverse().map((entry, index) => (
              <div key={index} className="relative pl-6 border-l-2 border-border pb-4 last:pb-0">
                <div className="absolute left-[-9px] top-0 w-4 h-4 rounded-full bg-white border-2 border-accent flex items-center justify-center">
                   <div className="w-1.5 h-1.5 rounded-full bg-accent" />
                </div>
                <div className="bg-white border border-border rounded-xl p-3 shadow-sm">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[8px] font-bold text-accent uppercase tracking-wider">{entry.action}</span>
                    <span className="text-[7px] font-medium text-ink-muted">{new Date(entry.timestamp).toLocaleString('pt-BR')}</span>
                  </div>
                  <p className="text-[10px] font-bold text-ink mb-1">{entry.details}</p>
                  <div className="flex items-center space-x-1">
                    <User size={8} className="text-ink-muted" />
                    <span className="text-[7px] font-bold text-ink-muted uppercase tracking-tighter">AUDITOR: {entry.user}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* KARDEX FOOTER */}
      {!readOnly && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-border flex flex-col space-y-3 z-30 shadow-[0_-4px_20px_rgba(0,0,0,0.05)]">
          {protheusIntegrationEnabled && !isBatch && (
            <div className="flex flex-col space-y-2">
              {protheusSyncResult && (
                <div className={`p-3 rounded-xl text-[10px] font-bold uppercase tracking-tight flex items-center space-x-2 animate-fadeIn ${protheusSyncResult.success ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-rose-50 text-rose-700 border border-rose-100'}`}>
                  {protheusSyncResult.success ? <Check size={14} /> : <AlertCircle size={14} />}
                  <span>{protheusSyncResult.message}</span>
                </div>
              )}
              <button 
                onClick={handleProtheusSync}
                disabled={isSyncingProtheus}
                className={`w-full py-4 rounded-2xl text-[11px] font-black uppercase flex items-center justify-center space-x-3 transition-all tracking-[0.2em] border-b-4 border-indigo-700/20 bg-indigo-600 text-white shadow-lg active:scale-95 disabled:opacity-50 disabled:active:scale-100`}
              >
                {isSyncingProtheus ? (
                  <Loader2 size={20} className="animate-spin" />
                ) : (
                  <ShieldCheck size={20} strokeWidth={3} />
                )}
                <span>{isSyncingProtheus ? 'SINCRONIZANDO...' : 'SINCRONIZAR PROTHEUS'}</span>
              </button>
            </div>
          )}

          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-[7px] font-bold text-ink-muted uppercase tracking-[0.3em]">AUDIT AUTHORITY</span>
              <span className="text-[9px] font-bold text-ink uppercase tracking-[0.1em] mt-0.5">v24.50 KARDEK</span>
            </div>
            <div className="flex items-center space-x-2">
              {!isBatch && onUnitize && (
                <button 
                  onClick={() => setIsUnitizeModalOpen(true)}
                  className="p-4 bg-amber-50 text-amber-600 border border-amber-100 rounded-2xl active:scale-95 transition-all"
                  title="Unitarizar Ativo (Desmembrar)"
                >
                  <Briefcase size={20} />
                </button>
              )}
              {!isBatch && onDelete && (
                <button 
                  onClick={handleDelete}
                  className="p-4 bg-rose-50 text-rose-600 border border-rose-100 rounded-2xl active:scale-95 transition-all"
                  title="Excluir Ativo"
                >
                  <Trash2 size={20} />
                </button>
              )}
              <button 
                onClick={handleFinalize} 
                className={`text-white px-8 py-4 rounded-2xl text-[11px] font-black uppercase shadow-2xl active:scale-95 flex items-center space-x-3 transition-all tracking-[0.2em] border-b-4 border-black/20 ${meta.color.bg.replace('/30', '')}`}
              >
                 <Check size={20} strokeWidth={3} />
                 <span>{isBatch ? 'EFETIVAR LOTE' : 'SALVAR E CONFERIR'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {isQrModalOpen && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-8 bg-slate-950/80 backdrop-blur-md animate-fadeIn" onClick={() => setIsQrModalOpen(false)}>
          <div className="bg-white w-full max-w-sm rounded-[3rem] border border-border shadow-2xl p-10 flex flex-col items-center text-center modern-card" onClick={(e) => e.stopPropagation()}>
            <p className="text-xl font-bold text-ink uppercase tracking-tight font-mono mb-6">{workingAsset.UNIDADE_OPERACIONAL || workingAsset._unitid}</p>
            <div className="bg-white p-6 border-2 border-ink rounded-3xl shadow-inner mb-8">
              <QRCodeSVG 
                value={qrCodeData} 
                size={280} 
                level="M"
                includeMargin={true}
              />
            </div>
            <div className="text-center w-full">
              <p className="text-[10px] font-bold text-ink-muted uppercase tracking-[0.3em] mb-3">NÚMERO DO ATIVO</p>
              <p className="bg-ink text-white w-full py-5 rounded-2xl text-3xl font-bold uppercase tracking-tighter font-mono shadow-xl">{workingAsset.ETIQUETA}</p>
            </div>
            <button onClick={() => setIsQrModalOpen(false)} className="mt-10 w-full py-5 bg-bg-main text-ink rounded-2xl font-bold uppercase text-[11px] tracking-[0.2em] active:scale-95 transition-all">Fechar</button>
          </div>
        </div>
      )}

      {isImpairmentModalOpen && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-6 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
          <div className="bg-white w-full max-w-sm rounded-3xl border border-border shadow-2xl p-6 flex flex-col space-y-6">
            <div className="text-center">
              <h3 className="text-lg font-bold text-ink uppercase tracking-tight">Teste de Impairment</h3>
              <p className="text-[9px] font-bold text-ink-muted uppercase tracking-widest mt-1">CPC 01 / IAS 36</p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-[8px] font-bold text-ink-muted uppercase tracking-widest mb-1.5 ml-1">Valor Justo Líquido de Despesa de Venda</label>
                <input 
                  type="number"
                  value={impairmentData.valorJusto}
                  onChange={(e) => setImpairmentData(prev => ({ ...prev, valorJusto: Number(e.target.value) }))}
                  className="w-full px-4 py-3 bg-bg-main border border-border rounded-xl text-xs font-bold outline-none focus:border-accent transition-all"
                  placeholder="0,00"
                />
              </div>
              <div>
                <label className="block text-[8px] font-bold text-ink-muted uppercase tracking-widest mb-1.5 ml-1">Valor em Uso (Fluxo de Caixa Descontado)</label>
                <input 
                  type="number"
                  value={impairmentData.valorEmUso}
                  onChange={(e) => setImpairmentData(prev => ({ ...prev, valorEmUso: Number(e.target.value) }))}
                  className="w-full px-4 py-3 bg-bg-main border border-border rounded-xl text-xs font-bold outline-none focus:border-accent transition-all"
                  placeholder="0,00"
                />
              </div>
            </div>

            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-3">
              <div className="flex justify-between text-[10px] font-bold text-slate-500 uppercase">
                <span>Valor Contábil Líquido:</span>
                <span>{formatCurrency(
                  (Number(workingAsset._valor_aquisicao || 0) || parseFloat(String(workingAsset.VLRAQUISIC || '0').replace(',', '.'))) - 
                  Number(workingAsset._depreciacao_acumulada || 0)
                )}</span>
              </div>
              <div className="flex justify-between text-[10px] font-bold text-accent uppercase">
                <span>Valor Recuperável Estimado:</span>
                <span>{formatCurrency(Math.max(Number(impairmentData.valorJusto), Number(impairmentData.valorEmUso)))}</span>
              </div>
              <div className="pt-2 border-t border-dashed border-slate-200 flex justify-between items-center">
                <span className="text-[10px] font-bold text-slate-700 uppercase">Perda Estimada:</span>
                <span className={`text-sm font-black ${
                  ((Number(workingAsset._valor_aquisicao || 0) || parseFloat(String(workingAsset.VLRAQUISIC || '0').replace(',', '.'))) - Number(workingAsset._depreciacao_acumulada || 0)) > 
                  Math.max(Number(impairmentData.valorJusto), Number(impairmentData.valorEmUso))
                  ? 'text-red-600' : 'text-emerald-600'
                }`}>
                  {formatCurrency(Math.max(0, 
                    ((Number(workingAsset._valor_aquisicao || 0) || parseFloat(String(workingAsset.VLRAQUISIC || '0').replace(',', '.'))) - Number(workingAsset._depreciacao_acumulada || 0)) - 
                    Math.max(Number(impairmentData.valorJusto), Number(impairmentData.valorEmUso))
                  ))}
                </span>
              </div>
            </div>

            <div className="flex space-x-3">
              <button 
                onClick={() => setIsImpairmentModalOpen(false)}
                className="flex-1 py-4 bg-bg-main text-ink rounded-2xl font-bold uppercase text-[10px] tracking-widest active:scale-95 transition-all"
              >
                Cancelar
              </button>
              <button 
                onClick={calculateImpairment}
                className="flex-1 py-4 bg-accent text-white rounded-2xl font-bold uppercase text-[10px] tracking-widest shadow-lg shadow-accent/20 active:scale-95 transition-all"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {isUnitizeModalOpen && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-6 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
          <div className="bg-white w-full max-w-sm rounded-3xl border border-border shadow-2xl p-6 flex flex-col space-y-6 max-h-[90vh] overflow-y-auto">
            <div className="text-center">
              <h3 className="text-lg font-bold text-ink uppercase tracking-tight">Unitarizar Ativo</h3>
              <p className="text-[9px] font-bold text-ink-muted uppercase tracking-widest mt-1">Desmembramento de Ativo em Lote</p>
            </div>

            <div className="flex bg-bg-main p-1 rounded-xl border border-border">
              <button 
                onClick={() => setUnitizeMethod('EQUAL')}
                className={`flex-1 py-2 text-[9px] font-bold uppercase tracking-widest rounded-lg transition-all ${unitizeMethod === 'EQUAL' ? 'bg-white shadow-sm text-accent' : 'text-ink-muted'}`}
              >
                Rateio Igual
              </button>
              <button 
                onClick={() => setUnitizeMethod('PERCENT')}
                className={`flex-1 py-2 text-[9px] font-bold uppercase tracking-widest rounded-lg transition-all ${unitizeMethod === 'PERCENT' ? 'bg-white shadow-sm text-accent' : 'text-ink-muted'}`}
              >
                Por Percentual
              </button>
            </div>

            <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100 space-y-2">
              <p className="text-[10px] text-amber-800 font-bold leading-tight">
                {unitizeMethod === 'EQUAL' 
                  ? 'Os valores serão divididos igualmente entre as unidades.' 
                  : 'Informe o percentual de valor para cada unidade. A soma deve ser 100%.'}
              </p>
            </div>

            <div>
              <label className="block text-[8px] font-bold text-ink-muted uppercase tracking-widest mb-1.5 ml-1">Quantidade de Unidades</label>
              <div className="flex items-center space-x-4">
                <button 
                  onClick={() => setUnitizeCount(Math.max(2, unitizeCount - 1))}
                  className="w-10 h-10 bg-bg-main border border-border rounded-xl flex items-center justify-center text-xl font-bold active:scale-90"
                >
                  -
                </button>
                <input 
                  type="number"
                  value={unitizeCount}
                  onChange={(e) => setUnitizeCount(Math.max(2, Number(e.target.value)))}
                  className="flex-1 text-center py-2 bg-bg-main border border-border rounded-xl text-lg font-bold outline-none focus:border-accent"
                />
                <button 
                  onClick={() => setUnitizeCount(unitizeCount + 1)}
                  className="w-10 h-10 bg-bg-main border border-border rounded-xl flex items-center justify-center text-xl font-bold active:scale-90"
                >
                  +
                </button>
              </div>
            </div>

            {unitizeMethod === 'PERCENT' && (
              <div className="space-y-3 max-h-48 overflow-y-auto pr-2 scrollbar-thin">
                {unitizePercentages.map((p, idx) => (
                  <div key={idx} className="flex items-center justify-between bg-bg-main p-3 rounded-xl border border-border">
                    <span className="text-[10px] font-bold text-ink-muted uppercase">Unidade {idx + 1}</span>
                    <div className="flex items-center space-x-2">
                      <input 
                        type="number"
                        value={p}
                        onChange={(e) => {
                          const newP = [...unitizePercentages];
                          newP[idx] = Number(e.target.value);
                          setUnitizePercentages(newP);
                        }}
                        className="w-16 text-right bg-transparent font-bold text-sm outline-none text-accent"
                      />
                      <span className="text-xs font-bold text-ink-muted">%</span>
                    </div>
                  </div>
                ))}
                <div className="flex justify-between p-2 border-t border-dashed border-border mt-2">
                  <span className="text-[10px] font-bold text-ink uppercase">Total:</span>
                  <span className={`text-xs font-bold ${Math.abs(unitizePercentages.reduce((a, b) => a + b, 0) - 100) < 0.01 ? 'text-green-600' : 'text-red-600'}`}>
                    {unitizePercentages.reduce((a, b) => a + b, 0).toFixed(1)}%
                  </span>
                </div>
              </div>
            )}

            <div className="flex space-x-3">
              <button 
                onClick={() => setIsUnitizeModalOpen(false)}
                className="flex-1 py-4 bg-bg-main text-ink rounded-2xl font-bold uppercase text-[10px] tracking-widest active:scale-95 transition-all"
              >
                Cancelar
              </button>
              <button 
                disabled={unitizeMethod === 'PERCENT' && Math.abs(unitizePercentages.reduce((a, b) => a + b, 0) - 100) > 0.01}
                onClick={() => {
                  if (onUnitize) {
                    onUnitize(
                      workingAsset, 
                      unitizeCount, 
                      unitizeMethod === 'PERCENT' ? unitizePercentages : undefined
                    );
                  }
                  setIsUnitizeModalOpen(false);
                  onBack();
                }}
                className="flex-1 py-4 bg-accent text-white rounded-2xl font-bold uppercase text-[10px] tracking-widest shadow-lg shadow-accent/20 active:scale-95 transition-all disabled:opacity-50 disabled:grayscale"
              >
                Unitarizar
              </button>
            </div>
          </div>
        </div>
      )}


    </div>
  );
};

export default AssetDetail;
