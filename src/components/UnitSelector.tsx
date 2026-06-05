import React, { useState } from 'react';
import { 
  Building2, 
  Search, 
  LayoutGrid, 
  Factory, 
  Landmark, 
  Warehouse, 
  Building, 
  RefreshCw, 
  Cloud, 
  Navigation as NavigationIcon,
  Database,
  Calendar,
  ChevronRight
} from 'lucide-react';
import BackButton from './BackButton';
import { DatabaseMode } from '../types';

interface UnitSelectorProps {
  units: Array<{ 
    filial: string; // Unified GBR v2.6 filial field
    hasData: boolean; 
    isDownloaded?: boolean; 
    hasCampaign?: boolean;
    hasGps?: boolean;
    assetCount?: number;
  }>;
  onSelect: (unit: string) => void;
  onBack: () => void;
  onSync?: () => void;
  onConfigGPS?: (unit: string) => void;
  onCampaigns?: (unit: string) => void;
  onLoadDatabase?: () => void;
  isSyncing?: boolean;
  lastSyncTime?: string | null;
  isAdmin?: boolean;
  databaseMode?: DatabaseMode;
  isImportingBatch?: boolean; // UX v2.6 Isolated state
}

const UnitSelector: React.FC<UnitSelectorProps> = ({ 
  units, 
  onSelect, 
  onBack, 
  onSync, 
  onConfigGPS, 
  onCampaigns, 
  onLoadDatabase, 
  isSyncing, 
  isAdmin, 
  databaseMode,
  isImportingBatch = false
}) => {
  const [searchTerm, setSearchTerm] = useState('');

  const purifiedUnits = units.filter(u => {
    const unitName = u && u.filial;
    return unitName && unitName.trim() !== '';
  });

  const filteredUnits = purifiedUnits.filter(u => {
    const unitName = u.filial || '';
    return unitName.toLowerCase().includes(searchTerm.toLowerCase());
  });

  // Log para depuração de unidades
  if (purifiedUnits.length === 0) {
    console.warn('>>> [UnitSelector] Recebeu 0 unidades purificadas para exibir.');
  } else {
    console.log(`>>> [UnitSelector] Exibindo ${filteredUnits.length} de ${purifiedUnits.length} unidades purificadas.`);
  }

  // Helper para gerar ícone e cor consistente baseada no nome
  const getUnitIdentity = (name: string, hasData: boolean) => {
    if (!hasData) {
      return {
        style: 'bg-slate-50 text-slate-300 border-slate-100 grayscale',
        Icon: Building2
      };
    }
    const hash = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const colors = [
      'bg-blue-50 text-blue-600 border-blue-100',
      'bg-indigo-50 text-indigo-600 border-indigo-100',
      'bg-emerald-50 text-emerald-600 border-emerald-100',
      'bg-purple-50 text-purple-600 border-purple-100',
      'bg-amber-50 text-amber-600 border-amber-100',
      'bg-rose-50 text-rose-600 border-rose-100'
    ];
    const icons = [Building2, Factory, Landmark, Warehouse, Building];
    
    return {
      style: colors[hash % colors.length],
      Icon: icons[hash % icons.length]
    };
  };

  return (
    <div className="flex flex-col h-[100dvh] bg-bg-main animate-fadeIn overflow-hidden">
      {/* Header Slim Fixo - Respiro do Cabeçalho e Altura Recomendados */}
      <div className="pt-7 pb-4 px-4 bg-white border-b border-gray-100 flex flex-col gap-3.5 shadow-sm shrink-0 min-h-20">
        <div className="flex items-center justify-between w-full h-12">
          {/* Back Button Alinhado à Esquerda */}
          <div className="flex-shrink-0 flex items-center">
            <BackButton onClick={onBack} label="Voltar" subLabel={isAdmin ? "Módulos" : "Sair"} />
          </div>
          
          {/* Bloco de Texto Centralizado Verticalmente com Altura Mínima Comprimida */}
          <div className="flex-1 flex flex-col items-center justify-center text-center px-1">
            <h2 className="text-[13px] sm:text-sm font-black text-ink uppercase tracking-[0.1em] leading-tight select-none">
              Unidade Operacional
            </h2>
            <p className="text-accent text-[8px] font-extrabold uppercase tracking-widest mt-0.5 leading-none select-none">
              Selecione o Foco do Inventário
            </p>
          </div>

          {/* Ícones de Ação/Status Alinhados à Direita */}
          <div className="flex items-center space-x-2 flex-shrink-0">
            {onSync && databaseMode !== DatabaseMode.INTERNAL && (
              <button 
                onClick={onSync}
                disabled={isSyncing}
                className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all shadow-sm cursor-pointer ${
                  isSyncing ? 'bg-blue-50 text-blue-500' : 'bg-white text-accent border border-accent/10 active:scale-95 hover:bg-accent-soft'
                }`}
                title="Sincronizar com a Nuvem"
              >
                <div className={isSyncing ? 'animate-spin' : ''}>
                  {isSyncing ? <RefreshCw size={16} /> : <Cloud size={16} />}
                </div>
              </button>
            )}
            <div className="w-10 h-10 bg-accent rounded-xl flex items-center justify-center text-white shadow-md">
              <LayoutGrid size={16} />
            </div>
          </div>
        </div>

        {/* Input Buscador */}
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-muted/30" size={16} />
          <input 
            type="text"
            placeholder="PESQUISAR UNIDADE..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value.toUpperCase())}
            className="w-full pl-11 pr-5 py-2.5 bg-bg-main rounded-xl text-[10px] font-bold uppercase border border-border focus:border-accent outline-none transition-all shadow-inner placeholder:text-ink-muted/30"
          />
        </div>
      </div>

      {/* Conteúdo com scroll de alta reatividade e respiração inferior proporcional */}
      <div className="flex-1 overflow-hidden bg-bg-main relative">
        {isImportingBatch ? (
          /* Estado Premium de Bloqueio de Leitura Suja */
          <div className="flex flex-col items-center justify-center h-full py-16 px-6 text-center animate-pulse-slow">
            <RefreshCw size={44} className="text-accent animate-spin mb-4" />
            <h3 className="font-extrabold uppercase tracking-[0.15em] text-xs text-slate-700">MODO IMPORTAÇÃO ATIVO</h3>
            <p className="text-[9px] text-slate-400 mt-2 max-w-[260px] leading-relaxed uppercase tracking-wider font-semibold">
              Persistindo transação limpa no disco local do dispositivo. Aguarde o fim do isolamento.
            </p>
          </div>
        ) : filteredUnits.length > 0 ? (
          <div className="h-full overflow-y-auto pb-24 px-5 pt-3 space-y-3.5">
            {filteredUnits.map((unit) => {
              const rawName = unit ? unit.filial : '';
              if (!unit || !rawName || rawName.trim() === '') {
                return null;
              }

              const displayName = rawName.trim().toUpperCase();
              const { style, Icon } = getUnitIdentity(displayName, unit.hasData);

              return (
                <div
                  key={displayName}
                  onClick={() => unit.hasData && onSelect(displayName)}
                  className={`w-full bg-white p-4 rounded-2xl flex items-center justify-between shadow-sm border transition-all duration-200 group overflow-hidden relative modern-card ${
                    unit.hasData 
                      ? 'hover:border-accent hover:shadow-md active:scale-[0.99] border-gray-100 cursor-pointer' 
                      : 'opacity-60 cursor-not-allowed border-slate-100'
                  }`}
                >
                  <div className="flex items-center space-x-4 relative z-10 w-full min-w-0 pr-2">
                    <div className={`w-12 h-12 ${style} rounded-xl flex items-center justify-center group-hover:scale-105 transition-transform shadow-sm border flex-shrink-0`}>
                      <Icon size={24} strokeWidth={2.5} />
                    </div>
                    <div className="text-left flex-1 min-w-0">
                      <h4 className={`font-bold text-sm uppercase leading-tight tracking-tight flex items-baseline flex-wrap gap-x-2 ${unit.hasData ? 'text-ink' : 'text-slate-400'}`}>
                        <span className="truncate">{displayName}</span>
                        {typeof unit.assetCount === 'number' && (
                          <span className="text-slate-400 font-semibold text-xs normal-case whitespace-nowrap">
                            - {unit.assetCount.toLocaleString('pt-BR')} ativos
                          </span>
                        )}
                      </h4>
                      
                      {/* Botões e Badges das Ações */}
                      <div className="flex items-center space-x-3 mt-2">
                        {/* Status de Dados */}
                        <div className="flex flex-col items-center gap-1">
                          <div className={`w-7 h-7 rounded-lg flex items-center justify-center border transition-all ${
                            unit.hasData ? 'bg-blue-50 text-blue-600 border-blue-100 shadow-sm' : 'bg-gray-50 text-gray-300 border-gray-100'
                          }`}>
                            <Database size={13} />
                          </div>
                          <span className={`text-[6px] font-black uppercase tracking-tighter ${unit.hasData ? 'text-blue-600' : 'text-gray-300'}`}>
                            Dados
                          </span>
                        </div>

                        {/* Status de GPS */}
                        <button 
                          type="button"
                          className="flex flex-col items-center gap-1 group/icon p-2 -m-2 rounded-xl active:scale-90 transition-all cursor-pointer min-w-[44px] min-h-[44px] justify-center bg-transparent border-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (isAdmin && onConfigGPS) { 
                              e.preventDefault(); 
                              try { 
                                Promise.resolve(onConfigGPS(displayName)).catch(err => console.error("[GPS MODAL CRASH PREVENTED]", err)); 
                              } catch (err) { 
                                console.error("[GPS MODAL CRASH PREVENTED]", err); 
                              } 
                            }
                          }}
                        >
                          <div className={`w-7.5 h-7.5 rounded-lg flex items-center justify-center border transition-all ${
                            unit.hasGps 
                              ? 'bg-emerald-50 text-emerald-600 border-emerald-100 shadow-sm' 
                              : 'bg-rose-50 text-rose-500 border-rose-100'
                          } ${isAdmin ? 'hover:scale-105 hover:bg-emerald-100' : ''}`}>
                            <NavigationIcon size={14} />
                          </div>
                          <span className={`text-[6px] font-black uppercase tracking-tighter ${unit.hasGps ? 'text-emerald-600' : 'text-rose-500'}`}>
                            GPS
                          </span>
                        </button>

                        {/* Status de Campanha */}
                        <button 
                          type="button"
                          className={`flex flex-col items-center gap-1 group/icon p-2 -m-2 rounded-xl transition-all min-w-[44px] min-h-[44px] justify-center bg-transparent border-0 font-sans ${
                            (!unit.hasGps && !((() => { 
                              try { 
                                const u = JSON.parse(localStorage.getItem('app_current_user') || '{}'); 
                                return ['ADMIN', 'MASTER', 'GESTOR'].includes(u.role?.toUpperCase()) || u.isAdmin || u.is_admin || isAdmin; 
                              } catch { 
                                return isAdmin; 
                              } 
                            })())) ? 'opacity-40 cursor-not-allowed' : 'active:scale-90 cursor-pointer'
                          }`}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!unit.hasGps && !((() => { 
                              try { 
                                const u = JSON.parse(localStorage.getItem('app_current_user') || '{}'); 
                                return ['ADMIN', 'MASTER', 'GESTOR'].includes(u.role?.toUpperCase()) || u.isAdmin || u.is_admin || isAdmin; 
                              } catch { 
                                return isAdmin; 
                              } 
                            })())) { 
                              e.preventDefault(); 
                              return; 
                            } 
                            if (onCampaigns) onCampaigns(displayName);
                          }}
                        >
                          <div className={`w-7.5 h-7.5 rounded-lg flex items-center justify-center border transition-all ${
                            unit.hasCampaign 
                              ? 'bg-amber-50 text-amber-600 border-amber-100 shadow-sm' 
                              : 'bg-gray-50 text-gray-300 border-gray-100'
                          } ${(!unit.hasGps && !((() => { 
                            try { 
                              const u = JSON.parse(localStorage.getItem('app_current_user') || '{}'); 
                              return ['ADMIN', 'MASTER', 'GESTOR'].includes(u.role?.toUpperCase()) || u.isAdmin || u.is_admin || isAdmin; 
                            } catch { 
                              return isAdmin; 
                            } 
                          })())) ? '' : 'hover:scale-105 hover:bg-amber-100'}`}>
                            <Calendar size={13} />
                          </div>
                          <span className={`text-[6px] font-black uppercase tracking-tighter ${unit.hasCampaign ? 'text-amber-600' : 'text-gray-300'}`}>
                            Campanha
                          </span>
                        </button>
                      </div>
                    </div>
                  </div>
                  
                  {/* Seta indicativa de Navegação */}
                  <div className="flex items-center space-x-1 flex-shrink-0">
                    <div className="w-8 h-8 flex items-center justify-center text-ink-muted/15 group-hover:text-accent/40 group-hover:translate-x-0.5 transition-all">
                      <ChevronRight size={18} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : isSyncing ? (
          <div className="flex flex-col items-center justify-center h-full py-16">
            <RefreshCw size={44} className="text-accent animate-spin mb-4" />
            <p className="font-bold uppercase tracking-[0.2em] text-[9px] text-accent">
              Sincronizando Unidades...
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full py-16 px-8 text-center">
            <div className="w-16 h-16 bg-slate-50 border border-slate-100 rounded-2xl flex items-center justify-center text-slate-300 mb-5 shadow-inner">
              <Building2 size={32} />
            </div>
            <p className="font-extrabold uppercase tracking-[0.15em] text-[9px] text-slate-400 mb-6">
              Nenhuma Unidade Operacional Disponível
            </p>
            
            {isAdmin && onLoadDatabase && (
              <button
                onClick={onLoadDatabase}
                className="w-full max-w-xs py-3.5 bg-accent text-white rounded-xl font-extrabold uppercase text-[9px] tracking-[0.15em] shadow-md hover:shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <Database size={15} />
                Iniciar Carga de Dados (Expert)
              </button>
            )}

            {!isAdmin && databaseMode !== DatabaseMode.INTERNAL && onSync && (
              <button
                onClick={onSync}
                disabled={isSyncing}
                className="w-full max-w-xs py-3.5 bg-white border border-accent/20 text-accent rounded-xl font-extrabold uppercase text-[9px] tracking-[0.15em] active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm"
              >
                <RefreshCw size={15} className={isSyncing ? 'animate-spin' : ''} />
                Tentar Sincronizar da Nuvem
              </button>
            )}
            
            {!isAdmin && (databaseMode === DatabaseMode.INTERNAL || !onSync) && (
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest max-w-[200px] leading-relaxed">
                Solicite ao administrador a carga da base de dados para iniciar o inventário.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Info Bar Técnica Inferior de Segurança */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/95 backdrop-blur-xl border-t border-border flex justify-between items-center z-50 shadow-lg">
        <div className="flex items-center space-x-2">
          <div className="w-2 h-2 bg-accent rounded-full shadow-sm shadow-accent/50 animate-pulse"></div>
          <p className="text-[9px] text-ink font-bold uppercase tracking-widest leading-none">Pipeline Ativo</p>
        </div>
        <p className="text-[9px] text-ink-muted font-bold uppercase tracking-widest leading-none">
          {purifiedUnits.length} {purifiedUnits.length === 1 ? 'Entidade' : 'Entidades'}
        </p>
      </div>
    </div>
  );
};

export default UnitSelector;
