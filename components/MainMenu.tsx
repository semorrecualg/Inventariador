
import React, { useState } from 'react';
import { AppScreen, User } from '../types';
import { 
  Search, 
  BarChart3, 
  LogOut, 
  ClipboardList, 
  Download, 
  Users,
  Settings,
  Shield,
  Database,
  X,
  ShieldCheck,
  ChevronRight,
  DatabaseZap,
  Trash2,
  SlidersHorizontal,
  Tag,
  AlertTriangle
} from 'lucide-react';

interface MainMenuProps {
  onNavigate: (target: AppScreen) => void;
  onLogout: () => void;
  onExport: () => void;
  onClearDatabase: () => void;
  user: User | null;
  inventoryInfo: { count: number; totalDatabase: number; date: string | null };
}

const MainMenu: React.FC<MainMenuProps> = ({ onNavigate, onLogout, onExport, onClearDatabase, user, inventoryInfo }) => {
  const [isAdminMenuOpen, setIsAdminMenuOpen] = useState(false);
  const isAdmin = user?.isAdmin || user?.email.toLowerCase() === "semorr@gmail.com";
  const hasData = inventoryInfo.totalDatabase > 0;

  return (
    <div className="flex flex-col h-full bg-slate-950 animate-fadeIn relative">
      <div className="px-6 pt-12 pb-6 border-b border-slate-900 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-sky-600 rounded-xl flex items-center justify-center text-white shadow-lg">
            <Shield size={20} />
          </div>
          <div>
            <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">GBR Mobile</p>
            <h1 className="text-md font-bold text-white truncate max-w-[150px]">
              {user?.username || 'Operador'}
            </h1>
          </div>
        </div>
        {isAdmin && (
          <button 
            onClick={() => setIsAdminMenuOpen(true)} 
            className="p-3 bg-slate-900 border border-slate-800 rounded-xl text-slate-400 active:scale-90 transition-all shadow-lg"
          >
            <Settings size={22} />
          </button>
        )}
      </div>

      <div className="px-6 py-3 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Database size={12} className={hasData ? 'text-emerald-500' : 'text-slate-700'} />
          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
            {hasData ? `${inventoryInfo.totalDatabase} Ativos` : 'Banco Vazio'}
          </span>
        </div>
        <div className="text-[8px] font-bold text-sky-500 uppercase tracking-widest">Power Opt v2.5</div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-8 space-y-3 no-scrollbar">
        <button
          disabled={!hasData}
          onClick={() => onNavigate(AppScreen.COMPANY_SELECTION)}
          className="w-full flex items-center p-4 bg-slate-900 border border-slate-800 rounded-2xl active:scale-95 disabled:opacity-20 transition-all"
        >
          <div className="w-10 h-10 bg-sky-900/30 text-sky-400 rounded-lg flex items-center justify-center mr-4">
            <ClipboardList size={20} />
          </div>
          <div className="flex-1 text-left">
            <h3 className="text-sm font-bold text-slate-100 uppercase tracking-tight">Inventário</h3>
            <p className="text-[9px] text-slate-500 uppercase font-medium tracking-widest">Conferência Física</p>
          </div>
          <ChevronRight size={14} className="text-slate-700" />
        </button>

        {/* MÓDULO EMPLAQUETAR v24.41 PRO */}
        <button
          disabled={!hasData}
          onClick={() => {
            // v24.41: Pula o mapeamento geográfico e entra direto no modo de plaqueteamento
            localStorage.setItem('app_inventory_location', 'BENS A SEREM ETIQUETADOS');
            localStorage.setItem('app_is_inventorying', 'true');
            onNavigate(AppScreen.INVENTORY);
          }}
          className="w-full flex items-center p-4 bg-amber-900/10 border border-amber-900/40 rounded-2xl active:scale-95 disabled:opacity-20 transition-all shadow-lg"
        >
          <div className="w-10 h-10 bg-amber-600 text-white rounded-lg flex items-center justify-center mr-4 shadow-xl">
            <Tag size={20} />
          </div>
          <div className="flex-1 text-left">
            <h3 className="text-sm font-bold text-amber-500 uppercase tracking-tight">EMPLAQUETAR</h3>
            <p className="text-[9px] text-amber-600 font-black uppercase tracking-widest italic">ETIQUETAR ITENS SEM PLAQUETA</p>
          </div>
          <ChevronRight size={14} className="text-amber-900/40" />
        </button>

        <button
          disabled={!hasData}
          onClick={() => onNavigate(AppScreen.CONSULTATION)}
          className="w-full flex items-center p-4 bg-slate-900 border border-slate-800 rounded-2xl active:scale-95 disabled:opacity-20 transition-all"
        >
          <div className="w-10 h-10 bg-emerald-900/30 text-emerald-400 rounded-lg flex items-center justify-center mr-4">
            <Search size={20} />
          </div>
          <div className="flex-1 text-left">
            <h3 className="text-sm font-bold text-slate-100 uppercase tracking-tight">Consulta</h3>
            <p className="text-[9px] text-slate-500 uppercase font-medium tracking-widest">Busca de Ativo</p>
          </div>
          <ChevronRight size={14} className="text-slate-700" />
        </button>

        <button
          disabled={!hasData}
          onClick={() => onNavigate(AppScreen.DASHBOARD)}
          className="w-full flex items-center p-4 bg-slate-900 border border-slate-800 rounded-2xl active:scale-95 disabled:opacity-20 transition-all"
        >
          <div className="w-10 h-10 bg-cyan-900/30 text-cyan-400 rounded-lg flex items-center justify-center mr-4">
            <BarChart3 size={20} />
          </div>
          <div className="flex-1 text-left">
            <h3 className="text-sm font-bold text-slate-100 uppercase tracking-tight">Painel</h3>
            <p className="text-[9px] text-slate-500 uppercase font-medium tracking-widest">Progresso Unitário</p>
          </div>
          <ChevronRight size={14} className="text-slate-700" />
        </button>
      </div>

      <div className="p-8 border-t border-slate-900 flex items-center justify-between">
        <button onClick={onLogout} className="flex items-center text-slate-600 hover:text-red-500 transition-colors">
          <LogOut size={16} className="mr-2" />
          <span className="text-[10px] font-bold uppercase tracking-widest">Logout</span>
        </button>
        <span className="text-[8px] font-bold text-slate-800 uppercase tracking-widest">GBR Intelligent Systems</span>
      </div>

      {isAdminMenuOpen && (
        <div className="fixed inset-0 z-[100] bg-slate-950/95 flex flex-col items-center justify-center p-6 animate-fadeIn">
          <button onClick={() => setIsAdminMenuOpen(false)} className="absolute top-12 right-6 p-3 bg-slate-900 border border-slate-800 rounded-xl text-slate-400 active:scale-90">
            <X size={24} />
          </button>
          <div className="w-full max-w-xs space-y-3">
            <div className="text-center mb-8">
              <div className="w-16 h-16 bg-sky-600/20 text-sky-500 rounded-[1.5rem] flex items-center justify-center mx-auto mb-4 border border-sky-500/30 shadow-2xl">
                <ShieldCheck size={32} />
              </div>
              <h2 className="text-xl font-bold text-white uppercase tracking-tighter italic">Painel Admin GBR</h2>
            </div>
            
            <div className="space-y-2">
              <button onClick={() => { setIsAdminMenuOpen(false); onNavigate(AppScreen.USER_MANAGEMENT); }} className="w-full flex items-center p-4 bg-slate-900 border border-slate-800 rounded-[1.8rem] active:scale-95 transition-all text-left">
                <div className="w-9 h-9 bg-blue-900/20 text-blue-500 rounded-xl flex items-center justify-center mr-4 border border-blue-500/20"><Users size={18} /></div>
                <div className="flex-1">
                  <h4 className="text-xs font-black text-slate-100 uppercase tracking-tighter">Acessos</h4>
                  <p className="text-[8px] font-bold text-slate-500 uppercase tracking-widest">Gerir Usuários</p>
                </div>
              </button>

              <button onClick={() => { setIsAdminMenuOpen(false); onNavigate(AppScreen.FIELD_CONFIGURATOR); }} className="w-full flex items-center p-4 bg-slate-900 border border-slate-800 rounded-[1.8rem] active:scale-95 transition-all text-left">
                <div className="w-9 h-9 bg-cyan-900/20 text-cyan-400 rounded-xl flex items-center justify-center mr-4 border border-cyan-500/20"><SlidersHorizontal size={18} /></div>
                <div className="flex-1">
                  <h4 className="text-xs font-black text-slate-100 uppercase tracking-tighter">Configurar Campos</h4>
                  <p className="text-[8px] font-bold text-slate-500 uppercase tracking-widest">Controle de Edição</p>
                </div>
              </button>

              <button disabled={!hasData} onClick={() => { setIsAdminMenuOpen(false); onExport(); }} className="w-full flex items-center p-4 bg-slate-900 border border-slate-800 rounded-[1.8rem] active:scale-95 disabled:opacity-20 transition-all text-left">
                <div className="w-9 h-9 bg-emerald-900/20 text-emerald-500 rounded-xl flex items-center justify-center mr-4 border border-emerald-500/20"><Download size={18} /></div>
                <div className="flex-1">
                  <h4 className="text-xs font-black text-slate-100 uppercase tracking-tighter">Baixar base de dados</h4>
                  <p className="text-[8px] font-bold text-slate-500 uppercase tracking-widest">Exportar XLS</p>
                </div>
              </button>

              <button onClick={() => { setIsAdminMenuOpen(false); onNavigate(AppScreen.LOAD_DATABASE); }} className="w-full flex items-center p-4 bg-sky-600 text-white rounded-[1.8rem] active:scale-95 transition-all text-left shadow-lg shadow-sky-900/20">
                <div className="w-9 h-9 bg-white/20 text-white rounded-xl flex items-center justify-center mr-4"><DatabaseZap size={18} /></div>
                <div className="flex-1">
                  <h4 className="text-xs font-black uppercase tracking-tighter">Carga Expert</h4>
                  <p className="text-[8px] font-bold text-sky-100 uppercase tracking-widest">Importar Base Master</p>
                </div>
              </button>

              <button onClick={() => { setIsAdminMenuOpen(false); onClearDatabase(); }} className="w-full flex items-center p-4 bg-red-950/30 border border-red-900/50 rounded-[1.8rem] active:scale-95 transition-all text-left">
                <div className="w-9 h-9 bg-red-600 text-white rounded-xl flex items-center justify-center mr-4 shadow-lg shadow-red-900/20"><Trash2 size={18} /></div>
                <div className="flex-1">
                  <h4 className="text-xs font-black text-red-500 uppercase tracking-tighter">Limpar Banco de Dados</h4>
                  <p className="text-[8px] font-bold text-red-900 uppercase tracking-widest">Apagar Ativos do App</p>
                </div>
              </button>
            </div>
            <div className="pt-6 text-center text-[8px] font-black text-slate-700 uppercase tracking-[0.4em]">GBR Security Protocol</div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MainMenu;
