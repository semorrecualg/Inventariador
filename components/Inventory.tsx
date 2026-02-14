
import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { Asset } from '../types';
import Scanner from './Scanner';
import { 
  Search, 
  ArrowLeft, 
  MapPin, 
  AlertCircle,
  Save,
  Check,
  X,
  PlusCircle,
  FilePlus,
  Keyboard,
  Zap,
  Plus,
  Building2,
  Hash,
  Tag as TagIcon
} from 'lucide-react';

interface AssetCardProps {
  asset: Asset;
  onSelect: (a: Asset) => void;
  plaquetaTerms: string[];
  decision: 'YES' | 'NO' | null;
  onMakeDecision: (id: string, decision: 'YES' | 'NO') => void;
  yesButtonRef?: React.RefObject<HTMLButtonElement | null>;
  isConferidoTab: boolean;
  currentLocation: string;
}

const AssetCard = React.memo(({ 
  asset, 
  onSelect, 
  plaquetaTerms, 
  decision,
  onMakeDecision,
  yesButtonRef,
  isConferidoTab,
  currentLocation
}: AssetCardProps) => {
  
  const normalizeStr = (s: string) => s.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, '_').trim();

  // Helper robusto para extração de dados da planilha
  const getVal = (terms: string[]) => {
    const normTerms = terms.map(t => normalizeStr(t));
    for (const term of normTerms) {
       const foundKey = Object.keys(asset).find(k => normalizeStr(k) === term);
       if (foundKey && asset[foundKey] !== undefined && asset[foundKey] !== null && String(asset[foundKey]).trim() !== "") {
           return String(asset[foundKey]).trim().toUpperCase();
       }
    }
    return "---";
  };

  // Mapeamento de campos conforme solicitação
  const data = {
    etiqueta: getVal(['ETIQUETA', 'PLAQUETA', 'PATRIMONIO', 'TAG', 'BEM']),
    empresa: getVal(['EMPRESA', 'RAZAO_SOCIAL', 'UNIDADE']),
    status: asset.TAG_INVENTARIO || 'PENDENTE',
    registro: getVal(['REGISTRO', 'COD_ITEM', 'ID_ATIVO']),
    sub_registro: getVal(['SUB_REGISTRO', 'SUB', 'PARCELA']),
    qtde: getVal(['QTDE', 'QUANTIDADE', 'QTD']),
    local: getVal(['LOCAL', 'ENDERECO', 'LOCALIZACAO', 'SETOR']),
    centro_custo: getVal(['CENTRO_CUSTO', 'CENTRO_DE_CUSTO', 'CC', 'DEPARTAMENTO']),
    cnpj: getVal(['CNPJ', 'CPF_CNPJ']),
    fornecedor: getVal(['FORNECEDOR', 'NOME_FORNECEDOR']),
    conta: getVal(['CONTA_CONTABIL', 'CONTA', 'DESC_CONTA']),
    data_compra: getVal(['DATA_COMPRA', 'DT_AQUISICAO', 'AQUISICAO']),
    data_baixa: getVal(['DATA_BAIXA', 'DT_BAIXA']),
    descricao: getVal(['DESCRICAO_DO_ATIVO_IMOBILIZADO', 'DESCRIÇÃO_DO_ATIVO_IMOBILIZADO', 'DESCRICAO', 'DESCRIÇÃO', 'DESC_SINTETICA', 'NOME'])
  };

  const isConferido = !!asset._conferido;
  const isAdopted = asset.TAG_ADOCAO === "ADOTADO" || asset.TAG_INVENTARIO === "ADOTADO";
  const isReAdopted = asset.TAG_ADOCAO === "RE-ADOTADO" || asset.TAG_INVENTARIO === "RE-ADOTADO NO INVENTARIO";

  // Estilização do Status
  const getStatusColor = () => {
    if (data.status === 'INVENTARIADO' || data.status === 'CONFERIDO') return 'bg-emerald-600';
    if (isAdopted || isReAdopted) return 'bg-cyan-600';
    if (data.status === 'INCLUSAO') return 'bg-purple-600';
    return 'bg-red-500';
  };

  // Componente de linha de dados com espaçamento otimizado
  const DataRow = ({ label, value, full = false }: { label: string, value: string, full?: boolean }) => (
    <div className={`flex flex-col border-b border-gray-50 py-2 ${full ? 'col-span-2' : 'col-span-1'}`}>
      <span className="text-[7px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">
        {label}
      </span>
      <span className="text-[10px] font-bold text-slate-900 uppercase truncate leading-tight">
        {value}
      </span>
    </div>
  );

  return (
    <div 
      onClick={() => onSelect(asset)} 
      className={`flex flex-col mb-4 rounded-[2rem] border shadow-sm overflow-hidden transition-all active:scale-[0.99] w-full
        ${decision === 'YES' ? 'border-emerald-500 ring-4 ring-emerald-50' : 'border-slate-100 bg-white'}`}
    >
      {/* Cabeçalho Técnico: PLAQUETA e Valor na mesma linha */}
      <div className="bg-slate-50/80 px-5 py-4 flex items-center justify-between border-b border-slate-100">
        <div className="flex flex-row items-baseline space-x-2">
          <span className="text-[9px] font-black text-blue-600/50 uppercase tracking-[0.2em] leading-none">PLAQUETA:</span>
          <span className="text-2xl font-black text-blue-950 tracking-tighter leading-none">{data.etiqueta}</span>
        </div>
        
        <div className="flex items-center space-x-2">
           {(!isConferido || (data.local !== currentLocation && !isConferidoTab)) && (
            <div className="flex items-center space-x-1">
              <button 
                onClick={(e) => { e.stopPropagation(); onMakeDecision(String(asset.id), 'NO'); }} 
                className="w-10 h-10 rounded-xl flex items-center justify-center bg-white text-slate-300 border border-slate-200 active:bg-red-50"
              >
                <X size={20} />
              </button>
              <button 
                ref={yesButtonRef}
                onClick={(e) => { e.stopPropagation(); onMakeDecision(String(asset.id), 'YES'); }} 
                className="w-14 h-14 rounded-xl flex items-center justify-center bg-blue-600 text-white shadow-lg active:scale-95"
              >
                <Check size={28} strokeWidth={3} />
              </button>
            </div>
          )}
          {isConferido && <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white shadow-lg ${getStatusColor()}`}><Check size={24} strokeWidth={4} /></div>}
        </div>
      </div>

      {/* Grid de Informações Técnicas (Ficha Técnica Profissional) */}
      <div className="px-5 py-4 grid grid-cols-2 gap-x-6 gap-y-1 bg-white">
        <DataRow label="EMPRESA" value={data.empresa} />
        <div className="flex flex-col border-b border-gray-50 py-2">
          <span className="text-[7px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">STATUS</span>
          <span className={`text-[8px] font-black text-white px-2 py-0.5 rounded-full inline-block self-start uppercase ${getStatusColor()}`}>
            {data.status}
          </span>
        </div>
        
        <DataRow label="REGISTRO" value={data.registro} />
        <DataRow label="SUB REGISTRO" value={data.sub_registro} />
        
        <DataRow label="QTDE" value={data.qtde} />
        <DataRow label="LOCAL" value={data.local} />
        
        <DataRow label="CENTRO CUSTO" value={data.centro_custo} />
        <DataRow label="CNPJ" value={data.cnpj} />
        
        <DataRow label="FORNECEDOR" value={data.fornecedor} full />
        <DataRow label="CONTA CONTÁBIL" value={data.conta} full />
        
        <DataRow label="DATA COMPRA" value={data.data_compra} />
        <DataRow label="DATA BAIXA" value={data.data_baixa} />
        
        {/* Campo de Descrição do Ativo Imobilizado incluído na ficha técnica conforme solicitado */}
        <DataRow label="DESCRIÇÃO DO ATIVO IMOBILIZADO" value={data.descricao} full />
      </div>
    </div>
  );
});

interface InventoryProps {
  assets: Asset[];
  allAssets: Asset[];
  onBack: () => void;
  onUpdateAsset: (asset: Asset) => void;
  onBulkUpdateAssets: (ids: string[]) => void;
  onSelectAsset: (asset: Asset) => void;
  selectedLocation: string | null;
  setSelectedLocation: (loc: string | null) => void;
  isInventorying: boolean;
  setIsInventorying: (val: boolean) => void;
  selectedCompany: string | null;
}

const Inventory: React.FC<InventoryProps> = ({ 
  assets, allAssets, onBack, onUpdateAsset, onBulkUpdateAssets, onSelectAsset, selectedLocation, setSelectedLocation, isInventorying, setIsInventorying, selectedCompany
}) => {
  const [displayValue, setDisplayValue] = useState('000000');
  const [committedSearch, setCommittedSearch] = useState('');
  const [locationSearch, setLocationSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<'pending' | 'checked'>('pending');
  const [inputMethod, setInputMethod] = useState<'keyboard' | 'scanner'>(() => (localStorage.getItem('app_input_method') as any) || 'keyboard');
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [showNewAssetDialog, setShowNewAssetDialog] = useState(false);
  const [isCreatingNewAsset, setIsCreatingNewAsset] = useState(false);
  const [newAssetData, setNewAssetData] = useState({ description: '', plaqueta: '' });
  const [localDecisions, setLocalDecisions] = useState<Record<string, 'YES' | 'NO'>>({});
  const [newLocationName, setNewLocationName] = useState('');

  const searchInputRef = useRef<HTMLInputElement>(null);
  const firstYesButtonRef = useRef<HTMLButtonElement>(null);

  const plaquetaTerms = ['ETIQUETA', 'PLAQUETA', 'PATRIMONIO', 'BEM', 'TAG', 'REGISTRO'];

  const getPlaqueta = useCallback((asset: Asset): string => {
    const key = Object.keys(asset).find(k => plaquetaTerms.includes(k.toUpperCase()));
    return key ? String(asset[key]).trim() : "";
  }, []);

  const getItemLocation = useCallback((asset: Asset): string => {
    const locationTerms = ['ENDERECO', 'LOCALIZACAO', 'SETOR', 'COD_END', 'LOCAL'];
    const keys = Object.keys(asset);
    for (const term of locationTerms) {
      const match = keys.find(k => k.toUpperCase() === term.toUpperCase());
      if (match && asset[match]) return String(asset[match]).trim().toUpperCase();
    }
    return "SEM ENDEREÇO";
  }, []);

  const locationStats = useMemo(() => {
    const stats: Record<string, { total: number, checked: number }> = {};
    assets.forEach(asset => {
      const loc = getItemLocation(asset);
      if (!stats[loc]) stats[loc] = { total: 0, checked: 0 };
      stats[loc].total++;
      if (asset._conferido) stats[loc].checked++;
    });
    return stats;
  }, [assets, getItemLocation]);

  const filteredAssetsInLocation = useMemo(() => {
    if (!selectedLocation) return [];
    const currentLoc = selectedLocation.toUpperCase();
    
    let results: Asset[] = [];
    if (committedSearch) {
      const term = committedSearch.toUpperCase().trim();
      results = allAssets.filter(a => {
          const p = getPlaqueta(a).toUpperCase();
          return p === term || p.padStart(6, '0') === term.padStart(6, '0');
      });
    } else {
      results = allAssets.filter(a => getItemLocation(a) === currentLoc);
    }

    return results
      .filter(a => {
          if (activeFilter === 'checked') {
            return !!a._conferido && getItemLocation(a) === currentLoc;
          }
          return !a._conferido || (!!a._conferido && getItemLocation(a) !== currentLoc);
      })
      .sort((a, b) => getPlaqueta(a).localeCompare(getPlaqueta(b), undefined, { numeric: true }));
  }, [allAssets, selectedLocation, committedSearch, activeFilter, getItemLocation, getPlaqueta]);

  const triggerSearch = (val: string) => {
    setCommittedSearch(val);
    setLocalDecisions({});
    searchInputRef.current?.blur();
  };

  const resetSearchAndFocus = useCallback(() => {
    setDisplayValue('000000'); setCommittedSearch(''); setLocalDecisions({});
    setShowNewAssetDialog(false); setIsCreatingNewAsset(false);
    if (inputMethod === 'scanner') setIsScannerOpen(true);
    else setTimeout(() => { searchInputRef.current?.focus(); }, 150);
  }, [inputMethod]);

  const handleMakeDecision = useCallback((id: string, decision: 'YES' | 'NO') => {
    const asset = filteredAssetsInLocation.find(a => String(a.id) === id);
    if (!asset) return;

    const itemPlaqueta = getPlaqueta(asset);
    const siblings = filteredAssetsInLocation.filter(a => getPlaqueta(a) === itemPlaqueta);

    if (decision === 'YES') {
        if (siblings.length > 1) {
            setLocalDecisions(prev => {
                const next = { ...prev };
                siblings.forEach(s => { next[String(s.id)] = 'YES'; });
                return next;
            });
        } else {
            onBulkUpdateAssets([id]);
            resetSearchAndFocus();
        }
    } else {
        setLocalDecisions(prev => ({ ...prev, [id]: 'NO' }));
    }
  }, [filteredAssetsInLocation, onBulkUpdateAssets, resetSearchAndFocus, getPlaqueta]);

  const showBatchButton = useMemo(() => {
    const yesCount = Object.values(localDecisions).filter(d => d === 'YES').length;
    return yesCount > 1;
  }, [localDecisions]);

  const handleAddNewLocation = () => {
    if (!newLocationName.trim()) return;
    const name = newLocationName.toUpperCase().trim();
    setSelectedLocation(name);
    setIsInventorying(true);
    setNewLocationName('');
  };

  useEffect(() => {
    if (committedSearch && filteredAssetsInLocation.length > 0) {
      setTimeout(() => firstYesButtonRef.current?.focus(), 300);
    } else if (committedSearch && filteredAssetsInLocation.length === 0) {
      const exists = allAssets.some(a => {
        const p = getPlaqueta(a).toUpperCase();
        return p === committedSearch || p.padStart(6, '0') === committedSearch.padStart(6, '0');
      });
      if (!exists && committedSearch !== "") setShowNewAssetDialog(true);
    }
  }, [committedSearch, filteredAssetsInLocation.length, allAssets, getPlaqueta]);

  if (!isInventorying) {
    return (
      <div className="flex flex-col h-full bg-slate-50 animate-fadeIn w-full overflow-hidden">
        <div className="p-4 bg-white border-b border-gray-100 shadow-sm">
          <button onClick={onBack} className="mb-3 text-gray-400 text-[9px] font-black uppercase flex items-center space-x-1"><ArrowLeft size={12} /> <span>Menu</span></button>
          <h2 className="text-lg font-black text-black uppercase mb-3">Setores do Inventário</h2>
          
          <div className="flex space-x-2 mb-3">
            <div className="flex-1 relative">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-400" size={14} />
              <input 
                type="text" 
                placeholder="NOME DO NOVO SETOR..." 
                value={newLocationName} 
                onChange={(e) => setNewLocationName(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === 'Enter' && handleAddNewLocation()}
                className="w-full pl-9 pr-4 py-3 bg-blue-50/50 rounded-xl text-[10px] font-black uppercase outline-none border border-blue-100 shadow-inner" 
              />
            </div>
            <button 
              onClick={handleAddNewLocation}
              disabled={!newLocationName.trim()}
              className="px-4 bg-blue-600 text-white rounded-xl flex items-center justify-center shadow-lg active:scale-95 disabled:opacity-30"
            >
              <Plus size={20} strokeWidth={4} />
            </button>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" size={14} />
            <input type="text" placeholder="FILTRAR EXISTENTES..." value={locationSearch} onChange={(e) => setLocationSearch(e.target.value.toUpperCase())} className="w-full pl-9 pr-4 py-3 bg-gray-50 rounded-xl text-[9px] font-black uppercase outline-none" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-4 pt-4 pb-6 space-y-2 no-scrollbar">
          {Object.keys(locationStats).sort().filter(l => l.includes(locationSearch)).map(loc => {
            const stats = locationStats[loc];
            const percent = stats.total > 0 ? Math.round((stats.checked / stats.total) * 100) : 0;
            return (
              <button key={loc} onClick={() => { setSelectedLocation(loc); setIsInventorying(true); }} className={`w-full flex items-center justify-between p-4 rounded-2xl border transition-all ${percent === 100 ? 'bg-emerald-50 border-emerald-100' : 'bg-white shadow-sm border-gray-100'}`}>
                <div className="flex items-center space-x-3 text-left min-w-0">
                  <div className={`p-2.5 rounded-xl ${percent === 100 ? 'bg-emerald-100 text-emerald-600' : 'bg-gray-50 text-gray-400'}`}><MapPin size={18} /></div>
                  <div className="min-w-0">
                    <span className="text-[11px] font-black uppercase truncate block">{loc}</span>
                    <span className="text-[7px] font-black opacity-40 uppercase mt-0.5 block">{stats.checked}/{stats.total} CONFERIDOS</span>
                  </div>
                </div>
                <div className="text-right">
                  <span className={`text-[10px] font-black ${percent === 100 ? 'text-emerald-600' : 'text-blue-600'}`}>{percent}%</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white animate-fadeIn relative w-full overflow-hidden">
      <div className={`p-4 pb-2 shadow-md relative z-30 transition-colors ${activeFilter === 'pending' ? 'bg-white' : 'bg-emerald-50'}`}>
        <div className="flex items-center justify-between mb-4">
          <button onClick={() => { setIsInventorying(false); resetSearchAndFocus(); }} className="text-gray-400 text-[9px] font-black uppercase flex items-center space-x-1"><ArrowLeft size={12} /> <span>{selectedLocation}</span></button>
          <div className="flex bg-gray-100 p-1 rounded-xl border border-gray-200">
             <button onClick={() => setInputMethod('keyboard')} className={`px-3 py-1.5 rounded-lg flex items-center space-x-2 ${inputMethod === 'keyboard' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400'}`}><Keyboard size={12} /><span className="text-[8px] font-black uppercase">DIGITAR</span></button>
             <button onClick={() => { setInputMethod('scanner'); setIsScannerOpen(true); }} className={`px-3 py-1.5 rounded-lg flex items-center space-x-2 ${inputMethod === 'scanner' ? 'bg-blue-600 text-white shadow-md' : 'text-gray-400'}`}><Zap size={12} /><span className="text-[8px] font-black uppercase">SCAN</span></button>
          </div>
        </div>
        
        <div className="relative mb-4 flex items-center w-full">
          <div className="flex-1 relative">
            <input 
              ref={searchInputRef} 
              type="text" 
              inputMode="numeric" 
              value={displayValue} 
              onChange={(e) => { 
                const r = e.target.value.replace(/\D/g, ''); 
                setDisplayValue(r.length > 6 ? r.slice(-6) : r.padStart(6, '0')); 
              }} 
              onKeyDown={(e) => e.key === 'Enter' && triggerSearch(displayValue)} 
              className="w-full pl-5 pr-5 py-4.5 text-3xl font-black uppercase outline-none border-2 border-gray-100 bg-gray-50/30 rounded-2xl focus:border-blue-500 focus:bg-white transition-all text-blue-950 shadow-inner" 
            />
          </div>
          <button onClick={() => triggerSearch(displayValue)} className="ml-3 w-14 h-14 bg-blue-600 text-white rounded-2xl flex items-center justify-center shadow-xl active:scale-95"><Search size={24} strokeWidth={3} /></button>
        </div>

        <div className="flex space-x-2">
          <button onClick={() => { setActiveFilter('pending'); setCommittedSearch(''); }} className={`flex-1 py-3 rounded-xl border-b-4 transition-all ${activeFilter === 'pending' ? 'bg-white border-blue-600 text-blue-600 shadow-sm' : 'text-gray-300 border-transparent opacity-50'}`}>
            <span className="text-[8px] font-black uppercase tracking-widest">PENDENTES</span>
          </button>
          <button onClick={() => { setActiveFilter('checked'); setCommittedSearch(''); }} className={`flex-1 py-3 rounded-xl border-b-4 transition-all ${activeFilter === 'checked' ? 'bg-emerald-50 border-emerald-600 text-emerald-900 shadow-sm' : 'text-gray-300 border-transparent opacity-50'}`}>
            <span className="text-[8px] font-black uppercase tracking-widest">CONFERIDOS</span>
          </button>
        </div>
      </div>

      <div className={`flex-1 overflow-y-auto px-4 no-scrollbar pb-32 transition-colors ${activeFilter === 'pending' ? 'bg-white' : 'bg-emerald-50/10'}`}>
        {filteredAssetsInLocation.length > 0 ? (
          <div className="mt-4">
            {filteredAssetsInLocation.map((asset, index) => (
              <AssetCard 
                key={asset.id} 
                asset={asset} 
                onSelect={onSelectAsset} 
                plaquetaTerms={plaquetaTerms} 
                decision={localDecisions[String(asset.id)] || null} 
                onMakeDecision={handleMakeDecision} 
                yesButtonRef={index === 0 ? firstYesButtonRef : undefined} 
                isConferidoTab={activeFilter === 'checked'}
                currentLocation={selectedLocation || ""}
              />
            ))}
          </div>
        ) : (
          <div className="py-20 text-center opacity-30 flex flex-col items-center">
            <AlertCircle size={48} className="mb-3 text-gray-200" />
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400">Setor Limpo / Não Encontrado</p>
          </div>
        )}
      </div>

      {showBatchButton && (
        <div className="fixed bottom-6 left-6 right-6 z-[60] animate-slideUp">
           <button onClick={() => { onBulkUpdateAssets(Object.entries(localDecisions).filter(([_, d]) => d === 'YES').map(([id]) => id)); resetSearchAndFocus(); }} className="w-full py-5 bg-emerald-600 text-white rounded-[1.8rem] font-black uppercase shadow-2xl flex items-center justify-center space-x-3 active:scale-95 border-2 border-emerald-400">
             <Save size={24} />
             <span>Confirmar Lote ({Object.entries(localDecisions).filter(([_, d]) => d === 'YES').length})</span>
           </button>
        </div>
      )}

      {showNewAssetDialog && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
          <div className="bg-white w-full max-w-[280px] rounded-[2.5rem] p-8 shadow-2xl text-center animate-bounceIn">
            <div className="w-14 h-14 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center mx-auto mb-5 border border-red-100"><AlertCircle size={32} /></div>
            <h3 className="text-xl font-black text-gray-900 uppercase mb-2">Item Ausente</h3>
            <p className="text-[10px] font-bold text-gray-400 uppercase leading-relaxed mb-8">O código <span className="text-red-600 font-black">{committedSearch}</span> não existe na base. Deseja cadastrar agora?</p>
            <div className="space-y-3">
              <button onClick={() => { setNewAssetData({ description: '', plaqueta: committedSearch }); setShowNewAssetDialog(false); setIsCreatingNewAsset(true); }} className="w-full py-4.5 bg-blue-600 text-white rounded-2xl font-black uppercase text-[10px] flex items-center justify-center space-x-2 shadow-xl shadow-blue-100"><PlusCircle size={18} /><span>Cadastrar Ativo</span></button>
              <button onClick={resetSearchAndFocus} className="w-full py-4 bg-gray-50 text-gray-400 rounded-2xl font-black uppercase text-[9px] tracking-[0.2em]">Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {isCreatingNewAsset && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl">
          <div className="bg-white w-full max-w-[280px] rounded-[2.5rem] p-6 shadow-2xl relative overflow-hidden">
             <div className="flex items-center space-x-3 mb-4">
                <div className="w-10 h-10 bg-purple-600 rounded-xl flex items-center justify-center text-white"><FilePlus size={20} /></div>
                <div>
                  <h3 className="text-sm font-black text-gray-900 uppercase">Novo Registro</h3>
                  <p className="text-[7px] font-black text-purple-600 uppercase tracking-widest">Inclusão Direta</p>
                </div>
             </div>
             <div className="space-y-4">
                <div className="px-4 py-3 bg-gray-50 rounded-xl font-black text-blue-600 text-lg border border-gray-100 shadow-inner">{newAssetData.plaqueta}</div>
                <div className="space-y-1">
                  <label className="text-[7px] font-black text-gray-400 uppercase tracking-widest ml-1">Descrição Detalhada</label>
                  <textarea rows={3} placeholder="DESCREVA O BEM..." value={newAssetData.description} onChange={(e) => setNewAssetData({...newAssetData, description: e.target.value.toUpperCase()})} className="w-full px-4 py-3 bg-gray-50 rounded-xl border-2 border-transparent focus:border-purple-500 outline-none font-bold text-[10px] uppercase shadow-inner" />
                </div>
                <div className="flex space-x-2 pt-2">
                   <button onClick={resetSearchAndFocus} className="flex-1 py-3.5 bg-gray-50 text-gray-400 rounded-xl font-black uppercase text-[8px] tracking-widest">Sair</button>
                   <button onClick={() => { onUpdateAsset({ id: `new_${Date.now()}`, DESCRICAO_DO_ATIVO_IMOBILIZADO: newAssetData.description.toUpperCase(), PLAQUETA: newAssetData.plaqueta, EMPRESA: selectedCompany || "", LOCALIZACAO: selectedLocation || "", _isNew: true, _conferido: true }); resetSearchAndFocus(); }} className="flex-[2] py-3.5 bg-emerald-600 text-white rounded-xl font-black uppercase text-[8px] tracking-widest shadow-lg shadow-emerald-100">Salvar Item</button>
                </div>
             </div>
          </div>
        </div>
      )}

      {isScannerOpen && <Scanner onBack={() => setIsScannerOpen(false)} onScanSuccess={(val) => { setIsScannerOpen(false); triggerSearch(val.replace(/\D/g, '').slice(-6)); }} />}
    </div>
  );
};

export default Inventory;
