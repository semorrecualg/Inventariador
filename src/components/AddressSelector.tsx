import {
  ChevronRight,
  Compass,
  Lock,
  MapPin,
  RefreshCw,
  Search
} from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { localDb } from '../services/localDbService';
import BackButton from './BackButton';

interface AddressSelectorProps {
  selectedUnit: string;
  onSelect: (address: string) => void;
  onBack: () => void;
  isImportingBatch?: boolean;
}

export const AddressSelector: React.FC<AddressSelectorProps> = ({
  selectedUnit,
  onSelect,
  onBack,
  isImportingBatch = false
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [addresses, setAddresses] = useState<Array<{ displayName: string; total: number; checked: number; locKey: string }>>([]);
  const [isLoading, setIsLoading] = useState(false);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeRequestRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    if (!selectedUnit) {
      setDebouncedQuery('');
      setIsLoading(false);
      return;
    }

    debounceTimerRef.current = setTimeout(() => {
      setDebouncedQuery(searchQuery);
      setIsLoading(true);
    }, 300);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [searchQuery, selectedUnit]);

  useEffect(() => {
    if (activeRequestRef.current) {
      activeRequestRef.current.abort();
    }

    const controller = new AbortController();
    activeRequestRef.current = controller;
    let active = true;

    const fetchAddresses = async () => {
      if (!selectedUnit) {
        if (active) {
          setAddresses([]);
          setIsLoading(false);
        }
        return;
      }

      try {
        const results = await localDb.assets.getLocationsWithStats(selectedUnit, debouncedQuery, controller.signal);
        if (active && !controller.signal.aborted) {
          setAddresses(results || []);
        }
      } catch (err) {
        if (controller.signal.aborted || (err instanceof DOMException && err.name === 'AbortError')) {
          return;
        }
        console.error(">>> [SRE AddressSelector] Erro ao carregar localidades física do SQLite:", err);
      } finally {
        if (active && !controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    };

    void fetchAddresses();

    return () => {
      active = false;
      controller.abort();
    };
  }, [selectedUnit, debouncedQuery]);

  const handleBack = () => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    if (activeRequestRef.current) {
      activeRequestRef.current.abort();
    }
    setAddresses([]);
    setSearchQuery('');
    setDebouncedQuery('');
    setIsLoading(false);
    onBack();
  };

  const handleSelect = (address: string) => {
    sessionStorage.setItem('current_selected_address', address);
    onSelect(address);
  };

  const purifiedUnitName = selectedUnit ? selectedUnit.toUpperCase().trim() : 'UNIDADE NÃO ESPECIFICADA';

  return (
    <div id="address-selector-container" className="flex flex-col h-[100dvh] bg-bg-main animate-fadeIn overflow-hidden">
      {/* Header Slim Fixo - Respiro do Cabeçalho e Altura Recomendados */}
      <div id="address-header" className="pt-7 pb-4 px-4 bg-white border-b border-gray-100 flex flex-col gap-3.5 shadow-sm shrink-0 min-h-20">
        <div className="flex items-center justify-between w-full h-12">
          {/* Back Button Alinhado à Esquerda */}
          <div className="flex-shrink-0 flex items-center">
            <BackButton id="address-back-btn" onClick={handleBack} label="Voltar" subLabel="Unidades" />
          </div>

          {/* Bloco de Texto Centralizado Verticalmente */}
          <div className="flex-1 flex flex-col items-center justify-center text-center px-1">
            <h2 className="text-[13px] sm:text-sm font-black text-ink uppercase tracking-[0.1em] leading-tight select-none">
              Endereço Físico
            </h2>
            <p className="text-accent text-[8px] font-extrabold uppercase tracking-widest mt-0.5 leading-none select-none">
              {purifiedUnitName}
            </p>
          </div>

          {/* Ícones de Ação/Status Alinhados à Direita */}
          <div className="flex items-center space-x-2 flex-shrink-0">
            <div className="w-10 h-10 bg-accent/10 border border-accent/20 rounded-xl flex items-center justify-center text-accent shadow-sm">
              <Compass size={16} />
            </div>
          </div>
        </div>

        {/* Input Buscador */}
        <div id="address-search-container" className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-muted/30" size={16} />
          <input
            type="text"
            id="address-search-input"
            placeholder="PESQUISAR ENDEREÇO / LOCALIDADE..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value.toUpperCase())}
            className="w-full pl-11 pr-5 py-2.5 bg-bg-main rounded-xl text-[10px] font-bold uppercase border border-border focus:border-accent outline-none transition-all shadow-inner placeholder:text-ink-muted/30 text-ink"
          />
        </div>
      </div>

      {/* Conteúdo com scroll de alta reatividade */}
      <div id="address-list-content" className="flex-1 overflow-y-auto bg-bg-main relative p-4 space-y-3">
        {isImportingBatch || isLoading ? (
          <div className="flex flex-col items-center justify-center h-full py-16 px-6 text-center">
            <RefreshCw size={36} className="text-accent animate-spin mb-4" />
            <h3 className="font-extrabold uppercase tracking-[0.15em] text-[10px] text-slate-700">Carregando Endereços</h3>
            <p className="text-[8px] text-slate-400 font-extrabold uppercase tracking-widest mt-1">SRE Sincronismo de I/O de Ativos</p>
          </div>
        ) : addresses?.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full py-16 px-6 text-center bg-white rounded-2xl border border-gray-100 p-8 shadow-sm">
            <MapPin size={40} className="text-slate-300 stroke-[1.5] mb-4" />
            <h3 className="font-extrabold uppercase tracking-[0.15em] text-[10px] text-slate-700">Nenhum Endereço Cadastrado</h3>
            <p className="text-[8px] text-slate-400 font-extrabold uppercase tracking-widest mt-1 leading-relaxed">
              Não foram encontrados dados de endereços físicos para esta filial ou termo pesquisado.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2.5">
            {addresses.map((item, index) => {
              const checkedPercent = item.total > 0 ? Math.round((item.checked / item.total) * 100) : 0;
              return (
                <button
                  key={item.locKey || index}
                  id={`address-item-${index}`}
                  onClick={() => handleSelect(item.displayName)}
                  className="w-full text-left bg-white border border-gray-100 hover:border-accent/30 rounded-2xl p-4 flex items-center justify-between transition-all duration-200 active:scale-[0.98] shadow-sm hover:shadow-md cursor-pointer group"
                >
                  <div className="flex items-center space-x-3.5 min-w-0 flex-1">
                    <div className="p-3 bg-slate-50 text-slate-500 rounded-xl group-hover:bg-accent/10 group-hover:text-accent transition-colors">
                      <MapPin size={18} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h4 className="text-[11px] font-black uppercase tracking-wider text-slate-800 truncate mb-1">
                        {item.displayName || 'GERAL - NÃO ESPECIFICADO'}
                      </h4>
                      <div className="flex items-center space-x-2 text-[8px] font-mono font-bold text-slate-400 uppercase tracking-widest">
                        <span>{item.checked} de {item.total} conferidos</span>
                        <span>•</span>
                        <span className={checkedPercent === 100 ? "text-emerald-500 font-extrabold" : "text-slate-400"}>
                          {checkedPercent}%
                        </span>
                      </div>

                      {/* Barra de Progresso Interna SRE */}
                      <div className="w-full bg-slate-100 h-1.5 rounded-full mt-2.5 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${checkedPercent === 100 ? 'bg-emerald-500' : 'bg-accent'}`}
                          style={{ width: `${checkedPercent}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="pl-3">
                    <ChevronRight size={16} className="text-slate-300 group-hover:text-accent group-hover:translate-x-1 transition-all" />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Margem inferior de estabilização do dispositivo */}
      <div id="address-bottom-safety" className="pb-6 pt-2 px-4 bg-white border-t border-gray-100 flex items-center justify-between shrink-0">
        <div className="flex items-center space-x-1.5 text-slate-400 font-mono text-[8px] font-bold uppercase tracking-widest">
          <Lock size={10} className="text-slate-400" />
          <span>SRE Governança Física local</span>
        </div>
        <div className="text-[8px] font-extrabold text-slate-400 uppercase tracking-widest font-mono">
          GBR KARDEK v2.60
        </div>
      </div>
    </div>
  );
};

export default AddressSelector;
