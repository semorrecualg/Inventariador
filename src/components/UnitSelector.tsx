
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
  Download, 
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
    name: string; 
    hasData: boolean; 
    isDownloaded?: boolean; 
    hasCampaign?: boolean;
    hasGps?: boolean;
  }>;
  onSelect: (unit: string) => void;
  onBack: () => void;
  onSync?: () => void;
  onDownload?: (unit: string) => void;
  onConfigGPS?: (unit: string) => void;
  onCampaigns?: (unit: string) => void;
  onLoadDatabase?: () => void;
  isSyncing?: boolean;
  lastSyncTime?: string | null;
  isAdmin?: boolean;
  databaseMode?: DatabaseMode;
}

const UnitSelector: React.FC<UnitSelectorProps> = ({ units, onSelect, onBack, onSync, onDownload, onConfigGPS, onCampaigns, onLoadDatabase, isSyncing, isAdmin, databaseMode }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [downloadingUnit, setDownloadingUnit] = useState<string | null>(null);

  const filteredUnits = units.filter(u => 
    u.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Log para depuração de unidades
  if (units.length === 0) {
    console.warn('>>> [UnitSelector] Recebeu 0 unidades para exibir.');
  } else {
    console.log(`>>> [UnitSelector] Exibindo ${filteredUnits.length} de ${units.length} unidades.`);
  }

  const handleDownload = async (e: React.MouseEvent, unitName: string) => {
    e.stopPropagation();
    if (!onDownload || downloadingUnit) return;
    setDownloadingUnit(unitName);
    try {
      await onDownload(unitName);
    } finally {
      setDownloadingUnit(null);
    }
  };

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

  console.log(`>>> [UnitSelector] Renderizando ${units.length} unidades. Unidades com campanha: ${units.filter(u => u.hasCampaign).map(u => u.name).join(', ') || 'NENHUMA'}`);

  return (
    <div className="flex flex-col h-[100dvh] bg-bg-main animate-fadeIn">
      {/* Header Fixo */}
      <div className="p-5 pt-14 bg-white border-b border-border shadow-sm">
        <div className="mb-6">
          <BackButton onClick={onBack} label="Voltar" subLabel={isAdmin ? "Módulos" : "Sair"} />
        </div>
        
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold text-ink uppercase tracking-tight leading-none">Unidade Operacional</h2>
            <p className="text-accent text-[9px] font-bold uppercase tracking-[0.2em] mt-2">Selecione o Foco do Inventário</p>
          </div>
          <div className="flex items-center space-x-2">
            {isAdmin && onLoadDatabase && (
              <button 
                onClick={onLoadDatabase}
                className="w-10 h-10 rounded-xl flex items-center justify-center transition-all shadow-md bg-white text-indigo-600 border border-indigo-100 active:scale-95 hover:bg-indigo-50"
                title="Carga Expert de Dados"
              >
                <Database size={20} />
              </button>
            )}
            {onSync && databaseMode !== DatabaseMode.INTERNAL && (
              <button 
                onClick={onSync}
                disabled={isSyncing}
                className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all shadow-md ${isSyncing ? 'bg-blue-50 text-blue-500' : 'bg-white text-accent border border-accent/10 active:scale-95 hover:bg-accent-soft'}`}
                title="Sincronizar com a Nuvem"
              >
                <div className={isSyncing ? 'animate-spin' : ''}>
                  {isSyncing ? <RefreshCw size={20} /> : <Cloud size={20} />}
                </div>
              </button>
            )}
            <div className="w-12 h-12 bg-accent rounded-xl flex items-center justify-center text-white shadow-lg shadow-accent/20">
              <LayoutGrid size={24} />
            </div>
          </div>
        </div>

        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-muted/30" size={18} />
          <input 
            type="text"
            placeholder="PESQUISAR UNIDADE..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value.toUpperCase())}
            className="w-full pl-12 pr-6 py-3.5 bg-bg-main rounded-xl text-[11px] font-bold uppercase border border-border focus:border-accent outline-none transition-all shadow-inner placeholder:text-ink-muted/30"
          />
        </div>
      </div>

      <div className="flex-1 overflow-hidden bg-bg-main relative">
        {filteredUnits.length > 0 ? (
          <Virtuoso
            style={{ height: '100%' }}
            data={filteredUnits}
            itemContent={(index, unit) => {
              const { style, Icon } = getUnitIdentity(unit.name, unit.hasData);
              const isDownloading = downloadingUnit === unit.name;
              return (
                <div className="px-5 py-1.5">
                  <div
                    key={unit.name}
                    onClick={() => unit.hasData && onSelect(unit.name)}
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
                        <h4 className={`font-bold text-sm uppercase leading-tight tracking-tight ${unit.hasData ? 'text-ink' : 'text-slate-400'}`}>
                          {unit.name}
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
                             <div 
                               className="flex flex-col items-center gap-1 group/icon"
                               onClick={(e) => {
                                 e.stopPropagation();
                                 if (isAdmin && onConfigGPS) onConfigGPS(unit.name);
                               }}
                             >
                               <div className={`w-7 h-7 rounded-lg flex items-center justify-center border transition-all ${
                                 unit.hasGps 
                                   ? 'bg-emerald-50 text-emerald-600 border-emerald-100 shadow-sm' 
                                   : 'bg-rose-50 text-rose-500 border-rose-100'
                               } ${isAdmin ? 'cursor-pointer hover:scale-110 active:scale-95 hover:bg-emerald-100' : ''}`}>
                                 <NavigationIcon size={14} />
                               </div>
                               <span className={`text-[6px] font-black uppercase tracking-tighter ${unit.hasGps ? 'text-emerald-600' : 'text-rose-500'}`}>GPS</span>
                             </div>
 
                           {/* Ícone de Campanha */}
                           <div 
                             className="flex flex-col items-center gap-1 group/icon"
                             onClick={(e) => {
                               e.stopPropagation();
                               if (onCampaigns) onCampaigns(unit.name);
                             }}
                           >
                             <div className={`w-7 h-7 rounded-lg flex items-center justify-center border transition-all ${
                               unit.hasCampaign 
                                 ? 'bg-amber-50 text-amber-600 border-amber-100 shadow-sm' 
                                 : 'bg-gray-50 text-gray-300 border-gray-100'
                             } cursor-pointer hover:scale-110 active:scale-95 hover:bg-amber-100`}>
                               <Calendar size={14} />
                             </div>
                             <span className={`text-[6px] font-black uppercase tracking-tighter ${unit.hasCampaign ? 'text-amber-600' : 'text-gray-300'}`}>Campanha</span>
                           </div>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-2 relative z-10">
                      {unit.hasData && onDownload && databaseMode !== DatabaseMode.INTERNAL && (
                        <button
                          onClick={(e) => handleDownload(e, unit.name)}
                          disabled={isDownloading || unit.isDownloaded}
                          className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                            unit.isDownloaded 
                              ? 'text-emerald-500 bg-emerald-50' 
                              : 'text-ink-muted hover:bg-bg-main active:scale-90'
                          }`}
                          title="Baixar para uso Offline"
                        >
                          {isDownloading ? (
                            <RefreshCw size={18} className="animate-spin" />
                          ) : (
                            <Download size={18} className={unit.isDownloaded ? 'text-emerald-500 opacity-50' : ''} />
                          )}
                        </button>
                      )}
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
            {units.length} Entidades
          </p>
       </div>
     </div>
   );
 };

 export default UnitSelector;
