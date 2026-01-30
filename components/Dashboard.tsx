
import React, { useMemo } from 'react';
import { Asset } from '../types';
import { 
  BarChart3, 
  ArrowLeft, 
  CheckCircle2, 
  Clock, 
  AlertTriangle, 
  FileWarning, 
  TrendingUp, 
  Target,
  Hash
} from 'lucide-react';

interface DashboardProps {
  assets: Asset[];
  onBack: () => void;
}

const Dashboard: React.FC<DashboardProps> = ({ assets, onBack }) => {
  const stats = useMemo(() => {
    const total = assets.length;
    const conferido = assets.filter(a => a._conferido).length;
    const pendente = total - conferido;
    const percConferido = total > 0 ? Math.round((conferido / total) * 100) : 0;

    // Tags de Plaqueta
    const comPlaqueta = assets.filter(a => a._hasPlaqueta).length;
    const semPlaqueta = total - comPlaqueta;
    
    // Tags de Duplicidade
    const unico = assets.filter(a => a.TAG_DUPLICIDADE === 'ÚNICO').length;
    const dupInterna = assets.filter(a => a.TAG_DUPLICIDADE === 'DUPLICIDADE INTERNA').length;
    const dupExterna = assets.filter(a => a.TAG_DUPLICIDADE === 'DUPLICIDADE EXTERNA').length;
    const dupMultipla = assets.filter(a => a.TAG_DUPLICIDADE === 'DUPLICIDADE MÚLTIPLA').length;
    const totalDups = dupInterna + dupExterna + dupMultipla;

    return {
      total,
      conferido,
      pendente,
      percConferido,
      comPlaqueta,
      semPlaqueta,
      unico,
      totalDups,
      dupInterna,
      dupExterna,
      dupMultipla
    };
  }, [assets]);

  // Gráfico de Rosca (Donut) SVG
  const ProgressDonut = ({ percentage }: { percentage: number }) => {
    const strokeWidth = 3;
    const radius = 16;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (percentage / 100) * circumference;

    return (
      <div className="relative w-48 h-48 flex items-center justify-center">
        <svg viewBox="0 0 36 36" className="w-full h-full transform -rotate-90">
          <circle 
            cx="18" cy="18" r={radius} 
            fill="none" 
            stroke="currentColor" 
            strokeWidth={strokeWidth} 
            className="text-gray-100" 
          />
          <circle 
            cx="18" cy="18" r={radius} 
            fill="none" 
            stroke="currentColor" 
            strokeWidth={strokeWidth} 
            strokeDasharray={circumference} 
            strokeDashoffset={offset} 
            strokeLinecap="round"
            className="text-emerald-500 transition-all duration-1000 ease-out" 
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-4xl font-black text-gray-900 leading-none">{percentage}%</span>
          <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest mt-2">Conferido</span>
        </div>
      </div>
    );
  };

  const StatBar = ({ label, value, total, colorClass, icon: Icon }: any) => {
    const percentage = total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0;
    return (
      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <div className={`p-1.5 rounded-lg ${colorClass} bg-opacity-10 text-opacity-100`}>
              <Icon size={12} className={colorClass.replace('bg-', 'text-')} />
            </div>
            <span className="text-[10px] font-black text-gray-600 uppercase tracking-tight">{label}</span>
          </div>
          <div className="text-right flex items-baseline space-x-1">
            <span className="text-xs font-black text-gray-900">{value}</span>
            <span className="text-[8px] font-bold text-gray-400 uppercase">({percentage}%)</span>
          </div>
        </div>
        <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
          <div 
            className={`h-full ${colorClass} transition-all duration-1000 ease-out`} 
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-white animate-fadeIn">
      {/* Header Fixo */}
      <div className="p-6 bg-white border-b border-gray-100 sticky top-0 z-20 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <button onClick={onBack} className="p-2.5 bg-gray-50 rounded-2xl text-gray-400 active:scale-90 transition-all">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h2 className="text-xl font-black text-gray-900 uppercase leading-none">Relatórios</h2>
            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mt-1">Visão Consolidada</p>
          </div>
        </div>
        <div className="w-12 h-12 bg-blue-600 rounded-[1.2rem] flex items-center justify-center text-white shadow-xl shadow-blue-100">
          <BarChart3 size={24} />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-8 no-scrollbar pb-32">
        
        {/* Seção 1: Progresso do Inventário */}
        <section className="bg-gray-50 rounded-[3rem] p-8 border border-gray-100 shadow-inner flex flex-col items-center">
          <div className="w-full flex items-center justify-between mb-8">
            <div className="flex items-center space-x-2">
              <TrendingUp size={18} className="text-blue-600" />
              <h3 className="text-[10px] font-black text-gray-900 uppercase tracking-[0.2em]">Status da Conferência</h3>
            </div>
            <div className="text-right">
              <span className="text-[10px] font-black text-gray-400 uppercase">Total de Itens</span>
              <p className="text-xl font-black text-blue-600 leading-none">{stats.total}</p>
            </div>
          </div>
          
          <ProgressDonut percentage={stats.percConferido} />
          
          <div className="grid grid-cols-2 gap-4 w-full mt-10">
            <div className="bg-white p-5 rounded-[1.8rem] border border-gray-200 shadow-sm flex items-center space-x-4">
              <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center shadow-inner">
                <CheckCircle2 size={24} />
              </div>
              <div>
                <span className="block text-xl font-black text-gray-900 leading-none">{stats.conferido}</span>
                <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest mt-1">Conferidos</span>
              </div>
            </div>
            <div className="bg-white p-5 rounded-[1.8rem] border border-gray-200 shadow-sm flex items-center space-x-4">
              <div className="w-12 h-12 bg-amber-50 text-amber-500 rounded-2xl flex items-center justify-center shadow-inner">
                <Clock size={24} />
              </div>
              <div>
                <span className="block text-xl font-black text-gray-900 leading-none">{stats.pendente}</span>
                <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest mt-1">Pendentes</span>
              </div>
            </div>
          </div>
        </section>

        {/* Seção 2: Distribuição por Tags */}
        <section className="space-y-6">
          <div className="flex items-center space-x-2 px-2">
            <Target size={18} className="text-indigo-600" />
            <h3 className="text-[10px] font-black text-gray-900 uppercase tracking-[0.2em]">Distribuição por Tags</h3>
          </div>

          <div className="bg-white border border-gray-100 rounded-[3rem] p-8 shadow-xl shadow-gray-100 space-y-6">
            <StatBar 
              label="Índices Únicos" 
              value={stats.unico} 
              total={stats.total} 
              colorClass="bg-emerald-500" 
              icon={CheckCircle2} 
            />
            <StatBar 
              label="Duplicidade Interna" 
              value={stats.dupInterna} 
              total={stats.total} 
              colorClass="bg-red-500" 
              icon={AlertTriangle} 
            />
            <StatBar 
              label="Duplicidade Externa" 
              value={stats.dupExterna} 
              total={stats.total} 
              colorClass="bg-orange-500" 
              icon={TrendingUp} 
            />
            <StatBar 
              label="Com Plaqueta Física" 
              value={stats.comPlaqueta} 
              total={stats.total} 
              colorClass="bg-indigo-600" 
              icon={Hash} 
            />
            <StatBar 
              label="Sem Plaqueta Física" 
              value={stats.semPlaqueta} 
              total={stats.total} 
              colorClass="bg-purple-600" 
              icon={FileWarning} 
            />
          </div>
        </section>

      </div>

      {/* Footer Branding */}
      <div className="p-8 bg-gray-50 border-t border-gray-100 flex flex-col items-center">
        <p className="text-[9px] font-black text-gray-300 uppercase tracking-[0.5em] mb-2">GBR Inteligência Patrimonial</p>
        <div className="h-1 w-12 bg-gray-200 rounded-full"></div>
      </div>
    </div>
  );
};

export default Dashboard;
