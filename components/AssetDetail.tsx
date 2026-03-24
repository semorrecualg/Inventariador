
import React, { useState, useMemo, useEffect } from 'react';
import { Asset, TagInventario } from '../types';
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
  Lock,
  Info,
  Briefcase,
  Wallet,
  QrCode,
  Loader2,
  Camera,
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
  onBulkUpdate: (ids: string[], updates?: Partial<Asset>) => void;
  editableFields: string[];
  uniqueEnderecos: string[];
  uniqueCentrosDeCusto: string[];
  qrCodeFields: string[];
  readOnly?: boolean;
  protheusIntegrationEnabled?: boolean;
  protheusApiUrl?: string;
  tenantId?: string;
  mandatoryPhotoOnDivergence?: boolean;
  mandatoryPhotoOnNewItem?: boolean;
}

const AssetDetail: React.FC<AssetDetailProps> = ({ 
  assets, 
  onBack, 
  onUpdate, 
  onBulkUpdate, 
  editableFields, 
  uniqueEnderecos, 
  uniqueCentrosDeCusto, 
  qrCodeFields, 
  readOnly = false,
  protheusIntegrationEnabled = false,
  protheusApiUrl = '',
  tenantId = '',
  mandatoryPhotoOnDivergence = false,
  mandatoryPhotoOnNewItem = false
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
  const ocrInputRef = React.useRef<HTMLInputElement>(null);
  const [ocrTargetField, setOcrTargetField] = useState<string | null>(null);

  const handleOCR = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !ocrTargetField) return;

    setIsOCRProcessing(true);
    try {
      const worker = await createWorker('eng');
      const { data: { text } } = await worker.recognize(file);
      await worker.terminate();

      // Limpeza básica do texto (remover espaços extras, quebras de linha)
      const cleanedText = text.replace(/[\n\r]/g, ' ').trim().toUpperCase();
      
      // Atualizar o ativo com o texto reconhecido
      const updates = { ...workingAsset };
      updates[ocrTargetField] = cleanedText;
      setWorkingAsset(updates);
      
      // Se estiver editando esse campo, atualizar o valor da edição
      if (editingField === ocrTargetField) {
        setEditValue(cleanedText);
      }
    } catch (err) {
      console.error('Erro no OCR:', err);
    } finally {
      setIsOCRProcessing(false);
      setOcrTargetField(null);
      if (ocrInputRef.current) ocrInputRef.current.value = '';
    }
  };

  const triggerOCR = (field: string) => {
    setOcrTargetField(field);
    ocrInputRef.current?.click();
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
      if (field === 'DATAAQUSIC' || field === 'DATABAIXA') value = formatDateBR(value);
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
        { key: 'EMPRESA', label: 'UNIDADE OPERACIONAL', icon: Building2 },
        { key: 'ENDERECO', label: 'ENDEREÇO FÍSICO', icon: MapPin },
        { key: 'CENTRODECUSTO', label: 'CENTRO DE CUSTO', icon: Briefcase }
      ]
    },
    {
      title: 'DADOS DE AQUISIÇÃO',
      fields: [
        { key: 'VLRAQUISIC', label: 'VALOR DE AQUISIÇÃO', icon: Wallet },
        { key: 'DATAAQUSIC', label: 'DATA DE AQUISIÇÃO', icon: Calendar },
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

      // Comprime a imagem antes de subir (Perfil WhatsApp: ~1024px e ~150KB)
      const compressedBlob = await compressImage(file, 1024, 1024, 0.6);
      
      // Salva localmente para persistência offline e modo INTERNO
      await saveLocalPhoto(String(workingAsset.id), compressedBlob as Blob);
      
      // Cria URL local para visualização imediata
      const localUrl = URL.createObjectURL(compressedBlob);
      
      // Adiciona à fila de sincronização offline (se não for modo INTERNO)
      // No modo INTERNO, o syncService pode ser ignorado ou usado como backup
      await addToSyncQueue(String(workingAsset.id), compressedBlob as Blob, tenantId || 'default');

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

  const getTagColors = (tag: TagInventario | string) => {
    switch (tag) {
      case TagInventario.BAIXADO: return { bg: 'bg-red-400', hex: '#f87171' };
      case TagInventario.ADOTADO_EXTERNO: return { bg: 'bg-sky-400', hex: '#38bdf8' };
      case TagInventario.ADOTADO: return { bg: 'bg-indigo-400', hex: '#818cf8' };
      case TagInventario.RE_ADOTADO: return { bg: 'bg-fuchsia-400', hex: '#e879f9' };
      case TagInventario.CONFERIDO: return { bg: 'bg-emerald-400', hex: '#34d399' };
      case TagInventario.FALTA_ETIQUETAR: return { bg: 'bg-amber-400', hex: '#fbbf24' };
      case TagInventario.ETIQUETADO: return { bg: 'bg-violet-400', hex: '#a78bfa' };
      case TagInventario.NOVO_ITEM: return { bg: 'bg-orange-400', hex: '#fb923c' };
      case TagInventario.DIVERGENCIA: return { bg: 'bg-rose-400', hex: '#fb7185' };
      default: return { bg: 'bg-slate-400', hex: '#94a3b8' };
    }
  };

  const isBaixado = useMemo(() => {
    const statusUpper = String(workingAsset.STATUS || '').toUpperCase();
    return statusUpper.includes('BAIXA') || !!workingAsset.DATABAIXA;
  }, [workingAsset.STATUS, workingAsset.DATABAIXA]);

  const isConferido = useMemo(() => {
    return !!workingAsset._conferido || String(workingAsset.AUDITOR_STATUS_CONFERENCIA || '').toUpperCase() === 'SIM';
  }, [workingAsset._conferido, workingAsset.AUDITOR_STATUS_CONFERENCIA]);

  const tagColors = useMemo(() => {
    if (isBatch) return { bg: 'bg-amber-400', hex: '#fbbf24' };
    const tag = workingAsset.TAG_INVENTARIO || (isConferido ? TagInventario.CONFERIDO : TagInventario.PENDENTE);
    const base = getTagColors(tag);
    // Se for baixado, vamos manter o cabeçalho vermelho ou com tom de alerta
    if (isBaixado) {
      return { bg: 'bg-red-400', hex: '#f87171' };
    }
    return base;
  }, [isBatch, workingAsset, isBaixado, isConferido]);

  const headerBg = tagColors.bg;



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

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-black/20 border border-white/10 p-3 rounded-xl backdrop-blur-xl shadow-inner">
              <p className="text-[8px] font-bold text-white/50 uppercase tracking-[0.2em] mb-2">PLAQUETA</p>
              <p className="text-2xl font-bold font-mono tracking-tighter text-white">{workingAsset.ETIQUETA || 'S/ ETQ'}</p>
            </div>
            <div className="bg-black/20 border border-white/10 p-3 rounded-xl backdrop-blur-xl shadow-inner flex flex-col justify-center">
              <p className="text-[8px] font-bold text-white/50 uppercase tracking-[0.2em] mb-2">AUDITORIA</p>
              <div className="flex items-center space-x-2">
                <div className={`w-1.5 h-1.5 rounded-full ${isBaixado ? 'bg-red-400 shadow-red-400/50' : 'bg-sky-400 shadow-sky-400/50'} shadow-sm`} />
                <span className={`text-[10px] font-bold uppercase ${isBaixado ? 'text-red-100' : 'text-sky-300'} tracking-widest`}>
                  {isBaixado ? 'BAIXADO | ' : ''}
                  {workingAsset.TAG_INVENTARIO || (isConferido ? TagInventario.CONFERIDO : TagInventario.PENDENTE)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* KARDEX BODY */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar pb-[60vh] bg-bg-main">
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
                  const isDateField = key === 'DATAAQUSIC' || key === 'DATABAIXA';
                  const isDateTime = key === '_dataLeitura';
                  const isCurrency = key === 'VLRAQUISIC';
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
            <button 
              onClick={handleFinalize} 
              className={`text-white px-8 py-4 rounded-2xl text-[11px] font-black uppercase shadow-2xl active:scale-95 flex items-center space-x-3 transition-all tracking-[0.2em] border-b-4 border-black/20 ${tagColors.bg}`}
            >
               <Check size={20} strokeWidth={3} />
               <span>{isBatch ? 'EFETIVAR LOTE' : 'SALVAR E CONFERIR'}</span>
            </button>
          </div>
        </div>
      )}

      {isQrModalOpen && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-8 bg-slate-950/80 backdrop-blur-md animate-fadeIn" onClick={() => setIsQrModalOpen(false)}>
          <div className="bg-white w-full max-w-sm rounded-[3rem] border border-border shadow-2xl p-10 flex flex-col items-center text-center modern-card" onClick={(e) => e.stopPropagation()}>
            <p className="text-xl font-bold text-ink uppercase tracking-tight font-mono mb-6">{workingAsset.EMPRESA}</p>
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


    </div>
  );
};

export default AssetDetail;
