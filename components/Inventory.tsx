
import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { Virtuoso, VirtuosoHandle } from 'react-virtuoso';
import { Asset, TagInventario } from '../types';

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
  ListChecks,
  Plus,
  Search,
  X,
  AlertTriangle,
  FilePlus2,
  RefreshCw,
  ShieldCheck,
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
  confirmButtonRef?: React.RefObject<HTMLButtonElement | null>;
}

const NumericKeypad = ({ onInput, onDelete, onClose }: { onInput: (val: string) => void, onDelete: () => void, onClose: () => void }) => {
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', 'OK'];
  
  return (
    <div className="bg-white/95 backdrop-blur-2xl border-t border-slate-200 p-3 grid grid-cols-3 gap-2 animate-slideUp z-[100] shadow-[0_-10px_40px_rgba(0,0,0,0.08)] rounded-t-[1.5rem]">
      {keys.map((key) => (
        <button
          key={key}
          onClick={() => {
            if (key === 'OK') onClose();
            else if (key === '⌫') onDelete();
            else onInput(key);
          }}
          className={`h-12 rounded-xl flex items-center justify-center text-lg font-bold transition-all active:scale-90 ${
            key === 'OK' ? 'bg-blue-600 text-white shadow-md' : 
            key === '⌫' ? 'bg-slate-100 text-slate-500' : 
            'bg-white border border-slate-200 text-slate-900 shadow-sm'
          }`}
        >
          {key === 'OK' ? 'PRONTO' : key}
        </button>
      ))}
    </div>
  );
};

