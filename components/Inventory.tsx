
import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { Asset } from '../types';
import Scanner from './Scanner';
import { 
  ArrowLeft, 
  MapPin, 
  Check,
  Keyboard, 
  Zap, 
  Plus, 
  AlertTriangle, 
  Info, 
  Search, 
  ClipboardCheck, 
  XCircle, 
  Globe, 
  PlusCircle, 
  FilePlus, 
  Save, 
  X, 
  Type 
} from 'lucide-react';

interface AssetCardProps {
  asset: Asset;
  onSelect: (a: Asset) => void;
  onMakeDecision: (id: string, decision: 'YES' | 'NO') => void;
  isConferidoTab: boolean;
  highlighted?: boolean;
  isAdotado?: boolean;
  isExternal?: boolean;
}

const AssetCard = React.memo(({ 
  asset, onSelect, onMakeDecision, isConferidoTab, highlighted, isAdotado, isExternal 
}: AssetCardProps) => {
  const isConferido = !!asset._conferido;
  
  const checkIsBaixado = (item: any) => {
    const terms = ['DATA_BAIXA', 'DT_BAIXA', 'DATA_DA_BAIXA', 'BAIXA', 'DATA_DE_BAIXA', 'MOTIVO_BAIXA', 'STATUS_BAIXA', 'SITUACAO'];
    for (const term of terms) {
      const val = String(item[term] || '').trim().toUpperCase();
      if (val !== "" && val !== "---" && val !== "0" && val !== "NULL" && val !== "ATIVO") return true;
    }
    return false;
  };
  
  const isBaixado = checkIsBaixado(asset);
  const plaquetaInv = asset.PLAQUETA_INVENTARIO;
  const originalPlaqueta = asset['PLAQUETA'] || asset['ETIQUETA'] || asset['PATRIMONIO'] || asset['BEM'] || '';
  const displayPlaqueta = plaquetaInv || originalPlaqueta || 'S/ PLACA';
  const descricao = asset['DESCRICAO_DO_ATIVO_IMOBILIZADO'] || asset['DESCRICAO'] || 'ITEM SEM DESCRIÇÃO';
  const tagInv = asset.TAG_INVENTARIO;

  let cardStyle = "bg-slate-900/40 border-slate-800";
  let badgeStyle = "bg-slate-800 text-slate-400 border-slate-700";
  let btnStyle = "bg-indigo-600";
  let tagLabel = tagInv || 'PENDENTE';

  if (isBaixado) {
    cardStyle = "bg-red-950/20 border-red-500/50 shadow-[0_0_20px_rgba(239,68,68,0.2)]";
    badgeStyle = "bg-red-600 text-white border-red-400";
    btnStyle = "bg-red-600";
    tagLabel = "BAIXADO";
  } else if (isExternal) {
    cardStyle = "bg-fuchsia-950/20 border-fuchsia-500/50 shadow-[0_0_20px_rgba(217,70,239,0.4)]";
    badgeStyle = "bg-fuchsia-600 text-white border-fuchsia-400";
    btnStyle = "bg-fuchsia-600";
    tagLabel = "EXTERNO";
  } else if (tagInv === 'NOVO ITEM INCLUÍDO') {
    cardStyle = "bg-purple-950/20 border-purple-500/50 shadow-[0_0_20px_rgba(168,85,247,0.3)]";
    badgeStyle = "bg-purple-600 text-white border-purple-400";
    btnStyle = "bg-purple-600";
    tagLabel = "NOVO ITEM INCLUÍDO";
  } else if (isAdotado || tagInv === 'ADOTADO') {
    cardStyle = "bg-blue-950/20 border-blue-500/50";
    badgeStyle = "bg-blue-600 text-white border-blue-400";
    btnStyle = "bg-blue-600";
    tagLabel = "ADOÇÃO";
  } else if (isConferido) {
    cardStyle = "bg-emerald-950/10 border-emerald-600/30";
    badgeStyle = "bg-emerald-600 text-white border-emerald-500";
    btnStyle = "bg-emerald-600";
    tagLabel = "CONFERIDO";
  }

  if (highlighted) cardStyle += " ring-2 ring-indigo-500 bg-slate-900 shadow-2xl";

  return (
    <div 
      className={`mb-3 p-4 border rounded-2xl transition-all duration-200 active:scale-[0.98] flex items-center justify-between ${cardStyle}
        ${isConferido && !isConferidoTab && !isBaixado && !isExternal ? 'opacity-30' : ''}`}
      onClick={() => onSelect(asset)}
    >
      <div className="flex-1 min-w-0 pr-4">
        <div className="flex items-center space-x-2 mb-1">
          <h3 className={`text-xl font-black font-mono tracking-tighter ${tagInv === 'NOVO ITEM INCLUÍDO' ? 'text-purple-400' : isBaixado ? 'text-red-400' : 'text-white'}`}>
            {displayPlaqueta}
          </h3>
          <span className={`text-[7px] font-black px-2 py-0.5 rounded-md uppercase tracking-widest border ${badgeStyle}`}>
            {tagLabel}
          </span>
        </div>
        <p className="text-[10px] font-bold text-slate-400 uppercase line-clamp-2 leading-tight italic">
          {descricao}
          {(isExternal || isAdotado) && (
            <span className={`block mt-1 font-black text-[8px] ${isExternal ? 'text-fuchsia-400' : 'text-blue-400'}`}>
               Origem: {asset._empresaNormalizada} - Setor: {asset['LOCALIZACAO'] || asset['SETOR'] || 'INDEFINIDO'}
            </span>
          )}
        </p>
      </div>

      {(!isConferido || isConferidoTab || isBaixado || isExternal) && (
        <button 
          onClick={(e) => { 
            e.stopPropagation(); 
            onMakeDecision(String(asset.id), 'YES'); 
          }}
          className={`w-12 h-12 rounded-xl flex items-center justify-center text-white shadow-xl active:scale-90 transition-all shrink-0 ${btnStyle}`}
        >
          <Check size={28} strokeWidth={4} />
        </button>
      )}
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
  databaseHeaders?: string[];
}

const Inventory: React.FC<InventoryProps> = ({ 
  assets, allAssets, onBack, onUpdateAsset, onBulkUpdateAssets, onSelectAsset, selectedLocation, setSelectedLocation, isInventorying, setIsInventorying, selectedCompany, databaseHeaders = []
}) => {
  const [displayValue, setDisplayValue] = useState('000000');
  const [committedSearch, setCommittedSearch] = useState('');
  const [batchTagFocus, setBatchTagFocus] = useState<string | null>(null);
  const [searchMode, setSearchMode] = useState<'TAG' | 'DESCRIPTION'>('TAG');
  const [activeFilter, setActiveFilter] = useState<'pending' | 'checked'>('pending');
  const [inputMethod, setInputMethod] = useState<'keyboard' | 'scanner'>('keyboard');
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [newLocationName, setNewLocationName] = useState('');
  
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [manualDescription, setManualDescription] = useState('');
  
  const searchInputRef = useRef<HTMLInputElement>(null);

  const checkIsBaixado = useCallback((item: any) => {
    const terms = ['DATA_BAIXA', 'DT_BAIXA', 'DATA_DA_BAIXA', 'BAIXA', 'DATA_DE_BAIXA', 'MOTIVO_BAIXA', 'STATUS_BAIXA', 'SITUACAO'];
    for (const term of terms) {
      const val = String(item[term] || '').trim().toUpperCase();
      if (val !== "" && val !== "---" && val !== "0" && val !== "NULL" && val !== "ATIVO") return true;
    }
    return false;
  }, []);

  const getAssetLocation = useCallback((asset: Asset): string => {
    const keys = ['LOCAL', 'LOCALIZACAO', 'SETOR', 'ENDERECO', 'UNIDADE'];
    for (const key of keys) {
      const val = asset[key] || asset[key.toLowerCase()];
      if (val && String(val).trim() !== "" && String(val).toUpperCase() !== "NULL") {
        return String(val).trim().toUpperCase();
      }
    }
    return 'SEM LOCAL';
  }, []);

  const getAssetTagValue = useCallback((asset: Asset): string => {
    if (asset.PLAQUETA_INVENTARIO) return String(asset.PLAQUETA_INVENTARIO).trim().toUpperCase();
    const keys = ['PLAQUETA', 'ETIQUETA', 'PATRIMONIO', 'BEM', 'TAG'];
    for (const key of keys) {
      const val = asset[key] || asset[key.toLowerCase()];
      if (val && String(val).trim() !== "") return String(val).trim().toUpperCase();
    }
    return '0';
  }, []);

  const currentCompanyAssets = useMemo(() => {
    if (!selectedCompany) return [];
    const sel = String(selectedCompany).toUpperCase().trim();
    return allAssets.filter(a => String(a._empresaNormalizada || '').toUpperCase().trim() === sel);
  }, [allAssets, selectedCompany]);

  const filteredAndSortedAssets = useMemo(() => {
    if (!selectedLocation) return [];
    const currentLoc = selectedLocation.toUpperCase();
    
    let baseList = [];

    // Prioridade 1: Foco em Lote (exibe todos os registros da mesma placa na empresa, independente do setor)
    if (batchTagFocus) {
      const term = batchTagFocus.toUpperCase().trim();
      baseList = currentCompanyAssets.filter(a => {
        const tagV = getAssetTagValue(a);
        const originalV = String(a['PLAQUETA'] || a['ETIQUETA'] || a['PATRIMONIO'] || '').toUpperCase();
        return tagV === term || tagV.padStart(6, '0') === term.padStart(6, '0') || originalV === term || originalV.padStart(6, '0') === term.padStart(6, '0');
      });
    }
    // Prioridade 2: Busca por termo digitado
    else if (committedSearch) {
      const term = committedSearch.toUpperCase().trim();
      
      // REGRA DE BUSCA: Busca na empresa atual (Ativos ou Baixados)
      baseList = currentCompanyAssets.filter(a => {
        const tagV = getAssetTagValue(a);
        const originalV = String(a['PLAQUETA'] || a['ETIQUETA'] || a['PATRIMONIO'] || '').toUpperCase();
        return tagV === term || tagV.padStart(6, '0') === term.padStart(6, '0') || tagV.includes(term) ||
               originalV === term || originalV.padStart(6, '0') === term.padStart(6, '0') || originalV.includes(term);
      });

      // SE NÃO ENCONTRADO na empresa atual, busca adoção externa em outras empresas
      if (baseList.length === 0) {
        baseList = allAssets.filter(a => {
          const tagV = getAssetTagValue(a);
          const originalV = String(a['PLAQUETA'] || a['ETIQUETA'] || a['PATRIMONIO'] || '').toUpperCase();
          const matches = tagV === term || tagV.padStart(6, '0') === term.padStart(6, '0') || 
                         originalV === term || originalV.padStart(6, '0') === term.padStart(6, '0');
          return matches && String(a._empresaNormalizada || '').toUpperCase() !== String(selectedCompany).toUpperCase();
        });
      }
    } 
    // Prioridade 3: Listagem padrão do Setor
    else {
      baseList = assets.filter(a => getAssetLocation(a) === currentLoc && !checkIsBaixado(a));
    }

    // Filtro de Pendentes/Conferidos se não estiver em busca/lote
    if (!batchTagFocus && !committedSearch) {
      baseList = baseList.filter(a => activeFilter === 'checked' ? !!a._conferido : !a._conferido);
    }

    return baseList.sort((a, b) => {
      const tagA = getAssetTagValue(a);
      const tagB = getAssetTagValue(b);
      return tagA.localeCompare(tagB, undefined, { numeric: true });
    });
  }, [assets, allAssets, currentCompanyAssets, selectedLocation, committedSearch, batchTagFocus, activeFilter, getAssetLocation, getAssetTagValue, selectedCompany, checkIsBaixado]);

  const isExternalAdoption = useMemo(() => {
    if (filteredAndSortedAssets.length === 0) return false;
    return String(filteredAndSortedAssets[0]._empresaNormalizada || '').toUpperCase() !== String(selectedCompany).toUpperCase();
  }, [filteredAndSortedAssets, selectedCompany]);

  const isBatchView = useMemo(() => {
    // Se temos mais de um registro para o que está sendo visualizado, é lote
    const pendings = filteredAndSortedAssets.filter(a => !a._conferido);
    if (pendings.length < 2) return false;
    const firstTag = getAssetTagValue(pendings[0]);
    return pendings.every(a => getAssetTagValue(a) === firstTag);
  }, [filteredAndSortedAssets, getAssetTagValue]);

  const clearFilters = () => {
    setCommittedSearch('');
    setBatchTagFocus(null);
    setDisplayValue(searchMode === 'TAG' ? '000000' : '');
  };

  const handleIncludeManual = () => {
    setManualDescription('');
    setIsManualModalOpen(true);
  };

  const onConfirmManualInclusion = () => {
    if (!manualDescription.trim()) return;
    const tag = committedSearch || displayValue || '000000';
    const today = new Date().toLocaleDateString('pt-BR');
    
    let suggestedCC = "";
    const ccHeader = databaseHeaders.find(h => h.includes('CENTRO') || h.includes('CUSTO') || h === 'CC');
    if (ccHeader) {
      const firstAssetInLoc = assets.find(a => getAssetLocation(a) === (selectedLocation || "").toUpperCase());
      if (firstAssetInLoc) suggestedCC = String(firstAssetInLoc[ccHeader] || "");
    }

    const newAsset: Asset = {
      id: `manual_${Date.now()}`,
      _empresaNormalizada: selectedCompany || "GERAL",
      _isNew: true,
      _conferido: true,
      PLAQUETA_INVENTARIO: tag,
      TAG_INVENTARIO: "NOVO ITEM INCLUÍDO"
    };

    databaseHeaders.forEach(header => { newAsset[header] = ""; });

    const plaquetaField = databaseHeaders.find(h => ['PLAQUETA', 'ETIQUETA', 'PATRIMONIO', 'TAG', 'BEM'].includes(h));
    if (plaquetaField) newAsset[plaquetaField] = tag;

    const companyField = databaseHeaders.find(h => h.includes('EMPRESA') || h.includes('UNIDADE'));
    if (companyField) newAsset[companyField] = (selectedCompany || "GERAL").toUpperCase();

    const locField = databaseHeaders.find(h => ['LOCALIZACAO', 'SETOR', 'LOCAL', 'ENDERECO'].includes(h));
    if (locField) newAsset[locField] = (selectedLocation || "SEM LOCAL").toUpperCase();

    if (ccHeader) newAsset[ccHeader] = suggestedCC;

    const dateField = databaseHeaders.find(h => h.includes('DATA_AQUISICAO') || h.includes('DT_AQ'));
    if (dateField) newAsset[dateField] = today;

    const descField = databaseHeaders.find(h => h.includes('DESCRICAO') || h.includes('DESC_SINTETICA'));
    if (descField) newAsset[descField] = manualDescription.toUpperCase().trim();

    onUpdateAsset(newAsset);
    setIsManualModalOpen(false);
    clearFilters();
  };

  const handleDecision = (id: string, decision: 'YES' | 'NO') => {
    if (decision === 'NO') return;
    const asset = allAssets.find(a => String(a.id) === id);
    if (!asset) return;
    const tag = getAssetTagValue(asset);
    
    // Verificamos duplicatas na EMPRESA inteira (independente de setor) para ativar lote
    const duplicates = currentCompanyAssets.filter(a => getAssetTagValue(a) === tag && !a._conferido);

    if (duplicates.length > 1 && !batchTagFocus) {
      setBatchTagFocus(tag);
      setCommittedSearch('');
    } else {
      // Confirmação de item individual ou confirmação final do lote
      onBulkUpdateAssets([id]);
      if (committedSearch || batchTagFocus) {
         // Se após confirmar ainda houver duplicatas pendentes no lote, mantém o foco
         const remaining = duplicates.filter(d => String(d.id) !== String(id));
         if (remaining.length === 0) clearFilters();
      }
    }
  };

  const handleItemClick = (asset: Asset) => {
    const tag = getAssetTagValue(asset);
    // Verifica se esse item clicado tem duplicatas na empresa (mesmo em outros setores)
    const duplicates = currentCompanyAssets.filter(a => getAssetTagValue(a) === tag && !a._conferido);
    
    if (duplicates.length > 1 && !batchTagFocus) {
      setBatchTagFocus(tag);
      setCommittedSearch('');
    } else {
      onSelectAsset(asset);
    }
  };

  if (!isInventorying) {
    return (
      <div className="flex flex-col h-full bg-slate-950 animate-fadeIn">
        <div className="px-6 pt-12 pb-6 bg-slate-900 border-b border-slate-800">
          <button onClick={onBack} className="flex items-center text-slate-600 text-[10px] font-black uppercase mb-6">
            <ArrowLeft size={14} className="mr-2" /> Central de Ativos
          </button>
          <h2 className="text-2xl font-black text-white uppercase italic">Setores de Inventário</h2>
          <p className="text-[9px] font-black text-indigo-500 uppercase mt-2">{selectedCompany}</p>
          <div className="mt-6 flex space-x-2">
            <input 
              type="text" 
              placeholder="NOVO SETOR..." 
              value={newLocationName} 
              onChange={(e) => setNewLocationName(e.target.value.toUpperCase())}
              className="flex-1 px-5 py-4 bg-slate-800 rounded-2xl text-[10px] font-black uppercase outline-none border border-slate-700 focus:border-indigo-600 text-white"
            />
            <button onClick={() => { if(newLocationName.trim()) { setSelectedLocation(newLocationName.trim().toUpperCase()); setIsInventorying(true); setNewLocationName(''); } }} className="w-14 h-14 bg-indigo-600 text-white rounded-2xl flex items-center justify-center active:scale-95"><Plus size={24} /></button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-3 pb-32 no-scrollbar">
          {Object.keys(assets.reduce((acc: any, a) => { 
            if (checkIsBaixado(a)) return acc;
            const loc = getAssetLocation(a); 
            if (!acc[loc]) acc[loc] = { total: 0, checked: 0 };
            acc[loc].total++;
            if (a._conferido) acc[loc].checked++;
            return acc;
          }, {})).sort().map(loc => {
            const stats = assets.reduce((acc: any, a) => { 
              if (getAssetLocation(a) === loc && !checkIsBaixado(a)) { acc.total++; if(a._conferido) acc.checked++; }
              return acc;
            }, {total: 0, checked: 0});
            const progress = (stats.checked / stats.total) * 100;
            return (
              <button key={loc} onClick={() => { setSelectedLocation(loc); setIsInventorying(true); }} className="w-full bg-slate-900 border border-slate-800 rounded-3xl p-6 relative overflow-hidden active:scale-[0.98]">
                <div className="absolute bottom-0 left-0 h-1 bg-indigo-600 transition-all duration-1000" style={{ width: `${progress}%` }} />
                <div className="flex items-center space-x-4">
                  <div className="w-12 h-12 bg-slate-950 text-indigo-500 rounded-xl flex items-center justify-center"><MapPin size={22} /></div>
                  <div className="text-left">
                    <span className="text-[14px] font-black uppercase block text-slate-100">{loc}</span>
                    <span className="text-[9px] font-black text-slate-600 uppercase">{stats.checked} / {stats.total} ATIVOS</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-slate-950 animate-fadeIn overflow-hidden">
      <div className="px-6 pt-12 pb-4 bg-slate-900 border-b border-slate-800 relative z-30 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <button onClick={() => { setIsInventorying(false); clearFilters(); }} className="flex items-center text-slate-500 text-[9px] font-black uppercase">
            <ArrowLeft size={14} className="mr-1" /> {selectedLocation}
          </button>
          <div className="flex space-x-2">
            {(committedSearch || batchTagFocus) && <button onClick={clearFilters} className="p-2.5 bg-red-900/20 text-red-500 rounded-xl border border-red-500/20"><XCircle size={18} /></button>}
            <button onClick={() => { setSearchMode(prev => prev === 'TAG' ? 'DESCRIPTION' : 'TAG'); clearFilters(); }} className={`px-4 py-2.5 rounded-2xl border text-[8px] font-black uppercase ${searchMode === 'DESCRIPTION' ? 'bg-amber-600 text-white' : 'bg-slate-800 text-slate-500'}`}>{searchMode === 'TAG' ? 'TEXTO' : 'PLACA'}</button>
            <button onClick={() => setInputMethod('keyboard')} className={`p-2.5 rounded-xl ${inputMethod === 'keyboard' ? 'bg-indigo-600 text-white' : 'text-slate-600'}`}><Keyboard size={18} /></button>
            <button onClick={() => { setInputMethod('scanner'); setIsScannerOpen(true); }} className={`p-2.5 rounded-xl ${inputMethod === 'scanner' ? 'bg-indigo-600 text-white' : 'text-slate-600'}`}><Zap size={18} /></button>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <input 
            ref={searchInputRef}
            type="text" 
            inputMode={searchMode === 'TAG' ? "numeric" : "text"}
            value={displayValue} 
            onChange={(e) => { 
              if (searchMode === 'TAG') {
                const r = e.target.value.replace(/\D/g, ''); 
                setDisplayValue(r.length > 6 ? r.slice(-6) : r.padStart(6, '0')); 
              } else setDisplayValue(e.target.value.toUpperCase());
            }}
            onKeyDown={(e) => e.key === 'Enter' && setCommittedSearch(displayValue)}
            className={`w-full bg-slate-950 border-2 px-6 py-5 font-black rounded-[2rem] outline-none focus:border-indigo-600 text-white ${searchMode === 'TAG' ? 'font-mono text-5xl text-center' : 'text-sm'}`}
            placeholder={searchMode === 'TAG' ? "000000" : "QUAL O ATIVO?"}
          />
        </div>
        <div className="flex mt-4 space-x-2">
          <button onClick={() => { setActiveFilter('pending'); clearFilters(); }} className={`flex-1 py-4 rounded-xl text-[11px] font-black uppercase border ${activeFilter === 'pending' && !committedSearch && !batchTagFocus ? 'bg-white text-slate-950' : 'text-slate-600 border-slate-800'}`}>Pendentes</button>
          <button onClick={() => { setActiveFilter('checked'); clearFilters(); }} className={`flex-1 py-4 rounded-xl text-[11px] font-black uppercase border ${activeFilter === 'checked' ? 'bg-indigo-600 text-white' : 'text-slate-600 border-slate-800'}`}>Conferidos</button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6 no-scrollbar pb-44">
        {/* Painel de Lote Unificado */}
        {isBatchView && !isExternalAdoption && (
          <div className="w-full mb-6 p-5 bg-amber-500 border-4 border-white/30 rounded-3xl flex items-center justify-between shadow-[0_15px_50px_rgba(245,158,11,0.4)] relative overflow-hidden">
            <div className="flex items-center space-x-3 text-black z-10">
              <ClipboardCheck size={24} />
              <div>
                <p className="text-[10px] font-black uppercase leading-none mb-1">Itens em Lote (Duplicatas)</p>
                <p className="text-[14px] font-black uppercase leading-none">{filteredAndSortedAssets.filter(a => !a._conferido).length} Registros na Empresa</p>
              </div>
            </div>
            <button 
              onClick={() => { 
                onBulkUpdateAssets(filteredAndSortedAssets.filter(a => !a._conferido).map(a => String(a.id))); 
                clearFilters(); 
              }} 
              className="px-6 py-3 bg-black text-white rounded-xl text-[10px] font-black uppercase active:scale-95 transition-all z-10"
            >
              Confirmar Todos
            </button>
          </div>
        )}

        {/* Painel de Adoção Externa */}
        {isExternalAdoption && (
          <div className="w-full mb-6 p-5 bg-fuchsia-600 border-4 border-white/30 rounded-3xl flex flex-col shadow-[0_15px_50px_rgba(217,70,239,0.4)] animate-pulse relative overflow-hidden">
             <div className="flex items-center justify-between mb-4 relative z-10">
                <div className="flex items-center space-x-3 text-white">
                  <Globe size={24} />
                  <div>
                    <p className="text-[10px] font-black uppercase opacity-90 leading-none mb-1">Adoção Externa</p>
                    <p className="text-[14px] font-black uppercase leading-none">Localizado em Outra Unidade</p>
                  </div>
                </div>
             </div>
            <div className="flex space-x-2 relative z-10">
              <button onClick={() => handleDecision(String(filteredAndSortedAssets[0].id), 'YES')} className="flex-1 px-4 py-4 bg-white text-fuchsia-700 rounded-2xl text-[10px] font-black uppercase shadow-2xl active:scale-95">Adotar Item</button>
              <button onClick={handleIncludeManual} className="flex-1 px-4 py-4 bg-black text-white rounded-2xl text-[10px] font-black uppercase flex items-center justify-center space-x-2"><PlusCircle size={16} /><span>Incluir Novo</span></button>
            </div>
          </div>
        )}

        {filteredAndSortedAssets.length > 0 ? (
          filteredAndSortedAssets.map((asset) => (
            <AssetCard 
              key={asset.id} 
              asset={asset} 
              onSelect={handleItemClick} 
              onMakeDecision={handleDecision} 
              isConferidoTab={activeFilter === 'checked'} 
              highlighted={committedSearch !== '' || batchTagFocus !== null} 
              isAdotado={getAssetLocation(asset) !== (selectedLocation || "").toUpperCase()}
              isExternal={String(asset._empresaNormalizada).toUpperCase() !== String(selectedCompany).toUpperCase()}
            />
          ))
        ) : (
          <div className="py-24 text-center opacity-40 flex flex-col items-center">
            <Search size={64} className="mb-4 text-slate-700" />
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-6">Nenhum registro encontrado</p>
            {committedSearch && (
              <button onClick={handleIncludeManual} className="px-8 py-5 bg-purple-600 text-white rounded-[2rem] font-black uppercase text-[10px] tracking-widest flex items-center space-x-3 shadow-2xl active:scale-95">
                <FilePlus size={20} />
                <span>Incluir Novo Registro</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Modal de Inclusão Manual Simplificado */}
      {isManualModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/80 backdrop-blur-md animate-fadeIn">
          <div className="bg-slate-900 w-full max-w-sm rounded-[3rem] p-8 shadow-2xl border border-slate-800">
            <div className="text-center mb-8">
              <div className="w-16 h-16 bg-purple-600/20 text-purple-500 rounded-3xl flex items-center justify-center mx-auto mb-4"><FilePlus size={32} /></div>
              <h3 className="text-xl font-black text-white uppercase tracking-tighter italic">Novo Item Incluído</h3>
              <p className="text-[10px] font-black text-slate-500 uppercase mt-1 tracking-widest">Placa: {committedSearch || displayValue}</p>
            </div>
            <div className="space-y-6">
              <div className="bg-slate-950/50 p-4 rounded-2xl border border-slate-800/50 mb-2 space-y-1">
                 <div className="flex justify-between items-center"><span className="text-[8px] font-black text-slate-600 uppercase">Empresa Auto</span><span className="text-[9px] font-black text-indigo-400 uppercase">{selectedCompany}</span></div>
                 <div className="flex justify-between items-center"><span className="text-[8px] font-black text-slate-600 uppercase">Localização Auto</span><span className="text-[9px] font-black text-indigo-400 uppercase">{selectedLocation}</span></div>
              </div>
              <div>
                <label className="block text-[9px] font-black text-purple-400 uppercase tracking-widest mb-2 ml-2">Descrição Completa</label>
                <textarea autoFocus rows={4} value={manualDescription} onChange={(e) => setManualDescription(e.target.value.toUpperCase())} className="w-full px-6 py-5 bg-slate-950 rounded-[1.8rem] border-2 border-slate-800 focus:border-purple-600 outline-none text-white text-sm font-bold uppercase transition-all resize-none shadow-inner" placeholder="EX: MESA DE ESCRITORIO..." />
              </div>
              <button onClick={onConfirmManualInclusion} disabled={!manualDescription.trim()} className="w-full py-5 bg-emerald-600 disabled:bg-slate-800 text-white rounded-[1.8rem] font-black uppercase tracking-widest shadow-xl active:scale-95 transition-all flex items-center justify-center space-x-2">
                <Save size={18} strokeWidth={3} />
                <span>Gravar Registro</span>
              </button>
              <button onClick={() => setIsManualModalOpen(false)} className="w-full py-4 text-slate-500 font-black uppercase text-[9px] tracking-widest">Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {isScannerOpen && <Scanner onBack={() => setIsScannerOpen(false)} onScanSuccess={(val) => { setIsScannerOpen(false); setCommittedSearch(val.replace(/\D/g, '').slice(-6)); }} />}
    </div>
  );
};

export default Inventory;
