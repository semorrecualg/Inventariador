
import React, { useMemo, useState } from 'react';
import { Asset } from '../types';
import BackButton from './BackButton';
import { 
  ChevronLeft, 
  ChevronRight, 
  Calendar, 
  TrendingUp, 
  CheckCircle2, 
  Clock, 
  BarChart3,
} from 'lucide-react';

interface GlobalPerformanceProps {
  assets: Asset[];
  onBack: () => void;
}

const GlobalPerformance: React.FC<GlobalPerformanceProps> = ({ assets, onBack }) => {
  const [currentDate, setCurrentDate] = useState(new Date());

  const { readingsByDate, stats } = useMemo(() => {
    const groups: Record<string, number> = {};
    const s = {
      total: assets.length,
      checked: 0,
      todayCount: 0
    };
    const todayStr = new Date().toLocaleDateString('en-CA');

    for (let i = 0; i < assets.length; i++) {
      const a = assets[i];
      const isConferido = !!a._conferido || String(a.AUDITOR_STATUS_CONFERENCIA || '').toUpperCase() === 'SIM';
      if (isConferido) {
        s.checked++;
        if (a._dataLeitura) {
          const date = new Date(a._dataLeitura).toLocaleDateString('en-CA');
          groups[date] = (groups[date] || 0) + 1;
          if (date === todayStr) s.todayCount++;
        }
      }
    }

    return { 
      readingsByDate: groups, 
      stats: { 
        ...s, 
        percentage: s.total > 0 ? Math.round((s.checked / s.total) * 100) : 0 
      } 
    };
  }, [assets]);

  // Lógica do Calendário
  const daysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();

  const calendarDays = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const days = daysInMonth(year, month);
    const firstDay = firstDayOfMonth(year, month);
    
    const result = [];
    // Espaços vazios para o início do mês
    for (let i = 0; i < firstDay; i++) {
      result.push(null);
    }
    // Dias do mês
    for (let i = 1; i <= days; i++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
      result.push({
        day: i,
        date: dateStr,
        count: readingsByDate[dateStr] || 0
      });
    }
    return result;
  }, [currentDate, readingsByDate]);

  const monthName = currentDate.toLocaleString('pt-BR', { month: 'long', year: 'numeric' });

  const nextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  const prevMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));

  return (
    <div className="h-[100dvh] flex flex-col bg-bg-main overflow-hidden">
      {/* Header */}
      <div className="bg-white px-6 pt-12 pb-6 border-b border-slate-200 shadow-sm shrink-0">
        <div className="flex items-center justify-between mb-4">
          <BackButton onClick={onBack} label="Voltar" subLabel="Análise de Rendimento" />
          <div className="w-10" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-accent p-4 rounded-2xl text-white shadow-lg shadow-accent/20">
            <div className="flex items-center space-x-2 mb-1 opacity-80">
              <CheckCircle2 size={12} />
              <span className="text-[8px] font-black uppercase tracking-widest">Total Geral</span>
            </div>
            <div className="flex items-baseline space-x-1">
              <span className="text-2xl font-black tracking-tighter">{stats.checked}</span>
              <span className="text-[10px] font-bold opacity-60">/ {stats.total}</span>
            </div>
          </div>
          <div className="bg-accent p-4 rounded-2xl text-white shadow-lg shadow-accent/20">
            <div className="flex items-center space-x-2 mb-1 opacity-80">
              <TrendingUp size={12} />
              <span className="text-[8px] font-black uppercase tracking-widest">Progresso</span>
            </div>
            <div className="flex items-baseline space-x-1">
              <span className="text-2xl font-black tracking-tighter">{stats.percentage}%</span>
              <span className="text-[10px] font-bold opacity-60">Concluído</span>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Calendário */}
        <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <h2 className="text-xs font-black text-slate-900 uppercase tracking-widest flex items-center space-x-2">
              <Calendar size={16} className="text-blue-600" />
              <span>{monthName}</span>
            </h2>
            <div className="flex space-x-2">
              <button onClick={prevMonth} className="p-2 bg-white border border-slate-200 rounded-xl text-slate-400 active:scale-90 transition-all">
                <ChevronLeft size={16} />
              </button>
              <button onClick={nextMonth} className="p-2 bg-white border border-slate-200 rounded-xl text-slate-400 active:scale-90 transition-all">
                <ChevronRight size={16} />
              </button>
            </div>
          </div>

          <div className="p-4">
            <div className="grid grid-cols-7 mb-2">
              {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((d, i) => (
                <div key={i} className="text-center text-[9px] font-black text-slate-400 uppercase py-2">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {calendarDays.map((day, i) => (
                <div key={i} className={`aspect-square rounded-xl flex flex-col items-center justify-center relative border ${
                  day ? 'bg-white border-slate-100' : 'bg-transparent border-transparent'
                }`}>
                  {day && (
                    <>
                      <span className={`text-[10px] font-bold ${day.count > 0 ? 'text-accent' : 'text-slate-400'}`}>
                        {day.day}
                      </span>
                      {day.count > 0 && (
                        <div className="mt-1 px-1.5 py-0.5 bg-accent-soft text-accent rounded-md text-[7px] font-black">
                          {day.count}
                        </div>
                      )}
                      {day.date === new Date().toLocaleDateString('en-CA') && (
                        <div className="absolute top-1 right-1 w-1.5 h-1.5 bg-accent rounded-full border border-white" />
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Resumo do Dia Selecionado ou Hoje */}
        <div className="p-6 bg-accent rounded-[2.5rem] text-white shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 p-8 opacity-10">
            <BarChart3 size={120} />
          </div>
          
          <div className="relative z-10">
            <div className="flex items-center space-x-3 mb-6">
              <div className="p-3 bg-white/20 rounded-2xl">
                <Clock size={24} className="text-white" />
              </div>
              <div>
                <h3 className="text-sm font-black uppercase tracking-tight">Atividade de Hoje</h3>
                <p className="text-[9px] font-bold text-white/50 uppercase tracking-widest">Tempo Real</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div>
                <p className="text-[8px] font-black text-white/40 uppercase tracking-widest mb-1">Itens Processados</p>
                <p className="text-3xl font-black text-white">{stats.todayCount}</p>
              </div>
              <div>
                <p className="text-[8px] font-black text-white/40 uppercase tracking-widest mb-1">Status</p>
                <p className="text-xs font-bold text-white/80">
                  {stats.todayCount > 0 ? 'Produtividade Ativa' : 'Aguardando Início'}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="p-6 bg-accent-soft rounded-[2.5rem] border border-accent/10 text-center">
          <p className="text-[10px] font-bold text-accent uppercase leading-relaxed italic">
            &quot;A visão macro permite entender o ritmo do projeto e antecipar prazos.&quot;
          </p>
        </div>
      </div>
    </div>
  );
};

export default GlobalPerformance;