const AssetCard = React.memo(({ 
  asset, selectedLocation, onSelect, onMakeDecision, selectedCompany, isBatchMode, isSelected, onToggleSelect, confirmButtonRef
}: AssetCardProps) => {
  const isConferido = !!asset._conferido;
  const normalize = (s: string) => s?.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Z0-9]/g, '').trim() || '';
  
  const companyKey = normalize(selectedCompany || '');
  const assetCompanyKey = normalize(asset.EMPRESA || '');
  const isDifferentCompany = selectedCompany && assetCompanyKey !== "" && assetCompanyKey !== companyKey;
  
  const statusUpper = String(asset.STATUS || '').toUpperCase();
  
  const isBaixado = useMemo(() => {
    return statusUpper.includes('BAIXA') || !!asset.DATABAIXA;
  }, [statusUpper, asset.DATABAIXA]);

  const visualStatus = useMemo(() => {
    if (isBaixado && !asset._conferido) return TagInventario.BAIXADO;
    if (isDifferentCompany) return TagInventario.ADOTADO_EXTERNO;

    if (!asset._conferido) {
      const needsLabel = normalize(asset.ETIQUETA || '') === 'ETIQUETAR';
      if (needsLabel) return TagInventario.FALTA_ETIQUETAR;
      return TagInventario.PENDENTE;
    }

    const wasFaltaEtiquetar = normalize(asset._plaquetaMaster || '') === 'ETIQUETAR';
    if (wasFaltaEtiquetar && normalize(asset.ETIQUETA || '') !== 'ETIQUETAR') {
      return TagInventario.ETIQUETADO;
    }

    if (asset._isNew || asset.TAG_INVENTARIO === TagInventario.NOVO_ITEM) return TagInventario.NOVO_ITEM;
    if (asset.TAG_INVENTARIO === TagInventario.RE_ADOTADO) return TagInventario.RE_ADOTADO;

    const currentEtq = normalize(asset.ETIQUETA || "");
    const masterEtq = normalize(asset._plaquetaMaster || "");
    if (masterEtq !== "" && masterEtq !== "ETIQUETAR" && currentEtq !== masterEtq) {
      return TagInventario.DIVERGENCIA;
    }

    const targetLocKey = normalize(selectedLocation || "");
    const originalLocKey = normalize(asset.ENDERECO || ""); 

    if (originalLocKey === targetLocKey) return TagInventario.CONFERIDO;
    return TagInventario.ADOTADO;

  }, [asset, selectedLocation, isDifferentCompany, normalize]);

  const getColors = (tag: TagInventario) => {
    switch (tag) {
      case TagInventario.BAIXADO: 
        return { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700', badge: 'bg-red-600 text-white', btn: 'bg-red-600', hex: '#dc2626', icon: AlertOctagon };
      case TagInventario.ADOTADO_EXTERNO: 
        return { bg: 'bg-sky-50', border: 'border-sky-200', text: 'text-sky-700', badge: 'bg-sky-600 text-white', btn: 'bg-sky-600', hex: '#0284c7', icon: Building2 };
      case TagInventario.ADOTADO: 
        return { bg: 'bg-indigo-50', border: 'border-indigo-200', text: 'text-indigo-700', badge: 'bg-indigo-600 text-white', btn: 'bg-indigo-600', hex: '#4f46e5', icon: MapPin };
      case TagInventario.RE_ADOTADO: 
        return { bg: 'bg-fuchsia-50', border: 'border-fuchsia-200', text: 'text-fuchsia-700', badge: 'bg-fuchsia-600 text-white', btn: 'bg-fuchsia-600', hex: '#c026d3', icon: RefreshCw };
      case TagInventario.CONFERIDO: 
        return { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', badge: 'bg-emerald-600 text-white', btn: 'bg-emerald-600', hex: '#059669', icon: Check };
      case TagInventario.FALTA_ETIQUETAR: 
        return { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', badge: 'bg-amber-600 text-white', btn: 'bg-amber-600', hex: '#d97706', icon: Hash };
      case TagInventario.ETIQUETADO: 
        return { bg: 'bg-violet-50', border: 'border-violet-200', text: 'text-violet-700', badge: 'bg-violet-600 text-white', btn: 'bg-violet-600', hex: '#7c3aed', icon: Check };
      case TagInventario.NOVO_ITEM: 
        return { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700', badge: 'bg-orange-600 text-white', btn: 'bg-orange-600', hex: '#ea580c', icon: Plus };
      case TagInventario.DIVERGENCIA:
        return { bg: 'bg-rose-50', border: 'border-rose-200', text: 'text-rose-700', badge: 'bg-rose-600 text-white', btn: 'bg-rose-700', hex: '#e11d48', icon: AlertTriangle };
      case TagInventario.PENDENTE:
        return { bg: 'bg-white', border: 'border-slate-200', text: 'text-slate-900', badge: 'bg-slate-200 text-slate-600', btn: 'bg-slate-600', hex: '#e2e8f0', icon: Check };
      default: 
        return { bg: 'bg-white', border: 'border-slate-200', text: 'text-slate-900', badge: 'bg-slate-200 text-slate-600', btn: 'bg-slate-600', hex: '#e2e8f0', icon: Check };
    }
  };

  const colors = useMemo(() => {
    const baseColors = getColors(visualStatus);
    // Se for baixado e conferido, vamos usar um tom de vermelho mais suave ou manter o alerta
    if (isBaixado && isConferido) {
      return { ...baseColors, bg: 'bg-red-50', border: 'border-red-200' };
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
      className={`mb-2 p-3 border-l-4 rounded-xl relative overflow-hidden transition-all modern-card active:scale-[0.99] shadow-sm ${colors.bg} ${colors.border} ${isSelected ? 'ring-2 ring-blue-500' : ''}`} 
      style={{ borderLeftColor: colors.hex }}
      onClick={() => isBatchMode ? onToggleSelect(String(asset.id)) : onSelect(asset)}
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
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Patrimônio:</span>
            <span className={`text-lg font-bold font-mono tracking-tight ${colors.text}`}>
              {formatEtiqueta(asset.ETIQUETA)}
            </span>
          </div>
          {isBatch && (
            <div className="px-2 py-1 bg-amber-500 rounded-lg flex items-center space-x-1 shadow-md">
              <Zap size={10} className="text-white fill-white" />
              <span className="text-[8px] font-bold text-white uppercase tracking-widest">LOTE</span>
            </div>
          )}
        </div>

        <p className="text-[11px] font-medium text-slate-600 uppercase leading-tight tracking-tight line-clamp-2">
          {fullDescription}
        </p>

        <div className="flex flex-wrap gap-1.5 pt-1">
          {isBaixado && (
            <span className="px-2 py-0.5 rounded-lg text-[8px] font-bold uppercase tracking-widest shadow-sm bg-red-600 text-white border border-red-700">
              BAIXADO
            </span>
          )}
          {[asset.AUDITOR_STATUS_CONFERENCIA, asset.AUDITOR_TAG_REGRA_OURO, asset.TAG_INVENTARIO].map((tag, index) => tag && (
            <span key={index} className={`px-2 py-0.5 rounded-lg text-[8px] font-bold uppercase tracking-widest shadow-sm ${index === 0 ? 'bg-blue-100 text-blue-600 border border-blue-200' : index === 1 ? 'bg-amber-100 text-amber-600 border border-amber-200' : 'bg-purple-100 text-purple-600 border border-purple-200'}`}>
              {String(tag)}
            </span>
          ))}
        </div>

        {asset._camposAlterados && asset._camposAlterados.length > 0 && (
          <div className="mt-2 pt-2 border-t border-slate-100/50 space-y-1">
            <p className="text-[7px] font-bold text-slate-400 uppercase tracking-widest">Auditoria DE/PARA:</p>
            {asset._camposAlterados.slice(0, 3).map(field => (
              <div key={field} className="flex flex-col">
                <span className="text-[8px] font-bold text-slate-700 uppercase tracking-tight">{String(field)}: {String(asset[field] || '---')}</span>
                {asset._valoresOriginais?.[field] !== undefined && (
                  <span className="text-[7px] text-red-500 font-bold uppercase italic">DE: {String(asset._valoresOriginais[field] || '---')}</span>
                )}
              </div>
            ))}
            {asset._camposAlterados.length > 3 && (
              <p className="text-[7px] text-slate-400 font-bold uppercase tracking-widest">+ {asset._camposAlterados.length - 3} campos alterados</p>
            )}
          </div>
        )}
      </div>

      {!isConferido && !isBatchMode && (
        <button 
          ref={confirmButtonRef}
          onClick={(e) => { e.stopPropagation(); onMakeDecision(String(asset.id), 'YES'); }} 
          className={`absolute bottom-3 right-3 w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-lg active:scale-90 transition-all ${colors.btn} shadow-blue-900/10`}
        >
          <Check size={20} strokeWidth={3} />
        </button>
      )}

      {isConferido && !isBatchMode && (
        <div className={`absolute bottom-3 right-3 w-8 h-8 ${isBaixado ? 'bg-red-500' : 'bg-emerald-500'} text-white rounded-lg flex items-center justify-center shadow-md`}>
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
}

const Inventory: React.FC<InventoryProps> = ({ assets, allAssets, onBack, onUpdateAsset, onBulkUpdateAssets, onSelectAsset, selectedLocation, setSelectedLocation, isInventorying, setIsInventorying, selectedCompany, onAddNewLocation, locationsWithStats }) => {
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

  const searchInputRef = useRef<HTMLInputElement>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const virtuosoRef = useRef<VirtuosoHandle>(null);

  const normalizeKey = useCallback((s: string) => s?.toString().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Z0-9]/g, '').trim() || '', []);

  useEffect(() => {
    if (isSearchVisible) {
      setShowNumericKeypad(true);
    } else {
      setShowNumericKeypad(false);
    }
  }, [isSearchVisible]);

  const filteredAssets = useMemo(() => {
    if (!selectedLocation) return [];
    const term = normalizeKey(committedSearch);
    const currentLocKey = normalizeKey(selectedLocation);
    const currentCompKey = normalizeKey(selectedCompany || '');

    // Se NÃO tem termo de busca, aplicamos Regra A: Esconde Baixados
    if (!term) {
      return assets.filter(a => {
        const locKey = normalizeKey(a.ENDERECO || "");
        const statusUpper = String(a.STATUS || '').toUpperCase();
        const isBaixado = statusUpper.includes('BAIXA') || !!a.DATABAIXA;
        
        // REGRA A: Baixado PENDENTE não aparece na listagem um clique
        if (isBaixado && !a._conferido) return false; 

        if (activeFilter === 'checked') return !!a._conferido && locKey === currentLocKey;
        return !a._conferido && locKey === currentLocKey;
      }).sort((a, b) => {
        const etqA = String(a.ETIQUETA || '').padStart(10, '0');
        const etqB = String(b.ETIQUETA || '').padStart(10, '0');
        return etqA.localeCompare(etqB, undefined, { numeric: true });
      });
    }

    // REGRA B e C: Quando há termo de busca
    // 1. Tentar buscar na empresa atual (incluindo baixados agora que houve busca manual)
    const companyMatches = assets.filter(a => 
      normalizeKey(a.ETIQUETA || '') === term || // Busca exata por etiqueta tem prioridade
      normalizeKey(a.ETIQUETA || '').includes(term)
    );

    // 2. REGRA C: Buscar em outras empresas se o número de ETIQUETA for idêntico
    // Mesmo que tenha encontrado na empresa atual, se o usuário digitou uma etiqueta, 
    // devemos mostrar se ela existe em outro lugar para análise de duplicidade/transferência.
    let globalMatches: Asset[] = [];
    if (term.length >= 3) {
      globalMatches = allAssets.filter(a => {
        const etq = normalizeKey(a.ETIQUETA || '');
        const assetCompKey = normalizeKey(a.EMPRESA || '');
        
        // Se for a mesma empresa, já tratamos em companyMatches
        if (assetCompKey === currentCompKey) return false;

        // Busca exata por etiqueta em outras empresas
        return etq === term;
      });
    }

    // Combinar resultados, removendo duplicatas por ID (caso ocorra)
    const combined = [...companyMatches];
    globalMatches.forEach(gm => {
      if (!combined.find(c => String(c.id) === String(gm.id))) {
        combined.push(gm);
      }
    });

    return combined.sort((a, b) => {
      const etqA = String(a.ETIQUETA || '').padStart(10, '0');
      const etqB = String(b.ETIQUETA || '').padStart(10, '0');
      return etqA.localeCompare(etqB, undefined, { numeric: true });
    });
  }, [assets, allAssets, selectedLocation, committedSearch, activeFilter, selectedCompany, normalizeKey]);

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
    const etq = normalizeKey(asset.ETIQUETA || "");
    const isBatch = asset.TAG_DUPLICIDADE === 'ETIQUETA+1REGISTRO';
    const currentCompKey = normalizeKey(selectedCompany || '');
    const assetCompKey = normalizeKey(asset.EMPRESA || '');
    
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
    
    const ids = Array.from(selectedIds);
    onBulkUpdateAssets(ids);
    
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

 

  // Removido auto-focus automático ao entrar na tela para atender solicitação do usuário
  // useEffect(() => {
  //   if (isInventorying) {
  //     searchInputRef.current?.focus();
  //   }
  // }, [isInventorying]);

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

  return (
    <div className="flex flex-col h-full bg-bg-main animate-fadeIn overflow-hidden">
      {!isInventorying ? (
        <>
          <div className="px-5 pt-8 pb-4 bg-white border-b border-slate-200">
            <div className="flex items-center justify-between mb-4">
              <button onClick={onBack} className="flex items-center space-x-2 text-slate-400 font-bold text-[10px] uppercase tracking-[0.2em]">
                <ArrowLeft size={16} /> <span>Voltar ao Menu</span>
              </button>
              <button 
                onClick={() => setIsLocationSearchVisible(!isLocationSearchVisible)}
                className={`p-2 rounded-lg transition-all ${isLocationSearchVisible ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}
              >
                <Search size={18} />
              </button>
            </div>
            <h1 className="text-2xl font-bold text-slate-900 uppercase tracking-tight">Mapeamento Geográfico</h1>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-2">Selecione uma localidade para auditoria</p>
            
            {isLocationSearchVisible && (
              <div className="mt-4 relative animate-fadeIn">
                <input 
                  type="text"
                  value={locationSearchTerm}
                  onChange={(e) => setLocationSearchTerm(e.target.value.toUpperCase())}
                  className="w-full bg-slate-50 border border-slate-200 px-4 py-3 font-bold text-sm rounded-xl text-slate-900 outline-none focus:border-blue-500 transition-all"
                  placeholder="PESQUISAR LOCAL..."
                  autoFocus
                />
                {locationSearchTerm && (
                  <button 
                    onClick={() => setLocationSearchTerm('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
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
                <button key={loc} onClick={() => { setSelectedLocation(loc); setIsInventorying(true); }} className="w-full bg-white border border-slate-200 rounded-2xl p-4 active:scale-[0.98] transition-all flex items-center justify-between group relative overflow-hidden modern-card">
                  <div className={`absolute top-0 left-0 bottom-0 transition-all duration-700 ease-out ${isStarted ? 'bg-emerald-50' : 'bg-transparent'}`} style={{ width: `${progress}%` }} />
                  <div className="flex items-center space-x-4 relative z-10">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center border transition-colors ${isStarted ? 'bg-emerald-500 text-white border-emerald-400 shadow-sm' : 'bg-slate-50 text-slate-400 border-slate-200'}`}>
                      <MapPin size={20} />
                    </div>
                    <div className="text-left">
                      <span className="text-[13px] font-bold uppercase block leading-none text-slate-900">{loc}</span>
                      <span className={`text-[9px] font-bold uppercase mt-2 block ${isStarted ? 'text-emerald-600' : 'text-slate-400'}`}>{stats.checked} / {stats.total} ITENS ({progress}%)</span>
                    </div>
                  </div>
                  <ChevronRight size={16} className="text-slate-300 relative z-10" />
                </button>
              );
            })}
          </div>
        </>
      ) : (
        <>
          <div className="px-3 pt-1.5 pb-1 bg-white border-b border-slate-200 shadow-sm z-20">
            <div className="flex flex-col space-y-1.5 mb-1">
              {/* Row 1: Action Buttons & SAFE Status */}
              <div className="flex items-center justify-end space-x-2">
                <div className="flex items-center space-x-1 bg-emerald-50 border border-emerald-100 px-2 py-1 rounded-lg shadow-sm" title="Banco de Dados Protegido (IndexedDB)">
                  <ShieldCheck size={10} className="text-emerald-600" />
                  <span className="text-[7px] font-black text-emerald-600 uppercase tracking-tighter">SAFE</span>
                </div>
                <div className="flex items-center space-x-1.5">
                  {isBatchMode && (
                    <button 
                      onClick={toggleSelectAll} 
                      className={`flex items-center space-x-1.5 px-2 py-1 rounded-lg border transition-all shadow-sm active:scale-95 ${selectedIds.size === filteredAssets.length && filteredAssets.length > 0 ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-slate-200 text-slate-600'}`}
                    >
                      {selectedIds.size === filteredAssets.length && filteredAssets.length > 0 ? <CheckSquare size={12} /> : <Square size={12} />}
                      <span className="text-[8px] font-bold uppercase tracking-widest">Todos</span>
                    </button>
                  )}
                  <button 
                    onClick={() => setIsSearchVisible(!isSearchVisible)} 
                    className={`p-1.5 rounded-lg border transition-all ${isSearchVisible ? 'bg-blue-600 border-blue-600 text-white shadow-sm' : 'border-slate-200 text-slate-400'}`}
                  >
                    <Search size={14} />
                  </button>
                  <button 
                    onClick={() => { setIsBatchMode(!isBatchMode); setSelectedIds(new Set()); }} 
                    className={`p-1.5 rounded-lg border transition-all ${isBatchMode ? 'bg-blue-600 border-blue-600 text-white shadow-sm' : 'border-slate-200 text-slate-400'}`}
                  >
                    <ListChecks size={14} />
                  </button>
                </div>
              </div>

              {/* Row 2: Location Field (Limited width on mobile) */}
              <button 
                onClick={() => { setIsInventorying(false); setIsBatchMode(false); setSelectedIds(new Set()); setCommittedSearch(''); setIsSearchVisible(false); }} 
                className="w-full max-w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg flex items-center space-x-2 text-slate-600 overflow-hidden active:bg-slate-100 transition-colors"
              >
                <MapPin size={12} className="text-blue-500 shrink-0" />
                <span className="text-[9px] font-bold uppercase truncate italic tracking-wide flex-1 text-left">{selectedLocation}</span>
              </button>
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
                  className="w-full bg-slate-50 border border-slate-200 px-4 py-2 font-bold font-mono text-lg text-center rounded-xl text-slate-900 outline-none focus:border-blue-500 transition-all cursor-pointer" 
                  placeholder="DIGITE ETIQUETA..." 
                />
                <button onClick={() => { setIsSearchVisible(false); setShowNumericKeypad(false); setDisplayValue(''); setCommittedSearch(''); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 active:text-slate-900"><X size={20} /></button>
              </div>
            )}

            <div className="flex space-x-1.5">
              <button onClick={() => { setActiveFilter('pending'); setCommittedSearch(''); setDisplayValue(''); }} className={`flex-1 py-1.5 rounded-lg text-[8px] font-bold uppercase border transition-all ${activeFilter === 'pending' ? 'bg-slate-900 text-white border-slate-900 shadow-sm' : 'text-slate-400 border-slate-200'}`}>Pendentes</button>
              <button onClick={() => { setActiveFilter('checked'); setCommittedSearch(''); setDisplayValue(''); }} className={`flex-1 py-1.5 rounded-lg text-[8px] font-bold uppercase border transition-all ${activeFilter === 'checked' ? 'bg-blue-600 text-white border-blue-600 shadow-sm' : 'text-slate-400 border-slate-200'}`}>Inventariado</button>
            </div>
          </div>

          <div className="flex-1 overflow-hidden bg-bg-main relative">
            {isSearchResultBatch && (
              <div className="px-4 pt-3">
                <button 
                  onClick={handleConfirmSearchBatch} 
                  className="w-full mb-3 bg-amber-500 text-white py-3 rounded-xl font-bold uppercase text-[9px] tracking-[0.2em] shadow-md active:scale-95 transition-all flex items-center justify-center space-x-2 border-b-4 border-amber-700"
                >
                  <Zap size={16} className="fill-white" />
                  <span>Confirmar Lote Completo ({filteredAssets.filter(a => !a._conferido).length} itens)</span>
                </button>
              </div>
            )}

            {/* BARRA DE AÇÃO LOTE INVENTARIO - TOPO PARA FLUIDEZ */}
            {isBatchMode && selectedIds.size > 0 && (
              <div className="px-4 pb-2 animate-slideDown">
                 <div className="bg-emerald-600 p-3 rounded-2xl shadow-lg flex items-center justify-between border border-white/20">
                    <div className="flex items-center space-x-3 pl-2">
                       <span className="text-xl font-black text-white tracking-tighter">{selectedIds.size}</span>
                       <span className="text-[9px] font-bold text-emerald-100 uppercase tracking-widest">Selecionados</span>
                    </div>
                    <div className="flex items-center space-x-2">
                       <button onClick={() => setSelectedIds(new Set())} className="p-2 bg-black/20 text-white rounded-xl"><X size={16} /></button>
                       <button onClick={handleBatchConfirm} className="px-6 py-2 bg-white text-emerald-600 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-md active:scale-95 transition-all">Confirmar Lote</button>
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
                    <div className="w-24 h-24 bg-orange-50 border border-orange-100 rounded-full flex items-center justify-center text-orange-500 mb-6 shadow-sm">
                        <AlertTriangle size={40} />
                    </div>
                    <h3 className="text-xl font-bold text-slate-900 uppercase tracking-tight">Nenhum Registro</h3>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-3 leading-relaxed">Etiqueta &quot;{committedSearch}&quot; não localizada na base v24</p>
                    
                    <button onClick={handleCreateNew} className="mt-10 w-full py-5 bg-orange-500 text-white rounded-2xl flex items-center justify-center space-x-3 shadow-lg active:scale-95 transition-all font-bold uppercase text-[10px] tracking-widest">
                        <FilePlus2 size={18} />
                        <span>Incluir Manual</span>
                    </button>
                </div>
            ) : (
                <div className="py-24 flex flex-col items-center justify-center opacity-30 text-center">
                    <Search size={64} className="mb-6 text-slate-300" />
                    <p className="text-[12px] font-bold uppercase tracking-[0.3em] text-slate-400">Aguardando Auditoria</p>
                </div>
            )}

            {showNumericKeypad && (
              <div className="absolute inset-x-0 bottom-0 z-[100]">
                <NumericKeypad 
                  onInput={(val) => setDisplayValue(prev => prev + val)}
                  onDelete={() => setDisplayValue(prev => prev.slice(0, -1))}
                  onClose={() => setShowNumericKeypad(false)}
                />
              </div>
            )}
          </div>
        </>
      )}

      {isManualEntryOpen && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-6 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
          <div className="bg-slate-900 w-full max-w-sm rounded-[2.5rem] border border-orange-500/30 shadow-2xl p-8">
            <h3 className="text-2xl font-black text-white uppercase italic tracking-tighter mb-2">Incluir Novo Item Manual</h3>
            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-6">Preencha os dados do novo ativo.</p>
            
            <div className="space-y-4 max-h-60 overflow-y-auto pr-2 no-scrollbar">
              <div>
                <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">DESCRIÇÃO DO ATIVO</label>
                <input 
                  type="text"
                  value={manualAsset.DESCRICAODOATIVO || ''}
                  onChange={(e) => setManualAsset(prev => ({ ...prev, DESCRICAODOATIVO: e.target.value.toUpperCase() }))}
                  className="w-full bg-slate-950 border-2 border-slate-800 rounded-lg px-4 py-2 font-mono text-sm text-white outline-none focus:border-orange-500 transition-all mt-1"
                />
              </div>
              <div>
                <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">SERIAL</label>
                <input 
                  type="text"
                  value={manualAsset.SERIAL || ''}
                  onChange={(e) => setManualAsset(prev => ({ ...prev, SERIAL: e.target.value.toUpperCase() }))}
                  className="w-full bg-slate-950 border-2 border-slate-800 rounded-lg px-4 py-2 font-mono text-sm text-white outline-none focus:border-orange-500 transition-all mt-1"
                />
              </div>
            </div>

            <div className="flex space-x-3 mt-6">
              <button onClick={() => setIsManualEntryOpen(false)} className="flex-1 py-4 bg-slate-800 text-slate-400 rounded-xl font-black uppercase text-xs tracking-widest">Cancelar</button>
              <button onClick={saveManualEntry} className="flex-1 py-4 bg-orange-600 text-white rounded-xl font-black uppercase text-xs tracking-widest">Salvar Item</button>
            </div>
          </div>
        </div>
      )}

       {isNewLocationModalOpen && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-6 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
          <div className="bg-slate-900 w-full max-w-sm rounded-[2.5rem] border border-sky-500/30 shadow-2xl p-8">
            <h3 className="text-2xl font-black text-white uppercase italic tracking-tighter mb-2">Criar Nova Localidade</h3>
            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-6">Insira o nome para o novo local de auditoria.</p>
            <input 
              type="text"
              value={newLocationName}
              onChange={(e) => setNewLocationName(e.target.value.toUpperCase())}
              className="w-full bg-slate-950 border-2 border-slate-800 rounded-xl px-5 py-4 font-black text-lg text-center text-white outline-none focus:border-sky-500 transition-all mb-6"
              placeholder="NOME DO LOCAL"
            />
            <div className="flex space-x-3">
              <button onClick={() => setIsNewLocationModalOpen(false)} className="flex-1 py-4 bg-slate-800 text-slate-400 rounded-xl font-black uppercase text-xs tracking-widest">Cancelar</button>
              <button 
                onClick={() => {
                  onAddNewLocation(newLocationName);
                  setNewLocationName('');
                  setIsNewLocationModalOpen(false);
                }}
                disabled={!newLocationName.trim()}
                className="flex-1 py-4 bg-sky-600 text-white rounded-xl font-black uppercase text-xs tracking-widest disabled:opacity-30"
              >
                Criar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* REMOVIDO BARRA INFERIOR PARA EVITAR SCROLL */}

      {isManualEntryOpen && (
        <div className="fixed inset-0 z-[400] flex items-center justify-center p-6 animate-fadeIn">
          <div className="absolute inset-0 bg-slate-950/95 backdrop-blur-md" onClick={() => setIsManualEntryOpen(false)} />
          <div className="bg-slate-900 w-full max-w-md rounded-[2.5rem] border border-orange-500/30 shadow-2xl overflow-hidden relative z-10 animate-scaleIn flex flex-col max-h-[90vh]">
            <div className="bg-orange-600 px-8 py-8 text-white shrink-0">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-2 bg-black/20 px-4 py-2 rounded-full border border-white/10">
                  <FilePlus2 size={14} className="fill-white" />
                  <span className="text-[10px] font-black uppercase tracking-widest">Inclusão Manual</span>
                </div>
                <button onClick={() => setIsManualEntryOpen(false)} className="p-2 bg-white/10 rounded-xl active:scale-90"><X size={20} /></button>
              </div>
              <h3 className="text-2xl font-black uppercase tracking-tighter italic leading-none">Novo Registro</h3>
              <p className="text-[10px] font-black text-white/60 uppercase tracking-widest mt-1">Preencha os dados do ativo encontrado</p>
            </div>

            <div className="flex-1 overflow-y-auto p-8 space-y-6 no-scrollbar">
               <div className="space-y-4">
                  <div>
                    <label className="text-[8px] font-black text-slate-500 uppercase tracking-[0.2em] mb-2 block">Etiqueta / Patrimônio</label>
                    <input 
                      type="text" 
                      value={manualAsset.ETIQUETA || ''} 
                      onChange={(e) => setManualAsset({...manualAsset, ETIQUETA: e.target.value.toUpperCase()})}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white font-black font-mono text-lg outline-none focus:border-orange-500"
                    />
                  </div>
                  <div>
                    <label className="text-[8px] font-black text-slate-500 uppercase tracking-[0.2em] mb-2 block">Descrição do Ativo</label>
                    <textarea 
                      rows={3}
                      value={manualAsset.DESCRICAODOATIVO || ''} 
                      onChange={(e) => setManualAsset({...manualAsset, DESCRICAODOATIVO: e.target.value.toUpperCase()})}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white font-bold text-xs outline-none focus:border-orange-500 uppercase"
                      placeholder="DESCREVA O BEM..."
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[8px] font-black text-slate-500 uppercase tracking-[0.2em] mb-2 block">Nº de Série</label>
                      <input 
                        type="text" 
                        value={manualAsset.SERIAL || ''} 
                        onChange={(e) => setManualAsset({...manualAsset, SERIAL: e.target.value.toUpperCase()})}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white font-bold text-xs outline-none focus:border-orange-500"
                      />
                    </div>
                    <div>
                      <label className="text-[8px] font-black text-slate-500 uppercase tracking-[0.2em] mb-2 block">Quantidade</label>
                      <input 
                        type="number" 
                        value={manualAsset.QT || 1} 
                        onChange={(e) => setManualAsset({...manualAsset, QT: e.target.value})}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white font-bold text-xs outline-none focus:border-orange-500"
                      />
                    </div>
                  </div>
                  <div className="p-4 bg-orange-500/10 border border-orange-500/20 rounded-2xl space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Empresa:</span>
                      <span className="text-[9px] font-black text-orange-500 uppercase">{manualAsset.EMPRESA}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Local:</span>
                      <span className="text-[9px] font-black text-orange-500 uppercase">{manualAsset.ENDERECO}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Status:</span>
                      <span className="text-[8px] font-black text-orange-500 uppercase text-right leading-tight">NOVO ITEM (MANUAL)</span>
                    </div>
                  </div>
               </div>
            </div>

            <div className="p-8 bg-slate-900 border-t border-slate-800 shrink-0">
               <button 
                 onClick={saveManualEntry}
                 className="w-full bg-orange-600 text-white py-5 rounded-2xl text-xs font-black uppercase tracking-widest shadow-xl active:scale-95 transition-all border-b-4 border-orange-800"
               >
                 Salvar e Conferir
               </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Inventory;
