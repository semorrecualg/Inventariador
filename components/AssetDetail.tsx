
import React, { useState, useMemo, useEffect } from 'react';
import { Asset, TagInventario, TransactionOrigin, AuditLogEntry, DatabaseMode } from '../types';
import { TYPE_LABELS } from '../utils/schema';
import { sqliteService } from '../services/sqliteService';
import { formatDateBR, formatCurrency } from '../utils/formatUtils';
import { QR_FIELD_ORDER } from '../utils/qrUtils';

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
  Camera as CameraIcon,
  X,
  ChevronRight,
  Image as ImageIcon,
  Trash2,
  CheckCircle2,
  History,
  Activity,
  Layers,
  Database
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { motion, AnimatePresence } from 'motion/react';
import { deleteAssetPhoto } from '../services/supabaseService';
import { addToSyncQueue } from '../services/syncService';
import { saveLocalPhoto, getLocalPhoto } from '../services/photoService';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { indoorNavigation } from '../services/indoorNavigationService';
import { DB_ASSET_COLUMNS } from '../constants/schema';

import { determineAssetTag, getTagMetadata } from '../services/tagService';

const ALL_ICON_MAP: Record<string, React.ElementType> = {
  ETIQUETA: FileText,
  DESCRICAODOATIVO: Info,
  DESCRICAODOBEM: Info,
  MARCA: Briefcase,
  MODELO: Briefcase,
  QT: Hash,
  SERIAL: Hash,
  REGISTRO: Hash,
  SUBREG: Hash,
  PRIMARYKEY: Lock,
  GRUPO_EMPRESARIAL: Building2,
  UNIDADE_OPERACIONAL: Building2,
  ENDERECO: MapPin,
  CENTRODECUSTO: Briefcase,
  VLRAQUISIC: Wallet,
  DATAAQUISIC: Calendar,
  NOTAFISCAL: FileText,
  NOMEFORNECEDOR: User,
  CNPJ: Building2,
  STATUS: ShieldCheck,
  CONTACONTABIL: Briefcase,
  ESTADO_CONSERVACAO: FileText,
  DATABAIXA: Calendar,
  Sn1_recno: Hash,
  Sn3_recno: Hash,
  _dataLeitura: Calendar,
  _auditor: User,
  _localMaster: MapPin,
  _lat: MapPin,
  _lng: MapPin,
  _history: History,
  _camposAlterados: Activity,
  _valoresOriginais: Layers,
  _campaignId: Briefcase,
  _version: Database,
  _is_synced: Layers,
  _is_deleted: Trash2,
  _plaquetado: CheckCircle2,
  _aprovado: ShieldCheck
};

const EXTRA_LABELS: Record<string, string> = {
  MARCA: 'Marca',
  MODELO: 'Modelo',
  QT: 'Quantidade',
  REGISTRO: 'Registro Mestre',
  SUBREG: 'Sub-Registro',
  PRIMARYKEY: 'Chave Primária (PK)',
  STATUS: 'Status Operacional',
  ESTADO_CONSERVACAO: 'Estado de Conservação',
  DATABAIXA: 'Data de Baixa',
  Sn1_recno: 'ID Protheus (SN1)',
  Sn3_recno: 'ID Protheus (SN3)',
  _dataLeitura: 'Data/Hora Inventário',
  _auditor: 'Auditor Responsável',
  _localMaster: 'Local Originário',
  _lat: 'Latitude',
  _lng: 'Longitude',
  _history: 'Histórico de Auditoria',
  _camposAlterados: 'Campos Alterados',
  _valoresOriginais: 'Valores Originais',
  _version: 'Versão do Registro',
  _is_synced: 'Sincronizado',
  _plaquetado: 'Plaquetado'
};

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
  isOCRProcessing: boolean;
  setIsOCRProcessing: (val: boolean) => void;
}

