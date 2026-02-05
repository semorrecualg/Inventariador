
import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { Asset } from '../types';
import Scanner from './Scanner';
import { 
  Search, 
  ChevronRight, 
  Hash, 
  X, 
  ArrowLeft, 
  MapPin, 
  Database,
  Scan,
  Barcode,
  Keyboard,
  Filter,
  AlertCircle,
  Layers
} from 'lucide-react';

interface ConsultationProps {
  assets: Asset[];
  onBack: () => void;
  onSelectAsset: (asset: Asset) => void;
}

const Consultation: React.FC<ConsultationProps> = ({ assets, onBack, onSelectAsset }) => {
  const [displayValue, setDisplayValue] = useState('000000');
  const [committedSearch, setCommittedSearch] = useState('');
  const [searchKey, setSearchKey] = useState<string>('PLAQUETA');
  
  const searchInputRef = useRef<HTMLInputElement>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

  const forceCursorRight = useCallback(() => {
    if (searchInputRef.current) {
      const len = searchInputRef.current.value.length;
      searchInputRef.current.setSelectionRange(len, len);
    }
  }, []);

  useEffect(() => {
    setTimeout(() => {
      searchInputRef.current?.focus();
      forceCursorRight();
    }, 400);
  }, [forceCursorRight]);

  const allAvailableKeys = useMemo(() => {
    if (!assets || assets.length === 0) return [];
    const blacklist = ['id', 'TAG_INVENTARIO', 'TAG_PLAQUETA', 'TAG_DUPLICIDADE', 'TAG_ADOCAO'];
    const keySet = new Set<string>();
    assets.forEach(asset => {
      Object.keys(asset).forEach(k => {
        if (!k.startsWith('_') && !blacklist.includes(k)) keySet.add(k);
      });
    });
    return Array.from(keySet).sort();
  }, [assets]);

  useEffect(() => {
    if (allAvailableKeys.length > 0 && searchKey === 'PLAQUETA') {
      const exists = allAvailableKeys.some(k => k.toUpperCase() === 'PLAQUETA');
      if (!exists) {
        const alt = allAvailableKeys.find(k => k.toUpperCase().includes('PATRI')) || allAvailableKeys[0];
        setSearchKey(alt);
      }
    }
  }, [allAvailableKeys, searchKey]);

  const filteredAssets = useMemo(() => {
    if (!committedSearch) return [];
    const term = committedSearch.toUpperCase().trim();
    
    return assets.filter(asset => {
      const val = String(asset[searchKey] || '').toUpperCase().trim();
      return val === term || val.padStart(6, '0') === term.padStart(6, '0') || val.includes(term);
    }).sort((a, b) => {
      const vA = String(a[searchKey] || '');
      const vB = String(b[searchKey] || '');
      return vA.localeCompare(vB, undefined, { numeric: true });
    }).slice(0, 50);
  }, [assets, committedSearch, searchKey]);

  const triggerSearch = (val: string) => {
    setCommittedSearch(val);
    searchInputRef.current?.blur();
    setTimeout(() => confirmButtonRef.current?.focus(), 100);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, '');
    let formatted = "";
    
    if (raw.length > 6) {
      formatted = raw.slice(-6);
    } else {
      formatted = raw.padStart(6, '0');
    }

    setDisplayValue(formatted);
    // Limpa a busca incremental
    if (committedSearch !== "") {
        setCommittedSearch("");
    }

    setTimeout(forceCursorRight, 0);
  };

  const handleFocus = () => {
    setTimeout(forceCursorRight, 0);
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50 animate-fadeIn relative overflow-hidden">
      <div className="bg-white px-6 pt-10 pb-6 border-b border-gray-100 shadow-sm relative z-20">
        <div className="flex items-center justify-between mb-6">
          <button onClick={onBack} className="flex items-center space-x-2 text-gray-400 font-black text-[10px] uppercase tracking-widest active:text-blue-600 transition-colors">
            <ArrowLeft size={16} /> <span>Voltar</span>
          </button>
          <div className="flex items-center space-x-2 bg-blue-50 px-3 py-1.5 rounded-full border border-blue-100">
            <Database size={10} className="text-blue-500" />
            <span className="text-[9px] font-black text-blue-700 uppercase tracking-tighter">Base: {assets.length}</span>
          </div>
        </div>

        <div className="flex items-end justify-between mb-6">
          <div className="flex-1">
            <h1 className="text-3xl font-black text-black uppercase tracking-tighter leading-none">Consulta</h1>
            <p className="text-[9px] font-black text-gray-400 uppercase tracking-[0.2em] mt-2">Busca por {searchKey}</p>
          </div>
        </div>

        <div className="relative">
          <div className="absolute left-6 top-1/2 -translate-y-1/2 text-blue-300">
            <Hash size={24} />
          </div>
          <input 
            ref={searchInputRef}
            type="text" 
            inputMode="numeric"
            value={displayValue} 
            onChange={handleInputChange}
            onFocus={handleFocus}
            onSelect={forceCursorRight}
            onKeyDown={(e) => e.key === 'Enter' && triggerSearch(displayValue)}
            className="w-full pl-16 pr-32 py-6 text-3xl font-black uppercase outline-none border-2 border-blue-50 bg-blue-50/20 rounded-[2.2rem] focus:border-blue-500 focus:bg-white transition-all tracking-tighter text-blue-950 caret-blue-600 shadow-inner"
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center space-x-2">
            <button 
              ref={confirmButtonRef}
              onClick={() => triggerSearch(displayValue)}
              className="w-14 h-14 bg-blue-600 text-white rounded-2xl flex items-center justify-center shadow-lg active:scale-95 transition-all focus:ring-4 focus:ring-blue-200"
            >
              <Search size={24} strokeWidth={3} />
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 pt-4 no-scrollbar pb-24">
        {committedSearch ? (
          filteredAssets.length > 0 ? (
            <div className="space-y-3">
              <span className="text-[9px] font-black text-gray-300 uppercase tracking-widest px-2">Resultados: {filteredAssets.length}</span>
              {filteredAssets.map((asset) => (
                <button 
                  key={asset.id} 
                  onClick={() => onSelectAsset(asset)} 
                  className="w-full flex items-center p-5 bg-white rounded-[1.8rem] border border-gray-100 shadow-sm active:bg-blue-50 transition-all text-left group"
                >
                  <div className="w-14 h-14 bg-gray-50 rounded-2xl flex items-center justify-center text-blue-500 mr-4">
                    <Barcode size={24} />
                  </div>
                  <div className="flex-1 min-w-0 pr-4">
                    <div className="flex items-center space-x-2 mb-1">
                      <span className="text-[8px] font-black text-blue-400 uppercase tracking-widest">Nº {searchKey}</span>
                      <span className="text-lg font-black text-black leading-none">{String(asset[searchKey] || '---')}</span>
                    </div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase truncate">
                      {String(asset['DESCRICAO'] || asset['DESC_SINTETICA'] || 'SEM DESCRIÇÃO')}
                    </p>
                  </div>
                  <ChevronRight size={18} className="text-gray-200" />
                </button>
              ))}
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center opacity-40 text-center py-20">
              <AlertCircle size={48} className="text-gray-200 mb-4" />
              <p className="text-[10px] font-black text-gray-400 uppercase">Item {committedSearch} não encontrado</p>
            </div>
          )
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-center py-20">
            <Keyboard size={40} className="text-gray-200 mb-4" />
            <p className="text-[10px] font-black text-gray-300 uppercase tracking-widest leading-relaxed max-w-[200px]">
              Insira os 6 dígitos para consulta instantânea.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Consultation;
