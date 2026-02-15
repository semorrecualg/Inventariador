
import React from 'react';
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
  Database
} from 'lucide-react';

interface MainMenuProps {
  onNavigate: (target: AppScreen) => void;
  onLogout: () => void;
  onExport: () => void;
  user: User | null;
  inventoryInfo: { count: number; totalDatabase: number; date: string | null };
}

const MainMenu: React.FC<MainMenuProps> = ({ onNavigate, onLogout, onExport, user, inventoryInfo }) => {
  const isAdmin = user?.isAdmin || user?.email.toLowerCase() === "semorr@gmail.com";
  const hasData = inventoryInfo.totalDatabase > 0;

  return (
    <div className="flex flex-col h-full bg-slate-950 animate-fadeIn">
      {/* Top Bar Minimalista */}
      <div className="px-6 pt-12 pb-6 border-b border-slate-900 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white">
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
          <button onClick={() => onNavigate(AppScreen.LOAD_DATABASE)} className="p-2 text-slate-500">
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
        <div className="text-[8px] font-bold text-indigo-500 uppercase tracking-widest">Power Opt v2.5</div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-8 space-y-3 no-scrollbar">
        <button
          disabled={!hasData}
          onClick={() => onNavigate(AppScreen.COMPANY_SELECTION)}
          className="w-full flex items-center p-4 bg-slate-900 border border-slate-800 rounded-xl active:scale-95 disabled:opacity-20"
        >
          <div className="w-10 h-10 bg-indigo-900/30 text-indigo-400 rounded-lg flex items-center justify-center mr-4">
            <ClipboardList size={20} />
          </div>
          <div className="flex-1 text-left">
            <h3 className="text-sm font-bold text-slate-100">Inventário</h3>
            <p className="text-[10px] text-slate-500 uppercase font-medium">Conferência Física</p>
          </div>
        </button>

        <button
          disabled={!hasData}
          onClick={() => onNavigate(AppScreen.CONSULTATION)}
          className="w-full flex items-center p-4 bg-slate-900 border border-slate-800 rounded-xl active:scale-95 disabled:opacity-20"
        >
          <div className="w-10 h-10 bg-emerald-900/30 text-emerald-400 rounded-lg flex items-center justify-center mr-4">
            <Search size={20} />
          </div>
          <div className="flex-1 text-left">
            <h3 className="text-sm font-bold text-slate-100">Consulta</h3>
            <p className="text-[10px] text-slate-500 uppercase font-medium">Busca de Ativo</p>
          </div>
        </button>

        <button
          disabled={!hasData}
          onClick={() => onNavigate(AppScreen.DASHBOARD)}
          className="w-full flex items-center p-4 bg-slate-900 border border-slate-800 rounded-xl active:scale-95 disabled:opacity-20"
        >
          <div className="w-10 h-10 bg-purple-900/30 text-purple-400 rounded-lg flex items-center justify-center mr-4">
            <BarChart3 size={20} />
          </div>
          <div className="flex-1 text-left">
            <h3 className="text-sm font-bold text-slate-100">Painel</h3>
            <p className="text-[10px] text-slate-500 uppercase font-medium">Progresso Unitário</p>
          </div>
        </button>

        {isAdmin && (
          <div className="pt-8 space-y-2">
            <button onClick={() => onNavigate(AppScreen.USER_MANAGEMENT)} className="w-full flex items-center p-3 text-slate-400">
              <Users size={16} className="mr-3" />
              <span className="text-[10px] font-bold uppercase tracking-widest">Acessos</span>
            </button>
            <button onClick={onExport} disabled={!hasData} className="w-full flex items-center p-3 text-slate-400 disabled:opacity-20">
              <Download size={16} className="mr-3" />
              <span className="text-[10px] font-bold uppercase tracking-widest">Sincronizar</span>
            </button>
          </div>
        )}
      </div>

      <div className="p-8 border-t border-slate-900 flex items-center justify-between">
        <button onClick={onLogout} className="flex items-center text-slate-600 hover:text-red-500">
          <LogOut size={16} className="mr-2" />
          <span className="text-[10px] font-bold uppercase tracking-widest">Logout</span>
        </button>
        <span className="text-[8px] font-bold text-slate-800 uppercase tracking-widest">OLED Saving Mode</span>
      </div>
    </div>
  );
};

export default MainMenu;
