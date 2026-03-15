import React, { useState, useMemo, useCallback } from 'react';
import { Virtuoso } from 'react-virtuoso';
import { Asset, TagInventario } from '../types';
import { 
  ArrowLeft, 
  Search, 
  Filter, 
  CheckCircle2, 
  Circle, 
  Building2, 
  ChevronRight,
  ListChecks,
  MapPin,
  Check,
  Zap,
  AlertOctagon,
  AlertTriangle,
  Plus,
  Hash,
  RefreshCw,
  Calendar
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

interface AssetCardProps {
  asset: Asset;
  onToggle: (a: Asset) => void;
}

const AssetCard = React.memo(({ asset, onToggle }: AssetCardProps) => {
  const isConferido = !!asset._conferido;
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

  const fullDescription = [
    asset.QT || '1',
    asset.DESCRICAODOATIVO || 'SEM DESCRIÇÃO',
    asset.SERIAL || 'S/N',
    formatMonthYearBR(asset.DATAAQUSIC),
    asset.NOMEFORNECEDOR || 'FORNECEDOR N/I'
  ].join('; ');

  return (
    <div 
      className={`mb-2 p-3 border-l-4 rounded-xl relative overflow-hidden transition-all modern-card active:scale-[0.99] shadow-sm ${colors.bg} ${colors.border}`} 
      style={{ borderLeftColor: colors.hex }}
      onClick={() => onToggle(asset)}
    >
      <div className={`absolute top-0 left-0 px-2 py-1 rounded-br-lg text-[7px] font-bold uppercase flex items-center space-x-1 shadow-sm z-10 ${colors.badge}`}>
        {colors.icon && <colors.icon size={10} strokeWidth={3} />}
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
          {asset.TAG_DUPLICIDADE === 'ETIQUETA+1REGISTRO' && (
            <div className="px-2 py-1 bg-amber-500 rounded-lg flex items-center space-x-1 shadow-md">
              <Zap size={10} className="text-white fill-white" />
              <span className="text-[8px] font-bold text-white uppercase tracking-widest">LOTE</span>
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
            <div className="px-2 py-0.5 rounded-lg text-[8px] font-black uppercase tracking-widest shadow-sm bg-slate-900 text-white border border-slate-700 flex items-center space-x-1">
              <Calendar size={10} />
              <span>{formatReadingTime(asset._dataLeitura)}</span>
            </div>
          )}
          {isBaixado && (
            <span className="px-2 py-0.5 rounded-lg text-[8px] font-bold uppercase tracking-widest shadow-sm bg-red-600 text-white border border-red-700">
              BAIXADO
            </span>
          )}
        </div>
      </div>

      <div className={`absolute bottom-3 right-3 w-8 h-8 ${isConferido ? (isBaixado ? 'bg-red-500' : 'bg-emerald-500') : 'bg-slate-100 text-slate-400 border border-slate-200'} rounded-lg flex items-center justify-center shadow-md transition-all`}>
        {isConferido ? <Check size={16} strokeWidth={3} className="text-white" /> : <Circle size={16} />}
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

  // Get unique accounts and their stats
  const accountStats = useMemo(() => {
    const stats: Record<string, { total: number; checked: number }> = {};
    assets.forEach(asset => {
      const statusUpper = String(asset.STATUS || '').toUpperCase();
      const isBaixado = statusUpper.includes('BAIXA') || !!asset.DATABAIXA;
      
      // REGRA SÊNIOR: Itens baixados que não foram conferidos não entram no inventário
      if (isBaixado && !asset._conferido) return;

      const account = asset.CONTACONTABIL || 'SEM CONTA';
      if (!stats[account]) {
        stats[account] = { total: 0, checked: 0 };
      }
      stats[account].total++;
      if (asset._conferido) {
        stats[account].checked++;
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

      const account = asset.CONTACONTABIL || 'SEM CONTA';
      const matchesAccount = account === selectedAccount;
      
      const matchesSearch = assetSearchTerm === '' || 
        (asset.DESCRICAODOATIVO || '').toUpperCase().includes(assetSearchTerm.toUpperCase()) ||
        (asset.REGISTRO || '').toString().includes(assetSearchTerm) ||
        (asset.ETIQUETA || '').toString().includes(assetSearchTerm);

      if (!matchesAccount || !matchesSearch) return false;

      if (activeFilter === 'checked') return !!asset._conferido;
      return !asset._conferido;
    }).sort((a, b) => {
      const etqA = String(a.ETIQUETA || '').padStart(10, '0');
      const etqB = String(b.ETIQUETA || '').padStart(10, '0');
      return etqA.localeCompare(etqB, undefined, { numeric: true });
    });
  }, [assets, selectedAccount, assetSearchTerm, activeFilter]);

  const handleToggleReconcile = useCallback((asset: Asset) => {
    onUpdateAsset({
      ...asset,
      _conferido: !asset._conferido,
      TAG_INVENTARIO: !asset._conferido ? TagInventario.CONFERIDO : TagInventario.PENDENTE,
      _dataLeitura: !asset._conferido ? new Date().toISOString() : undefined
    });
  }, [onUpdateAsset]);

  const handleReconcileAll = () => {
    const pendingIds = filteredAssets
      .filter(a => !a._conferido)
      .map(a => String(a.id));
    
    if (pendingIds.length > 0) {
      onBulkUpdateAssets(pendingIds, {
        _conferido: true,
        TAG_INVENTARIO: TagInventario.CONFERIDO,
        _dataLeitura: new Date().toISOString()
      });
    }
  };

  if (selectedAccount) {
    const stats = accountStats[selectedAccount];
    const progress = stats.total > 0 ? Math.round((stats.checked / stats.total) * 100) : 0;

    return (
      <div className="flex flex-col h-full bg-slate-50 animate-fadeIn">
        {/* Header */}
        <div className="bg-white border-b border-slate-200 shadow-sm z-20">
          <div className="px-4 pt-8 pb-4">
            <button 
              onClick={() => setSelectedAccount(null)}
              className="flex items-center space-x-2 text-slate-500 font-bold text-xs uppercase tracking-widest mb-4 active:scale-95 transition-all"
            >
              <ArrowLeft size={18} />
              <span>Voltar às Contas</span>
            </button>
            
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <h1 className="text-xl font-black text-slate-900 uppercase tracking-tight truncate">
                  {selectedAccount}
                </h1>
                <div className="flex items-center space-x-2 mt-1">
                  <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-emerald-500 transition-all duration-500" 
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <span className="text-[10px] font-black text-emerald-600 uppercase">
                    {stats.checked}/{stats.total} ({progress}%)
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-4 flex items-center space-x-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input 
                  type="text"
                  value={assetSearchTerm}
                  onChange={(e) => setAssetSearchTerm(e.target.value)}
                  placeholder="PESQUISAR ITEM NA CONTA..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-3 text-sm font-bold text-slate-900 outline-none focus:border-blue-500 transition-all"
                />
              </div>
              <button 
                onClick={handleReconcileAll}
                disabled={stats.checked === stats.total}
                className="w-12 h-12 bg-emerald-600 text-white rounded-xl flex items-center justify-center shadow-md active:scale-95 transition-all disabled:opacity-50 disabled:scale-100"
                title="Conciliar Pendentes"
              >
                <ListChecks size={20} />
              </button>
            </div>
          </div>

          {/* Standardized Tabs */}
          <div className="flex border-t border-slate-100">
            <button 
              onClick={() => setActiveFilter('pending')}
              className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest transition-all relative ${activeFilter === 'pending' ? 'text-blue-600' : 'text-slate-400'}`}
            >
              Pendentes ({stats.total - stats.checked})
              {activeFilter === 'pending' && <div className="absolute bottom-0 left-0 right-0 h-1 bg-blue-600 rounded-t-full" />}
            </button>
            <button 
              onClick={() => setActiveFilter('checked')}
              className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest transition-all relative ${activeFilter === 'checked' ? 'text-emerald-600' : 'text-slate-400'}`}
            >
              Inventariado ({stats.checked})
              {activeFilter === 'checked' && <div className="absolute bottom-0 left-0 right-0 h-1 bg-emerald-600 rounded-t-full" />}
            </button>
          </div>
        </div>

        {/* Asset List with Virtuoso */}
        <div className="flex-1 relative">
          <Virtuoso
            data={filteredAssets}
            className="no-scrollbar"
            totalCount={filteredAssets.length}
            itemContent={(index, asset) => (
              <div className="px-4 pt-3 pb-1">
                <AssetCard 
                  key={asset.id} 
                  asset={asset} 
                  onToggle={handleToggleReconcile} 
                />
              </div>
            )}
            components={{
              Footer: () => (
                <div className="py-20 flex flex-col items-center justify-center text-slate-300">
                  {filteredAssets.length === 0 ? (
                    <>
                      <Search size={48} className="mb-4 opacity-20" />
                      <p className="text-xs font-bold uppercase tracking-widest">Nenhum item encontrado</p>
                    </>
                  ) : (
                    <div className="w-1.5 h-1.5 bg-slate-200 rounded-full" />
                  )}
                </div>
              )
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-slate-50 animate-fadeIn">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 pt-10 pb-6 shadow-sm">
        <button 
          onClick={onBack}
          className="flex items-center space-x-2 text-slate-400 font-bold text-xs uppercase tracking-widest mb-6 active:scale-95 transition-all"
        >
          <ArrowLeft size={18} />
          <span>Voltar ao Menu</span>
        </button>
        
        <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tight">
          Conciliação por Conta
        </h1>
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-2">
          Auditoria de bens não etiquetáveis por grupo contábil
        </p>

        <div className="mt-6 relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
          <input 
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="PESQUISAR CONTA CONTÁBIL..."
            className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-12 pr-4 py-4 text-sm font-bold text-slate-900 outline-none focus:border-blue-500 transition-all shadow-inner"
          />
        </div>
      </div>

      {/* Account List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 no-scrollbar pb-32">
        {sortedAccounts.map(account => {
          const stats = accountStats[account];
          const progress = stats.total > 0 ? Math.round((stats.checked / stats.total) * 100) : 0;
          const isComplete = stats.checked === stats.total && stats.total > 0;

          return (
            <button 
              key={account}
              onClick={() => setSelectedAccount(account)}
              className="w-full bg-white border border-slate-200 rounded-2xl p-5 flex items-center justify-between active:scale-[0.98] transition-all shadow-sm hover:border-blue-200 group relative overflow-hidden"
            >
              {/* Progress Background */}
              <div 
                className={`absolute top-0 left-0 bottom-0 transition-all duration-700 ease-out opacity-10 ${isComplete ? 'bg-emerald-500' : 'bg-blue-500'}`}
                style={{ width: `${progress}%` }}
              />

              <div className="flex items-center space-x-4 relative z-10">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center border transition-all ${
                  isComplete 
                    ? 'bg-emerald-500 text-white border-emerald-400 shadow-lg shadow-emerald-100' 
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
                      isComplete ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                    }`}>
                      {stats.checked} / {stats.total} ITENS
                    </span>
                    <span className="text-[9px] font-black text-slate-400 uppercase">
                      {progress}% CONCLUÍDO
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center space-x-2 relative z-10">
                {isComplete && <CheckCircle2 size={18} className="text-emerald-500" />}
                <ChevronRight size={18} className="text-slate-300 group-hover:text-blue-500 transition-colors" />
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
    </div>
  );
};

export default AccountReconciliation;
