
import React from 'react';
import { AppScreen, User } from '../types';
import { 
  Database, 
  Search, 
  BarChart3, 
  LogOut, 
  Clock, 
  Layers, 
  ClipboardList, 
  Download, 
  UploadCloud,
  Building2
} from 'lucide-react';

interface MainMenuProps {
  onNavigate: (target: AppScreen) => void;
  onLogout: () => void;
  onExport: () => void;
  user: User | null;
  inventoryInfo: { count: number; date: string | null };
}

const MainMenu: React.FC<MainMenuProps> = ({ onNavigate, onLogout, onExport, user, inventoryInfo }) => {
  const menuOptions = [
    { 
      id: AppScreen.INVENTORY, 
      title: 'Inventário', 
      desc: 'Conferência física', 
      icon: <ClipboardList className="text-orange-600" />,
      color: 'bg-orange-100'
    },
    { 
      id: AppScreen.CONSULTATION, 
      title: 'Consulta', 
      desc: 'Pesquisa Dinâmica', 
      icon: <Search className="text-emerald-600" />,
      color: 'bg-emerald-100'
    },
    { 
      id: AppScreen.COMPANY_SELECTION, 
      title: 'Trocar Empresa', 
      desc: 'Mudar unidade de atuação', 
      icon: <Building2 className="text-indigo-600" />,
      color: 'bg-indigo-100'
    },
    { 
      id: AppScreen.DASHBOARD, 
      title: 'Relatórios', 
      desc: 'Status patrimonial', 
      icon: <BarChart3 className="text-purple-600" />,
      color: 'bg-purple-100'
    },
    { 
      id: AppScreen.LOAD_DATABASE, 
      title: 'Carga', 
      desc: 'Importar Excel', 
      icon: <UploadCloud className="text-blue-600" />,
      color: 'bg-blue-100'
    },
    { 
      id: 'EXPORT', 
      title: 'Descarga', 
      desc: 'Exportar Base', 
      icon: <Download className="text-slate-600" />,
      color: 'bg-slate-100',
      action: onExport
    }
  ];

  return (
    <div className="p-6 pb-24">
      <div className="mb-8">
        <h2 className="text-2xl font-black text-gray-900 leading-tight uppercase">Olá, {user?.username}!</h2>
        <p className="text-gray-400 text-xs font-black uppercase tracking-widest">Gestão de Ativo Imobilizado</p>
      </div>

      <div className="grid grid-cols-1 gap-3">
        {menuOptions.map((opt) => (
          <button
            key={opt.id}
            onClick={() => opt.action ? opt.action() : onNavigate(opt.id as AppScreen)}
            className="flex items-center p-4 rounded-[2rem] border border-gray-100 bg-white shadow-sm hover:shadow-md active:scale-[0.98] transition-all text-left group"
          >
            <div className={`w-12 h-12 ${opt.color} rounded-2xl flex items-center justify-center mr-4 group-hover:scale-110 transition-transform`}>
              {opt.icon}
            </div>
            <div className="flex-1">
              <h3 className="font-black text-gray-800 text-sm uppercase tracking-tight">{opt.title}</h3>
              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest leading-none mt-1">{opt.desc}</p>
            </div>
          </button>
        ))}
      </div>

      <div className="mt-8 bg-gray-900 rounded-[2.5rem] p-6 text-white overflow-hidden relative shadow-xl">
        <div className="relative z-10">
          <h4 className="text-[10px] font-black uppercase tracking-[0.2em] opacity-50 mb-2">Monitoramento de Base</h4>
          <div className="text-xl font-black mb-4 uppercase">Status: Ativo</div>
          
          <div className="space-y-2">
            <div className="flex items-center text-[10px] font-bold uppercase tracking-wider opacity-80">
              <Clock size={14} className="mr-2 text-blue-400" />
              {inventoryInfo.date ? `Sinc: ${new Date(inventoryInfo.date).toLocaleString().toUpperCase()}` : 'Sem registros'}
            </div>
            <div className="flex items-center text-[10px] font-bold uppercase tracking-wider opacity-80">
              <Layers size={14} className="mr-2 text-blue-400" />
              {inventoryInfo.count} Itens na Unidade
            </div>
          </div>
        </div>
        <div className="absolute -right-8 -bottom-8 w-40 h-40 bg-blue-600/20 rounded-full blur-3xl"></div>
      </div>

      <button 
        onClick={onLogout}
        className="mt-8 w-full flex items-center justify-center space-x-2 p-5 text-red-500 font-black text-[10px] uppercase tracking-[0.2em] border border-red-50 rounded-[2rem] hover:bg-red-50 transition-colors"
      >
        <LogOut size={18} />
        <span>Encerrar Sessão</span>
      </button>
    </div>
  );
};

export default MainMenu;
