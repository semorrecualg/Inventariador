
import React, { useState, useMemo, useRef, useEffect, useDeferredValue } from 'react';
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
  Loader2,
  Maximize2,
  Layers
} from 'lucide-react';

interface ConsultationProps {
  assets: Asset[];
  onBack: () => void;
  onSelectAsset: (asset: Asset) => void;
}

const Consultation: React.FC<ConsultationProps> = ({ assets, onBack, onSelectAsset }) => {
  const [inputValue, setInputValue] = useState('');
  const [searchKey, setSearchKey] = useState<string>('PLAQUETA');
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const deferredSearchTerm = useDeferredValue(inputValue);

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
    if (!deferredSearchTerm) return [];
    const term = deferredSearchTerm.toUpperCase().trim();
    
    const results = assets.filter(asset => {
      const val = String(asset[searchKey] || '').toUpperCase().trim();
      
      // Busca inteligente: exata, contendo ou igualando com preenchimento de zeros
      return val === term || 
             val.padStart(6, '0') === term.padStart(6, '0') || 
             val.includes(term);
    });

    // Ordenação numérica sempre aplicada aos resultados
    const sorted = results.sort((a, b) => {
      const vA = String(a[searchKey] || '');
      const vB = String(b[searchKey] || '');
      return vA.localeCompare(vB, undefined, { numeric: true });
    });

    // Ação de auto-select ao atingir 6 dígitos foi removida conforme solicitação

    return sorted.slice(0, 50);
  }, [assets, deferredSearchTerm, searchKey]);

  const handleScanSuccess = (decodedText: string) => {
    setIsScannerOpen(false);
    const cleaned = decodedText.replace(/\D/g, '').slice(-6).padStart(6, '0');
    setInputValue(cleaned);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value.replace(/\D/g, ''); 
    if (searchKey.toUpperCase().includes('PLAQUETA') || searchKey.toUpperCase().includes('PATRI')) {
      if (rawValue === '') {
        setInputValue('');
      } else {
        const padded = rawValue.slice(-6).padStart(6, '0');
        setInputValue(padded);
      }
    } else {
      setInputValue(e.target.value.toUpperCase());
    }
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
            <span className="text-[9px] font-black text-blue-700 uppercase tracking-tighter">Base: {assets.length} Itens</span>
          </div>
        </div>

        <div className="flex items-end justify-between mb-6">
          <div className="flex-1">
            <h1 className="text-3xl font-black text-black uppercase tracking-tighter leading-none">Consulta</h1>
            <p className="text-[9px] font-black text-gray-400 uppercase tracking-[0.2em] mt-2">Busca Técnica por {searchKey}</p>
          </div>
          <button 
            onClick={() => setShowFilters(!showFilters)}
            className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all active:scale-90 shadow-sm
              ${showFilters ? 'bg-blue-600 text-white shadow-blue-200' : 'bg-gray-100 text-gray-400'}`}
          >
            <Filter size={20} />
          </button>
        </div>

        <div className="relative group">
          <div className="absolute left-6 top-1/2 -translate-y-1/2 text-blue-300 group-focus-within:text-blue-600 transition-colors">
            {searchKey.toUpperCase().includes('PLAQUETA') ? <Hash size={24} /> : <Search size={24} />}
          </div>
          <input 
            ref={searchInputRef}
            type="text" 
            inputMode={searchKey.toUpperCase().includes('PLAQUETA') ? "numeric" : "text"}
            placeholder={searchKey.toUpperCase().includes('PLAQUETA') ? "000000" : "DIGITE O VALOR..."}
            value={inputValue} 
            onChange={handleInputChange}
            className="w-full pl-16 pr-28 py-6 text-3xl font-black uppercase outline-none border-2 border-blue-50 bg-blue-50/20 rounded-[2.2rem] focus:border-blue-500 focus:bg-white transition-all tracking-tighter text-blue-950 placeholder:text-blue-100/50 shadow-inner"
          />
          
          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center space-x-2">
            {inputValue && (
              <button onClick={() => setInputValue('')} className="w-10 h-10 flex items-center justify-center text-blue-200 hover:text-blue-400">
                <X size={20} />
              </button>
            )}
            <button 
              onClick={() => setIsScannerOpen(true)}
              className="w-14 h-14 bg-blue-600 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-blue-200 active:scale-95 transition-all"
            >
              <Scan size={24} strokeWidth={2.5} />
            </button>
          </div>
        </div>
      </div>

      {showFilters && (
        <div className="bg-white border-b border-gray-100 p-6 animate-slideUp overflow-x-auto no-scrollbar flex space-x-3 shrink-0">
          {allAvailableKeys.map(key => (
            <button
              key={key}
              onClick={() => { setSearchKey(key); setShowFilters(false); setInputValue(''); }}
              className={`whitespace-nowrap px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest border-2 transition-all
                ${searchKey === key ? 'bg-blue-600 border-blue-600 text-white shadow-lg' : 'bg-gray-50 border-gray-100 text-gray-400 hover:border-blue-100'}`}
            >
              {key}
            </button>
          ))}
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-6 pt-4 no-scrollbar pb-24">
        {inputValue ? (
          filteredAssets.length > 0 ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between px-2 mb-4">
                <span className="text-[9px] font-black text-gray-300 uppercase tracking-widest">Encontrados: {filteredAssets.length}</span>
              </div>
              
              {filteredAssets.map((asset) => (
                <button 
                  key={asset.id} 
                  onClick={() => onSelectAsset(asset)} 
                  className="w-full flex items-center p-5 bg-white rounded-[1.8rem] border border-gray-100 shadow-sm active:scale-[0.98] active:bg-blue-50 transition-all text-left group"
                >
                  <div className="w-14 h-14 bg-gray-50 rounded-2xl flex items-center justify-center text-blue-500 mr-4 group-active:bg-blue-600 group-active:text-white transition-colors">
                    {searchKey.toUpperCase().includes('PLAQUETA') ? <Barcode size={24} /> : <Layers size={24} />}
                  </div>
                  <div className="flex-1 min-w-0 pr-4">
                    <div className="flex items-center space-x-2 mb-1">
                      <span className="text-[8px] font-black text-blue-400 uppercase tracking-widest">Nº {searchKey}</span>
                      <span className="text-lg font-black text-black leading-none">{String(asset[searchKey] || '---')}</span>
                    </div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase truncate leading-none">
                      {String(asset['DESCRICAO'] || asset['DESC_SINTETICA'] || 'SEM DESCRIÇÃO')}
                    </p>
                    <div className="mt-2 flex items-center space-x-3">
                       <div className="flex items-center space-x-1">
                          <MapPin size={10} className="text-gray-300" />
                          <span className="text-[8px] font-black text-gray-300 uppercase truncate max-w-[120px]">
                            {String(asset['LOCALIZACAO'] || asset['SETOR'] || 'NÃO LOCALIZADO')}
                          </span>
                       </div>
                    </div>
                  </div>
                  <ChevronRight size={18} className="text-gray-200 group-active:text-blue-500" />
                </button>
              ))}
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center opacity-40">
              <AlertCircle size={48} className="text-gray-200 mb-4" />
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Nenhum ativo corresponde a esta busca</p>
            </div>
          )
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-center py-20">
            <div className="w-24 h-24 bg-white rounded-[2.5rem] flex items-center justify-center text-blue-100 border-4 border-dashed border-blue-50 mb-6 shadow-inner">
               <Keyboard size={40} />
            </div>
            <p className="text-[10px] font-black text-gray-300 uppercase tracking-[0.3em] leading-relaxed max-w-[200px]">
              Digite o número da plaqueta ou use o scanner para consulta instantânea.
            </p>
          </div>
        )}
      </div>

      <div className="p-6 bg-white border-t border-gray-100 text-center">
         <p className="text-[9px] font-black text-gray-200 uppercase tracking-[0.5em]">GBR Inteligência Patrimonial</p>
      </div>

      {isScannerOpen && (
        <div className="fixed inset-0 z-[100] bg-black">
          <Scanner 
            onBack={() => setIsScannerOpen(false)} 
            onScanSuccess={handleScanSuccess} 
          />
        </div>
      )}
    </div>
  );
};

export default Consultation;
