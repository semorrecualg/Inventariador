import React, { useState, useEffect } from 'react';
import { 
  MapPin, 
  Search, 
  ChevronRight, 
  Compass, 
  RefreshCw, 
  AlertTriangle,
  Lock,
  Plus,
  Target,
  WifiOff
} from 'lucide-react';
import BackButton from './BackButton';
import { BufferIndicator } from './BufferIndicator';
import { localDb } from '../services/localDbService';
import { isAdminEmail } from '../utils/authUtils';
import { DatabaseMode, UnitConfig, User } from '../types';

interface AddressSelectorProps {
  selectedUnit: string;
  onSelect: (address: string) => void;
  onBack: () => void;
  isImportingBatch?: boolean;
  /** Configuração da unidade: sem âncora GPS o inventário fica bloqueado. */
  unitConfig?: UnitConfig | null;
  /** Operador atual — o admin/master tem bypass da âncora GPS. */
  user?: User | null;
  databaseMode?: DatabaseMode;
  /** Registo do local criado no ecrã (modal «Nova Localidade»). */
  onAddNewLocation?: (newLocation: string) => void | Promise<void>;
  /** Abre o configurador da unidade para definir a âncora GPS. */
  onConfigureAnchor?: () => void;
}

export const AddressSelector: React.FC<AddressSelectorProps> = ({
  selectedUnit,
  onSelect,
  onBack,
  isImportingBatch = false,
  unitConfig,
  user = null,
  databaseMode,
  onAddNewLocation,
  onConfigureAnchor
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [addresses, setAddresses] = useState<Array<{ displayName: string; total: number; checked: number; locKey: string }>>([]);
  const [isLoading, setIsLoading] = useState(false);
  // Falha de LEITURA da base local, que não é o mesmo que uma base vazia: a
  // lista vazia dizia «Nenhum Endereço Cadastrado» e escondia o erro de SQLite.
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [isNewLocationModalOpen, setIsNewLocationModalOpen] = useState(false);
  const [newLocationName, setNewLocationName] = useState('');
  const [isCreatingLocation, setIsCreatingLocation] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    let active = true;
    const fetchAddresses = async () => {
      if (!selectedUnit) return;
      setIsLoading(true);
      setLoadError(null);
      try {
        const results = await localDb.assets.getLocationsWithStats(selectedUnit, debouncedQuery);
        if (active) {
          setAddresses(results || []);
        }
      } catch (err) {
        console.error(">>> [SRE AddressSelector] Erro ao carregar localidades física do SQLite:", err);
        if (active) {
          // Sem lista não há endereços para tocar: o ecrã tem de dizer que a
          // consulta falhou, e não que a filial não tem endereços.
          setAddresses([]);
          setLoadError(err instanceof Error ? err.message : String(err ?? '').trim() || 'Erro desconhecido ao consultar a base local.');
        }
      } finally {
        if (active) setIsLoading(false);
      }
    };

    fetchAddresses();

    return () => {
      active = false;
    };
  }, [selectedUnit, debouncedQuery, reloadToken]);

  const handleBack = () => {
    setAddresses([]);
    setLoadError(null);
    setSearchQuery('');
    setDebouncedQuery('');
    onBack();
  };

  const handleSelect = (address: string) => {
    sessionStorage.setItem('current_selected_address', address);
    onSelect(address);
  };

  const handleCreateLocation = async () => {
    const nome = newLocationName.trim();
    if (!nome || isCreatingLocation) return;
    setIsCreatingLocation(true);
    setCreateError(null);
    try {
      await onAddNewLocation?.(nome);
      setNewLocationName('');
      setIsNewLocationModalOpen(false);
      // O local novo já está no índice da base local; recarrega a lista para o
      // mostrar e poder ser escolhido de imediato.
      setReloadToken((token) => token + 1);
    } catch (err) {
      // Sem gravar não há local para escolher: o modal fica aberto a dizer porquê.
      setCreateError(err instanceof Error ? err.message : String(err ?? '').trim() || 'Não foi possível gravar a localidade na base local.');
    } finally {
      setIsCreatingLocation(false);
    }
  };

  // Espelha a coluna 'filial' como veio da base — sem uppercase.
  const purifiedUnitName = selectedUnit ? selectedUnit.trim() : 'UNIDADE NÃO ESPECIFICADA';

  // Âncora GPS é obrigatória para abrir o inventário; ADMIN/MASTER mantêm o
  // bypass que já existia na antiga fase de mapeamento.
  // Só bloqueia quando o App diz explicitamente que a unidade não tem âncora
  // (`null`); um chamador sem a prop não fica travado.
  const isAnchorMissing = unitConfig === null;
  const isAnchorBypass = isAdminEmail(user?.email);
  const isBlockedByAnchor = isAnchorMissing && !isAnchorBypass;

  return (
    <div id="address-selector-container" className="flex flex-col h-[100dvh] bg-bg-main animate-fadeIn overflow-hidden">
      {/* Header Slim Fixo - Respiro do Cabeçalho e Altura Recomendados */}
      <div id="address-header" className="pt-7 pb-4 px-4 bg-white border-b border-gray-100 flex flex-col gap-3.5 shadow-sm shrink-0 min-h-20">
        <div className="flex items-center justify-between w-full h-12">
          {/* Back Button Alinhado à Esquerda */}
          <div className="flex-shrink-0 flex items-center">
            <BackButton onClick={handleBack} label="Voltar" subLabel="Unidades" />
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
      <div id="address-list-content" className="flex-1 overflow-y-auto bg-bg-main relative p-4 space-y-3 pb-28">
        {databaseMode === DatabaseMode.INTERNAL && (
          <div className="space-y-3">
            <div className="bg-amber-50 border border-amber-100 p-3 rounded-2xl flex items-center space-x-3">
              <WifiOff size={14} className="text-amber-600" />
              <p className="text-[10px] font-bold text-amber-700 uppercase tracking-widest">Modo Offline Ativo</p>
            </div>
            <BufferIndicator />
          </div>
        )}

        {isAnchorMissing && (
          <div id="address-gps-anchor" className="bg-red-50 border border-red-100 p-4 rounded-2xl flex items-start space-x-3">
            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-black text-red-700 uppercase tracking-widest">GPS Âncora Pendente</p>
              </div>
              <p className="text-[9px] text-red-600 font-bold uppercase leading-tight mt-1">
                Configuração de GPS obrigatória para liberar o inventário.
              </p>
              {isAnchorBypass ? (
                <p className="text-[8px] text-red-500 font-bold uppercase leading-tight mt-2">
                  Acesso de administrador: o inventário abre sem âncora.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2 mt-3">
                  <button
                    id="address-configure-anchor-btn"
                    onClick={onConfigureAnchor}
                    disabled={!onConfigureAnchor}
                    className="bg-red-600 hover:bg-red-700 text-white px-4 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest active:scale-95 transition-all flex items-center space-x-2 shadow-lg shadow-red-500/20 disabled:opacity-50"
                  >
                    <Target size={12} />
                    <span>Reconfigurar Âncora (MAPA)</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {isImportingBatch || isLoading ? (
          <div className="flex flex-col items-center justify-center h-full py-16 px-6 text-center">
            <RefreshCw size={36} className="text-accent animate-spin mb-4" />
            <h3 className="font-extrabold uppercase tracking-[0.15em] text-[10px] text-slate-700">Carregando Endereços</h3>
            <p className="text-[8px] text-slate-400 font-extrabold uppercase tracking-widest mt-1">SRE Sincronismo de I/O de Ativos</p>
          </div>
        ) : loadError ? (
          <div id="address-load-error" role="alert" className="flex flex-col items-center justify-center h-full py-16 px-6 text-center bg-white rounded-2xl border-2 border-amber-300 p-8 shadow-sm">
            <AlertTriangle size={40} className="text-amber-500 stroke-[1.5] mb-4" />
            <h3 className="font-extrabold uppercase tracking-[0.15em] text-[10px] text-slate-700">Falha ao Ler a Base Local</h3>
            <p className="text-[8px] text-slate-400 font-extrabold uppercase tracking-widest mt-1 leading-relaxed">
              Não foi possível consultar os endereços desta filial. Os endereços podem existir — a leitura é que falhou.
            </p>
            <p className="text-[8px] text-amber-600 font-mono font-bold break-words mt-3 max-w-full">
              {loadError}
            </p>
            <button
              id="address-retry-btn"
              onClick={() => setReloadToken((token) => token + 1)}
              className="mt-4 px-5 py-3 rounded-xl bg-slate-900 text-white font-black uppercase text-[9px] tracking-widest active:scale-95 transition-all flex items-center gap-2"
            >
              <RefreshCw size={12} />
              Tentar novamente
            </button>
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
              // A pergunta do auditor é «quantos faltam», não «quantos já
              // foram conferidos»: o cartão responde pelo que falta.
              const pendentes = Math.max(0, item.total - item.checked);
              return (
                <button
                  key={item.locKey || index}
                  id={`address-item-${index}`}
                  onClick={() => handleSelect(item.displayName)}
                  disabled={isBlockedByAnchor}
                  className={`w-full bg-white rounded-[16px] p-4 border border-gray-100 shadow-sm active:scale-[0.98] transition-all flex items-center justify-between text-left group ${isBlockedByAnchor ? 'opacity-60 cursor-not-allowed' : ''}`}
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
                        <span>{pendentes === 0 ? `Tudo conferido (${item.total})` : `Faltam ${pendentes} de ${item.total}`}</span>
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

      {/* FAB - Criar Nova Localidade */}
      <div className="fixed bottom-20 left-0 right-0 px-6 flex justify-center pointer-events-none">
        <button
          id="address-new-location-fab"
          disabled={isBlockedByAnchor || !onAddNewLocation}
          onClick={() => { setCreateError(null); setIsNewLocationModalOpen(true); }}
          className={`pointer-events-auto h-14 px-8 rounded-full flex items-center justify-center space-x-3 font-bold uppercase text-xs tracking-widest active:scale-95 transition-all shadow-xl shadow-blue-500/20 ${isBlockedByAnchor || !onAddNewLocation ? 'bg-slate-300 text-slate-500 cursor-not-allowed' : 'bg-[#2563EB] text-white'}`}
        >
          <Plus size={20} strokeWidth={3} />
          <span>Nova Localidade</span>
        </button>
      </div>

      {isNewLocationModalOpen && (
        <div id="address-new-location-modal" className="fixed inset-0 z-[500] flex items-center justify-center p-6 bg-slate-950/40 backdrop-blur-md animate-fadeIn">
          <div className="bg-white w-full max-w-sm rounded-[2.5rem] border border-border shadow-2xl overflow-hidden relative animate-scaleIn">
            <div className="bg-accent p-8 text-white text-center">
              <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4 border border-white/30">
                <MapPin size={40} className="text-white" />
              </div>
              <h3 className="text-2xl font-black uppercase italic tracking-tighter leading-none">Nova Localidade</h3>
              <p className="text-[10px] font-bold text-white/70 uppercase tracking-widest mt-2">Mapeamento de Endereço</p>
            </div>

            <div className="p-8 space-y-6">
              <div className="space-y-2">
                <label className="text-[9px] font-black text-ink-muted uppercase tracking-widest ml-1">Nome do Local</label>
                <input
                  type="text"
                  value={newLocationName}
                  onChange={(e) => setNewLocationName(e.target.value.toUpperCase())}
                  list="locais-cadastrados"
                  className="w-full bg-bg-main border border-border p-4 rounded-2xl text-sm font-bold text-ink outline-none focus:border-accent transition-all"
                  placeholder="EX: SALA 101, ALMOXARIFADO..."
                  autoFocus
                />
                {/* Inteligência de sugestão: reaproveitar endereços já existentes
                    evita variações de escrita ("ADM" × "ADMINISTRACAO"). */}
                <datalist id="locais-cadastrados">
                  {addresses.map(loc => (
                    <option key={loc.locKey} value={loc.displayName} />
                  ))}
                </datalist>
                {addresses.length > 0 && (
                  <p className="text-[9px] font-bold text-ink-muted uppercase tracking-wide ml-1">
                    {addresses.length} endereço(s) já cadastrado(s) — toque para reaproveitar.
                  </p>
                )}
              </div>

              <div className="flex flex-col space-y-3">
                {createError && (
                  <p id="address-new-location-error" role="alert" className="text-[9px] font-bold text-red-600 uppercase leading-snug break-words">
                    {createError}
                  </p>
                )}
                <button
                  onClick={handleCreateLocation}
                  disabled={!newLocationName.trim() || isCreatingLocation}
                  className="w-full py-4 bg-accent disabled:bg-ink-muted/20 text-white rounded-xl font-black uppercase text-xs tracking-widest shadow-lg shadow-accent/20 active:scale-95 transition-all"
                >
                  {isCreatingLocation ? 'A Gravar…' : 'Confirmar Criação'}
                </button>
                <button
                  onClick={() => { setIsNewLocationModalOpen(false); setNewLocationName(''); setCreateError(null); }}
                  className="w-full py-4 bg-bg-main text-ink-muted rounded-xl font-black uppercase text-xs tracking-widest active:scale-95 transition-all"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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
