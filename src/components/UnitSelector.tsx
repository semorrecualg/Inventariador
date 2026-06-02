
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
import { Virtuoso } from 'react-virtuoso';
import BackButton from './BackButton';
import { DatabaseMode } from '../types';

interface UnitSelectorProps {
  units: Array<{ 
    filial?: string; // Unified GBR v2.6
    UNIDADE_OPERACIONAL: string; 
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
}

const UnitSelector: React.FC<UnitSelectorProps> = ({ units, onSelect, onBack, onSync, onConfigGPS, onCampaigns, onLoadDatabase, isSyncing, isAdmin, databaseMode }) => {
  const [searchTerm, setSearchTerm] = useState('');

  const purifiedUnits = units.filter(u => {
    const unitName = u && (u.filial || u.UNIDADE_OPERACIONAL);
    return unitName && unitName.trim() !== '';
  });

  const filteredUnits = purifiedUnits.filter(u => {
    const unitName = u.filial || u.UNIDADE_OPERACIONAL || '';
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

  console.log(`>>> [UnitSelector] Renderizando ${purifiedUnits.length} unidades. Unidades com campanha: ${purifiedUnits.filter(u => u.hasCampaign).map(u => u.UNIDADE_OPERACIONAL).join(', ') || 'NENHUMA'}`);

  return (
    <div className="flex flex-col h-[100dvh] bg-bg-main animate-fadeIn">
      {/* Header Fixo */}
      <div className="pt-[constant(safe-area-inset-top)] pt-[env(safe-area-inset-top)] pt-4 pb-3 px-4 bg-white border-b border-gray-100 flex flex-col gap-3 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <BackButton onClick={onBack} label="Voltar" subLabel={isAdmin ? "Módulos" : "Sair"} />
          
          <div className="flex-1 text-center">
            <h2 className="text-sm font-black text-ink uppercase tracking-tight leading-none">Unidade Operacional</h2>
            <p className="text-accent text-[8px] font-bold uppercase tracking-wider mt-1">Selecione o Foco do Inventário</p>
          </div>

          <div className="flex items-center space-x-1.5 flex-shrink-0">
            {onSync && databaseMode !== DatabaseMode.INTERNAL && (
              <button 
                onClick={onSync}
                disabled={isSyncing}
                className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all shadow-sm ${isSyncing ? 'bg-blue-50 text-blue-500' : 'bg-white text-accent border border-accent/10 active:scale-95 hover:bg-accent-soft'}`}
                title="Sincronizar com a Nuvem"
              >
                <div className={isSyncing ? 'animate-spin' : ''}>
                  {isSyncing ? <RefreshCw size={16} /> : <Cloud size={16} />}
                </div>
              </button>
            )}
            <div className="w-9 h-9 bg-accent rounded-xl flex items-center justify-center text-white shadow-md">
              <LayoutGrid size={16} />
            </div>
          </div>
        </div>

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

      <div className="flex-1 overflow-hidden bg-bg-main relative">
        {filteredUnits.length > 0 ? (
          <Virtuoso
            style={{ height: '100%' }}
            data={filteredUnits}
            components={{
              Footer: () => <div className="h-28 w-full flex-shrink-0" />
            }}
            itemContent={(index, unit) => {
              const rawName = unit ? (unit.filial || unit.UNIDADE_OPERACIONAL) : '';
              // Garanta o uso rigoroso do campo oficial do projeto
              if (!unit || !rawName || rawName.trim() === '') {
                return null;
              }

              const displayName = rawName.trim().toUpperCase();
              const { style, Icon } = getUnitIdentity(displayName, unit.hasData);

              return (
                <div className="px-5 py-1.5">
                  <div
                    key={displayName}
                    onClick={() => unit.hasData && onSelect(displayName)}
                    className={`w-full bg-white p-4 rounded-xl flex items-center justify-between shadow-sm border transition-all group overflow-hidden relative modern-card ${
                      unit.hasData 
                        ? 'hover:border-accent active:scale-[0.99] border-border cursor-pointer' 
                        : 'opacity-60 cursor-not-allowed border-slate-100'
                    }`}
                  >
                    <div className="flex items-center space-x-4 relative z-10">
                      <div className={`w-12 h-12 ${style} rounded-xl flex items-center justify-center group-hover:scale-105 transition-transform shadow-sm border`}>
                        <Icon size={24} strokeWidth={2.5} />
                      </div>
                      <div className="text-left">
                        <h4 className={`font-bold text-sm uppercase leading-tight tracking-tight flex items-baseline flex-wrap gap-x-2 ${unit.hasData ? 'text-ink' : 'text-slate-400'}`}>
                          <span>{displayName}</span>
                          {typeof unit.assetCount === 'number' && (
                            <span className="text-slate-400 font-semibold text-xs normal-case">
                              - {unit.assetCount.toLocaleString('pt-BR')} ativos
                            </span>
                          )}
                        </h4>
                        <div className="flex items-center space-x-3 mt-2">
                           {/* Ícone de Dados */}
                           <div className="flex flex-col items-center gap-1">
                             <div className={`w-7 h-7 rounded-lg flex items-center justify-center border transition-all ${unit.hasData ? 'bg-blue-50 text-blue-600 border-blue-100 shadow-sm' : 'bg-gray-50 text-gray-300 border-gray-100'}`}>
                               <Database size={14} />
                             </div>
                             <span className={`text-[6px] font-black uppercase tracking-tighter ${unit.hasData ? 'text-blue-600' : 'text-gray-300'}`}>Dados</span>
                           </div>

                             {/* Ícone de GPS */}
                             <button 
                               type="button"
                               className="flex flex-col items-center gap-1 group/icon p-2 -m-2 rounded-xl active:scale-90 transition-all cursor-pointer min-w-[44px] min-h-[44px] justify-center bg-transparent border-0"
                               onClick={(e) => {
                                 e.stopPropagation();
                                 if (isAdmin && onConfigGPS) { e.preventDefault(); try { Promise.resolve(onConfigGPS(displayName)).catch(err => console.error("[GPS MODAL CRASH PREVENTED]", err)); } catch (err) { console.error("[GPS MODAL CRASH PREVENTED]", err); } }
                               }}
                             >
                               <div className={`w-8 h-8 rounded-lg flex items-center justify-center border transition-all ${
                                 unit.hasGps 
                                   ? 'bg-emerald-50 text-emerald-600 border-emerald-100 shadow-sm' 
                                   : 'bg-rose-50 text-rose-500 border-rose-100'
                               } ${isAdmin ? 'hover:scale-110 hover:bg-emerald-100' : ''}`}>
                                 <NavigationIcon size={16} />
                                </div>
                                <span className={`text-[7px] font-black uppercase tracking-tighter ${unit.hasGps ? 'text-emerald-600' : 'text-rose-500'}`}>GPS</span>
                             </button>
 
                           {/* Ícone de Campanha */}
                           <button 
                             type="button"
                             className={`flex flex-col items-center gap-1 group/icon p-2 -m-2 rounded-xl transition-all min-w-[44px] min-h-[44px] justify-center bg-transparent border-0 font-sans ${(!unit.hasGps && !((() => { try { const u = JSON.parse(localStorage.getItem('app_current_user') || '{}'); return ['ADMIN', 'MASTER', 'GESTOR'].includes(u.role?.toUpperCase()) || u.isAdmin || u.is_admin || isAdmin; } catch { return isAdmin; } })())) ? 'opacity-40 cursor-not-allowed' : 'active:scale-90 cursor-pointer'}`}
                             onClick={(e) => {
                               e.stopPropagation();
                               if (!unit.hasGps && !((() => { try { const u = JSON.parse(localStorage.getItem('app_current_user') || '{}'); return ['ADMIN', 'MASTER', 'GESTOR'].includes(u.role?.toUpperCase()) || u.isAdmin || u.is_admin || isAdmin; } catch { return isAdmin; } })())) { e.preventDefault(); e.stopPropagation(); return; } if (onCampaigns) onCampaigns(displayName);
                             }}
                           >
                             <div className={`w-8 h-8 rounded-lg flex items-center justify-center border transition-all ${
                               unit.hasCampaign 
                                 ? 'bg-amber-50 text-amber-600 border-amber-100 shadow-sm' 
                                 : 'bg-gray-50 text-gray-300 border-gray-100'
                             } ${(!unit.hasGps && !((() => { try { const u = JSON.parse(localStorage.getItem('app_current_user') || '{}'); return ['ADMIN', 'MASTER', 'GESTOR'].includes(u.role?.toUpperCase()) || u.isAdmin || u.is_admin || isAdmin; } catch { return isAdmin; } })())) ? '' : 'hover:scale-110 hover:bg-amber-100'}`}>
                               <Calendar size={16} />
                             </div>
                             <span className={`text-[7px] font-black uppercase tracking-tighter ${unit.hasCampaign ? 'text-amber-600' : 'text-gray-300'}`}>Campanha</span>
                           </button>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-2 relative z-10">
                      <div className="w-8 h-8 flex items-center justify-center text-ink-muted/20 group-hover:text-accent/40 transition-colors">
                        <ChevronRight size={20} />
                      </div>
                    </div>
                  </div>
                </div>
              );
            }}
          />
        ) : isSyncing ? (
          <div className="flex flex-col items-center justify-center py-16">
            <RefreshCw size={60} className="text-accent animate-spin" />
            <p className="font-bold uppercase tracking-[0.3em] text-[10px] mt-6 text-accent">Sincronizando Unidades...</p>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 px-8 text-center">
            <div className="w-20 h-20 bg-slate-100 rounded-[2rem] flex items-center justify-center text-slate-300 mb-6">
              <Building2 size={40} />
            </div>
            <p className="font-black uppercase tracking-[0.2em] text-[10px] text-slate-400 mb-8">Nenhuma Unidade Operacional Disponível</p>
            
            {isAdmin && onLoadDatabase && (
              <button
                onClick={onLoadDatabase}
                className="w-full max-w-xs py-4 bg-accent text-white rounded-2xl font-black uppercase text-[10px] tracking-[0.2em] shadow-xl shadow-accent/20 active:scale-95 transition-all flex items-center justify-center gap-3"
              >
                <Database size={18} />
                Iniciar Carga de Dados (Expert)
              </button>
            )}

            {!isAdmin && databaseMode !== DatabaseMode.INTERNAL && onSync && (
              <button
                onClick={onSync}
                disabled={isSyncing}
                className="w-full max-w-xs py-4 bg-white border-2 border-accent/20 text-accent rounded-2xl font-black uppercase text-[10px] tracking-[0.2em] active:scale-95 transition-all flex items-center justify-center gap-3"
              >
                <RefreshCw size={18} className={isSyncing ? 'animate-spin' : ''} />
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

       {/* Info Bar Técnica */}
       <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/80 backdrop-blur-xl border-t border-border flex justify-between items-center z-50 shadow-lg">
          <div className="flex items-center space-x-2">
             <div className="w-2 h-2 bg-accent rounded-full shadow-sm shadow-accent/50"></div>
             <p className="text-[9px] text-ink font-bold uppercase tracking-widest">Pipeline Ativo</p>
          </div>
          <p className="text-[9px] text-ink-muted font-bold uppercase tracking-widest">
            {purifiedUnits.length} Entidades
          </p>
       </div>
     </div>
   );
 };

 export default UnitSelector;
