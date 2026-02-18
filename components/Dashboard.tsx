
import React, { useMemo } from 'react';
import { Asset } from '../types';
import * as XLSX from 'xlsx';
import { 
  BarChart3, 
  ArrowLeft, 
  CheckCircle2, 
  AlertTriangle, 
  FileWarning, 
  TrendingUp, 
  Target,
  Hash,
  ShieldAlert,
  Activity,
  History,
  LayoutList,
  Download
} from 'lucide-react';

interface DashboardProps {
  assets: Asset[];
  onBack: () => void;
}

const Dashboard: React.FC<DashboardProps> = ({ assets, onBack }) => {
  const stats = useMemo(() => {
    const total = assets.length;
    const conferido = assets.filter(a => !!a._conferido).length;
    const pendente = total - conferido;
    const percConferido = total > 0 ? Math.round((conferido / total) * 100) : 0;

    const getStatus = (a: Asset) => String(a.STATUS || a.SITUACAO || '').toUpperCase();

    const countAtivos = assets.filter(a => getStatus(a).includes('ATIVO')).length;
    const countBaixados = assets.filter(a => getStatus(a).includes('BAIXADO')).length;

    const comPlaqueta = assets.filter(a => !!a.ETIQUETA).length;
    const semPlaqueta = total - comPlaqueta;
    
    const unico = assets.filter(a => a.TAG_DUPLICIDADE === 'ÚNICO').length;
    const dupInterna = assets.filter(a => a.TAG_DUPLICIDADE === 'DUPLICIDADE INTERNA').length;
    const dupExterna = assets.filter(a => a.TAG_DUPLICIDADE === 'DUPLICIDADE EXTERNA').length;
    const semId = assets.filter(a => a.TAG_DUPLICIDADE === 'SEM IDENTIFICAÇÃO').length;

    return {
      total,
      conferido,
      pendente,
      percConferido,
      comPlaqueta,
      semPlaqueta,
      unico,
      dupInterna,
      dupExterna,
      semId,
      countAtivos,
      countBaixados
    };
  }, [assets]);

  const exportFilteredData = (filterFn: (a: Asset) => boolean, fileName: string) => {
    const filtered = assets.filter(filterFn);
    if (filtered.length === 0) return;

    const wsData = filtered.map(a => {
      const res: any = {};
      Object.keys(a).forEach(k => { if (!k.startsWith('_') && k !== 'id') res[k] = a[k]; });
      res['AUDITOR_LOCAL_AUDITADO'] = a._localMaster || a.ENDERECO;
      res['AUDITOR_STATUS_CONFERENCIA'] = a._conferido ? 'SIM' : 'NAO';
      res['AUDITOR_TAG_REGRA_OURO'] = a.TAG_INVENTARIO || 'PENDENTE';
      res['AUDITOR_DUPLICIDADE'] = a.TAG_DUPLICIDADE || 'NAO ANALISADO';
      return res;
    });

    const ws = XLSX.utils.json_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "GBR_AUDIT");
    XLSX.writeFile(wb, `GBR_${fileName}_${new Date().getTime()}.xlsx`);
  };

  const StatBar = ({ label, value, total, colorClass, icon: Icon, onClick }: any) => {
    const percentage = total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0;
    return (
      <button 
        onClick={onClick}
        className="w-full text-left space-y-2 group active:scale-[0.98] transition-all p-2 -mx-2 rounded-xl hover:bg-slate-50"
      >
        <div className="flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <div className={`p-1.5 rounded-lg ${colorClass} bg-opacity-10 text-opacity-100`}>
              <Icon size={12} className={colorClass.replace('bg-', 'text-')} />
            </div>
            <span className="text-[10px] font-black text-slate-600 uppercase tracking-tight">{label}</span>
          </div>
          <div className="text-right flex items-center space-x-2">
            <div className="flex items-baseline space-x-1">
              <span className="text-xs font-black text-slate-900">{value}</span>
              <span className="text-[8px] font-bold text-slate-400 uppercase">({percentage}%)</span>
            </div>
            <Download size={10} className="text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        </div>
        <div className="h-1.5 w-full bg-slate-50 rounded-full overflow-hidden">
          <div className={`h-full ${colorClass} transition-all duration-1000 ease-out`} style={{ width: `${percentage}%` }} />
        </div>
      </button>
    );
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 animate-fadeIn overflow-hidden">
      <div className="p-6 bg-white border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <button onClick={onBack} className="p-2.5 bg-slate-50 rounded-2xl text-slate-400 active:scale-90 transition-all"><ArrowLeft size={20} /></button>
          <div>
            <h2 className="text-xl font-black text-slate-900 uppercase leading-none">Relatórios</h2>
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-1">Analytics Precision v20</p>
          </div>
        </div>
        <div className="w-12 h-12 bg-blue-600 rounded-[1.2rem] flex items-center justify-center text-white shadow-xl shadow-blue-100"><BarChart3 size={24} /></div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6 no-scrollbar pb-32">
        
        {/* RESUMO DE SITUAÇÃO */}
        <section className="bg-white rounded-[2rem] border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex items-center space-x-2">
            <LayoutList size={16} className="text-blue-600" />
            <h3 className="text-[10px] font-black text-slate-900 uppercase tracking-widest">Resumo de Situação</h3>
          </div>
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-50">
                <th className="px-6 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                <th className="px-6 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              <tr 
                className="border-b border-slate-50 group hover:bg-slate-50 transition-colors cursor-pointer"
                onClick={() => exportFilteredData(a => String(a.STATUS || '').toUpperCase().includes('ATIVO'), 'ATIVOS')}
              >
                <td className="px-6 py-4">
                  <div className="flex items-center space-x-2">
                    <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                    <span className="text-xs font-black text-slate-900 uppercase">ATIVO</span>
                  </div>
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex items-center justify-end space-x-2">
                    <span className="font-mono font-black text-slate-900">{stats.countAtivos}</span>
                    <Download size={10} className="text-slate-300 opacity-0 group-hover:opacity-100" />
                  </div>
                </td>
              </tr>
              <tr 
                className="border-b border-slate-50 group hover:bg-slate-50 transition-colors cursor-pointer"
                onClick={() => exportFilteredData(a => String(a.STATUS || '').toUpperCase().includes('BAIXADO'), 'BAIXADOS')}
              >
                <td className="px-6 py-4">
                  <div className="flex items-center space-x-2">
                    <div className="w-2 h-2 rounded-full bg-red-500"></div>
                    <span className="text-xs font-black text-slate-900 uppercase">BAIXADO</span>
                  </div>
                </td>
                <td className="px-6 py-4 text-right">
                   <div className="flex items-center justify-end space-x-2">
                    <span className="font-mono font-black text-slate-900">{stats.countBaixados}</span>
                    <Download size={10} className="text-slate-300 opacity-0 group-hover:opacity-100" />
                  </div>
                </td>
              </tr>
              <tr className="bg-blue-50/30">
                <td className="px-6 py-4">
                  <span className="text-xs font-black text-blue-600 uppercase">TOTAL GERAL</span>
                </td>
                <td className="px-6 py-4 text-right font-mono font-black text-blue-600">{stats.total}</td>
              </tr>
            </tbody>
          </table>
        </section>

        {/* DISTRIBUIÇÃO POR TAGS INTERATIVA */}
        <section className="bg-white border border-slate-100 rounded-[2rem] p-8 shadow-sm space-y-6">
          <div className="flex items-center space-x-2 mb-2">
            <Target size={18} className="text-indigo-600" />
            <h3 className="text-[10px] font-black text-slate-900 uppercase tracking-widest">Distribuição por Tags</h3>
          </div>
          
          <StatBar 
            label="Registros Ativos" 
            value={stats.countAtivos} 
            total={stats.total} 
            colorClass="bg-emerald-500" 
            icon={Activity} 
            onClick={() => exportFilteredData(a => String(a.STATUS || '').toUpperCase().includes('ATIVO'), 'ATIVOS')}
          />
          <StatBar 
            label="Registros Baixados" 
            value={stats.countBaixados} 
            total={stats.total} 
            colorClass="bg-red-500" 
            icon={History} 
            onClick={() => exportFilteredData(a => String(a.STATUS || '').toUpperCase().includes('BAIXADO'), 'BAIXADOS')}
          />
          <div className="pt-4 border-t border-slate-50 space-y-6">
            <StatBar 
              label="Plaquetas Únicas" 
              value={stats.unico} 
              total={stats.total} 
              colorClass="bg-indigo-600" 
              icon={CheckCircle2} 
              onClick={() => exportFilteredData(a => a.TAG_DUPLICIDADE === 'ÚNICO', 'PLAQUETAS_UNICAS')}
            />
            <StatBar 
              label="Duplicidade Interna" 
              value={stats.dupInterna} 
              total={stats.total} 
              colorClass="bg-amber-500" 
              icon={ShieldAlert} 
              onClick={() => exportFilteredData(a => a.TAG_DUPLICIDADE === 'DUPLICIDADE INTERNA', 'DUPLICIDADE_INTERNA')}
            />
            <StatBar 
              label="Com Plaqueta Física" 
              value={stats.comPlaqueta} 
              total={stats.total} 
              colorClass="bg-blue-600" 
              icon={Hash} 
              onClick={() => exportFilteredData(a => !!a.ETIQUETA, 'COM_PLAQUETA')}
            />
            <StatBar 
              label="Sem Identificação" 
              value={stats.semId + stats.semPlaqueta} 
              total={stats.total} 
              colorClass="bg-purple-600" 
              icon={FileWarning} 
              onClick={() => exportFilteredData(a => a.TAG_DUPLICIDADE === 'SEM IDENTIFICAÇÃO' || !a.ETIQUETA, 'SEM_IDENTIFICACAO')}
            />
          </div>
        </section>

        {/* PROGRESSO DA AUDITORIA */}
        <section className="bg-white rounded-[2rem] p-8 border border-slate-100 shadow-sm flex flex-col items-center">
          <div className="w-full flex items-center justify-between mb-8">
            <div className="flex items-center space-x-2">
              <TrendingUp size={18} className="text-blue-600" />
              <h3 className="text-[10px] font-black text-slate-900 uppercase tracking-widest">Eficiência Auditada</h3>
            </div>
            <div className="text-right">
              <span className="text-[9px] font-black text-slate-400 uppercase">Taxa de Conclusão</span>
              <p className="text-xl font-black text-blue-600 leading-none">{stats.percConferido}%</p>
            </div>
          </div>
          
          <div className="relative w-40 h-40 flex items-center justify-center mb-6">
             <svg viewBox="0 0 36 36" className="w-full h-full transform -rotate-90">
                <circle cx="18" cy="18" r="16" fill="none" stroke="#f1f5f9" strokeWidth="4" />
                <circle cx="18" cy="18" r="16" fill="none" stroke="#10b981" strokeWidth="4" strokeDasharray="100" strokeDashoffset={100 - stats.percConferido} strokeLinecap="round" className="transition-all duration-1000" />
             </svg>
             <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-3xl font-black text-slate-900">{stats.conferido}</span>
                <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Auditados</span>
             </div>
          </div>
          
          <div className="grid grid-cols-2 gap-3 w-full">
            <button 
              onClick={() => exportFilteredData(a => !!a._conferido, 'ITENS_CONFERIDOS')}
              className="bg-slate-50 p-4 rounded-2xl border border-slate-100 text-center active:scale-95 transition-all"
            >
               <span className="block text-lg font-black text-slate-900 leading-none">{stats.conferido}</span>
               <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Baixar Conferidos</span>
            </button>
            <button 
              onClick={() => exportFilteredData(a => !a._conferido, 'ITENS_PENDENTES')}
              className="bg-slate-50 p-4 rounded-2xl border border-slate-100 text-center active:scale-95 transition-all"
            >
               <span className="block text-lg font-black text-slate-900 leading-none">{stats.pendente}</span>
               <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Baixar Pendentes</span>
            </button>
          </div>
        </section>
      </div>
    </div>
  );
};

export default Dashboard;
