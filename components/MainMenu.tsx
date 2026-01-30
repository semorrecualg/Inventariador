
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
  ChevronDown,
  ChevronUp,
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
  const [showDbDetails, setShowDbDetails] = useState(false);
  const isAdmin = user?.isAdmin || user?.email.toLowerCase() === "semorr@gmail.com";
  const hasData = inventoryInfo.totalDatabase > 0;

  const menuOptions = [
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
    },
    { 
      id: AppScreen.LOAD_DATABASE, 
      title: 'Carga', 
      desc: 'Importar Banco', 
      icon: <UploadCloud className="text-blue-600" />,
      color: 'bg-blue-100',
      highlight: !hasData
    },
    { 
      id: 'EXPORT', 
      title: 'Descarga', 
      desc: 'Exportar & Limpar', 
      icon: <Download className="text-slate-600" />,
      color: 'bg-slate-100',
      action: onExport,
      disabled: !hasData
    }
  ];

  if (isAdmin) {
    menuOptions.push({
      id: AppScreen.USER_MANAGEMENT,
      title: 'Usuários',
      desc: 'Gestão de Acessos',
      icon: <Users className="text-red-600" />,
      color: 'bg-red-100',
      disabled: false
    });
  }

  return (
    <div className="p-6 pb-10 h-full flex flex-col bg-white">
      {/* HEADER MINIMALISTA - LINHA ÚNICA */}
      <div className="flex items-center justify-between mb-4 pt-2">
        <h2 className="text-xs font-black text-gray-900 uppercase tracking-tight">
          OLÁ, {user?.username || 'USUÁRIO'} <span className="text-gray-300 mx-2">•</span> 
          <span className="text-gray-400 font-bold">{isAdmin ? "ADMIN" : "OPERADOR"}</span>
        </h2>
        {isAdmin && <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse"></div>}
      </div>

      {/* BOTÃO DE STATUS DA BASE - TOP INFO */}
      <div className="mb-6">
        <button 
          onClick={() => setShowDbDetails(!showDbDetails)}
          className={`w-full flex items-center justify-between p-3 rounded-2xl border transition-all active:scale-[0.98]
            ${hasData ? 'bg-emerald-50/30 border-emerald-100' : 'bg-red-50/30 border-red-100'}`}
        >
          <div className="flex items-center space-x-3">
            <div className={`p-2 rounded-xl ${hasData ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-500'}`}>
              <Database size={16} />
            </div>
            <span className={`text-[10px] font-black uppercase tracking-widest ${hasData ? 'text-emerald-700' : 'text-red-600'}`}>
              {hasData ? 'Base Ativa e Carregada' : 'Base de Dados Vazia'}
            </span>
          </div>
          <div className="text-gray-400">
            {showDbDetails ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </div>
        </button>

        {/* PAINEL EXPANSÍVEL DE DETALHES */}
        {showDbDetails && (
          <div className="mt-2 p-4 bg-gray-900 rounded-[1.5rem] text-white animate-fadeIn shadow-lg">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <span className="text-[8px] font-black uppercase text-gray-500 tracking-widest">Registros</span>
                <div className="flex items-center space-x-2">
                  <Layers size={12} className="text-blue-400" />
                  <span className="text-xs font-black uppercase">{inventoryInfo.totalDatabase} Ativos</span>
                </div>
              </div>
              <div className="space-y-1">
                <span className="text-[8px] font-black uppercase text-gray-500 tracking-widest">Última Sinc</span>
                <div className="flex items-center space-x-2">
                  <Clock size={12} className="text-blue-400" />
                  <span className="text-[9px] font-black uppercase truncate">
                    {inventoryInfo.date ? new Date(inventoryInfo.date).toLocaleDateString() : '--/--/--'}
                  </span>
                </div>
              </div>
            </div>
            {!hasData && (
              <div className="mt-3 pt-3 border-t border-white/5 flex items-start space-x-2">
                <Info size={10} className="text-amber-400 shrink-0 mt-0.5" />
                <p className="text-[8px] font-bold text-gray-400 uppercase leading-relaxed">
                  Sistema aguardando carga de arquivo Excel para habilitar funções.
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* GRID DE OPÇÕES */}
      <div className="grid grid-cols-1 gap-3 flex-1 overflow-y-auto no-scrollbar pr-1">
        {menuOptions.map((opt) => (
          <button
            key={opt.id}
            disabled={opt.disabled}
            onClick={() => opt.action ? opt.action() : onNavigate(opt.id as AppScreen)}
            className={`flex items-center p-4 rounded-[1.8rem] border shadow-sm transition-all text-left group
              ${opt.disabled ? 'opacity-40 grayscale pointer-events-none border-gray-50' : 'bg-white hover:shadow-md active:scale-[0.98] border-gray-100'}
              ${opt.highlight ? 'ring-2 ring-blue-500 ring-offset-4 border-blue-200 animate-pulse' : ''}`}
          >
            <div className={`w-11 h-11 ${opt.color} rounded-2xl flex items-center justify-center mr-4 group-hover:scale-110 transition-transform`}>
              {opt.icon}
            </div>
            <div className="flex-1">
              <h3 className="font-black text-gray-800 text-xs uppercase tracking-tight">{opt.title}</h3>
              <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest leading-none mt-1">{opt.desc}</p>
            </div>
          </button>
        ))}
      </div>

      {/* RODAPÉ LOGOUT */}
      <button 
        onClick={onLogout}
        className="mt-6 w-full flex items-center justify-center space-x-2 p-4 text-gray-400 font-black text-[10px] uppercase tracking-[0.2em] border border-gray-100 rounded-[1.5rem] hover:bg-red-50 hover:text-red-500 hover:border-red-100 transition-all"
      >
        <LogOut size={16} />
        <span>Sair do Sistema</span>
      </button>

      <div className="mt-4 text-center">
        <p className="text-[8px] font-black text-gray-200 uppercase tracking-[0.4em]">GBR Inteligência Patrimonial</p>
      </div>
    </div>
  );
};

export default MainMenu;
