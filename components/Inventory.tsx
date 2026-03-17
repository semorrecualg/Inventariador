
import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Virtuoso, VirtuosoHandle } from 'react-virtuoso';
import { Asset, TagInventario, ScannerMode, InventorySearchMode, ScanFeedbackMode } from '../types';
import Scanner from './Scanner';
import BackButton from './BackButton';

import { 
  ArrowLeft,
  MapPin, 
  Check,
  Zap, 
  ChevronRight,
  Building2,
  Hash,
  AlertOctagon,
  Square,
  CheckSquare,
  Plus,
  Search,
  X,
  AlertTriangle,
  FilePlus2,
  RefreshCw,
  ShieldCheck,
  Camera,
  Database,
  Keyboard,
  Calendar,
  User
} from 'lucide-react';

const parseAssetDate = (val: string | number | null | undefined): Date | null => {
  if (!val) return null;
  const s = String(val).trim();
  if (s === "" || s.toUpperCase() === "NULL") return null;
  if (!isNaN(Number(s)) && Number(s) > 10000) {
    return new Date(Math.round((Number(s) - 25569) * 86400 * 1000));
  }
  const parts = s.split(/[/-]/);
  if (parts.length === 3) {
    if (parts[0].length === 4) return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    if (parts[2].length === 4) return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
};

const formatMonthYearBR = (val: string | number | null | undefined): string => {
  const date = parseAssetDate(val);
  if (date) {
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${month}/${year}`;
  }
  return String(val || '').toUpperCase();
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

const formatEtiqueta = (val: string | number | null | undefined): string => {
  const s = String(val || '').trim();
  if (!s || s.toUpperCase() === 'ETIQUETAR') return s.toUpperCase();
  return s.padStart(6, '0');
};

interface AssetCardProps {
  asset: Asset;
  selectedLocation: string | null;
  onSelect: (a: Asset) => void;
  onMakeDecision: (id: string, decision: 'YES' | 'NO') => void;
  selectedCompany: string | null;
  isBatchMode: boolean;
  isSelected: boolean;
  onToggleSelect: (id: string) => void;
  confirmButtonRef?: React.Ref<HTMLButtonElement>;
}

const NumericKeypad = ({ onInput, onDelete, onClose }: { onInput: (val: string) => void, onDelete: () => void, onClose: () => void }) => {
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', 'OK'];
  
  return (
    <div className="bg-white/95 backdrop-blur-2xl border-t border-border p-3 pb-10 grid grid-cols-3 gap-2 animate-slideUp z-[100] shadow-[0_-10px_40px_rgba(0,0,0,0.08)] rounded-t-[1.5rem]">
      {keys.map((key) => (
        <button
          key={key}
          onClick={() => {
            if (key === 'OK') onClose();
            else if (key === '⌫') onDelete();
            else onInput(key);
          }}
          className={`h-14 rounded-xl flex items-center justify-center text-xl font-bold transition-all active:scale-90 ${
            key === 'OK' ? 'bg-accent text-white shadow-md' : 
            key === '⌫' ? 'bg-bg-main text-ink-muted' : 
            'bg-white border border-border text-ink shadow-sm'
          }`}
        >
          {key === 'OK' ? 'PRONTO' : key}
        </button>
      ))}
    </div>
  );
};

const normalizeKeyFast = (s: string | null | undefined) => {
  if (!s) return '';
  return s.toString().toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]/g, '')
    .trim();
};

const AssetCard = React.memo(({ 
  asset, selectedLocation, onSelect, onMakeDecision, selectedCompany, isBatchMode, isSelected, onToggleSelect, confirmButtonRef
}: AssetCardProps) => {
  const isConferido = !!asset._conferido || String(asset.AUDITOR_STATUS_CONFERENCIA || '').toUpperCase() === 'SIM';
  
  const companyKey = useMemo(() => normalizeKeyFast(selectedCompany), [selectedCompany]);
  const assetCompanyKey = useMemo(() => normalizeKeyFast(asset.EMPRESA), [asset.EMPRESA]);
  const isDifferentCompany = selectedCompany && assetCompanyKey !== "" && assetCompanyKey !== companyKey;
  
  const statusUpper = String(asset.STATUS || '').toUpperCase();
  
  const isBaixado = useMemo(() => {
    return statusUpper.includes('BAIXA') || !!asset.DATABAIXA;
  }, [statusUpper, asset.DATABAIXA]);

  const visualStatus = useMemo(() => {
    if (isBaixado && !isConferido) return TagInventario.BAIXADO;
    if (isDifferentCompany) return TagInventario.ADOTADO_EXTERNO;

    if (!isConferido) {
      const needsLabel = normalizeKeyFast(asset.ETIQUETA) === 'ETIQUETAR';
      if (needsLabel) return TagInventario.FALTA_ETIQUETAR;
      return TagInventario.PENDENTE;
    }

    const wasFaltaEtiquetar = normalizeKeyFast(asset._plaquetaMaster) === 'ETIQUETAR';
    if (wasFaltaEtiquetar && normalizeKeyFast(asset.ETIQUETA) !== 'ETIQUETAR') {
      return TagInventario.ETIQUETADO;
    }

    if (asset._isNew || asset.TAG_INVENTARIO === TagInventario.NOVO_ITEM) return TagInventario.NOVO_ITEM;
    if (asset.TAG_INVENTARIO === TagInventario.RE_ADOTADO) return TagInventario.RE_ADOTADO;

    const currentEtq = normalizeKeyFast(asset.ETIQUETA);
    const masterEtq = normalizeKeyFast(asset._plaquetaMaster);
    if (masterEtq !== "" && masterEtq !== "ETIQUETAR" && currentEtq !== masterEtq) {
      return TagInventario.DIVERGENCIA;
    }

    const targetLocKey = normalizeKeyFast(selectedLocation);
    const effectiveLocKey = normalizeKeyFast(asset._localMaster || asset.ENDERECO); 

    if (effectiveLocKey === targetLocKey && normalizeKeyFast(asset.ENDERECO) === targetLocKey) return TagInventario.CONFERIDO;
    return TagInventario.ADOTADO;

  }, [asset, selectedLocation, isDifferentCompany, isBaixado]);

  const getColors = (tag: TagInventario) => {
    switch (tag) {
      case TagInventario.BAIXADO: 
        return { bg: 'bg-danger/5', border: 'border-danger/20', text: 'text-danger', badge: 'bg-danger text-white', btn: 'bg-danger', hex: 'var(--danger)', icon: AlertOctagon };
      case TagInventario.ADOTADO_EXTERNO: 
        return { bg: 'bg-sky-50', border: 'border-sky-200', text: 'text-sky-700', badge: 'bg-sky-500 text-white', btn: 'bg-sky-500', hex: '#38bdf8', icon: Building2 };
      case TagInventario.ADOTADO: 
        return { bg: 'bg-accent-soft', border: 'border-accent/20', text: 'text-accent', badge: 'bg-accent text-white', btn: 'bg-accent', hex: 'var(--accent)', icon: MapPin };
      case TagInventario.RE_ADOTADO: 
        return { bg: 'bg-fuchsia-50', border: 'border-fuchsia-200', text: 'text-fuchsia-700', badge: 'bg-fuchsia-500 text-white', btn: 'bg-fuchsia-500', hex: '#e879f9', icon: RefreshCw };
      case TagInventario.CONFERIDO: 
        return { bg: 'bg-success/5', border: 'border-success/20', text: 'text-success', badge: 'bg-success text-white', btn: 'bg-success', hex: 'var(--success)', icon: Check };
      case TagInventario.FALTA_ETIQUETAR: 
        return { bg: 'bg-warning/5', border: 'border-warning/20', text: 'text-warning', badge: 'bg-warning text-white', btn: 'bg-warning', hex: 'var(--warning)', icon: Hash };
      case TagInventario.ETIQUETADO: 
        return { bg: 'bg-violet-50', border: 'border-violet-200', text: 'text-violet-700', badge: 'bg-violet-500 text-white', btn: 'bg-violet-500', hex: '#a78bfa', icon: Check };
      case TagInventario.NOVO_ITEM: 
        return { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700', badge: 'bg-orange-500 text-white', btn: 'bg-orange-500', hex: '#fb923c', icon: Plus };
      case TagInventario.DIVERGENCIA:
        return { bg: 'bg-danger/5', border: 'border-danger/20', text: 'text-danger', badge: 'bg-danger text-white', btn: 'bg-danger', hex: 'var(--danger)', icon: AlertTriangle };
      case TagInventario.PENDENTE:
        return { bg: 'bg-white', border: 'border-border', text: 'text-ink', badge: 'bg-bg-main text-ink-muted', btn: 'bg-ink-muted', hex: 'var(--border)', icon: Check };
      default: 
        return { bg: 'bg-white', border: 'border-border', text: 'text-ink', badge: 'bg-bg-main text-ink-muted', btn: 'bg-ink-muted', hex: 'var(--border)', icon: Check };
    }
  };

  const colors = useMemo(() => {
    const baseColors = getColors(visualStatus);
    // Se for baixado e conferido, vamos usar um tom de vermelho mais suave ou manter o alerta
    if (isBaixado && isConferido) {
      return { ...baseColors, bg: 'bg-danger/5', border: 'border-danger/20' };
    }
    return baseColors;
  }, [visualStatus, isBaixado, isConferido]);

  const isBatch = asset.TAG_DUPLICIDADE === 'ETIQUETA+1REGISTRO';

  const fullDescription = [
    asset.QT || '1',
    asset.DESCRICAODOATIVO || 'SEM DESCRIÇÃO',
    asset.SERIAL || 'S/N',
    formatMonthYearBR(asset.DATAAQUSIC),
    asset.NOMEFORNECEDOR || 'FORNECEDOR N/I'
  ].join('; ');

  return (
    <div 
      className={`mb-2 p-3 border-l-4 rounded-xl relative overflow-hidden transition-all modern-card active:scale-[0.99] shadow-sm ${colors.bg} ${colors.border} ${isSelected ? 'ring-2 ring-accent' : ''}`} 
      style={{ borderLeftColor: colors.hex }}
      onClick={() => {
        if (isBatchMode) {
          if (!isConferido) onToggleSelect(String(asset.id));
        } else {
          onSelect(asset);
        }
      }}
    >
      <div className={`absolute top-0 left-0 px-2 py-1 rounded-br-lg text-[7px] font-bold uppercase flex items-center space-x-1 shadow-sm z-10 ${colors.badge}`}>
        {isBatchMode ? (
          isSelected ? <CheckSquare size={10} className="text-white" strokeWidth={3} /> : <Square size={10} className="text-white/50" />
        ) : (
          colors.icon && <colors.icon size={10} strokeWidth={3} />
        )}
        <span className="tracking-widest">{asset.REGISTRO || '---'} | {visualStatus}</span>
      </div>
      
      <div className="pt-4 pr-8 flex flex-col space-y-1.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="text-[9px] font-bold text-ink-muted uppercase tracking-widest">Patrimônio:</span>
            <span className={`text-lg font-bold font-mono tracking-tight ${colors.text}`}>
              {formatEtiqueta(asset.ETIQUETA)}
            </span>
          </div>
          {isBatch && (
            <div className="px-2 py-1 bg-warning rounded-lg flex items-center space-x-1 shadow-md">
              <Zap size={10} className="text-white fill-white" />
              <span className="text-[8px] font-bold text-white uppercase tracking-widest">LOTE</span>
            </div>
          )}
        </div>

        <p className="text-[11px] font-medium text-ink-muted uppercase leading-tight tracking-tight line-clamp-2">
          {fullDescription}
        </p>

        <div className="flex flex-wrap gap-1.5 pt-1">
          {asset._dataLeitura && (
            <div className="px-2 py-0.5 rounded-lg text-[8px] font-black uppercase tracking-widest shadow-sm bg-ink text-white border border-border flex items-center divide-x divide-border">
              <div className="flex items-center space-x-1 pr-2">
                <Calendar size={10} className="text-accent" />
                <span>{formatReadingTime(asset._dataLeitura)}</span>
              </div>
              {asset._auditor && (
                <div className="flex items-center space-x-1 pl-2">
                  <User size={10} className="text-success" />
                  <span className="text-ink-muted">{asset._auditor}</span>
                </div>
              )}
            </div>
          )}
          {isBaixado && (
            <span className="px-2 py-0.5 rounded-lg text-[8px] font-bold uppercase tracking-widest shadow-sm bg-danger text-white border border-danger/20">
              BAIXADO
            </span>
          )}
          {[asset.AUDITOR_STATUS_CONFERENCIA, asset.AUDITOR_TAG_REGRA_OURO, asset.TAG_INVENTARIO].map((tag, index) => tag && (
            <span key={index} className={`px-2 py-0.5 rounded-lg text-[8px] font-bold uppercase tracking-widest shadow-sm ${index === 0 ? 'bg-accent-soft text-accent border border-accent/20' : index === 1 ? 'bg-warning/10 text-warning border border-warning/20' : 'bg-purple-100 text-purple-600 border border-purple-200'}`}>
              {String(tag)}
            </span>
          ))}
        </div>

        {asset.DE_PARA === 'COM ALTERAÇÃO' && (
          <div className="mt-2 pt-2 border-t border-border/50">
            <div className="flex items-center space-x-2 bg-accent-soft/50 p-2 rounded-xl border border-accent/10">
              <div className="flex-1">
                <p className="text-[7px] font-bold text-ink-muted uppercase tracking-widest">Localização DE/PARA:</p>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-[8px] font-bold text-danger uppercase italic">DE: {asset.ENDERECO || '---'}</span>
                  <span className="text-[8px] font-bold text-accent uppercase">PARA: {asset._localMaster || '---'}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {asset._camposAlterados && asset._camposAlterados.length > 0 && (
          <div className="mt-2 pt-2 border-t border-border/50 space-y-1.5">
            <p className="text-[7px] font-bold text-ink-muted uppercase tracking-widest">Outras Alterações:</p>
            {asset._camposAlterados.filter(f => f !== 'ENDERECO').slice(0, 5).map(field => (
              <div key={field} className="flex flex-col bg-bg-main/50 p-1 rounded-md border border-border/30">
                <div className="flex items-center justify-between">
                  <span className="text-[7px] font-bold text-ink-muted uppercase">{String(field)}</span>
                  <span className="text-[8px] font-bold text-success uppercase">PARA: {String(asset[field] || '---')}</span>
                </div>
                {asset._valoresOriginais?.[field] !== undefined && (
                  <span className="text-[7px] text-danger font-bold uppercase italic mt-0.5">DE: {String(asset._valoresOriginais[field] || '---')}</span>
                )}
              </div>
            ))}
            {asset._camposAlterados.length > 10 && (
              <p className="text-[7px] text-ink-muted font-bold uppercase tracking-widest">+ {asset._camposAlterados.length - 10} campos alterados</p>
            )}
          </div>
        )}
      </div>

      {!isConferido && !isBatchMode && (
        <button 
          ref={confirmButtonRef}
          onClick={(e) => { e.stopPropagation(); onMakeDecision(String(asset.id), 'YES'); }} 
          className={`absolute bottom-3 right-3 w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-lg active:scale-90 transition-all ${colors.btn} shadow-accent/10`}
        >
          <Check size={20} strokeWidth={3} />
        </button>
      )}

      {isConferido && !isBatchMode && (
        <div className={`absolute bottom-3 right-3 w-8 h-8 ${isBaixado ? 'bg-danger' : 'bg-success'} text-white rounded-lg flex items-center justify-center shadow-md`}>
          <Check size={16} strokeWidth={3} />
        </div>
      )}
    </div>
  );
});

AssetCard.displayName = 'AssetCard';

interface InventoryProps {
  assets: Asset[];
  allAssets: Asset[];
  onBack: () => void;
  onUpdateAsset: (asset: Asset) => void;
  onBulkUpdateAssets: (ids: string[], updates?: Partial<Asset>) => void;
  onSelectAsset: (asset: Asset) => void;
  selectedLocation: string | null;
  setSelectedLocation: (loc: string | null) => void;
  isInventorying: boolean;
  setIsInventorying: (val: boolean) => void;
  selectedCompany: string | null;
  onAddNewLocation: (newLocation: string) => void;
  locationsWithStats: Record<string, { total: number; checked: number }>;
  scannerMode: ScannerMode;
  searchMode: InventorySearchMode;
  onUpdateSearchMode: (mode: InventorySearchMode) => void;
  onUpdateScannerMode: (mode: ScannerMode) => void;
  autoConfirmOnScan: boolean;
  scanFeedbackMode: ScanFeedbackMode;
  onOpenConsultation: () => void;
  inventorySearchValue: string | null;
  clearInventorySearchValue: () => void;
}

const Inventory: React.FC<InventoryProps> = ({ assets, allAssets, onBack, onUpdateAsset, onBulkUpdateAssets, onSelectAsset, selectedLocation, setSelectedLocation, isInventorying, setIsInventorying, selectedCompany, onAddNewLocation, locationsWithStats, scannerMode, searchMode, onUpdateSearchMode, onUpdateScannerMode, autoConfirmOnScan, scanFeedbackMode, onOpenConsultation, inventorySearchValue, clearInventorySearchValue }) => {
  const [displayValue, setDisplayValue] = useState('');
  const [committedSearch, setCommittedSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<'pending' | 'checked'>('pending');
  
  const [isBatchMode, setIsBatchMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isManualEntryOpen, setIsManualEntryOpen] = useState(false);

  const [manualAsset, setManualAsset] = useState<Partial<Asset>>({});
  const [isNewLocationModalOpen, setIsNewLocationModalOpen] = useState(false);
  const [newLocationName, setNewLocationName] = useState('');
  const [showNumericKeypad, setShowNumericKeypad] = useState(false);
  const [isSearchVisible, setIsSearchVisible] = useState(false);
  const [isLocationSearchVisible, setIsLocationSearchVisible] = useState(false);
  const [locationSearchTerm, setLocationSearchTerm] = useState('');
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [duplicateAsset, setDuplicateAsset] = useState<Asset | null>(null);
  const [scannedAsset, setScannedAsset] = useState<Asset | null>(null);
  const [scannedResult, setScannedResult] = useState<string | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const virtuosoRef = useRef<VirtuosoHandle>(null);

  const normalizeKey = useCallback((s: string) => s?.toString().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Z0-9]/g, '').trim() || '', []);

  // Refs para manter callbacks estáveis e evitar reinício do scanner a cada atualização de estado
  const allAssetsRef = useRef(allAssets);
  const selectedLocationRef = useRef(selectedLocation);
  const selectedCompanyRef = useRef(selectedCompany);
  const onUpdateAssetRef = useRef(onUpdateAsset);
  const autoConfirmOnScanRef = useRef(autoConfirmOnScan);
  const scanFeedbackModeRef = useRef(scanFeedbackMode);
  const lastScanTime = useRef<number>(0);
  const lastScanResult = useRef<string>('');
  const isModalOpenRef = useRef(false);

  useEffect(() => { allAssetsRef.current = allAssets; }, [allAssets]);
  useEffect(() => { selectedLocationRef.current = selectedLocation; }, [selectedLocation]);
  useEffect(() => { selectedCompanyRef.current = selectedCompany; }, [selectedCompany]);
  useEffect(() => { onUpdateAssetRef.current = onUpdateAsset; }, [onUpdateAsset]);
  useEffect(() => { autoConfirmOnScanRef.current = autoConfirmOnScan; }, [autoConfirmOnScan]);
  useEffect(() => { scanFeedbackModeRef.current = scanFeedbackMode; }, [scanFeedbackMode]);
  
  useEffect(() => {
    isModalOpenRef.current = !!(scannedAsset || scannedResult || duplicateAsset || isManualEntryOpen);
  }, [scannedAsset, scannedResult, duplicateAsset, isManualEntryOpen]);

  // Auto-close duplicate asset modal after 1 second to avoid user interaction
  useEffect(() => {
    if (duplicateAsset) {
      const timer = setTimeout(() => {
        setDuplicateAsset(null);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [duplicateAsset]);

  // Handle returned search value from Consultation
  useEffect(() => {
    if (inventorySearchValue) {
      setDisplayValue(inventorySearchValue);
      setCommittedSearch(inventorySearchValue);
      setIsSearchVisible(true);
      setIsScannerOpen(false);
      onUpdateSearchMode(InventorySearchMode.MANUAL);
      clearInventorySearchValue();
    }
  }, [inventorySearchValue, clearInventorySearchValue, onUpdateSearchMode]);

  const handleScan = useCallback((result: string) => {
    // Se já houver algum modal aberto, ignora novas leituras para evitar sobreposição
    if (isModalOpenRef.current) return;

    // Debounce para evitar múltiplas leituras do mesmo código em sequência rápida (2 segundos)
    const now = Date.now();
    if (result === lastScanResult.current && now - lastScanTime.current < 2000) return;
    
    lastScanTime.current = now;
    lastScanResult.current = result;

    const term = normalizeKey(result);
    setCommittedSearch(result);
    setDisplayValue(result);
    
    // Buscar o ativo na base total usando o Ref para estabilidade
    const foundAsset = allAssetsRef.current.find(a => normalizeKey(a.ETIQUETA || '') === term);
    
    // REGRA: Se já foi inventariado, avisa (Sempre mostra modal de duplicidade)
    if (foundAsset && foundAsset._conferido) {
      setDuplicateAsset(foundAsset);
      return;
    }

    if (autoConfirmOnScanRef.current) {
      if (foundAsset) {
        // Se encontrou, confirma automaticamente na localização atual
        const currentCompKey = normalizeKey(selectedCompanyRef.current || '');
        const assetCompKey = normalizeKey(foundAsset.EMPRESA || '');
        
        if (assetCompKey !== "" && assetCompKey !== currentCompKey) {
          // Caso seja de outra empresa, adota
          onUpdateAssetRef.current({ 
            ...foundAsset, 
            EMPRESA: selectedCompanyRef.current || foundAsset.EMPRESA,
            _conferido: true,
            TAG_INVENTARIO: TagInventario.ADOTADO_EXTERNO,
            _localMaster: selectedLocationRef.current || foundAsset.ENDERECO
          });
        } else {
          // Caso seja da mesma empresa
          onUpdateAssetRef.current({
            ...foundAsset,
            _conferido: true,
            _localMaster: selectedLocationRef.current || foundAsset.ENDERECO
          });
        }
        
        // Limpa busca para próxima leitura contínua
        setCommittedSearch('');
        setDisplayValue('');
      } else {
        // Se não encontrou e está em auto-confirm, mostra modal de "Não Localizado"
        setScannedResult(result);
      }
    } else {
      // Se NÃO for auto-conferência (NÃO), deve mostrar o item e aguardar confirmação
      if (foundAsset) {
        setScannedAsset(foundAsset);
      } else {
        setScannedResult(result);
      }
    }
  }, [normalizeKey]);

  useEffect(() => {
    if (isSearchVisible) {
      setShowNumericKeypad(true);
    } else {
      setShowNumericKeypad(false);
    }
  }, [isSearchVisible]);

  const filteredAssets = useMemo(() => {
    if (!selectedLocation) return [];
    const term = normalizeKeyFast(committedSearch);
    const currentLocKey = normalizeKeyFast(selectedLocation);
    const currentCompKey = normalizeKeyFast(selectedCompany || '');

    if (!term) {
      const result = [];
      for (let i = 0; i < assets.length; i++) {
        const a = assets[i];
        const effectiveLoc = a._localMaster || a.ENDERECO || "";
        const locKey = normalizeKeyFast(effectiveLoc);
        
        if (locKey !== currentLocKey) continue;

        const statusUpper = String(a.STATUS || '').toUpperCase();
        const isBaixado = statusUpper.includes('BAIXA') || !!a.DATABAIXA;
        const isConferido = !!a._conferido || String(a.AUDITOR_STATUS_CONFERENCIA || '').toUpperCase() === 'SIM';
        
        if (isBaixado && !isConferido) continue;

        if (activeFilter === 'checked') {
          if (isConferido) result.push(a);
        } else {
          if (!isConferido) result.push(a);
        }
      }

      return result.sort((a, b) => {
        if (activeFilter === 'checked') {
          const dateA = a._dataLeitura ? new Date(a._dataLeitura).getTime() : 0;
          const dateB = b._dataLeitura ? new Date(b._dataLeitura).getTime() : 0;
          if (dateA !== dateB) return dateB - dateA;
        }
        
        const etqA = String(a.ETIQUETA || '').padStart(10, '0');
        const etqB = String(b.ETIQUETA || '').padStart(10, '0');
        return activeFilter === 'checked' 
          ? etqB.localeCompare(etqA, undefined, { numeric: true })
          : etqA.localeCompare(etqB, undefined, { numeric: true });
      });
    }

    const companyMatches = [];
    for (let i = 0; i < assets.length; i++) {
      const a = assets[i];
      const etq = normalizeKeyFast(a.ETIQUETA || '');
      if (etq === term || etq.includes(term)) {
        companyMatches.push(a);
      }
    }

    const globalMatches: Asset[] = [];
    if (term.length >= 3) {
      for (let i = 0; i < allAssets.length; i++) {
        const a = allAssets[i];
        const assetCompKey = normalizeKeyFast(a.EMPRESA || '');
        if (assetCompKey === currentCompKey) continue;

        const etq = normalizeKeyFast(a.ETIQUETA || '');
        if (etq === term) {
          globalMatches.push(a);
        }
      }
    }

    const combined = [...companyMatches];
    const seenIds = new Set(combined.map(c => String(c.id)));
    for (let i = 0; i < globalMatches.length; i++) {
      const gm = globalMatches[i];
      if (!seenIds.has(String(gm.id))) {
        combined.push(gm);
      }
    }

    return combined.sort((a, b) => {
      if (activeFilter === 'checked') {
        const dateA = a._dataLeitura ? new Date(a._dataLeitura).getTime() : 0;
        const dateB = b._dataLeitura ? new Date(b._dataLeitura).getTime() : 0;
        if (dateA !== dateB) return dateB - dateA;
      }

      const etqA = String(a.ETIQUETA || '').padStart(10, '0');
      const etqB = String(b.ETIQUETA || '').padStart(10, '0');
      return activeFilter === 'checked'
        ? etqB.localeCompare(etqA, undefined, { numeric: true })
        : etqA.localeCompare(etqB, undefined, { numeric: true });
    });
  }, [assets, allAssets, selectedLocation, committedSearch, activeFilter, selectedCompany]);

  const isSearchResultBatch = useMemo(() => {
    if (!committedSearch || filteredAssets.length <= 1) return false;
    const pendingInSearch = filteredAssets.filter(a => !a._conferido);
    if (pendingInSearch.length <= 1) return false;
    
    const firstEtq = normalizeKey(pendingInSearch[0].ETIQUETA || "");
    if (!firstEtq || firstEtq === "ETIQUETAR") return false;
    
    return pendingInSearch.every(a => normalizeKey(a.ETIQUETA || "") === firstEtq);
  }, [committedSearch, filteredAssets, normalizeKey]);

  const handleConfirmSearchBatch = () => {
    const pendingInSearch = filteredAssets.filter(a => !a._conferido);
    if (pendingInSearch.length === 0) return;
    
    const ids = pendingInSearch.map(a => String(a.id));
    onBulkUpdateAssets(ids);
    
    setCommittedSearch('');
    setDisplayValue('');
  };

  const handleMakeDecision = useCallback((id: string, decision: 'YES' | 'NO') => {
    if (decision === 'NO') return;

    const asset = allAssets.find(a => String(a.id) === id);
    if (!asset) return;
    
    const etq = normalizeKey(asset.ETIQUETA || "");
    const isBatch = asset.TAG_DUPLICIDADE === 'ETIQUETA+1REGISTRO';
    const currentCompKey = normalizeKey(selectedCompany || '');
    
    if (isBatch && etq && etq !== "ETIQUETAR") {
      // Restrito à EMPRESA ATUAL e STATUS ATIVO
      const related = allAssets.filter(a => {
        const sameEtq = normalizeKey(a.ETIQUETA || "") === etq;
        const sameComp = normalizeKey(a.EMPRESA || "") === currentCompKey;
        const sUpper = String(a.STATUS || '').toUpperCase();
        const isNotB = !sUpper.includes('BAIXA') && !a.DATABAIXA;
        return sameEtq && sameComp && isNotB && !a._conferido;
      });

      if (related.length > 1) {
        const ids = related.map(a => String(a.id));
        onBulkUpdateAssets(ids);
        setDisplayValue('');
        return;
      }
    }
    
    onUpdateAsset({
      ...asset,
      _conferido: true,
      _localMaster: selectedLocation || asset.ENDERECO
    });
    setDisplayValue('');
  }, [allAssets, onUpdateAsset, onBulkUpdateAssets, normalizeKey, selectedCompany, selectedLocation]);

  const handleAssetClick = useCallback((asset: Asset) => {
    setShowNumericKeypad(false);
    const etq = normalizeKey(asset.ETIQUETA || "");
    const isBatch = asset.TAG_DUPLICIDADE === 'ETIQUETA+1REGISTRO';
    const currentCompKey = normalizeKey(selectedCompany || '');
    const assetCompKey = normalizeKey(asset.EMPRESA || '');
    
    // BLOQUEIO DE SEGURANÇA: Se já foi conferido, mostra modal de duplicidade e impede abertura
    if (asset._conferido) {
      setDuplicateAsset(asset);
      return;
    }

    // Regra C: Se for de outra empresa, adotar automaticamente (fluidez sênior)
    if (assetCompKey !== "" && assetCompKey !== currentCompKey) {
      onUpdateAsset({ 
        ...asset, 
        EMPRESA: selectedCompany || asset.EMPRESA,
        _conferido: true,
        TAG_INVENTARIO: TagInventario.ADOTADO_EXTERNO,
        _localMaster: selectedLocation || asset.ENDERECO
      });
      return;
    }

    if (isBatch && etq && etq !== "ETIQUETAR" && !asset._conferido) {
      const related = allAssets.filter(a => {
        const sameEtq = normalizeKey(a.ETIQUETA || "") === etq;
        const sameComp = normalizeKey(a.EMPRESA || "") === currentCompKey;
        const statusUpper = String(a.STATUS || '').toUpperCase();
        const isNotBaixado = !statusUpper.includes('BAIXA') && !a.DATABAIXA;
        return sameEtq && sameComp && isNotBaixado && !a._conferido;
      });

      if (related.length > 1) {
        const ids = related.map(a => String(a.id));
        onBulkUpdateAssets(ids);
        return;
      }
    }
    onSelectAsset(asset);
  }, [allAssets, onSelectAsset, onUpdateAsset, onBulkUpdateAssets, normalizeKey, selectedCompany, selectedLocation]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) newSet.delete(id);
      else newSet.add(id);
      return newSet;
    });
  }, []);

  const handleBatchConfirm = () => {
    if (selectedIds.size === 0) return;
    
    // Filtra apenas os que ainda não foram conferidos para preservar integridade De/Para
    const ids = Array.from(selectedIds).filter(id => {
      const asset = allAssets.find(a => String(a.id) === id);
      return asset && !asset._conferido;
    });

    if (ids.length > 0) {
      onBulkUpdateAssets(ids);
    }
    
    setSelectedIds(new Set());
    setIsBatchMode(false);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredAssets.length) {
      setSelectedIds(new Set());
    } else {
      const allIds = filteredAssets.map(a => String(a.id));
      setSelectedIds(new Set(allIds));
    }
  };

  const handleCreateNew = () => {
    setManualAsset({
        ETIQUETA: committedSearch || "",
        EMPRESA: selectedCompany || "",
        STATUS: "ATIVO",
        DATAAQUSIC: new Date().toLocaleDateString('pt-BR'),
        AUDITOR_LOCAL_AUDITADO: selectedLocation || "",
        TAG_INVENTARIO: TagInventario.NOVO_ITEM,
        QT: 1,
        DESCRICAODOATIVO: '',
        SERIAL: ''
    });
    setIsManualEntryOpen(true);
  };

  const saveManualEntry = () => {
    const newAsset: Asset = {
        ...manualAsset,
        id: `manual_${Date.now()}`,
        TAG_INVENTARIO: TagInventario.NOVO_ITEM,
        _conferido: true,
        _isNew: true,
        _localMaster: selectedLocation || ""
    } as Asset;
    
    onUpdateAsset(newAsset);
    setIsManualEntryOpen(false);
    setCommittedSearch('');
    setDisplayValue('');
    onSelectAsset(newAsset);
  };

 

  useEffect(() => {
    if (isInventorying && searchMode === InventorySearchMode.SCANNER) {
      setIsScannerOpen(true);
    }
  }, [isInventorying]); // Só dispara quando entra no inventário de um local

  useEffect(() => {
    const searchTimeout = setTimeout(() => {
      setCommittedSearch(displayValue);
    }, 500);

    return () => clearTimeout(searchTimeout);
  }, [displayValue]);

  useEffect(() => {
    if (filteredAssets.length === 1 && committedSearch && !filteredAssets[0]._conferido) {
      searchInputRef.current?.blur();
      confirmButtonRef.current?.focus();
    }
  }, [filteredAssets, committedSearch]);

  // Helper para renderizar os modais de confirmação/erro de leitura
  const renderConfirmationModals = () => {
    return (
      <>
        {/* Modal de Item Duplicado */}
        {duplicateAsset && createPortal(
          <div className="fixed inset-0 z-[10001] flex items-center justify-center p-6 bg-slate-950/40 backdrop-blur-md animate-fadeIn">
            <div className="bg-white w-full max-w-sm rounded-[3rem] border border-border shadow-2xl overflow-hidden relative animate-scaleIn">
              <button 
                onClick={() => setDuplicateAsset(null)}
                className="absolute top-4 right-4 z-10 p-2 bg-white/20 hover:bg-white/30 rounded-full text-white transition-colors"
              >
                <X size={20} />
              </button>
              {(() => {
                const isSameLocation = normalizeKey(duplicateAsset._localMaster || "") === normalizeKey(selectedLocation || "");
                return (
                  <>
                    <div className={`${isSameLocation ? 'bg-success' : 'bg-warning'} p-8 text-white text-center transition-colors`}>
                      <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4 border border-white/30">
                        {isSameLocation ? <Check size={40} className="text-white" /> : <AlertTriangle size={40} className="text-white" />}
                      </div>
                      <h3 className="text-2xl font-black uppercase italic tracking-tighter leading-none">
                        {isSameLocation ? 'Item já Conferido' : 'Conflito de Localização'}
                      </h3>
                      <p className="text-[10px] font-bold text-white/70 uppercase tracking-widest mt-2">
                        {isSameLocation ? 'Registro Confirmado neste Local' : 'Bloqueio: Item em outro endereço'}
                      </p>
                    </div>
                    
                    <div className="p-8 space-y-4">
                      <div className="bg-accent-soft p-4 rounded-2xl border border-accent/10">
                        <p className="text-[8px] font-black text-ink-muted uppercase tracking-widest mb-1">Patrimônio</p>
                        <p className="text-xl font-black text-ink font-mono">{duplicateAsset.ETIQUETA}</p>
                        <p className="text-[10px] font-bold text-ink-muted mt-2 uppercase leading-tight line-clamp-2">{duplicateAsset.DESCRICAODOATIVO}</p>
                        <div className="mt-3 pt-3 border-t border-accent/10 flex items-center justify-between">
                          <span className="text-[8px] font-black text-ink-muted uppercase tracking-widest">Local do Registro:</span>
                          <span className={`text-[9px] font-black uppercase ${isSameLocation ? 'text-success' : 'text-warning'}`}>
                            {duplicateAsset._localMaster || duplicateAsset.ENDERECO}
                          </span>
                        </div>
                      </div>

                      <div className={`${isSameLocation ? 'bg-success/5 border-success/20' : 'bg-warning/5 border-warning/20'} p-4 rounded-2xl border`}>
                        <p className={`text-[10px] font-bold uppercase tracking-tight leading-relaxed text-center ${isSameLocation ? 'text-success' : 'text-warning'}`}>
                          {isSameLocation 
                            ? "Este item já foi processado e conferido neste mesmo endereço. O registro está seguro e não precisa de nova ação."
                            : "Este item já foi registrado em OUTRO endereço durante este inventário. Para preservar a integridade do relatório De/Para, o primeiro registro foi mantido."
                          }
                        </p>
                      </div>

                      <div className="pt-2">
                        <button 
                          onClick={() => setDuplicateAsset(null)} 
                          className={`w-full py-4 ${isSameLocation ? 'bg-success' : 'bg-accent'} text-white rounded-xl font-black uppercase text-xs tracking-widest shadow-lg active:scale-95 transition-all`}
                        >
                          Entendido
                        </button>
                      </div>
                    </div>
                    
                    {/* Barra de progresso para auto-fechamento */}
                    <div className="absolute bottom-0 left-0 h-1.5 w-full bg-bg-main overflow-hidden">
                      <div className={`h-full animate-progress ${isSameLocation ? 'bg-success' : 'bg-warning'}`} style={{ animationDuration: '1s' }} />
                    </div>
                  </>
                );
              })()}
            </div>
          </div>,
          document.body
        )}

        {/* Modal de Confirmação de Item Lido */}
        {scannedAsset && createPortal(
          <div className="fixed inset-0 z-[10001] flex items-center justify-center p-6 bg-slate-950/40 backdrop-blur-md animate-fadeIn">
            <div className="bg-white w-full max-w-sm rounded-[2.5rem] border border-border shadow-2xl overflow-hidden relative animate-scaleIn">
              <div className="bg-accent p-8 text-white text-center">
                <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4 border border-white/30">
                  <ShieldCheck size={40} className="text-white" />
                </div>
                <h3 className="text-2xl font-black uppercase italic tracking-tighter leading-none">Confirmar Inventário</h3>
                <p className="text-[10px] font-bold text-white/70 uppercase tracking-widest mt-2">Verifique os dados antes de registrar</p>
              </div>
              
              <div className="p-8 space-y-4">
                <div className="bg-accent-soft p-4 rounded-2xl border border-accent/10">
                  <p className="text-[8px] font-black text-ink-muted uppercase tracking-widest mb-1">Patrimônio</p>
                  <p className="text-xl font-black text-ink font-mono">{scannedAsset.ETIQUETA}</p>
                  <p className="text-[10px] font-bold text-ink-muted mt-2 uppercase leading-tight line-clamp-2">{scannedAsset.DESCRICAODOATIVO}</p>
                  <div className="mt-3 pt-3 border-t border-accent/10 flex items-center justify-between">
                    <span className="text-[8px] font-black text-ink-muted uppercase tracking-widest">Localização Atual:</span>
                    <span className="text-[9px] font-black text-accent uppercase">{selectedLocation}</span>
                  </div>
                </div>

                <div className="flex space-x-3 pt-2">
                  <button 
                    onClick={() => setScannedAsset(null)} 
                    className="flex-1 py-4 bg-bg-main text-ink-muted rounded-xl font-black uppercase text-xs tracking-widest active:scale-95 transition-all"
                  >
                    Cancelar
                  </button>
                  <button 
                    onClick={() => {
                      const currentCompKey = normalizeKey(selectedCompany || '');
                      const assetCompKey = normalizeKey(scannedAsset.EMPRESA || '');
                      
                      if (assetCompKey !== "" && assetCompKey !== currentCompKey) {
                        onUpdateAsset({ 
                          ...scannedAsset, 
                          EMPRESA: selectedCompany || scannedAsset.EMPRESA,
                          _conferido: true,
                          TAG_INVENTARIO: TagInventario.ADOTADO_EXTERNO,
                          _localMaster: selectedLocation || scannedAsset.ENDERECO
                        });
                      } else {
                        onUpdateAsset({
                          ...scannedAsset,
                          _conferido: true,
                          _localMaster: selectedLocation || scannedAsset.ENDERECO
                        });
                      }
                      setScannedAsset(null);
                    }} 
                    className="flex-1 py-4 bg-accent text-white rounded-xl font-black uppercase text-xs tracking-widest shadow-lg shadow-accent/20 active:scale-95 transition-all"
                  >
                    Confirmar
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}

        {/* Modal de Item Não Localizado */}
        {scannedResult && !scannedAsset && createPortal(
          <div className="fixed inset-0 z-[10001] flex items-center justify-center p-6 bg-slate-950/40 backdrop-blur-md animate-fadeIn">
            <div className="bg-white w-full max-w-sm rounded-[2.5rem] border border-border shadow-2xl overflow-hidden relative animate-scaleIn">
              <div className="bg-warning p-8 text-white text-center">
                <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4 border border-white/30">
                  <AlertTriangle size={40} className="text-white" />
                </div>
                <h3 className="text-2xl font-black uppercase italic tracking-tighter leading-none">Não Localizado</h3>
                <p className="text-[10px] font-bold text-white/70 uppercase tracking-widest mt-2">Patrimônio não encontrado na base</p>
              </div>
              
              <div className="p-8 space-y-4">
                <div className="bg-accent-soft p-4 rounded-2xl border border-accent/10 text-center">
                  <p className="text-[8px] font-black text-ink-muted uppercase tracking-widest mb-1">Código Lido</p>
                  <p className="text-xl font-black text-ink font-mono">{scannedResult}</p>
                </div>

                <div className="flex flex-col space-y-3 pt-2">
                  <button 
                    onClick={() => {
                      setManualAsset({
                        ETIQUETA: scannedResult,
                        EMPRESA: selectedCompany || "",
                        STATUS: "ATIVO",
                        DATAAQUSIC: new Date().toLocaleDateString('pt-BR'),
                        AUDITOR_LOCAL_AUDITADO: selectedLocation || "",
                        TAG_INVENTARIO: TagInventario.NOVO_ITEM,
                        QT: 1,
                        DESCRICAODOATIVO: '',
                        SERIAL: ''
                      });
                      setIsManualEntryOpen(true);
                      setScannedResult(null);
                    }} 
                    className="w-full py-4 bg-accent text-white rounded-xl font-black uppercase text-xs tracking-widest active:scale-95 transition-all flex items-center justify-center space-x-2 shadow-lg shadow-accent/20"
                  >
                    <FilePlus2 size={16} />
                    <span>Incluir Manual</span>
                  </button>
                  <button 
                    onClick={() => setScannedResult(null)} 
                    className="w-full py-4 bg-bg-main text-ink-muted rounded-xl font-black uppercase text-xs tracking-widest active:scale-95 transition-all"
                  >
                    Voltar ao Scanner
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
      </>
    );
  };

  return (
    <div className="flex flex-col h-full bg-bg-main animate-fadeIn overflow-hidden">
      {!isInventorying ? (
        <>
          <div className="px-5 pt-12 pb-4 bg-white border-b border-border">
            <div className="flex items-center justify-between mb-6">
              <BackButton onClick={onBack} label="Retornar ao Painel" subLabel="Analytics Precision V24" />
              <button 
                onClick={() => setIsLocationSearchVisible(!isLocationSearchVisible)}
                className={`p-3 rounded-xl transition-all shadow-sm active:scale-95 ${isLocationSearchVisible ? 'bg-accent text-white' : 'bg-bg-main text-ink-muted'}`}
              >
                <Search size={20} />
              </button>
            </div>
            <h1 className="text-2xl font-bold text-ink uppercase tracking-tight">Mapeamento Geográfico</h1>
            <p className="text-[10px] font-bold text-ink-muted uppercase tracking-widest mt-2">Selecione uma localidade para auditoria</p>
            
            {isLocationSearchVisible && (
              <div className="mt-4 relative animate-fadeIn">
                <input 
                  type="text"
                  value={locationSearchTerm}
                  onChange={(e) => setLocationSearchTerm(e.target.value.toUpperCase())}
                  className="w-full bg-bg-main border border-border px-4 py-3 font-bold text-sm rounded-xl text-ink outline-none focus:border-accent transition-all"
                  placeholder="PESQUISAR LOCAL..."
                  autoFocus
                />
                {locationSearchTerm && (
                  <button 
                    onClick={() => setLocationSearchTerm('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted"
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
            )}
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3 pb-32 no-scrollbar">
            <button onClick={() => setIsNewLocationModalOpen(true)} className="w-full bg-sky-600 text-white p-5 rounded-2xl flex items-center justify-center space-x-3 font-bold uppercase text-sm tracking-widest active:scale-[0.98] transition-all shadow-md">
              <Plus size={20} />
              <span>Criar Nova Localidade</span>
            </button>
            {Object.keys(locationsWithStats)
              .filter(loc => normalizeKey(loc).includes(normalizeKey(locationSearchTerm)))
              .sort()
              .map(loc => {
                const stats = locationsWithStats[loc];
              const progress = stats.total > 0 ? Math.round((stats.checked / stats.total) * 100) : 0;
              const isStarted = stats.checked > 0;
              
              return (
                <button key={loc} onClick={() => { setSelectedLocation(loc); setIsInventorying(true); }} className="w-full bg-white border border-border rounded-2xl p-4 active:scale-[0.98] transition-all flex items-center justify-between group relative overflow-hidden modern-card">
                  <div className={`absolute top-0 left-0 bottom-0 transition-all duration-700 ease-out ${isStarted ? 'bg-success/5' : 'bg-transparent'}`} style={{ width: `${progress}%` }} />
                  <div className="flex items-center space-x-4 relative z-10">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center border transition-colors ${isStarted ? 'bg-success text-white border-success/20 shadow-sm' : 'bg-bg-main text-ink-muted border-border'}`}>
                      <MapPin size={20} />
                    </div>
                    <div className="text-left">
                      <span className="text-[13px] font-bold uppercase block leading-none text-ink">{loc}</span>
                      <span className={`text-[9px] font-bold uppercase mt-2 block ${isStarted ? 'text-success' : 'text-ink-muted'}`}>{stats.checked} / {stats.total} ITENS ({progress}%)</span>
                    </div>
                  </div>
                  <ChevronRight size={16} className="text-ink-muted/30 relative z-10" />
                </button>
              );
            })}
          </div>
        </>
      ) : (
        <>
          <div className="px-3 py-1.5 bg-white border-b border-border shadow-sm z-20">
            <div className="flex flex-col space-y-1.5 mb-1">
              {/* Row 1: Action Buttons & SAFE Status */}
              <div className="flex items-center justify-between space-x-2">
                <button 
                  onClick={() => { setIsInventorying(false); setIsBatchMode(false); setSelectedIds(new Set()); setCommittedSearch(''); setIsSearchVisible(false); }}
                  className="p-2.5 bg-bg-main border border-border rounded-xl text-ink-muted active:text-ink active:scale-95 transition-all shadow-sm"
                  title="Voltar para Seleção de Local"
                >
                  <ArrowLeft size={16} />
                </button>
                
                <div className="flex items-center space-x-2">
                  <div className="flex items-center space-x-2">
                  {isBatchMode && (
                    <button 
                      onClick={toggleSelectAll} 
                      className={`flex items-center space-x-2 px-2.5 py-1.5 rounded-xl border transition-all shadow-sm active:scale-95 ${selectedIds.size === filteredAssets.length && filteredAssets.length > 0 ? 'bg-accent border-accent text-white' : 'bg-white border-border text-ink-muted'}`}
                    >
                      {selectedIds.size === filteredAssets.length && filteredAssets.length > 0 ? <CheckSquare size={18} /> : <Square size={18} />}
                      <span className="text-[10px] font-bold uppercase tracking-widest">Todos</span>
                    </button>
                  )}
                  
                  {activeFilter === 'pending' && !isBatchMode && (
                    <button 
                      onClick={onOpenConsultation}
                      className="p-2.5 bg-accent-soft text-accent rounded-xl border border-accent/10 shadow-sm active:scale-95 transition-all"
                      title="Consultar Item na Base"
                    >
                      <Database size={20} strokeWidth={2.5} />
                    </button>
                  )}
                  
                  <div className="flex p-0.5 bg-bg-main rounded-xl border border-border shadow-inner">
                    <button 
                      onClick={() => {
                        if (searchMode === InventorySearchMode.MANUAL && isSearchVisible) {
                          setShowNumericKeypad(!showNumericKeypad);
                        } else {
                          onUpdateSearchMode(InventorySearchMode.MANUAL);
                          setIsSearchVisible(true);
                          setIsScannerOpen(false);
                          setShowNumericKeypad(true);
                        }
                      }} 
                      className={`p-2.5 rounded-lg transition-all ${searchMode === InventorySearchMode.MANUAL ? 'bg-white text-accent shadow-sm border border-border' : 'text-ink-muted'}`}
                    >
                      <Keyboard size={20} strokeWidth={searchMode === InventorySearchMode.MANUAL ? 3 : 2} />
                    </button>
                    <button 
                      onClick={() => {
                        onUpdateSearchMode(InventorySearchMode.SCANNER);
                        setIsSearchVisible(false);
                        setIsScannerOpen(true);
                      }} 
                      className={`p-2.5 rounded-lg transition-all ${searchMode === InventorySearchMode.SCANNER ? 'bg-white text-accent shadow-sm border border-border' : 'text-ink-muted'}`}
                    >
                      <Camera size={20} strokeWidth={searchMode === InventorySearchMode.SCANNER ? 3 : 2} />
                    </button>
                  </div>

                </div>
              </div>
            </div>

            {/* Row 2: Location Field (Full width) */}
              <div className="w-full px-3 py-2 bg-bg-main border border-border rounded-xl flex items-center space-x-3 text-ink-muted shadow-sm">
                <MapPin size={16} className="text-accent shrink-0" />
                <span className="text-[11px] font-normal uppercase italic tracking-tight flex-1 text-left leading-tight">
                  {selectedLocation}
                </span>
              </div>
            </div>

            {isSearchVisible && (
              <div className="relative mb-3 animate-fadeIn">
                <input 
                  ref={searchInputRef} 
                  type="text" 
                  readOnly
                  inputMode="none"
                  onFocus={() => setShowNumericKeypad(true)}
                  value={displayValue} 
                  className="w-full bg-bg-main border border-border px-4 py-2 font-bold font-mono text-lg text-center rounded-xl text-ink outline-none focus:border-accent transition-all cursor-pointer" 
                  placeholder="DIGITE ETIQUETA..." 
                />
                <button onClick={() => { setIsSearchVisible(false); setShowNumericKeypad(false); setDisplayValue(''); setCommittedSearch(''); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted active:text-ink"><X size={20} /></button>
              </div>
            )}

            <div className="flex space-x-1.5">
              <button onClick={() => { setActiveFilter('pending'); setCommittedSearch(''); setDisplayValue(''); }} className={`flex-1 py-1.5 rounded-lg text-[8px] font-bold uppercase border transition-all ${activeFilter === 'pending' ? 'bg-ink text-white border-ink shadow-sm' : 'text-ink-muted border-border'}`}>Pendentes</button>
              <button onClick={() => { setActiveFilter('checked'); setCommittedSearch(''); setDisplayValue(''); }} className={`flex-1 py-1.5 rounded-lg text-[8px] font-bold uppercase border transition-all ${activeFilter === 'checked' ? 'bg-accent text-white border-accent shadow-sm' : 'text-ink-muted border-border'}`}>Inventariado</button>
            </div>
          </div>

          <div 
            className="flex-1 overflow-hidden bg-bg-main relative"
            onClick={() => setShowNumericKeypad(false)}
          >
            {isSearchResultBatch && (
              <div className="px-4 pt-3">
                <button 
                  onClick={handleConfirmSearchBatch} 
                  className="w-full mb-3 bg-warning text-white py-3 rounded-xl font-bold uppercase text-[9px] tracking-[0.2em] shadow-md active:scale-95 transition-all flex items-center justify-center space-x-2 border-b-4 border-black/20"
                >
                  <Zap size={16} className="fill-white" />
                  <span>Confirmar Lote Completo ({filteredAssets.filter(a => !a._conferido).length} itens)</span>
                </button>
              </div>
            )}

            {/* BARRA DE AÇÃO LOTE INVENTARIO - TOPO PARA FLUIDEZ */}
            {isBatchMode && selectedIds.size > 0 && (
              <div className="px-4 pb-2 animate-slideDown">
                 <div className="bg-success p-3 rounded-2xl shadow-lg flex items-center justify-between border border-white/20">
                    <div className="flex items-center space-x-3 pl-2">
                       <span className="text-xl font-black text-white tracking-tighter">{selectedIds.size}</span>
                       <span className="text-[9px] font-bold text-white/70 uppercase tracking-widest">Selecionados</span>
                    </div>
                    <div className="flex items-center space-x-2">
                       <button onClick={() => setSelectedIds(new Set())} className="p-2 bg-black/20 text-white rounded-xl"><X size={16} /></button>
                       <button onClick={handleBatchConfirm} className="px-6 py-2 bg-white text-success rounded-xl text-[10px] font-black uppercase tracking-widest shadow-md active:scale-95 transition-all">Confirmar Lote</button>
                    </div>
                 </div>
              </div>
            )}

            {/* Scanner Integrado (Inline) */}
            {isScannerOpen && searchMode === 'SCANNER' && (
              <div className="px-4 mb-4">
                <div className="relative overflow-hidden rounded-3xl border-4 border-white/10 shadow-2xl">
                  <Scanner 
                    isInline={true}
                    mode={scannerMode}
                    onModeChange={onUpdateScannerMode}
                    onScan={handleScan}
                    onClose={() => setIsScannerOpen(false)}
                    isPaused={!!(scannedAsset || scannedResult || duplicateAsset)}
                    scanFeedbackMode={scanFeedbackMode}
                  />
                  <div className="absolute top-4 right-4 flex items-center space-x-2 z-50">
                    <div className="px-3 py-1 bg-success/80 backdrop-blur-md rounded-full flex items-center space-x-2">
                      <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
                      <span className="text-[10px] font-black text-white uppercase tracking-widest">Scanner Ativo</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* BARRA DE RESUMO DE AUDITORIA NO LOCAL */}
            {activeFilter === 'checked' && filteredAssets.length > 0 && (
              <div className="px-4 py-2 animate-fadeIn">
                <div className="bg-white border border-border rounded-2xl p-3 flex items-center justify-between shadow-sm">
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 bg-accent-soft rounded-lg flex items-center justify-center text-accent">
                      <MapPin size={16} />
                    </div>
                    <div>
                      <p className="text-[7px] font-black text-ink-muted uppercase tracking-widest">Auditoria no Local</p>
                      <p className="text-[10px] font-bold text-ink uppercase tracking-tight">{selectedLocation}</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-4 pr-2">
                    <div className="text-right">
                      <p className="text-[7px] font-black text-ink-muted uppercase tracking-widest">Adotados</p>
                      <p className="text-sm font-black text-accent leading-none mt-0.5">
                        {filteredAssets.filter(a => normalizeKey(a.ENDERECO || '') !== normalizeKey(selectedLocation || '')).length}
                      </p>
                    </div>
                    <div className="w-px h-6 bg-border" />
                    <div className="text-right">
                      <p className="text-[7px] font-black text-ink-muted uppercase tracking-widest">Próprios</p>
                      <p className="text-sm font-black text-success leading-none mt-0.5">
                        {filteredAssets.filter(a => normalizeKey(a.ENDERECO || '') === normalizeKey(selectedLocation || '')).length}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {filteredAssets.length > 0 ? (
              <Virtuoso
                ref={virtuosoRef}
                style={{ height: '100%' }}
                data={filteredAssets}
                increaseViewportBy={300}
                isScrolling={(scrolling) => {
                  if (scrolling && showNumericKeypad) {
                    setShowNumericKeypad(false);
                  }
                }}
                itemContent={(index, asset) => (
                  <div className="px-4 pt-1.5">
                    <AssetCard 
                      asset={asset} 
                      selectedLocation={selectedLocation} 
                      onSelect={() => handleAssetClick(asset)} 
                      onMakeDecision={handleMakeDecision} 
                      selectedCompany={selectedCompany} 
                      isBatchMode={isBatchMode} 
                      isSelected={selectedIds.has(String(asset.id))} 
                      onToggleSelect={toggleSelect} 
                      confirmButtonRef={confirmButtonRef}
                    />
                  </div>
                )}
              />
            ) : committedSearch ? (
                <div className="py-20 flex flex-col items-center justify-center text-center animate-fadeIn px-10">
                    <div className="w-24 h-24 bg-warning/5 border border-warning/20 rounded-full flex items-center justify-center text-warning mb-6 shadow-sm">
                        <AlertTriangle size={40} />
                    </div>
                    <h3 className="text-xl font-bold text-ink uppercase tracking-tight">Nenhum Registro</h3>
                    <p className="text-[10px] font-bold text-ink-muted uppercase tracking-widest mt-3 leading-relaxed">Etiqueta &quot;{committedSearch}&quot; não localizada na base v24</p>
                    
                    <button onClick={handleCreateNew} className="mt-10 w-full py-5 bg-warning text-white rounded-2xl flex items-center justify-center space-x-3 shadow-lg active:scale-95 transition-all font-bold uppercase text-[10px] tracking-widest">
                        <FilePlus2 size={18} />
                        <span>Incluir Manual</span>
                    </button>
                </div>
            ) : (
                <div className="py-24 flex flex-col items-center justify-center opacity-30 text-center">
                    <Search size={64} className="mb-6 text-ink-muted" />
                    <p className="text-[12px] font-bold uppercase tracking-[0.3em] text-ink-muted">Aguardando Auditoria</p>
                </div>
            )}
          </div>

        {showNumericKeypad && (
          <div className="absolute inset-x-0 bottom-0 z-[100]">
            <NumericKeypad 
              onInput={(val) => setDisplayValue(prev => prev + val)}
              onDelete={() => setDisplayValue(prev => prev.slice(0, -1))}
              onClose={() => setShowNumericKeypad(false)}
            />
          </div>
        )}
      </>
    )}

      {/* Modal de Inclusão Manual removido daqui pois estava duplicado */}

      {/* Scanner Full-Screen */}
      {isScannerOpen && searchMode !== 'SCANNER' && (
        <Scanner 
          mode={scannerMode}
          onModeChange={onUpdateScannerMode}
          onScan={handleScan}
          onClose={() => setIsScannerOpen(false)}
          isPaused={!!(scannedAsset || scannedResult || duplicateAsset)}
          scanFeedbackMode={scanFeedbackMode}
          onManualInput={() => {
            setIsScannerOpen(false);
            setManualAsset({
              ETIQUETA: "",
              EMPRESA: selectedCompany || "",
              STATUS: "ATIVO",
              DATAAQUSIC: new Date().toLocaleDateString('pt-BR'),
              AUDITOR_LOCAL_AUDITADO: selectedLocation || "",
              TAG_INVENTARIO: TagInventario.NOVO_ITEM,
              QT: 1,
              DESCRICAODOATIVO: '',
              SERIAL: '',
              ENDERECO: selectedLocation || ""
            });
            setIsManualEntryOpen(true);
          }}
        />
      )}

      {/* Modais de Confirmação e Erro de Leitura */}
      {renderConfirmationModals()}

      {/* Outros Modais do Sistema */}
      {isNewLocationModalOpen && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-6 bg-slate-950/40 backdrop-blur-md animate-fadeIn">
          <div className="bg-white w-full max-w-sm rounded-[2.5rem] border border-border shadow-2xl overflow-hidden relative animate-scaleIn">
            <div className="bg-accent p-8 text-white text-center">
              <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4 border border-white/30">
                <MapPin size={40} className="text-white" />
              </div>
              <h3 className="text-2xl font-black uppercase italic tracking-tighter leading-none">Nova Localidade</h3>
              <p className="text-[10px] font-bold text-white/70 uppercase tracking-widest mt-2">Mapeamento de Endereço</p>
            </div>
            
            <div className="p-8 space-y-6">
              <div className="space-y-2">
                <label className="text-[9px] font-black text-ink-muted uppercase tracking-widest ml-1">Nome do Local</label>
                <input 
                  type="text" 
                  value={newLocationName} 
                  onChange={(e) => setNewLocationName(e.target.value.toUpperCase())}
                  className="w-full bg-bg-main border border-border p-4 rounded-2xl text-sm font-bold text-ink outline-none focus:border-accent transition-all"
                  placeholder="EX: SALA 101, ALMOXARIFADO..."
                  autoFocus
                />
              </div>

              <div className="flex flex-col space-y-3">
                <button 
                  onClick={() => {
                    onAddNewLocation(newLocationName);
                    setNewLocationName('');
                    setIsNewLocationModalOpen(false);
                  }}
                  disabled={!newLocationName.trim()}
                  className="w-full py-4 bg-accent disabled:bg-ink-muted/20 text-white rounded-xl font-black uppercase text-xs tracking-widest shadow-lg shadow-accent/20 active:scale-95 transition-all"
                >
                  Confirmar Criação
                </button>
                <button 
                  onClick={() => { setIsNewLocationModalOpen(false); setNewLocationName(''); }} 
                  className="w-full py-4 bg-bg-main text-ink-muted rounded-xl font-black uppercase text-xs tracking-widest active:scale-95 transition-all"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {scannedAsset && createPortal(
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-6 bg-slate-950/40 backdrop-blur-md animate-fadeIn">
          <div className="bg-white w-full max-w-sm rounded-[2.5rem] border border-border shadow-2xl overflow-hidden relative animate-scaleIn">
            <button 
              onClick={() => setScannedAsset(null)}
              className="absolute top-4 right-4 z-10 p-2 bg-white/20 hover:bg-white/30 rounded-full text-white transition-colors"
            >
              <X size={20} />
            </button>
            <div className="bg-accent p-8 text-white text-center">
              <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4 border border-white/30">
                <ShieldCheck size={40} className="text-white" />
              </div>
              <h3 className="text-2xl font-black uppercase italic tracking-tighter leading-none">Confirmar Inventário</h3>
              <p className="text-[10px] font-bold text-white/70 uppercase tracking-widest mt-2">Verifique os dados antes de registrar</p>
            </div>
            
            <div className="p-8 space-y-4">
              <div className="bg-accent-soft p-4 rounded-2xl border border-accent/10">
                <p className="text-[8px] font-black text-ink-muted uppercase tracking-widest mb-1">Patrimônio</p>
                <p className="text-xl font-black text-ink font-mono">{scannedAsset.ETIQUETA}</p>
                <p className="text-[10px] font-bold text-ink-muted mt-2 uppercase leading-tight line-clamp-2">{scannedAsset.DESCRICAODOATIVO}</p>
                <div className="mt-3 pt-3 border-t border-accent/10 flex items-center justify-between">
                  <span className="text-[8px] font-black text-ink-muted uppercase tracking-widest">Localização Atual:</span>
                  <span className="text-[9px] font-black text-accent uppercase">{selectedLocation}</span>
                </div>
              </div>

              <div className="flex space-x-3 pt-2">
                <button 
                  onClick={() => setScannedAsset(null)} 
                  className="flex-1 py-4 bg-bg-main text-ink-muted rounded-xl font-black uppercase text-xs tracking-widest active:scale-95 transition-all"
                >
                  Cancelar
                </button>
                <button 
                  onClick={() => {
                    const currentCompKey = normalizeKey(selectedCompany || '');
                    const assetCompKey = normalizeKey(scannedAsset.EMPRESA || '');
                    
                    if (assetCompKey !== "" && assetCompKey !== currentCompKey) {
                      onUpdateAsset({ 
                        ...scannedAsset, 
                        EMPRESA: selectedCompany || scannedAsset.EMPRESA,
                        _conferido: true,
                        TAG_INVENTARIO: TagInventario.ADOTADO_EXTERNO,
                        _localMaster: selectedLocation || scannedAsset.ENDERECO
                      });
                    } else {
                      onUpdateAsset({
                        ...scannedAsset,
                        _conferido: true,
                        _localMaster: selectedLocation || scannedAsset.ENDERECO
                      });
                    }
                    setScannedAsset(null);
                  }} 
                  className="flex-1 py-4 bg-accent text-white rounded-xl font-black uppercase text-xs tracking-widest shadow-lg shadow-accent/20 active:scale-95 transition-all"
                >
                  Confirmar
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {scannedResult && !scannedAsset && createPortal(
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-6 bg-slate-950/40 backdrop-blur-md animate-fadeIn">
          <div className="bg-white w-full max-w-sm rounded-[2.5rem] border border-border shadow-2xl overflow-hidden relative animate-scaleIn">
            <button 
              onClick={() => setScannedResult(null)}
              className="absolute top-4 right-4 z-10 p-2 bg-white/20 hover:bg-white/30 rounded-full text-white transition-colors"
            >
              <X size={20} />
            </button>
            <div className="bg-warning p-8 text-white text-center">
              <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4 border border-white/30">
                <AlertTriangle size={40} className="text-white" />
              </div>
              <h3 className="text-2xl font-black uppercase italic tracking-tighter leading-none">Não Localizado</h3>
              <p className="text-[10px] font-bold text-white/70 uppercase tracking-widest mt-2">Patrimônio não encontrado na base</p>
            </div>
            
            <div className="p-8 space-y-4">
              <div className="bg-accent-soft p-4 rounded-2xl border border-accent/10 text-center">
                <p className="text-[8px] font-black text-ink-muted uppercase tracking-widest mb-1">Código Lido</p>
                <p className="text-xl font-black text-ink font-mono">{scannedResult}</p>
              </div>

              <div className="flex flex-col space-y-3 pt-2">
                <button 
                  onClick={() => {
                    setManualAsset({
                      ETIQUETA: scannedResult,
                      EMPRESA: selectedCompany || "",
                      STATUS: "ATIVO",
                      DATAAQUSIC: new Date().toLocaleDateString('pt-BR'),
                      AUDITOR_LOCAL_AUDITADO: selectedLocation || "",
                      TAG_INVENTARIO: TagInventario.NOVO_ITEM,
                      QT: 1,
                      DESCRICAODOATIVO: '',
                      SERIAL: ''
                    });
                    setIsManualEntryOpen(true);
                    setScannedResult(null);
                  }} 
                  className="w-full py-4 bg-accent text-white rounded-xl font-black uppercase text-xs tracking-widest active:scale-95 transition-all flex items-center justify-center space-x-2 shadow-lg shadow-accent/20"
                >
                  <FilePlus2 size={16} />
                  <span>Incluir Manual</span>
                </button>
                <button 
                  onClick={() => setScannedResult(null)} 
                  className="w-full py-4 bg-bg-main text-ink-muted rounded-xl font-black uppercase text-xs tracking-widest active:scale-95 transition-all"
                >
                  Voltar ao Scanner
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* REMOVIDO BARRA INFERIOR PARA EVITAR SCROLL */}

      {isManualEntryOpen && createPortal(
        <div className="fixed inset-0 z-[10000] flex items-start justify-center p-4 sm:p-6 bg-slate-950/40 backdrop-blur-md animate-fadeIn overflow-y-auto pt-10 sm:pt-20">
          <div className="absolute inset-0" onClick={() => setIsManualEntryOpen(false)} />
          <div className="bg-white w-full max-w-md rounded-[2.5rem] border border-border shadow-2xl overflow-hidden relative z-10 animate-scaleIn flex flex-col mb-20">
            <div className="bg-accent px-8 py-6 text-white shrink-0">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-2 bg-white/20 px-4 py-2 rounded-full border border-white/10">
                  <FilePlus2 size={14} className="fill-white" />
                  <span className="text-[10px] font-black uppercase tracking-widest">Inclusão Manual</span>
                </div>
                <button onClick={() => setIsManualEntryOpen(false)} className="p-2 bg-white/10 rounded-xl active:scale-90"><X size={20} /></button>
              </div>
              <h3 className="text-2xl font-black uppercase tracking-tighter italic leading-none">Novo Registro</h3>
              <p className="text-[10px] font-black text-white/60 uppercase tracking-widest mt-1">Preencha os dados do ativo encontrado</p>
            </div>

            <div className="flex-1 p-8 space-y-6 pb-[40vh]">
               <div className="space-y-4">
                  <div>
                    <label className="text-[8px] font-black text-ink-muted uppercase tracking-[0.2em] mb-2 block">Etiqueta / Patrimônio</label>
                    <input 
                      type="text" 
                      value={manualAsset.ETIQUETA || ''} 
                      onChange={(e) => setManualAsset({...manualAsset, ETIQUETA: e.target.value.toUpperCase()})}
                      className="w-full bg-accent-soft border border-accent/10 rounded-xl px-4 py-3 text-ink font-black font-mono text-lg outline-none focus:border-accent"
                    />
                  </div>
                  <div>
                    <label className="text-[8px] font-black text-ink-muted uppercase tracking-[0.2em] mb-2 block">Descrição do Ativo</label>
                    <textarea 
                      rows={3}
                      value={manualAsset.DESCRICAODOATIVO || ''} 
                      onChange={(e) => setManualAsset({...manualAsset, DESCRICAODOATIVO: e.target.value.toUpperCase()})}
                      className="w-full bg-accent-soft border border-accent/10 rounded-xl px-4 py-3 text-ink font-bold text-xs outline-none focus:border-accent uppercase"
                      placeholder="DESCREVA O BEM..."
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[8px] font-black text-ink-muted uppercase tracking-[0.2em] mb-2 block">Nº de Série</label>
                      <input 
                        type="text" 
                        value={manualAsset.SERIAL || ''} 
                        onChange={(e) => setManualAsset({...manualAsset, SERIAL: e.target.value.toUpperCase()})}
                        className="w-full bg-accent-soft border border-accent/10 rounded-xl px-4 py-3 text-ink font-bold text-xs outline-none focus:border-accent"
                      />
                    </div>
                    <div>
                      <label className="text-[8px] font-black text-ink-muted uppercase tracking-[0.2em] mb-2 block">Quantidade</label>
                      <input 
                        type="number" 
                        value={manualAsset.QT || 1} 
                        onChange={(e) => setManualAsset({...manualAsset, QT: e.target.value})}
                        className="w-full bg-accent-soft border border-accent/10 rounded-xl px-4 py-3 text-ink font-bold text-xs outline-none focus:border-accent"
                      />
                    </div>
                  </div>
                  <div className="p-4 bg-accent-soft border border-accent/10 rounded-2xl space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[8px] font-black text-ink-muted uppercase tracking-widest">Empresa:</span>
                      <span className="text-[9px] font-black text-accent uppercase">{manualAsset.EMPRESA}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[8px] font-black text-ink-muted uppercase tracking-widest">Local:</span>
                      <span className="text-[9px] font-black text-accent uppercase">{manualAsset.ENDERECO}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[8px] font-black text-ink-muted uppercase tracking-widest">Status:</span>
                      <span className="text-[8px] font-black text-accent uppercase text-right leading-tight">NOVO ITEM (MANUAL)</span>
                    </div>
                  </div>
               </div>
            </div>

            <div className="p-8 bg-white border-t border-accent/10 shrink-0 sticky bottom-0">
               <button 
                 onClick={saveManualEntry}
                 className="w-full bg-accent text-white py-5 rounded-2xl text-xs font-black uppercase tracking-widest shadow-xl active:scale-95 transition-all shadow-accent/20"
               >
                 Salvar e Conferir
               </button>
            </div>
          </div>
        </div>,
        document.body
      )}

    </div>
  );
};

export default Inventory;
