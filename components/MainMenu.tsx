
import React, { useState } from 'react';
import { AppScreen, User } from '../types';
import { 
  Search, 
  BarChart3, 
  LogOut, 
  Clock, 
  Layers, 
  ClipboardList, 
  Download, 
  UploadCloud,
  Building2,
  Users,
  Database,
  ShieldCheck,
  X,
  Settings,
  Lock,
  ChevronRight,
  Info
} from 'lucide-react';

interface MainMenuProps {
  onNavigate: (target: AppScreen) => void;
  onLogout: () => void;
  onExport: () => void;
  user: User | null;
  inventoryInfo: { count: number; totalDatabase: number; date: string | null };
}

const MainMenu: React.FC<MainMenuProps> = ({ onNavigate, onLogout, onExport, user, inventoryInfo }) => {
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  
  const isAdmin = user?.isAdmin || user?.email.toLowerCase() === "semorr@gmail.com";
  const hasData = inventoryInfo.totalDatabase > 0;

  // Opções principais da operação - Grid Limpo
  const coreOptions = [
    { 
      id: AppScreen.INVENTORY, 
      title: 'Inventário', 
      desc: 'Conferência física', 
      icon: <ClipboardList className="text-orange-600" />,
      color: 'bg-orange-100',
      disabled: !hasData
    },
    { 
      id: AppScreen.CONSULTATION, 
      title: 'Consulta', 
      desc: 'Pesquisa Dinâmica', 
      icon: <Search className="text-emerald-600" />,
      color: 'bg-emerald-100',
      disabled: !hasData
    },
    { 
      id: AppScreen.COMPANY_SELECTION, 
      title: 'Empresas', 
      desc: 'Alternar Unidade', 
      icon: <Building2 className="text-indigo-600" />,
      color: 'bg-indigo-100',
      disabled: !hasData
    },
    { 
      id: AppScreen.DASHBOARD, 
      title: 'Relatórios', 
      desc: 'Status patrimonial', 
      icon: <BarChart3 className="text-purple-600" />,
      color: 'bg-purple-100',
      disabled: !hasData
    }
  ];

  // Opções do submenu administrativo
  const adminOptions = [
    { 
      id: AppScreen.LOAD_DATABASE, 
      title: 'Carga', 
      desc: 'Importar Banco Excel', 
      icon: <UploadCloud className="text-blue-400" />,
      action: () => { setShowAdminPanel(false); onNavigate(AppScreen.LOAD_DATABASE); }
    },
    { 
      id: 'EXPORT', 
      title: 'Descarga', 
      desc: 'Exportar & Limpar Base', 
      icon: <Download className="text-emerald-400" />,
      action: () => { setShowAdminPanel(false); onExport(); },
      disabled: !hasData
    },
    { 
      id: AppScreen.USER_MANAGEMENT, 
      title: 'Usuários', 
      desc: 'Gestão de Acessos', 
      icon: <Users className="text-red-400" />,
      action: () => { setShowAdminPanel(false); onNavigate(AppScreen.USER_MANAGEMENT); }
    }
  ];

  return (
    <div className="p-6 pb-10 h-full flex flex-col bg-white relative overflow-hidden">
      {/* HEADER SUPERIOR - LOGO E BOTÃO ADMIN */}
      <div className="flex items-center justify-between mb-8 pt-2">
        <div>
          <h2 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-1">
            {isAdmin ? "ADMIN MASTER" : "OPERADOR"}
          </h2>
          <h1 className="text-xl font-black text-gray-900 uppercase tracking-tighter">
            {user?.username || 'USUÁRIO'}
          </h1>
        </div>

        {isAdmin && (
          <button 
            onClick={() => setShowAdminPanel(true)}
            className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all active:scale-90 relative
              ${!hasData ? 'bg-red-50 text-red-500 shadow-lg shadow-red-100 ring-2 ring-red-100' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
          >
            <Settings size={22} className={!hasData ? "animate-pulse" : ""} />
            {!hasData && (
              <span className="absolute -top-1 -right-1 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
              </span>
            )}
          </button>
        )}
      </div>

      {!hasData && !isAdmin && (
        <div className="mb-6 p-4 bg-amber-50 rounded-2xl border border-amber-100 flex items-start space-x-3 animate-fadeIn">
          <Info className="text-amber-500 shrink-0 mt-0.5" size={16} />
          <p className="text-[9px] font-black text-amber-700 uppercase leading-relaxed tracking-wider">
            Aguardando carga inicial de dados pelo administrador para liberar as funções de operação.
          </p>
        </div>
      )}

      {/* GRID DE OPERAÇÃO PADRÃO - EXTREMAMENTE LIMPO */}
      <div className="grid grid-cols-1 gap-4 flex-1 overflow-y-auto no-scrollbar pr-1">
        {coreOptions.map((opt) => (
          <button
            key={opt.id}
            disabled={opt.disabled}
            onClick={() => onNavigate(opt.id as AppScreen)}
            className={`flex items-center p-5 rounded-[2.2rem] border transition-all text-left group relative
              ${opt.disabled 
                ? 'opacity-30 grayscale cursor-not-allowed border-gray-50 bg-gray-50' 
                : 'bg-white border-gray-100 hover:border-blue-200 hover:shadow-xl hover:shadow-blue-50 active:scale-[0.98]'}`}
          >
            <div className={`w-14 h-14 ${opt.color} rounded-2xl flex items-center justify-center mr-5 group-hover:scale-110 transition-transform shadow-inner`}>
              {opt.icon}
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <h3 className="font-black text-gray-900 text-sm uppercase tracking-tight">{opt.title}</h3>
                {opt.disabled ? (
                  <Lock size={12} className="text-gray-300" />
                ) : (
                  <ChevronRight size={16} className="text-gray-200 group-hover:text-blue-500 transition-colors" />
                )}
              </div>
              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest leading-none mt-1.5">{opt.desc}</p>
            </div>
          </button>
        ))}
      </div>

      {/* RODAPÉ LOGOUT */}
      <button 
        onClick={onLogout}
        className="mt-8 w-full flex items-center justify-center space-x-2 p-5 text-gray-400 font-black text-[10px] uppercase tracking-[0.2em] border border-gray-100 rounded-[1.8rem] hover:bg-red-50 hover:text-red-500 hover:border-red-100 transition-all"
      >
        <LogOut size={16} />
        <span>Encerrar Sessão</span>
      </button>

      {/* PAINEL DE GESTÃO (OVERLAY) */}
      {showAdminPanel && (
        <div className="absolute inset-0 z-50 bg-gray-900/95 backdrop-blur-xl animate-fadeIn flex flex-col p-8">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center space-x-3 text-white">
              <div className="w-12 h-12 bg-amber-500 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-amber-500/20">
                <ShieldCheck size={28} />
              </div>
              <div>
                <h2 className="text-xl font-black uppercase tracking-tight">Gestão Master</h2>
                <p className="text-[8px] font-bold text-amber-400 uppercase tracking-[0.3em]">Controle de Infraestrutura</p>
              </div>
            </div>
            <button 
              onClick={() => setShowAdminPanel(false)}
              className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center text-white active:scale-90 transition-all"
            >
              <X size={24} />
            </button>
          </div>

          {/* STATUS DA BASE DENTRO DO PAINEL ADMIN */}
          <div className={`mb-8 p-6 rounded-[2rem] border-2 transition-all
            ${hasData ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-red-500/10 border-red-500/20 animate-pulse'}`}>
            <div className="flex items-center justify-between mb-4">
              <span className={`text-[10px] font-black uppercase tracking-widest ${hasData ? 'text-emerald-400' : 'text-red-400'}`}>
                {hasData ? 'Database Status: Ativa' : 'Database Status: Vazia'}
              </span>
              <Database size={16} className={hasData ? 'text-emerald-400' : 'text-red-400'} />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <span className="text-[8px] font-black uppercase text-gray-500 tracking-widest">Ativos Totais</span>
                <div className="flex items-center space-x-2">
                  <Layers size={12} className="text-blue-400" />
                  <span className="text-xs font-black text-white">{inventoryInfo.totalDatabase}</span>
                </div>
              </div>
              <div className="space-y-1">
                <span className="text-[8px] font-black uppercase text-gray-500 tracking-widest">Sincronização</span>
                <div className="flex items-center space-x-2">
                  <Clock size={12} className="text-blue-400" />
                  <span className="text-[9px] font-black text-white truncate">
                    {inventoryInfo.date ? new Date(inventoryInfo.date).toLocaleDateString() : 'PENDENTE'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-3 flex-1">
            <p className="text-[8px] font-black text-gray-500 uppercase tracking-[0.3em] ml-2 mb-2">Ferramentas de Dados</p>
            {adminOptions.map((opt) => (
              <button
                key={opt.id}
                disabled={(opt as any).disabled}
                onClick={opt.action}
                className={`w-full flex items-center p-6 rounded-[2.2rem] bg-white/5 border border-white/10 hover:bg-white/10 active:scale-[0.98] transition-all text-left group
                  ${(opt as any).disabled ? 'opacity-30 grayscale cursor-not-allowed' : ''}`}
              >
                <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center mr-5 group-hover:scale-110 transition-transform">
                  {opt.icon}
                </div>
                <div>
                  <h3 className="font-black text-white text-sm uppercase tracking-tight">{opt.title}</h3>
                  <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest mt-1">{opt.desc}</p>
                </div>
              </button>
            ))}
          </div>

          <div className="text-center pt-6 border-t border-white/5">
            <p className="text-[8px] font-black text-white/20 uppercase tracking-[0.5em]">GBR Inteligência Patrimonial</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default MainMenu;
