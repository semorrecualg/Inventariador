
import React, { useMemo, useState } from 'react';
import { Asset } from '../types';
import BackButton from './BackButton';
import { 
  Search, 
  MapPin, 
  AlertCircle, 
  Download, 
  Filter,
  PackageSearch,
  ArrowRight
} from 'lucide-react';
import * as XLSX from 'xlsx';

interface ActiveSearchProps {
  assets: Asset[];
  onBack: () => void;
  onSelectAsset: (asset: Asset) => void;
}

const ActiveSearch: React.FC<ActiveSearchProps> = ({ assets, onBack, onSelectAsset }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [committedSearch, setCommittedSearch] = useState('');
  const [selectedLocation, setSelectedLocation] = useState<string | null>(null);

  // Debounce para o termo de busca para aliviar a CPU em grandes volumes
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setCommittedSearch(searchTerm);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Filtra apenas os itens não conferidos
  const missingAssets = useMemo(() => {
    return assets.filter(a => !a._conferido);
  }, [assets]);

  // Agrupa por localização (ENDERECO)
  const groupedByLocation = useMemo(() => {
    const groups: Record<string, Asset[]> = {};
    
    missingAssets.forEach(asset => {
      const loc = asset.endereco || 'SEM LOCALIZAÇÃO';
      if (!groups[loc]) groups[loc] = [];
      groups[loc].push(asset);
    });

    // Ordena por quantidade de itens faltantes (decrescente)
    return Object.entries(groups)
      .sort((a, b) => b[1].length - a[1].length);
  }, [missingAssets]);

  // Filtra a lista de ativos baseada no termo de busca e localização selecionada
  const filteredAssets = useMemo(() => {
    let list = missingAssets;
    
    if (selectedLocation) {
      list = list.filter(a => (a.endereco || 'SEM LOCALIZAÇÃO') === selectedLocation);
    }

    if (committedSearch) {
      const lower = committedSearch.toLowerCase();
      list = list.filter(a => 
        String(a.etiqueta || '').toLowerCase().includes(lower) ||
        String(a.descricaodoativo || '').toLowerCase().includes(lower) ||
        String(a.serial || '').toLowerCase().includes(lower)
      );
    }

    return list;
  }, [missingAssets, selectedLocation, committedSearch]);

  const exportMissingList = () => {
    if (missingAssets.length === 0) return;

    const wsData = missingAssets.map(a => ({
      'ETIQUETA': a.etiqueta,
      'DESCRIÇÃO': a.descricaodoativo,
      'LOCALIZAÇÃO': a.endereco,
      'CENTRO DE CUSTO': a.centrodecusto,
      'CONTA CONTÁBIL': a.conta_contabil,
      'VALOR AQUISIÇÃO': a.vlraquisic,
      'STATUS ATUAL': a.status
    }));

    const ws = XLSX.utils.json_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "ITENS_FALTANTES");
    XLSX.writeFile(wb, `BUSCA_ATIVA_FALTANTES_${new Date().getTime()}.xlsx`);
  };

  return (
    <div className="flex flex-col h-[100dvh] bg-bg-main animate-fadeIn overflow-hidden">
      {/* Header */}
      <div className="pt-12 pb-4 px-4 bg-white border-b border-border flex items-center justify-between shadow-sm z-20">
        <div className="flex items-center space-x-3">
          <BackButton onClick={onBack} label="Voltar" subLabel="Busca Ativa" />
        </div>
        <div className="w-10 h-10 bg-accent-soft border border-accent/10 rounded-xl flex items-center justify-center text-accent shadow-sm">
          <PackageSearch size={20} />
        </div>
      </div>

      {/* Search & Export Bar */}
      <div className="p-4 bg-white border-b border-border space-y-3">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-muted" size={18} />
          <input
            type="text"
            placeholder="Buscar por etiqueta ou descrição..."
            className="w-full pl-12 pr-4 py-4 bg-bg-main border border-border rounded-2xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent/20 transition-all"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="px-3 py-1.5 bg-accent-soft border border-accent/10 rounded-full flex items-center space-x-1.5">
              <AlertCircle size={12} className="text-accent" />
              <span className="text-[10px] font-bold text-accent uppercase tracking-widest">
                {missingAssets.length} Itens Faltantes
              </span>
            </div>
          </div>
          <button 
            onClick={exportMissingList}
            className="flex items-center space-x-2 px-4 py-2 bg-white border border-border rounded-xl text-[10px] font-bold text-ink-muted uppercase tracking-widest hover:bg-bg-main active:scale-95 transition-all"
          >
            <Download size={14} />
            <span>Exportar Lista</span>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
        {/* Sidebar: Locations */}
        <div className="w-full md:w-80 bg-white border-r border-border overflow-y-auto no-scrollbar">
          <div className="p-4 border-b border-border bg-bg-main/50">
            <h3 className="text-[10px] font-bold text-ink uppercase tracking-widest flex items-center space-x-2">
              <MapPin size={14} className="text-accent" />
              <span>Filtrar por Localização</span>
            </h3>
          </div>
          
          <div className="divide-y divide-border">
            <button
              onClick={() => setSelectedLocation(null)}
              className={`w-full p-4 text-left flex items-center justify-between transition-colors ${!selectedLocation ? 'bg-accent-soft border-l-4 border-accent' : 'hover:bg-bg-main'}`}
            >
              <span className="text-xs font-bold text-ink uppercase tracking-tight">Todas as Localizações</span>
              <span className="text-[10px] font-bold text-ink-muted">{missingAssets.length}</span>
            </button>
            
            {groupedByLocation.map(([loc, items]) => (
              <button
                key={loc}
                onClick={() => setSelectedLocation(loc)}
                className={`w-full p-4 text-left flex items-center justify-between transition-colors ${selectedLocation === loc ? 'bg-accent-soft border-l-4 border-accent' : 'hover:bg-bg-main'}`}
              >
                <div className="flex flex-col min-w-0 pr-2">
                  <span className="text-xs font-bold text-ink uppercase tracking-tight truncate">{loc}</span>
                  <span className="text-[8px] font-bold text-ink-muted uppercase tracking-widest">Busca Ativa Recomendada</span>
                </div>
                <span className="text-[10px] font-bold text-ink-muted shrink-0">{items.length}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Main Content: Missing Items List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 no-scrollbar pb-24 bg-bg-main">
          {filteredAssets.length > 0 ? (
            filteredAssets.map((asset) => (
              <div 
                key={asset.id}
                onClick={() => onSelectAsset(asset)}
                className="bg-white border border-border rounded-2xl p-4 shadow-sm hover:shadow-md transition-all cursor-pointer active:scale-[0.98] group relative overflow-hidden"
              >
                <div className="absolute top-0 left-0 w-1 h-full bg-amber-400" />
                
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0 pr-4">
                    <div className="flex items-center space-x-2 mb-1">
                      <span className="text-[10px] font-black text-accent uppercase tracking-widest">
                        {asset.etiqueta || 'S/ ETIQUETA'}
                      </span>
                      <span className="text-[8px] font-bold text-ink-muted uppercase tracking-widest px-2 py-0.5 bg-bg-main rounded-full border border-border">
                        {asset.status || 'ATIVO'}
                      </span>
                    </div>
                    <h4 className="text-sm font-bold text-ink uppercase tracking-tight line-clamp-2 mb-2 group-hover:text-accent transition-colors">
                      {asset.descricaodoativo || 'SEM DESCRIÇÃO'}
                    </h4>
                    
                    <div className="flex flex-wrap gap-y-2 gap-x-4">
                      <div className="flex items-center space-x-1.5">
                        <MapPin size={10} className="text-ink-muted" />
                        <span className="text-[9px] font-bold text-ink-muted uppercase tracking-widest truncate max-w-[150px]">
                          {asset.endereco || 'SEM LOCAL'}
                        </span>
                      </div>
                      <div className="flex items-center space-x-1.5">
                        <Filter size={10} className="text-ink-muted" />
                        <span className="text-[9px] font-bold text-ink-muted uppercase tracking-widest">
                          CC: {asset.centrodecusto || '---'}
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex flex-col items-end justify-between self-stretch">
                    <div className="w-8 h-8 rounded-xl bg-bg-main border border-border flex items-center justify-center text-ink-muted group-hover:bg-accent group-hover:text-white transition-all">
                      <ArrowRight size={16} />
                    </div>
                    <span className="text-[10px] font-bold text-ink-muted uppercase tracking-widest">
                      {asset.vlraquisic ? `R$ ${asset.vlraquisic}` : ''}
                    </span>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-20 h-20 bg-white border border-border rounded-[2rem] flex items-center justify-center text-ink-muted mb-6 shadow-sm">
                <PackageSearch size={36} />
              </div>
              <h3 className="text-lg font-bold text-ink uppercase tracking-tight mb-2">Nada encontrado</h3>
              <p className="text-xs text-ink-muted max-w-xs">
                {searchTerm ? 'Nenhum item faltante corresponde à sua busca.' : 'Parabéns! Todos os itens desta seleção foram conferidos.'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ActiveSearch;