const AssetDetail: React.FC<AssetDetailProps> = ({ 
  assets, 
  onBack, 
  onUpdate, 
  onDelete,
  onUnitize,
  onBulkUpdate, 
  editableFields, 
  qrCodeFields, 
  readOnly = false,
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
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
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

  // Hook simplificado para buscar o usuário logado e verificar admin
  const [user, setUser] = useState<User | null>(null);
  useEffect(() => {
    const saved = localStorage.getItem('app_current_user');
    if (saved) {
      try { setUser(JSON.parse(saved)); } catch { console.error('Erro ao carregar usuário para auditoria'); }
    }
  }, []);

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

  const [unitMapping, setUnitMapping] = useState<string | null>(null);
  const [ccMapping, setCcMapping] = useState<string | null>(null);

  useEffect(() => {
    const fetchMappings = async () => {
      const unit = await sqliteService.getMapping('UNIT');
      const cc = await sqliteService.getMapping('COST_CENTER');
      setUnitMapping(unit);
      setCcMapping(cc);
    };
    fetchMappings();
  }, []);

  const fieldGroups = useMemo(() => {
    const groups = [
      {
        title: 'IDENTIFICAÇÃO TÉCNICA',
        fields: [
          { key: 'ETIQUETA', label: TYPE_LABELS.TAG, icon: FileText },
          { key: 'DESCRICAODOATIVO', label: TYPE_LABELS.DESCRIPTION, icon: Info },
          { key: 'MARCA', label: 'MARCA', icon: Briefcase },
          { key: 'MODELO', label: 'MODELO', icon: Briefcase },
          { key: 'QT', label: 'QUANTIDADE', icon: Hash },
          { key: 'SERIAL', label: TYPE_LABELS.SERIAL, icon: Hash },
          { key: 'REGISTRO', label: 'REGISTRO MESTRE', icon: Hash },
          { key: 'SUBREG', label: 'SUB-REGISTRO', icon: Hash },
          { key: 'PRIMARYKEY', label: 'CHAVE PRIMÁRIA (PK)', icon: Lock }
        ]
      },
      {
        title: 'LOCALIZAÇÃO E CUSTO',
        fields: [
          { key: 'GRUPO_EMPRESARIAL', label: TYPE_LABELS.GROUP, icon: Building2 },
          { key: 'UNIDADE_OPERACIONAL', label: TYPE_LABELS.UNIT, icon: Building2 },
          { key: 'ENDERECO', label: TYPE_LABELS.ADDRESS, icon: MapPin },
          { key: 'CENTRODECUSTO', label: TYPE_LABELS.COST_CENTER, icon: Briefcase }
        ]
      },
      {
        title: 'DADOS DE AQUISIÇÃO',
        fields: [
          { key: 'VLRAQUISIC', label: TYPE_LABELS.VALUE, icon: Wallet },
          { key: 'DATAAQUISIC', label: TYPE_LABELS.DATE, icon: Calendar },
          { key: 'NOTAFISCAL', label: TYPE_LABELS.INVOICE, icon: FileText },
          { key: 'NOMEFORNECEDOR', label: TYPE_LABELS.VENDOR, icon: User },
          { key: 'CNPJ', label: 'CNPJ FORNECEDOR', icon: Building2 }
        ]
      },
      {
        title: 'CONTROLE CONTÁBIL',
        fields: [
          { key: 'STATUS', label: 'STATUS OPERACIONAL', icon: ShieldCheck },
          { key: 'CONTACONTABIL', label: TYPE_LABELS.ACCOUNT, icon: Briefcase },
          { key: 'ESTADO_CONSERVACAO', label: 'ESTADO DE CONSERVAÇÃO', icon: FileText },
          { key: 'DATABAIXA', label: 'DATA DE BAIXA', icon: Calendar },
          { key: 'Sn1_recno', label: 'ID PROTHEUS (SN1)', icon: Hash },
          { key: 'Sn3_recno', label: 'ID PROTHEUS (SN3)', icon: Hash }
        ]
      }
    ];

    // Mapeia campos extras que não estão nos grupos fixos mas podem estar no DB_ASSET_COLUMNS
    const processedKeys = new Set(groups.flatMap(g => g.fields.map(f => f.key)));
    const additionalFields: { key: string; label: string; icon: React.ElementType }[] = [];
    const internalFields: { key: string; label: string; icon: React.ElementType }[] = [];

    DB_ASSET_COLUMNS.forEach(key => {
      if (processedKeys.has(key)) return;
      if (key === 'id' || key === 'FOTO_PATH') return;

      const fieldDef = {
        key,
        label: EXTRA_LABELS[key] || TYPE_LABELS[key] || key,
        icon: ALL_ICON_MAP[key] || Database
      };

      if (key.startsWith('_')) {
        internalFields.push(fieldDef);
      } else {
        additionalFields.push(fieldDef);
      }
    });

    if (additionalFields.length > 0) {
      groups.push({
        title: 'DADOS ADICIONAIS',
        fields: additionalFields
      });
    }

    if (internalFields.length > 0) {
      groups.push({
        title: 'METADADOS E SISTEMA',
        fields: internalFields
      });
    }

    return groups;
  }, [unitMapping, ccMapping]);

  const applyFieldEdit = (val?: string) => {
    if (editingField) {
      const updates: Asset = { ...workingAsset };
      const newValue = (val || editValue).toUpperCase().trim();
      updates[editingField] = newValue;
      setWorkingAsset(updates);
      setEditingField(null);
    }
  };

  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    if (type === 'success' && navigator.vibrate) navigator.vibrate(50);
  };

  const handleFinalize = async () => {
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

    // Validação de Prova de Vida (Anti-Fraude)
    if ((isDivergence || isNew) && !finalAsset._ocr_verified) {
      alert('BLOQUEIO: A regularização exige prova de presença física. Utilize a câmera no campo ETIQUETA ou SERIAL para validar o ativo in loco.');
      return;
    }

    // 1. EXTRAÇÃO DE ALTERAÇÕES PARA AUDITORIA SOBERANA
    const originalAsset = assets.find(a => a.id === finalAsset.id) || assets[0];
    const changedFields: string[] = [];
    const auditDetails: string[] = [];

    // Compara chaves do schema técnico
    Object.keys(originalAsset).forEach(key => {
      if (key.startsWith('_') || key === 'id' || key === 'TAG_INVENTARIO' || key === 'FOTO_PATH') return;
      
      const oldVal = String(originalAsset[key] || '').trim();
      const newVal = String(finalAsset[key] || '').trim();
      
      if (oldVal !== newVal) {
        changedFields.push(key);
        auditDetails.push(`${key}: "${oldVal}" -> "${newVal}"`);
      }
    });

    if (changedFields.length > 0) {
      const timestamp = new Date().toISOString();
      const auditEntry: AuditLogEntry = {
        action: 'UPDATE_ASSET_FIELDS',
        details: `Alteração de campos: ${auditDetails.join(' | ')}`,
        timestamp,
        user: finalAsset._auditor || user?.name || 'AUDITOR',
        user_email: user?.email,
        origin: TransactionOrigin.INVENTORY,
        record_id: String(finalAsset.id),
        old_data: originalAsset,
        new_data: finalAsset
      };

      // Persiste no histórico do ativo para rastreabilidade offline
      finalAsset._history = [...(finalAsset._history || []), auditEntry];
      finalAsset._camposAlterados = [...new Set([...(finalAsset._camposAlterados || []), ...changedFields])];
      
      // Armazena valores originais se for a primeira vez que altera
      if (!finalAsset._valoresOriginais) finalAsset._valoresOriginais = {};
      changedFields.forEach(f => {
        if (finalAsset._valoresOriginais && finalAsset._valoresOriginais[f] === undefined) {
          finalAsset._valoresOriginais[f] = originalAsset[f];
        }
      });

      // Log no SQLite Global
      await sqliteService.logAuditEvent(auditEntry);
    }

    if (isBatch) {
      // Para lote, se houve alteração em algum campo no finalAsset, aplicamos a todos os itens do lote.
      const manualUpdates: Partial<Asset> = {};
      
      changedFields.forEach(key => {
        (manualUpdates as Record<string, unknown>)[key] = finalAsset[key];
      });

      onBulkUpdate(assets.map(a => String(a.id)), manualUpdates);
      showToast("LOTE GRAVADO NO DISCO NATIVO");
    } else {
      // v2.6: Garante que o status 'CONFERIDO' seja setado se houver alteração ou ação positiva
      onUpdate({ ...finalAsset, _conferido: true, _dataLeitura: new Date().toISOString() });
      showToast("DADOS GRAVADOS NO DISCO NATIVO");
    }
    setTimeout(onBack, 1000); // Dá tempo de ver o toast
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

  useEffect(() => { setWorkingAsset({ ...assets[0] }); }, [assets]);

  const handlePhotoUpload = async () => {
    if (isBatch) return;

    try {
      const checkPerms = await Camera.checkPermissions();
      if (checkPerms.camera !== 'granted') {
        const reqPerms = await Camera.requestPermissions();
        if (reqPerms.camera !== 'granted') {
          throw new Error('PERMISSÃO NEGADA: A câmera é obrigatória para Prova de Vida e registro de evidências. Clique no cadeado na barra de endereços do navegador e mude de "Bloquear" para "Permitir".');
        }
      }

      // 1. Prova de Vida: Captura de Foto Apenas via Câmera (Sem Galeria)
      const image = await Camera.getPhoto({
        quality: 60, // Otimização WhatsApp
        allowEditing: false,
        resultType: CameraResultType.Base64,
        source: CameraSource.Camera, // Obrigatório: Apenas Câmera
        width: 1600, // Padrão WhatsApp
        promptLabelHeader: 'EVIDÊNCIA FOTOGRÁFICA',
        promptLabelPicture: 'Foque no ativo e na etiqueta patrimonial instalada. A geolocalização será capturada para autenticidade.'
      });

      if (!image.base64String) return;

      setIsUploadingPhoto(true);
      
      // Captura de Posição via Sensores (Metadata da Foto)
      let gpsData = null;
      try {
        const indoorPos = indoorNavigation.getCurrentPosition();
        gpsData = {
          latitude: indoorPos.lat,
          longitude: indoorPos.lng,
          accuracy: indoorPos.accuracy,
          altitude: indoorPos.altitude
        };
      } catch {
        console.warn('GPS Indoor não capturado para foto.');
      }

      // Converter base64 para Blob
      const byteCharacters = atob(image.base64String);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'image/jpeg' });

      // Se já existe uma foto, vamos deletar a antiga
      if (workingAsset._photoUrl && !workingAsset._photoUrl.startsWith('blob:')) {
        await deleteAssetPhoto(workingAsset._photoUrl);
      }

      // Salva localmente
      await saveLocalPhoto(String(workingAsset.id), blob);
      
      // Cria URL local
      const localUrl = URL.createObjectURL(blob);
      
      // Adiciona à fila de sincronização
      if (!databaseMode.startsWith('INTERNAL')) {
        await addToSyncQueue(String(workingAsset.id), blob, tenantid || '');
      }

      // Atualiza o estado
      const updated: Asset = { 
        ...workingAsset, 
        _photoUrl: localUrl,
        FOTO_PATH: localUrl, // Armazena o path local (blob URL ou reference)
        _conferido: true // Foto de evidência conta como conferência
      };

      if (gpsData) {
        updated._lat = gpsData.latitude;
        updated._lng = gpsData.longitude;
        updated._gps_accuracy = gpsData.accuracy;
        updated._altitude_level = gpsData.altitude || 0;
        updated._pos_timestamp = new Date().toISOString();
      }

      setWorkingAsset(updated);
      onUpdate(updated);
      
    } catch (err) {
      console.error('Erro ao capturar foto via Capacitor:', err);
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const visualStatus = useMemo(() => {
    return determineAssetTag(workingAsset, workingAsset._localMaster || workingAsset.ENDERECO || "", tenantid);
  }, [workingAsset, tenantid]);

  const meta = getTagMetadata(visualStatus);
  const StatusIcon = meta.icon;

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
    <div className="flex flex-col h-full bg-[#F8FAFC] animate-fadeIn overflow-hidden font-sans">
      {/* NATIVE HEADER v2.7 - Minimalist & Compact */}
      <div className="shrink-0 bg-white border-b border-slate-100 px-6 pt-10 pb-4 z-40">
        <div className="flex items-center justify-between mb-4">
          <button 
            onClick={onBack}
            className="w-10 h-10 bg-slate-50 text-slate-600 rounded-full flex items-center justify-center active:scale-90 transition-all border border-slate-100"
          >
            <ChevronRight className="rotate-180" size={20} strokeWidth={2.5} />
          </button>
          <div className="flex items-center space-x-2">
             <button onClick={() => setIsQrModalOpen(true)} className="w-10 h-10 flex items-center justify-center rounded-xl bg-slate-50 text-slate-400 hover:text-blue-600 transition-all">
               <QrCode size={18} />
             </button>
             <div className="bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100">
               <span className="text-[9px] font-bold text-slate-400 uppercase tracking-[0.2em]">NATIVE v2.7</span>
             </div>
          </div>
        </div>

        <div className="flex items-center space-x-4 px-1">
          <div className="relative shrink-0">
            <div className="w-16 h-16 bg-slate-50 rounded-2xl border border-slate-100 overflow-hidden flex items-center justify-center shadow-sm relative">
              {workingAsset._photoUrl ? (
                <img 
                  src={workingAsset._photoUrl} 
                  className="w-full h-full object-cover" 
                  referrerPolicy="no-referrer"
                  alt="Avatar"
                />
              ) : (
                <ImageIcon size={24} className="text-slate-200" />
              )}
              {isUploadingPhoto && (
                <div className="absolute inset-0 bg-white/60 flex items-center justify-center">
                  <Loader2 size={16} className="text-blue-600 animate-spin" />
                </div>
              )}
            </div>
            {!readOnly && (
              <button 
                onClick={handlePhotoUpload} 
                className="absolute -bottom-1 -right-1 w-7 h-7 bg-[#1E40AF] text-white rounded-lg flex items-center justify-center shadow-lg active:scale-90 transition-all border-2 border-white"
              >
                <CameraIcon size={12} strokeWidth={3} />
              </button>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center space-x-2 mb-0.5">
              <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded ${meta.color.bg} ${meta.color.text} border ${meta.color.border.replace('border-', 'border-opacity-30 border-')}`}>
                {visualStatus}
              </span>
              <span className="text-[10px] font-mono font-bold text-slate-400">#{workingAsset.REGISTRO || '---'}</span>
            </div>
            <h2 className="text-lg font-bold text-[#0F172A] mb-0.5 truncate uppercase tracking-tight">
              {isBatch ? `LOTE: ${workingAsset.ETIQUETA}` : (workingAsset.DESCRICAODOATIVO || 'ITEM SEM DESCRIÇÃO')}
            </h2>
            <p className="text-[14px] font-black font-mono text-blue-600 tracking-tighter">
              {workingAsset.ETIQUETA || '000000'}
            </p>
          </div>
        </div>
      </div>

      {/* SOVEREIGN SCROLL VIEW - High Performance */}
      <div className="flex-1 overflow-y-auto pb-44 no-scrollbar bg-[#F8FAFC]">
        <div className="p-4 space-y-6">
          {/* Alertas Críticos */}
          {workingAsset._is_divergent_baixa && (
            <div className="bg-red-500 p-4 rounded-2xl flex items-center space-x-4 shadow-[0_8px_20px_rgba(239,68,68,0.2)] border border-red-400">
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center text-white shrink-0">
                <AlertTriangle size={20} strokeWidth={2.5} />
              </div>
              <div className="flex-1">
                <h4 className="text-[10px] font-black text-white uppercase tracking-widest">Divergência Crítica</h4>
                <p className="text-[9px] font-bold text-white/90 uppercase tracking-tight leading-tight mt-0.5">
                  Ativo possui Baixa ({workingAsset.DATABAIXA}) mas está em auditoria.
                </p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
             <div className="bg-white border border-slate-100 p-4 rounded-2xl shadow-sm">
                <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Plaqueta</p>
                <p className="text-lg font-black text-slate-900 font-mono tracking-tight">{workingAsset.ETIQUETA || '---'}</p>
             </div>
             <div className="bg-white border border-slate-100 p-4 rounded-2xl shadow-sm">
                <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Status</p>
                <div className="flex items-center space-x-1.5">
                   <StatusIcon size={12} className={meta.color.text} />
                   <span className={`text-[10px] font-black uppercase ${meta.color.text} truncate`}>{meta.label}</span>
                </div>
             </div>
          </div>

          {/* Seções de Campos Agrupados */}
          {fieldGroups.map((group, gIdx) => (
            <div key={gIdx} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="px-5 py-3 bg-slate-50/50 border-b border-slate-100/50 flex items-center justify-between">
                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">{group.title}</h3>
                <div className="w-1.5 h-1.5 rounded-full bg-slate-200" />
              </div>
              <div className="divide-y divide-slate-50">
                {group.fields.map((field) => {
                  const key = field.key;
                  const label = field.label;
                  const Icon = field.icon;
                  const rawVal = workingAsset[key as keyof Asset];
                  const isDateField = key === 'DATAAQUISIC' || key === 'DATABAIXA';
                  const isDateTime = key === '_dataLeitura';
                  const isCurrency = key === 'VLRAQUISIC' || key.startsWith('_valor') || key.includes('perda');
                  
                  let displayVal = String(rawVal || '---');
                  if (isDateField) displayVal = formatDateBR(rawVal as string | number | undefined);
                  if (isDateTime) displayVal = formatReadingTime(rawVal as string);
                  if (isCurrency) displayVal = formatCurrency(rawVal as string | number | undefined);

                  const canEdit = !readOnly && editableFields.includes(key);
                  const isEditing = editingField === key;

                  if (!rawVal && (key === 'DATABAIXA' || key === '_dataLeitura' || key === '_auditor' || key.startsWith('_'))) return null;
                  
                  // Se o campo for um objeto ou array (como _history, _camposAlterados), vamos pular por enquanto na listagem simples
                  if (rawVal && (typeof rawVal === 'object')) return null;

                  return (
                    <div 
                      key={key}
                      onClick={() => canEdit && !isEditing && (setEditingField(key), setEditValue(String(rawVal || '')))}
                      className={`px-5 py-4 flex flex-col transition-all active:bg-slate-50/50 relative group ${canEdit ? 'cursor-pointer' : 'opacity-80'}`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center space-x-2">
                          <Icon size={12} className={canEdit ? 'text-blue-500' : 'text-slate-300'} strokeWidth={2.5} />
                          <label className={`text-[9px] font-bold uppercase tracking-widest ${canEdit ? 'text-slate-400' : 'text-slate-300'}`}>
                            {label}
                          </label>
                        </div>
                        {canEdit && !isEditing && (
                          <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                            <Edit2 size={10} className="text-blue-400" strokeWidth={3} />
                          </div>
                        )}
                        {!canEdit && <Lock size={10} className="text-slate-200" />}
                      </div>

                      {isEditing ? (
                        <div className="mt-2 animate-in fade-in slide-in-from-top-1 duration-200">
                          <div className="flex items-center space-x-2">
                            <input 
                              autoFocus
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onKeyDown={(e) => e.key === 'Enter' && applyFieldEdit()}
                              className="flex-1 bg-blue-50/50 px-3 py-2 rounded-xl text-xs font-bold text-slate-900 border border-blue-200 outline-none focus:ring-2 focus:ring-blue-100 transition-all uppercase"
                            />
                            <div className="flex space-x-1">
                              <button 
                                onClick={(e) => { e.stopPropagation(); applyFieldEdit(); }}
                                className="w-8 h-8 bg-blue-600 text-white rounded-lg flex items-center justify-center shadow-md active:scale-90"
                              >
                                <Check size={14} strokeWidth={3} />
                              </button>
                              <button 
                                onClick={(e) => { e.stopPropagation(); setEditingField(null); }}
                                className="w-8 h-8 bg-slate-100 text-slate-400 rounded-lg flex items-center justify-center active:scale-90"
                              >
                                <X size={14} strokeWidth={2.5} />
                              </button>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between">
                          <p className={`text-[13px] font-bold font-mono tracking-tight ${rawVal ? 'text-slate-700' : 'text-slate-300 italic font-sans'}`}>
                            {displayVal}
                          </p>
                          {workingAsset._valoresOriginais?.[key] !== undefined && (
                            <div className="flex items-center space-x-1 text-[7px] text-amber-600 font-black bg-amber-50 px-1.5 py-0.5 rounded border border-amber-100">
                              <AlertCircle size={8} />
                              <span>ALTERADO</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
      
      {/* NATIVE SOVEREIGN FOOTER v2.7 - Floating Glassmorphism */}
      {!readOnly && (
        <div className="fixed bottom-0 left-0 right-0 p-6 z-50 pointer-events-none">
          <div className="bg-white/80 backdrop-blur-xl border border-white/50 p-4 rounded-[2rem] shadow-[0_20px_50px_rgba(0,0,0,0.15)] flex items-center justify-between max-w-lg mx-auto pointer-events-auto">
            <div className="flex flex-col px-2">
              <span className="text-[8px] font-black text-slate-400 uppercase tracking-[0.4em]">SOBERANIA NATIVA</span>
              <span className="text-[11px] font-black text-slate-900 uppercase tracking-tight mt-0.5 italic">VERSÃO 2.7.1</span>
            </div>
            
            <div className="flex items-center space-x-3">
              {!isBatch && onDelete && (
                <button 
                  onClick={handleDelete}
                  className="w-12 h-12 bg-red-50 text-red-600 rounded-2xl active:scale-90 transition-all flex items-center justify-center border border-red-100"
                >
                  <Trash2 size={20} strokeWidth={2.5} />
                </button>
              )}

              <button 
                onClick={handleFinalize} 
                className="h-14 px-8 bg-[#1E40AF] text-white rounded-2xl text-[13px] font-black uppercase shadow-xl shadow-blue-900/20 active:scale-95 flex items-center justify-center space-x-3 transition-all tracking-widest border-b-4 border-blue-950"
              >
                 <ShieldCheck size={20} strokeWidth={3} />
                 <span>{isBatch ? 'CONCLUIR' : 'GRAVAR'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAIS E TOASTS */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="fixed bottom-32 left-4 right-4 z-[12000] pointer-events-none"
          >
            <div className={`mx-auto max-w-xs px-6 py-4 rounded-3xl shadow-2xl border-2 flex items-center space-x-4 backdrop-blur-xl ${
              toast.type === 'success' 
                ? 'bg-emerald-500/95 border-emerald-400 text-white' 
                : 'bg-red-500/95 border-red-400 text-white'
            }`}>
              <div className="flex-shrink-0 w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
                {toast.type === 'success' ? <CheckCircle2 size={24} strokeWidth={3} /> : <AlertCircle size={24} strokeWidth={3} />}
              </div>
              <div className="flex-1">
                <p className="text-[10px] font-black uppercase tracking-widest leading-none mb-1 opacity-70">Sistema Soberano</p>
                <p className="text-xs font-black uppercase tracking-tight leading-tight">
                  {toast.message}
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

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
