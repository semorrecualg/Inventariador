
import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { Asset } from '../types';
import Scanner from './Scanner';
import { 
  Search, 
  ChevronRight, 
  Hash, 
  X, 
  ArrowLeft, 
  Database,
  Scan,
  Barcode,
  Keyboard,
  Filter,
  AlertCircle,
  Globe,
  Building2
} from 'lucide-react';

interface ConsultationProps {
  assets: Asset[];
  onBack: () => void;
  onSelectAsset: (asset: Asset) => void;
  allAssets?: Asset[]; 
}

const Consultation: React.FC<ConsultationProps> = ({ assets, onBack, onSelectAsset, allAssets = [] }) => {
  const [displayValue, setDisplayValue] = useState('000000');
  const [committedSearch, setCommittedSearch] = useState('');
  const [searchKey, setSearchKey] = useState<string>('PLAQUETA');
  const [isGlobalSearch, setIsGlobalSearch] = useState(false);
  
  const searchInputRef = useRef<HTMLInputElement>(null);

  const forceCursorRight = useCallback(() => {
    if (searchInputRef.current) {
      const len = searchInputRef.current.value.length;
      searchInputRef.current.setSelectionRange(len, len);
    }
  }, []);

  const dataToSearch = useMemo(() => isGlobalSearch && allAssets.length > 0 ? allAssets : assets, [isGlobalSearch, allAssets, assets]);

  const filteredAssets = useMemo(() => {
    if (!committedSearch) return [];
    const term = committedSearch.toUpperCase().trim();
    
    return dataToSearch.filter(asset => {
      const val = String(asset[searchKey] || '').toUpperCase().trim();
      return val === term || val.padStart(6, '0') === term.padStart(6, '0') || val.includes(term);
    }).sort((a, b) => {
      const vA = String(a[searchKey] || '');
      const vB = String(b[searchKey] || '');
      return vA.localeCompare(vB, undefined, { numeric: true });
    }).slice(0, 30);
  }, [dataToSearch, committedSearch, searchKey]);

  const triggerSearch = (val: string) => {
    setCommittedSearch(val);
    searchInputRef.current?.blur();
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50 animate-fadeIn relative overflow-hidden">
      <div className="bg-white px-6 pt-8 pb-4 border-b border-gray-100 shadow-sm relative z-20">
        <div className="flex items-center justify-between mb-4">
          <button onClick={onBack} className="flex items-center space-x-1.5 text-gray-400 font-black text-[9px] uppercase tracking-widest active:text-blue-600 transition-colors">
            <ArrowLeft size={14} /> <span>Voltar</span>
          </button>
          
          <button 
            onClick={() => setIsGlobalSearch(!isGlobalSearch)}
            className={`flex items-center space-x-1.5 px-3 py-1 rounded-full border transition-all ${isGlobalSearch ? 'bg-indigo-600 text-white border-indigo-700 shadow-sm' : 'bg-gray-50 text-gray-500 border-gray-100'}`}
          >
            <Globe size={10} />
            <span className="text-[7px] font-black uppercase tracking-widest">{isGlobalSearch ? 'Global' : 'Local'}</span>
          </button>
        </div>

        <div className="flex items-end justify-between mb-4">
          <div>
            <h1 className="text-xl font-black text-black uppercase tracking-tighter leading-none">Consulta</h1>
            <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest mt-1">Pesquisa {isGlobalSearch ? 'em toda a base' : 'no setor atual'}</p>
          </div>
        </div>

        <div className="relative">
          <input 
            ref={searchInputRef}
            type="text" 
            inputMode="numeric"
            value={displayValue} 
            onChange={(e) => { const r = e.target.value.replace(/\D/g, ''); setDisplayValue(r.length > 6 ? r.slice(-6) : r.padStart(6, '0')); if(committedSearch) setCommittedSearch(''); }}
            onFocus={() => setTimeout(forceCursorRight, 0)}
            onSelect={forceCursorRight}
            onKeyDown={(e) => e.key === 'Enter' && triggerSearch(displayValue)}
            className="w-full pl-4 pr-20 py-4.5 text-3xl font-black uppercase outline-none border-2 border-gray-50 bg-gray-50/50 rounded-2xl focus:border-blue-500 focus:bg-white transition-all text-blue-950 shadow-inner"
          />
          <div className="absolute right-2 top-1/2 -translate-y-1/2">
            <button onClick={() => triggerSearch(displayValue)} className="w-12 h-12 bg-blue-600 text-white rounded-xl flex items-center justify-center shadow-lg active:scale-95 transition-all"><Search size={22} strokeWidth={3} /></button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pt-3 no-scrollbar pb-24">
        {committedSearch ? (
          filteredAssets.length > 0 ? (
            <div className="space-y-2">
              <span className="text-[8px] font-black text-gray-300 uppercase tracking-widest px-2">Total: {filteredAssets.length}</span>
              {filteredAssets.map((asset) => (
                <button key={asset.id} onClick={() => onSelectAsset(asset)} className="w-full flex items-center p-3.5 bg-white rounded-2xl border border-gray-100 shadow-sm active:bg-blue-50 transition-all text-left">
                  <div className="w-10 h-10 bg-gray-50 rounded-xl flex items-center justify-center text-blue-500 mr-3 shrink-0"><Barcode size={20} /></div>
                  <div className="flex-1 min-w-0 pr-2">
                    <div className="flex items-center space-x-1.5 mb-0.5">
                      <span className="text-[14px] font-black text-black leading-none">{String(asset[searchKey] || '---')}</span>
                    </div>
                    <p className="text-[9px] font-bold text-gray-400 uppercase truncate">
                      {String(asset['DESCRICAO'] || asset['DESC_SINTETICA'] || 'SEM DESCRIÇÃO')}
                    </p>
                  </div>
                  <ChevronRight size={14} className="text-gray-200" />
                </button>
              ))}
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center opacity-40 text-center py-20">
              <AlertCircle size={36} className="text-gray-200 mb-2" />
              <p className="text-[9px] font-black text-gray-400 uppercase">Não encontrado</p>
            </div>
          )
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-center py-20 opacity-30">
            <Keyboard size={32} className="text-gray-200 mb-3" />
            <p className="text-[8px] font-black text-gray-300 uppercase tracking-[0.2em]">Insira os 6 dígitos para buscar</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Consultation;
