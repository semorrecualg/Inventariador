
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
  X,
  ShieldCheck,
  ChevronRight,
  DatabaseZap,
  Trash2,
  SlidersHorizontal,
  Tag,
  QrCode
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
    <div className="flex flex-col h-full bg-bg-main animate-fadeIn relative overflow-hidden">
      <div className="px-6 pt-12 pb-8 bg-white border-b border-slate-200 flex items-center justify-between shadow-sm z-20">
        <div className="flex items-center space-x-4">
          <div className="w-14 h-14 bg-sky-50 border border-sky-100 rounded-[1.8rem] flex items-center justify-center text-sky-600 shadow-sm">
            <Shield size={28} />
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.3em] mb-1">GBR Mobile</p>
            <h1 className="text-xl font-bold text-slate-900 truncate max-w-[200px] tracking-tight">
              {user?.username || 'Operador'}
            </h1>
          </div>
        </div>
        {isAdmin && (
          <button 
            onClick={() => setIsAdminMenuOpen(true)} 
            className="p-4 bg-slate-50 border border-slate-200 rounded-2xl text-slate-400 active:scale-90 transition-all shadow-sm hover:bg-white hover:text-slate-900"
          >
            <Settings size={24} />
          </button>
        )}
      </div>

      <div className="px-6 py-5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className={`w-2.5 h-2.5 rounded-full ${hasData ? 'bg-emerald-500 animate-pulse shadow-sm shadow-emerald-200' : 'bg-slate-300'}`} />
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">
            {hasData ? `${inventoryInfo.totalDatabase} Ativos Carregados` : 'Banco de Dados Vazio'}
          </span>
        </div>
        <div className="text-[10px] font-bold text-sky-600 uppercase tracking-widest bg-sky-50 px-3 py-1.5 rounded-xl border border-sky-100 shadow-sm">Power Opt v24</div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-8 space-y-4 no-scrollbar">
        <button
          disabled={!hasData}
          onClick={() => onNavigate(AppScreen.COMPANY_SELECTION)}
          className="w-full flex items-center p-5 bg-white border border-slate-200 rounded-3xl active:scale-[0.98] disabled:opacity-40 transition-all shadow-sm group hover:border-sky-200"
        >
          <div className="w-12 h-12 bg-sky-50 text-sky-600 rounded-2xl flex items-center justify-center mr-5 group-hover:bg-sky-100 transition-colors">
            <ClipboardList size={24} />
          </div>
          <div className="flex-1 text-left">
            <h3 className="text-[15px] font-bold text-slate-900 uppercase tracking-tight">Inventário</h3>
            <p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest mt-1">Conferência Física</p>
          </div>
          <ChevronRight size={18} className="text-slate-300 group-hover:text-sky-400 transition-colors" />
        </button>

        <button
          disabled={!hasData}
          onClick={() => onNavigate(AppScreen.LABELING)}
          className="w-full flex items-center p-5 bg-amber-50 border border-amber-100 rounded-3xl active:scale-[0.98] disabled:opacity-40 transition-all shadow-sm group hover:border-amber-200"
        >
          <div className="w-12 h-12 bg-amber-500 text-white rounded-2xl flex items-center justify-center mr-5 shadow-md">
            <Tag size={24} />
          </div>
          <div className="flex-1 text-left">
            <h3 className="text-[15px] font-bold text-amber-700 uppercase tracking-tight">EMPLAQUETAR</h3>
            <p className="text-[10px] text-amber-600 font-bold uppercase tracking-widest mt-1 italic">Itens sem plaqueta</p>
          </div>
          <ChevronRight size={18} className="text-amber-300 group-hover:text-amber-500 transition-colors" />
        </button>

        <button
          disabled={!hasData}
          onClick={() => onNavigate(AppScreen.CONSULTATION)}
          className="w-full flex items-center p-5 bg-white border border-slate-200 rounded-3xl active:scale-[0.98] disabled:opacity-40 transition-all shadow-sm group hover:border-emerald-200"
        >
          <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mr-5 group-hover:bg-emerald-100 transition-colors">
            <Search size={24} />
          </div>
          <div className="flex-1 text-left">
            <h3 className="text-[15px] font-bold text-slate-900 uppercase tracking-tight">Consulta</h3>
            <p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest mt-1">Busca de Ativo</p>
          </div>
          <ChevronRight size={18} className="text-slate-300 group-hover:text-emerald-400 transition-colors" />
        </button>

        <button
          disabled={!hasData}
          onClick={() => onNavigate(AppScreen.DASHBOARD)}
          className="w-full flex items-center p-5 bg-white border border-slate-200 rounded-3xl active:scale-[0.98] disabled:opacity-40 transition-all shadow-sm group hover:border-cyan-200"
        >
          <div className="w-12 h-12 bg-cyan-50 text-cyan-600 rounded-2xl flex items-center justify-center mr-5 group-hover:bg-cyan-100 transition-colors">
            <BarChart3 size={24} />
          </div>
          <div className="flex-1 text-left">
            <h3 className="text-[15px] font-bold text-slate-900 uppercase tracking-tight">Painel</h3>
            <p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest mt-1">Progresso Unitário</p>
          </div>
          <ChevronRight size={18} className="text-slate-300 group-hover:text-cyan-400 transition-colors" />
        </button>
      </div>

      <div className="p-8 bg-white border-t border-slate-200 flex items-center justify-between shadow-[0_-1px_3px_rgba(0,0,0,0.05)]">
        <button onClick={onLogout} className="flex items-center text-slate-400 hover:text-red-500 transition-colors font-bold uppercase text-[10px] tracking-widest">
          <LogOut size={18} className="mr-2" />
          <span>Sair do App</span>
        </button>
        <span className="text-[9px] font-bold text-slate-300 uppercase tracking-[0.3em]">GBR Intelligent Systems</span>
      </div>

      {isAdminMenuOpen && (
        <div className="fixed inset-0 z-[300] bg-white/95 backdrop-blur-md flex flex-col items-center justify-center p-8 animate-fadeIn">
          <button onClick={() => setIsAdminMenuOpen(false)} className="absolute top-12 right-8 p-4 bg-slate-50 border border-slate-200 rounded-2xl text-slate-400 active:scale-90 shadow-sm">
            <X size={28} />
          </button>
          <div className="w-full max-w-sm space-y-4">
            <div className="text-center mb-10">
              <div className="w-20 h-20 bg-sky-50 text-sky-600 rounded-[2rem] flex items-center justify-center mx-auto mb-6 border border-sky-100 shadow-xl">
                <ShieldCheck size={40} />
              </div>
              <h2 className="text-2xl font-bold text-slate-900 uppercase tracking-tight">Painel Administrativo</h2>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.3em] mt-2">Protocolo de Segurança GBR</p>
            </div>
            
            <div className="space-y-3 max-h-[60vh] overflow-y-auto no-scrollbar pr-1">
              <button onClick={() => { setIsAdminMenuOpen(false); onNavigate(AppScreen.USER_MANAGEMENT); }} className="w-full flex items-center p-5 bg-white border border-slate-200 rounded-3xl active:scale-[0.98] transition-all text-left shadow-sm">
                <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center mr-5 border border-blue-100"><Users size={20} /></div>
                <div className="flex-1">
                  <h4 className="text-sm font-bold text-slate-900 uppercase tracking-tight">Acessos</h4>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">Gerir Usuários</p>
                </div>
              </button>

              <button onClick={() => { setIsAdminMenuOpen(false); onNavigate(AppScreen.FIELD_CONFIGURATOR); }} className="w-full flex items-center p-5 bg-white border border-slate-200 rounded-3xl active:scale-[0.98] transition-all text-left shadow-sm">
                <div className="w-10 h-10 bg-cyan-50 text-cyan-600 rounded-xl flex items-center justify-center mr-5 border border-cyan-100"><SlidersHorizontal size={20} /></div>
                <div className="flex-1">
                  <h4 className="text-sm font-bold text-slate-900 uppercase tracking-tight">Configurar Campos</h4>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">Controle de Edição</p>
                </div>
              </button>

              <button onClick={() => { setIsAdminMenuOpen(false); onNavigate(AppScreen.QR_CODE_CONFIGURATOR); }} className="w-full flex items-center p-5 bg-white border border-slate-200 rounded-3xl active:scale-[0.98] transition-all text-left shadow-sm">
                <div className="w-10 h-10 bg-purple-50 text-purple-600 rounded-xl flex items-center justify-center mr-5 border border-purple-100"><QrCode size={20} /></div>
                <div className="flex-1">
                  <h4 className="text-sm font-bold text-slate-900 uppercase tracking-tight">Configurar QR Code</h4>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">Definir campos do QR</p>
                </div>
              </button>
              

              <button disabled={!hasData} onClick={() => { setIsAdminMenuOpen(false); onExport(); }} className="w-full flex items-center p-5 bg-white border border-slate-200 rounded-3xl active:scale-[0.98] disabled:opacity-40 transition-all text-left shadow-sm">
                <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center mr-5 border border-emerald-100"><Download size={20} /></div>
                <div className="flex-1">
                  <h4 className="text-sm font-bold text-slate-900 uppercase tracking-tight">Baixar base de dados</h4>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">Exportar XLS</p>
                </div>
              </button>

              <button disabled={hasData} onClick={() => { setIsAdminMenuOpen(false); onNavigate(AppScreen.LOAD_DATABASE); }} className="w-full flex items-center p-5 bg-sky-600 text-white rounded-3xl active:scale-[0.98] transition-all text-left shadow-lg disabled:opacity-40 disabled:bg-slate-200">
                <div className="w-10 h-10 bg-white/20 text-white rounded-xl flex items-center justify-center mr-5"><DatabaseZap size={20} /></div>
                <div className="flex-1">
                  <h4 className="text-sm font-bold uppercase tracking-tight">Carga Expert</h4>
                  <p className="text-[9px] font-bold text-sky-100 uppercase tracking-widest mt-1">Importar Base Master</p>
                </div>
              </button>

              <button onClick={() => { setIsAdminMenuOpen(false); onClearDatabase(); }} className="w-full flex items-center p-5 bg-red-50 border border-red-100 rounded-3xl active:scale-[0.98] transition-all text-left shadow-sm">
                <div className="w-10 h-10 bg-red-500 text-white rounded-xl flex items-center justify-center mr-5 shadow-md"><Trash2 size={20} /></div>
                <div className="flex-1">
                  <h4 className="text-sm font-bold text-red-600 uppercase tracking-tight">Limpar Banco de Dados</h4>
                  <p className="text-[9px] font-bold text-red-400 uppercase tracking-widest mt-1">Apagar Ativos do App</p>
                </div>
              </button>
            </div>
            <div className="pt-8 text-center text-[9px] font-bold text-slate-300 uppercase tracking-[0.4em]">GBR Security Protocol</div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MainMenu;
