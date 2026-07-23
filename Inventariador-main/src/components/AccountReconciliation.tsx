import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { Virtuoso } from 'react-virtuoso';
import { Asset, TagInventario } from '../types';
import { logger } from '../utils/logger';
import { 
  Search, 
  Filter, 
  CheckCircle2, 
  Circle, 
  Building2, 
  ChevronRight,
  MapPin,
  Check,
  Zap,
  AlertOctagon,
  AlertTriangle,
  Plus,
  Hash,
  RefreshCw,
  Calendar,
  User,
  ArrowLeft
} from 'lucide-react';

const formatMonthYearBR = (val: string | number | null | undefined): string => {
  if (!val) return '';
  const s = String(val).trim();
  if (s === "" || s.toUpperCase() === "NULL") return '';
  
  const parseDate = (v: string): Date | null => {
    if (!isNaN(Number(v)) && Number(v) > 10000) {
      return new Date(Math.round((Number(v) - 25569) * 86400 * 1000));
    }
    const parts = v.split(/[/-]/);
    if (parts.length === 3) {
      if (parts[0].length === 4) return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
      if (parts[2].length === 4) return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
    }
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  };

  const date = parseDate(s);
  if (date) {
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${month}/${year}`;
  }
  return s.toUpperCase();
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

const isSixDigitNumeric = (val: string | number | null | undefined): boolean => {
  const s = String(val || '').trim();
  return /^\d{6}$/.test(s);
};

interface AssetCardProps {
  asset: Asset;
  onToggle: (a: Asset) => void;
  isSelected?: boolean;
  onSelect?: (id: string) => void;
}

const AssetCard = React.memo(({ asset, onToggle, isSelected = false, onSelect }: AssetCardProps) => {
  const isConferido = !!asset._conferido;
  const isSixDigit = isSixDigitNumeric(asset.ETIQUETA);
  const isLabeling = String(asset.ETIQUETA || '').toUpperCase().trim() === 'ETIQUETAR';
  const isLocked = isSixDigit || isLabeling;
  const normalize = (s: string) => s?.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Z0-9]/g, '').trim() || '';
  
  const statusUpper = String(asset.STATUS || '').toUpperCase();
  const isBaixado = statusUpper.includes('BAIXA') || !!asset.DATABAIXA;

  const visualStatus = useMemo(() => {
    if (isBaixado && !asset._conferido) return TagInventario.BAIXADO;

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

    return TagInventario.CONFERIDO;
  }, [asset, isBaixado, normalize]);

  const getColors = (tag: TagInventario) => {
    switch (tag) {
      case TagInventario.BAIXADO: 
        return { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700', badge: 'bg-red-600 text-white', btn: 'bg-red-600', hex: '#dc2626', icon: AlertOctagon };
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
    if (isBaixado && isConferido) {
      return { ...baseColors, bg: 'bg-red-50', border: 'border-red-200' };
    }
    return baseColors;
  }, [visualStatus, isBaixado, isConferido]);

  const isValueZeroForAsset = useMemo(() => {
    const val = asset.VLRAQUISIC || asset.vlraquisic;
    if (val === undefined || val === null) return true;
    const num = typeof val === 'number' ? val : parseFloat(String(val).replace(/[R$\s]/gi, ''));
    return isNaN(num) || num <= 0;
  }, [asset.VLRAQUISIC, asset.vlraquisic]);

  const fullDescription = [
    asset.QT || '1',
    asset.DESCRICAODOATIVO || 'SEM DESCRIÇÃO',
    asset.SERIAL || 'S/N',
    formatMonthYearBR(asset.DATAAQUISIC),
    asset.NOMEFORNECEDOR || 'FORNECEDOR N/I'
  ].join('; ');

  return (
    <div className="flex items-center space-x-3 w-full">
      {!isLocked && onSelect && (
        <button 
          onClick={(e) => {
            e.stopPropagation();
            onSelect(String(asset.id));
          }}
          className={`shrink-0 w-6 h-6 rounded-lg border flex items-center justify-center transition-all cursor-pointer ${
            isSelected 
              ? 'bg-accent border-accent text-white shadow-md shadow-accent/20' 
              : 'bg-white border-slate-300 text-transparent hover:border-accent'
          }`}
        >
          <Check size={14} strokeWidth={3} className={isSelected ? 'block' : 'hidden'} />
        </button>
      )}
      <div 
        className={`flex-1 p-3 border-l-4 rounded-xl relative overflow-hidden transition-all modern-card shadow-sm ${isLocked ? 'opacity-60 grayscale-[0.5] cursor-not-allowed bg-slate-50 border-slate-200' : `active:scale-[0.99] cursor-pointer ${colors.bg} ${colors.border}`}`} 
        style={{ borderLeftColor: isLocked ? '#94a3b8' : colors.hex }}
        onClick={() => !isLocked && onToggle(asset)}
      >
        <div className={`absolute top-0 left-0 px-2 py-1 rounded-br-lg text-[7px] font-bold uppercase flex items-center space-x-1 shadow-sm z-10 ${isLocked ? 'bg-slate-400 text-white' : colors.badge}`}>
          {isLocked ? <AlertTriangle size={10} strokeWidth={3} /> : (colors.icon && <colors.icon size={10} strokeWidth={3} />)}
          <span className="tracking-widest">
            {isLocked ? `BLOQUEADO | ${isSixDigit ? 'REGRA DE OURO' : 'ETIQUETAGEM'}` : `${asset.REGISTRO || '---'} | ${visualStatus}`}
          </span>
        </div>
        
        <div className="pt-4 pr-8 flex flex-col space-y-1.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Patrimônio:</span>
              <span className={`text-lg font-bold font-mono tracking-tight ${isLocked ? 'text-slate-500' : colors.text}`}>
                {formatEtiqueta(asset.ETIQUETA)}
              </span>
            </div>
            {isLocked ? (
              <div className="px-2 py-1 bg-slate-200 rounded-lg flex items-center space-x-1">
                <AlertTriangle size={10} className="text-slate-500" />
                <span className="text-[7px] font-black text-slate-500 uppercase tracking-widest">
                  {isSixDigit ? 'USAR TELA INVENTÁRIO' : 'USAR TELA ETIQUETAR'}
                </span>
              </div>
            ) : (
              <div className="flex gap-1">
                {asset.TAG_DUPLICIDADE === 'ETIQUETA+1REGISTRO' && (
                  <div className="px-2 py-1 bg-amber-500 rounded-lg flex items-center space-x-1 shadow-md">
                    <Zap size={10} className="text-white fill-white" />
                    <span className="text-[8px] font-bold text-white uppercase tracking-widest">LOTE</span>
                  </div>
                )}
                {isValueZeroForAsset && (
                  <div className="px-2 py-1 bg-rose-50 border border-rose-205 text-rose-700 rounded-lg flex items-center space-x-1 shadow-sm">
                    <AlertTriangle size={10} className="text-rose-600" />
                    <span className="text-[7px] font-black uppercase tracking-widest leading-none">AQUISIÇÃO ZERO</span>
                  </div>
                )}
              </div>
            )}
          </div>

          <p className="text-[11px] font-medium text-slate-600 uppercase leading-tight tracking-tight line-clamp-2">
            {fullDescription}
          </p>

          <div className="flex items-center space-x-2 pt-1 border-t border-slate-100 mt-1">
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">C. Custo:</span>
            <span className="text-[10px] font-bold text-slate-700 uppercase truncate tracking-tight">
              {asset.CENTRODECUSTO || '---'}
            </span>
          </div>

          <div className="flex flex-wrap gap-1.5 pt-1">
            {asset._dataLeitura && (
              <div className="px-2 py-0.5 rounded-lg text-[8px] font-black uppercase tracking-widest shadow-sm bg-accent text-white border border-accent/20 flex items-center divide-x divide-white/20">
                <div className="flex items-center space-x-1 pr-2">
                  <Calendar size={10} className="text-white/80" />
                  <span>{formatReadingTime(asset._dataLeitura)}</span>
                </div>
                {asset._auditor && (
                  <div className="flex items-center space-x-1 pl-2">
                    <User size={10} className="text-white/80" />
                    <span className="text-white/90">{asset._auditor}</span>
                  </div>
                )}
              </div>
            )}
            {isBaixado && (
              <span className="px-2 py-0.5 rounded-lg text-[8px] font-bold uppercase tracking-widest shadow-sm bg-red-400 text-white border border-red-500/20">
                BAIXADO
              </span>
            )}
          </div>
        </div>

        <div className={`absolute bottom-3 right-3 w-8 h-8 ${isConferido ? (isBaixado ? 'bg-red-400' : 'bg-accent') : 'bg-slate-100 text-slate-400 border border-slate-200'} rounded-lg flex items-center justify-center shadow-md transition-all`}>
          {isConferido ? <Check size={16} strokeWidth={3} className="text-white" /> : <Circle size={16} />}
        </div>
      </div>
    </div>
  );
});

AssetCard.displayName = 'AssetCard';

interface AccountReconciliationProps {
  assets: Asset[];
  onBack: () => void;
  onUpdateAsset: (asset: Asset) => void;
  onBulkUpdateAssets: (ids: string[], updates?: Partial<Asset>) => void;
}

const AccountReconciliation: React.FC<AccountReconciliationProps> = ({ 
  assets, 
  onBack, 
  onUpdateAsset,
  onBulkUpdateAssets
}) => {
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [assetSearchTerm, setAssetSearchTerm] = useState('');
  const [activeFilter, setActiveFilter] = useState<'pending' | 'checked'>('pending');
  const [selectedAssetIds, setSelectedAssetIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    setSelectedAssetIds(new Set());
  }, [selectedAccount, activeFilter]);

  const handleSelectAsset = useCallback((assetId: string) => {
    setSelectedAssetIds(prev => {
      const next = new Set(prev);
      if (next.has(assetId)) {
        next.delete(assetId);
      } else {
        next.add(assetId);
      }
      return next;
    });
  }, []);

  const handleBulkReconcile = useCallback(async () => {
    if (selectedAssetIds.size === 0) return;
    
    const TAMANHO_LOTE_SRE = 200;
    const allIdsArray = Array.from(selectedAssetIds);
    
    logger.info(`[SRE AUDIT] Iniciando conciliação em lote fracionada para ${allIdsArray.length} itens.`);
    
    for (let i = 0; i < allIdsArray.length; i += TAMANHO_LOTE_SRE) {
      const chunkIds = allIdsArray.slice(i, i + TAMANHO_LOTE_SRE);
      
      await onBulkUpdateAssets(chunkIds, {
        _conferido: true,
        TAG_INVENTARIO: TagInventario.CONFERIDO,
        _dataLeitura: new Date().toISOString()
      });
      
      logger.info(`[SRE AUDIT] Bloco de conciliação de ${i} até ${i + chunkIds.length} despachado.`);
    }

    setSelectedAssetIds(new Set());
  }, [selectedAssetIds, onBulkUpdateAssets]);

  // Get unique accounts and their stats
  const accountStats = useMemo(() => {
    const stats: Record<string, { total: number; checked: number; totalValue: number; itemsWithZeroValue: number }> = {};
    assets.forEach(asset => {
      const statusUpper = String(asset.STATUS || '').toUpperCase();
      const isBaixado = statusUpper.includes('BAIXA') || !!asset.DATABAIXA;
      
      // REGRA SÊNIOR: Itens baixados que não foram conferidos não entram no inventário
      if (isBaixado && !asset._conferido) return;

      const account = asset.conta_contabil || 'SEM CONTA';
      if (!stats[account]) {
        stats[account] = { total: 0, checked: 0, totalValue: 0, itemsWithZeroValue: 0 };
      }
      stats[account].total++;
      if (asset._conferido) {
        stats[account].checked++;
      }

      // Validador de Balanço Patrimonial: Identifica valor zero ou corrompido
      const val = asset.VLRAQUISIC || asset.vlraquisic;
      const num = val !== undefined && val !== null 
        ? (typeof val === 'number' ? val : parseFloat(String(val).replace(/[R$\s]/gi, ''))) 
        : 0;
      const cleanNum = isNaN(num) || num <= 0 ? 0 : num;
      
      if (cleanNum === 0) {
        stats[account].itemsWithZeroValue++;
      } else {
        stats[account].totalValue += cleanNum;
      }
    });
    return stats;
  }, [assets]);

  const sortedAccounts = useMemo(() => {
    return Object.keys(accountStats)
      .filter(acc => acc.toUpperCase().includes(searchTerm.toUpperCase()))
      .sort((a, b) => a.localeCompare(b));
  }, [accountStats, searchTerm]);

  const filteredAssets = useMemo(() => {
    if (!selectedAccount) return [];
    return assets.filter(asset => {
      const statusUpper = String(asset.STATUS || '').toUpperCase();
      const isBaixado = statusUpper.includes('BAIXA') || !!asset.DATABAIXA;

      // REGRA SÊNIOR: Itens baixados que não foram conferidos não entram no inventário
      if (isBaixado && !asset._conferido) return false;

      const account = asset.conta_contabil || 'SEM CONTA';
      const matchesAccount = account === selectedAccount;
      
      const matchesSearch = assetSearchTerm === '' || 
        (asset.DESCRICAODOATIVO || '').toUpperCase().includes(assetSearchTerm.toUpperCase()) ||
        (asset.REGISTRO || '').toString().includes(assetSearchTerm) ||
        (asset.ETIQUETA || '').toString().includes(assetSearchTerm) ||
        (asset.Sn1_recno || '').toString().includes(assetSearchTerm) ||
        (asset.Sn3_recno || '').toString().includes(assetSearchTerm);

      if (!matchesAccount || !matchesSearch) return false;

      if (activeFilter === 'checked') return !!asset._conferido;
      return !asset._conferido;
    }).sort((a, b) => {
      if (activeFilter === 'checked') {
        const dateA = a._dataLeitura ? new Date(a._dataLeitura).getTime() : 0;
        const dateB = b._dataLeitura ? new Date(b._dataLeitura).getTime() : 0;
        if (dateA !== dateB) return dateB - dateA;
      }
      const etqA = String(a.ETIQUETA || '').padStart(10, '0');
      const etqB = String(b.ETIQUETA || '').padStart(10, '0');
      return etqB.localeCompare(etqA, undefined, { numeric: true });
    });
  }, [assets, selectedAccount, assetSearchTerm, activeFilter]);

  const handleToggleReconcile = useCallback((asset: Asset) => {
    const etq = String(asset.ETIQUETA || '').toUpperCase().trim();
    if (isSixDigitNumeric(etq) || etq === 'ETIQUETAR') return;
    
    onUpdateAsset({
      ...asset,
      _conferido: !asset._conferido,
      TAG_INVENTARIO: !asset._conferido ? TagInventario.CONFERIDO : TagInventario.PENDENTE,
      _dataLeitura: !asset._conferido ? new Date().toISOString() : undefined
    });
  }, [onUpdateAsset]);

  if (selectedAccount) {
    const stats = accountStats[selectedAccount];
    const progress = stats.total > 0 ? Math.round((stats.checked / stats.total) * 100) : 0;

    return (
      <div className="flex flex-col h-[100dvh] bg-bg-main animate-fadeIn overflow-hidden">
        {/* Header Fixo Blindado */}
        <div className="bg-white border-b border-slate-200 px-6 pt-12 pb-6 sticky top-0 z-50 shrink-0 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <button 
              onClick={() => setSelectedAccount(null)}
              className="flex items-center space-x-3 group"
            >
              <div className="p-3 bg-slate-50 text-slate-800 rounded-2xl group-active:scale-90 transition-all border border-slate-100 shadow-sm">
                <ArrowLeft size={20} strokeWidth={3} />
              </div>
              <div className="text-left">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Voltar</p>
                <p className="text-sm font-bold text-slate-900 uppercase tracking-tight leading-none italic">Conta Expert</p>
              </div>
            </button>
          </div>
          
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <h1 className="text-lg font-black text-slate-900 uppercase tracking-tight truncate leading-none mb-2">
                {selectedAccount}
              </h1>
              <div className="flex items-center space-x-2">
                <div className="flex-1 h-1 bg-slate-100 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-accent transition-all duration-500" 
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <span className="text-[10px] font-black text-accent uppercase">
                  {progress}%
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
          <div className="p-6 bg-white border-b border-slate-100 shrink-0 space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input 
                type="text"
                value={assetSearchTerm}
                onChange={(e) => setAssetSearchTerm(e.target.value)}
                placeholder="CONTA: FILTRAR ITEM..."
                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-3.5 text-xs font-bold text-slate-900 outline-none"
              />
            </div>
            <div className="flex bg-slate-100/50 p-1 rounded-xl">
              <button 
                onClick={() => {
                  setActiveFilter('pending');
                  setSelectedAssetIds(new Set());
                }}
                className={`flex-1 py-2 text-[10px] font-black uppercase rounded-lg transition-all ${activeFilter === 'pending' ? 'bg-white text-accent shadow-sm' : 'text-slate-400'}`}
              >
                Pendente
              </button>
              <button 
                onClick={() => {
                  setActiveFilter('checked');
                  setSelectedAssetIds(new Set());
                }}
                className={`flex-1 py-2 text-[10px] font-black uppercase rounded-lg transition-all ${activeFilter === 'checked' ? 'bg-white text-accent shadow-sm' : 'text-slate-400'}`}
              >
                Concluido
              </button>
            </div>

            {/* Ação em Massa: Selecionar Todos e Conciliar Seleção */}
            <div className="space-y-3 pt-1">
              <div className="flex items-center justify-between px-1">
                <button
                  type="button"
                  onClick={() => {
                    const allSelectableIds = filteredAssets
                      .filter(a => {
                        const etq = String(a.ETIQUETA || '').toUpperCase().trim();
                        const isSixDigit = /^\d{6}$/.test(etq);
                        const isLabeling = etq === 'ETIQUETAR';
                        return !(isSixDigit || isLabeling);
                      })
                      .map(a => String(a.id));

                    setSelectedAssetIds(prev => {
                      const next = new Set(prev);
                      const allSelected = allSelectableIds.every(id => next.has(id));
                      if (allSelected) {
                        allSelectableIds.forEach(id => next.delete(id));
                      } else {
                        allSelectableIds.forEach(id => next.add(id));
                      }
                      return next;
                    });
                  }}
                  className="text-[9px] font-black text-accent hover:text-accent-soft uppercase tracking-wider cursor-pointer"
                >
                  {filteredAssets.length > 0 && filteredAssets
                    .filter(a => {
                      const etq = String(a.ETIQUETA || '').toUpperCase().trim();
                      const isSixDigit = /^\d{6}$/.test(etq);
                      const isLabeling = etq === 'ETIQUETAR';
                      return !(isSixDigit || isLabeling);
                    })
                    .every(a => selectedAssetIds.has(String(a.id)))
                    ? "Desmarcar Todos"
                    : "Selecionar Todos os Pendentes"
                  }
                </button>
                {selectedAssetIds.size > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelectedAssetIds(new Set())}
                    className="text-[9px] font-black text-rose-500 hover:text-rose-600 uppercase tracking-wider cursor-pointer"
                  >
                    Limpar Seleção ({selectedAssetIds.size})
                  </button>
                )}
              </div>

              {selectedAssetIds.size > 0 && (
                <div className="flex items-center justify-between bg-accent/10 border border-accent/20 p-3 rounded-xl animate-fadeIn">
                  <div className="flex items-center space-x-2">
                    <span className="w-2 h-2 rounded-full bg-accent animate-pulse"></span>
                    <span className="text-[10px] font-black text-accent uppercase tracking-wider">
                      {selectedAssetIds.size} {selectedAssetIds.size === 1 ? 'item' : 'itens'} para conciliar
                    </span>
                  </div>
                  <button 
                    onClick={handleBulkReconcile}
                    className="px-4 py-2.5 bg-accent hover:bg-accent-soft text-white rounded-lg text-[9px] font-black uppercase tracking-widest transition-all shadow-md active:scale-95 flex items-center space-x-1.5 cursor-pointer"
                  >
                    <CheckCircle2 size={12} strokeWidth={3} />
                    <span>Conciliar Lote Selecionado</span>
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="flex-1 min-h-0 relative">
            <Virtuoso
              data={filteredAssets}
              components={{
                Footer: () => <div className="h-40" />
              }}
              itemContent={(index, asset) => (
                <div className="px-6 py-2">
                  <AssetCard 
                    key={asset.id} 
                    asset={asset} 
                    onToggle={handleToggleReconcile} 
                    isSelected={selectedAssetIds.has(String(asset.id))}
                    onSelect={handleSelectAsset}
                  />
                </div>
              )}
            />
          </div>
        </div>

        <footer className="bg-slate-900 px-6 py-4 text-center border-t border-white/5 shrink-0">
          <p className="text-[10px] font-black text-white/40 uppercase tracking-[0.3em]">Inventariador GBR v2.6 • MOBILE SOBERANO</p>
        </footer>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[100dvh] bg-bg-main animate-fadeIn overflow-hidden">
      {/* Header Fixo Blindado */}
      <div className="bg-white border-b border-slate-200 px-6 pt-12 pb-6 sticky top-0 z-50 shrink-0 shadow-sm">
        <div className="flex items-center justify-between">
          <button 
            onClick={onBack}
            className="flex items-center space-x-3 group"
          >
            <div className="p-3 bg-slate-50 text-slate-800 rounded-2xl group-active:scale-90 transition-all border border-slate-110 shadow-sm">
              <ArrowLeft size={20} strokeWidth={3} />
            </div>
            <div className="text-left">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Voltar</p>
              <p className="text-sm font-bold text-slate-900 uppercase tracking-tight leading-none italic">Conciliação</p>
            </div>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3 no-scrollbar pb-32">
        <div className="mt-4 relative mb-6">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
          <input 
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="PESQUISAR CONTA CONTÁBIL..."
            className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-12 pr-4 py-4 text-sm font-bold text-slate-900 outline-none focus:border-blue-500 transition-all shadow-inner"
          />
        </div>

        {sortedAccounts.map(account => {
          const stats = accountStats[account];
          const progress = stats.total > 0 ? Math.round((stats.checked / stats.total) * 100) : 0;
          const isComplete = stats.checked === stats.total && stats.total > 0;

          return (
            <button 
              key={account}
              onClick={() => setSelectedAccount(account)}
              className="w-full bg-white border border-slate-200 rounded-2xl p-5 flex items-center justify-between active:scale-[0.98] transition-all shadow-sm hover:border-accent/20 group relative overflow-hidden"
            >
              {/* Progress Background */}
              <div 
                className={`absolute top-0 left-0 bottom-0 transition-all duration-700 ease-out opacity-10 ${isComplete ? 'bg-accent' : 'bg-accent'}`}
                style={{ width: `${progress}%` }}
              />

              <div className="flex items-center space-x-4 relative z-10">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center border transition-all ${
                  isComplete 
                    ? 'bg-accent text-white border-accent/20 shadow-lg shadow-accent/10' 
                    : 'bg-slate-50 text-slate-400 border-slate-200'
                }`}>
                  <Building2 size={22} />
                </div>
                <div className="text-left">
                  <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight leading-none mb-2">
                    {account}
                  </h3>
                  <div className="flex items-center space-x-2">
                    <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded ${
                      isComplete ? 'bg-accent-soft text-accent' : 'bg-slate-100 text-slate-500'
                    }`}>
                      {stats.checked} / {stats.total} ITENS
                    </span>
                    <span className="text-[9px] font-black text-slate-400 uppercase">
                      {progress}% CONCLUÍDO
                    </span>
                    <span className="text-[9px] font-black text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded uppercase">
                      R$ {stats.totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                    {stats.itemsWithZeroValue > 0 && (
                      <span className="text-[9px] font-black text-rose-600 bg-rose-50 border border-rose-100 px-1.5 py-0.5 rounded flex items-center space-x-1 animate-pulse">
                        <AlertTriangle size={10} />
                        <span>{stats.itemsWithZeroValue} ZERO</span>
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center space-x-2 relative z-10">
                {isComplete && <CheckCircle2 size={18} className="text-accent" />}
                <ChevronRight size={18} className="text-slate-300 group-hover:text-accent transition-colors" />
              </div>
            </button>
          );
        })}

        {sortedAccounts.length === 0 && (
          <div className="py-24 flex flex-col items-center justify-center text-slate-300">
            <Filter size={64} className="mb-6 opacity-10" />
            <p className="text-sm font-black uppercase tracking-[0.2em]">Nenhuma conta encontrada</p>
          </div>
        )}
      </div>

      <footer className="bg-slate-900 px-6 py-4 text-center border-t border-white/5 shrink-0">
        <p className="text-[10px] font-black text-white/40 uppercase tracking-[0.3em]">Inventariador GBR v2.6 • MOBILE SOBERANO</p>
      </footer>
    </div>
  );
};

export default AccountReconciliation;
