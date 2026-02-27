
import React, { useMemo, useState } from 'react';
import { Asset, TagInventario } from '../types';
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
  Download,
  Info,
  X,
  Palette
} from 'lucide-react';

const DASHBOARD_HINTS: Record<string, string> = {
  'Falta Etiquetar': 'Ativos marcados com "ETIQUETAR" na planilha original. Necessário aplicar plaqueta física em campo.',
  'Etiquetado': 'Itens que eram marcados como "ETIQUETAR" e foram conferidos e devidamente plaqueteados durante o inventário.',
  'Registros Ativos': 'Total de itens com status ATIVO na base master selecionada.',
  'Registros Baixados': 'Itens que possuem status de BAIXADO no contábil. Auditoria rigorosa recomendada.',
  'Plaquetas Únicas': 'Registros que possuem um número de etiqueta exclusivo na base carregada.',
  'Etiqueta+1Registro': 'ALERTA DE INTEGRIDADE: Existem registros diferentes compartilhando o mesmo número de etiqueta na planilha.',
  'Com Plaqueta Física': 'Total de itens que possuem alguma identificação numérica (exceto marcadores temporários).',
  'Sem Identificação': 'Ativos carregados sem nenhum número de patrimônio vinculado no sistema de origem.'
};

interface DashboardProps {
  assets: Asset[];
  onBack: () => void;
}

const Dashboard: React.FC<DashboardProps> = ({ assets, onBack }) => {
  const [hintOverlay, setHintOverlay] = useState<{label: string, text: string} | null>(null);

  const stats = useMemo(() => {
    const getStatus = (a: Asset) => String(a.STATUS || a.SITUACAO || '').toUpperCase();
    
    // Filtrar ativos para o progresso principal (ignorar baixados)
    const activeAssets = assets.filter(a => !getStatus(a).includes('BAIXADO'));
    
    const total = activeAssets.length;
    const conferido = activeAssets.filter(a => !!a._conferido).length;
    const pendente = total - conferido;
    const percConferido = total > 0 ? Math.round((conferido / total) * 100) : 0;

    const countAtivos = assets.filter(a => getStatus(a).includes('ATIVO')).length;
    const countBaixados = assets.filter(a => getStatus(a).includes('BAIXADO')).length;

    const comPlaqueta = assets.filter(a => !!a.ETIQUETA && String(a.ETIQUETA).toUpperCase() !== 'ETIQUETAR').length;
    
    const faltaEtiquetar = assets.filter(a => 
      (String(a.ETIQUETA || '').toUpperCase() === 'ETIQUETAR' || a.TAG_INVENTARIO === TagInventario.FALTA_ETIQUETAR) && !a._conferido
    ).length;

    const jaEtiquetado = assets.filter(a => a.TAG_INVENTARIO === TagInventario.ETIQUETADO).length;
    const divergencia = assets.filter(a => a.TAG_INVENTARIO === TagInventario.DIVERGENCIA).length;

    const semPlaqueta = total - comPlaqueta - faltaEtiquetar - jaEtiquetado;
    
    const unico = assets.filter(a => a.TAG_DUPLICIDADE === 'ÚNICO').length;
    const dupInterna = assets.filter(a => a.TAG_DUPLICIDADE === 'ETIQUETA+1REGISTRO').length;
    const dupExterna = assets.filter(a => a.TAG_DUPLICIDADE === 'DUPLICIDADE EXTERNA').length;
    
    const semId = assets.filter(a => 
      a.TAG_DUPLICIDADE === 'SEM IDENTIFICAÇÃO' && 
      String(a.ETIQUETA || '').toUpperCase() !== 'ETIQUETAR' &&
      !!String(a.ETIQUETA || '').trim() === false
    ).length;

    return {
      total,
      conferido,
      pendente,
      percConferido,
      comPlaqueta,
      faltaEtiquetar,
      jaEtiquetado,
      semPlaqueta,
      unico,
      dupInterna,
      dupExterna,
      semId,
      countAtivos,
      countBaixados,
      divergencia
    };
  }, [assets]);

  const exportFilteredData = (filterFn: (a: Asset) => boolean, fileName: string) => {
    const filtered = assets.filter(filterFn);
    if (filtered.length === 0) return;

    const wsData = filtered.map(a => {
      const res: { [key: string]: string | number | boolean | null | undefined } = {};
      Object.keys(a).forEach(k => { if (!k.startsWith('_') && k !== 'id') res[k] = a[k] as string | number | boolean | null | undefined; });
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

  const StatBar = ({ label, value, total, colorClass, icon: Icon, onClick }: { label: string; value: number; total: number; colorClass: string; icon: React.ElementType; onClick: () => void }) => {
    const percentage = total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0;
    
    const handleHintTrigger = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (DASHBOARD_HINTS[label]) {
        setHintOverlay({ label, text: DASHBOARD_HINTS[label] });
      }
    };

    return (
      <div className="w-full relative group p-2 -mx-2 rounded-xl hover:bg-slate-50 transition-all border border-transparent hover:border-slate-100">
        <div className="flex justify-between items-center mb-2">
          <div className="flex items-center space-x-2.5">
            <button 
              onClick={handleHintTrigger}
              className={`p-1.5 rounded-lg ${colorClass} bg-opacity-10 text-opacity-100 flex items-center justify-center active:scale-90 shadow-sm`}
            >
              <Icon size={12} className={colorClass.replace('bg-', 'text-')} />
            </button>
            <div className="flex items-center space-x-1.5" onClick={onClick}>
              <span className="text-[10px] font-bold text-slate-600 uppercase tracking-widest cursor-pointer">{label}</span>
              {DASHBOARD_HINTS[label] && <Info size={10} className="text-slate-300 group-hover:text-blue-500 transition-colors" />}
            </div>
          </div>
          <div className="text-right flex items-center space-x-2" onClick={onClick}>
            <div className="flex items-baseline space-x-1">
              <span className="text-xs font-bold text-slate-900">{value}</span>
              <span className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter">({percentage}%)</span>
            </div>
            <Download size={10} className="text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        </div>
        <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden cursor-pointer shadow-inner" onClick={onClick}>
          <div className={`h-full ${colorClass} transition-all duration-1000 ease-out shadow-sm`} style={{ width: `${percentage}%` }} />
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-bg-main animate-fadeIn overflow-hidden">
      <div className="p-4 bg-white border-b border-slate-200 flex items-center justify-between shadow-sm z-20">
        <div className="flex items-center space-x-3">
          <button onClick={onBack} className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-400 active:scale-90 transition-all shadow-sm hover:bg-white hover:text-slate-900">
            <ArrowLeft size={18} />
          </button>
          <div>
            <h2 className="text-lg font-bold text-slate-900 uppercase tracking-tight">Relatórios</h2>
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Analytics Precision v24</p>
          </div>
        </div>
        <div className="w-10 h-10 bg-blue-50 border border-blue-100 rounded-xl flex items-center justify-center text-blue-600 shadow-sm">
          <BarChart3 size={20} />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar pb-28">
        
        {/* PROGRESSO DA AUDITORIA */}
        <section className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex flex-col items-center modern-card">
          <div className="w-full flex items-center justify-between mb-6">
            <div className="flex items-center space-x-2.5">
              <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center text-blue-600">
                <TrendingUp size={16} />
              </div>
              <h3 className="text-[10px] font-bold text-slate-900 uppercase tracking-widest">Eficiência</h3>
            </div>
            <div className="text-right">
              <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">Conclusão</span>
              <p className="text-xl font-bold text-blue-600 leading-none mt-0.5">{stats.percConferido}%</p>
            </div>
          </div>
          
          <div className="relative w-32 h-32 flex items-center justify-center mb-6">
             <svg viewBox="0 0 36 36" className="w-full h-full transform -rotate-90">
                <circle cx="18" cy="18" r="16" fill="none" stroke="#F1F5F9" strokeWidth="3.5" />
                <circle cx="18" cy="18" r="16" fill="none" stroke="#10B981" strokeWidth="3.5" strokeDasharray="100" strokeDashoffset={100 - stats.percConferido} strokeLinecap="round" className="transition-all duration-1000" />
             </svg>
             <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-3xl font-bold text-slate-900 tracking-tighter">{stats.conferido}</span>
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-[0.1em]">Auditados</span>
             </div>
          </div>
          
          <div className="grid grid-cols-2 gap-3 w-full">
            <button 
              onClick={() => exportFilteredData(a => !!a._conferido, 'ITENS_CONFERIDOS')}
              className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-center active:scale-95 transition-all shadow-sm"
            >
               <span className="block text-lg font-bold text-slate-900 leading-none mb-1">{stats.conferido}</span>
               <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">Conferidos</span>
            </button>
            <button 
              onClick={() => exportFilteredData(a => !a._conferido, 'ITENS_PENDENTES')}
              className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-center active:scale-95 transition-all shadow-sm"
            >
               <span className="block text-lg font-bold text-slate-900 leading-none mb-1">{stats.pendente}</span>
               <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">Pendentes</span>
            </button>
          </div>
        </section>

        {/* RESUMO DE SITUAÇÃO */}
        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden modern-card">
          <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center space-x-2.5">
            <LayoutList size={16} className="text-blue-600" />
            <h3 className="text-[10px] font-bold text-slate-900 uppercase tracking-widest">Resumo</h3>
          </div>
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="px-4 py-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Status</th>
                <th className="px-4 py-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              <tr 
                className="border-b border-slate-50 group hover:bg-slate-50 transition-colors cursor-pointer"
                onClick={() => exportFilteredData(a => String(a.STATUS || '').toUpperCase().includes('ATIVO'), 'ATIVOS')}
              >
                <td className="px-4 py-3">
                  <div className="flex items-center space-x-2.5">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-sm shadow-emerald-200"></div>
                    <span className="text-xs font-bold text-slate-700 uppercase tracking-tight">ATIVO</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end space-x-2">
                    <span className="font-mono font-bold text-slate-900 text-sm">{stats.countAtivos}</span>
                    <Download size={12} className="text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </td>
              </tr>
              <tr 
                className="border-b border-slate-50 group hover:bg-slate-50 transition-colors cursor-pointer"
                onClick={() => exportFilteredData(a => String(a.STATUS || '').toUpperCase().includes('BAIXADO'), 'BAIXADOS')}
              >
                <td className="px-4 py-3">
                  <div className="flex items-center space-x-2.5">
                    <div className="w-2 h-2 rounded-full bg-red-500 shadow-sm shadow-red-200"></div>
                    <span className="text-xs font-bold text-slate-700 uppercase tracking-tight">BAIXADO</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-right">
                   <div className="flex items-center justify-end space-x-2">
                    <span className="font-mono font-bold text-slate-900 text-sm">{stats.countBaixados}</span>
                    <Download size={12} className="text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </td>
              </tr>
              <tr className="bg-blue-50/50">
                <td className="px-4 py-3">
                  <span className="text-xs font-bold text-blue-700 uppercase tracking-tight">TOTAL GERAL</span>
                </td>
                <td className="px-4 py-3 text-right font-mono font-bold text-blue-700 text-sm">{stats.total}</td>
              </tr>
            </tbody>
          </table>
        </section>

        {/* DISTRIBUIÇÃO POR TAGS INTERATIVA */}
        <section className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4 modern-card">
          <div className="flex items-center space-x-2.5 mb-1">
            <div className="w-8 h-8 bg-indigo-50 rounded-lg flex items-center justify-center text-indigo-600">
              <Target size={16} />
            </div>
            <h3 className="text-[10px] font-bold text-slate-900 uppercase tracking-widest">Distribuição por Tags</h3>
          </div>
          
          <StatBar 
            label="Falta Etiquetar" 
            value={stats.faltaEtiquetar} 
            total={stats.total} 
            colorClass="bg-amber-500" 
            icon={AlertTriangle} 
            onClick={() => exportFilteredData(a => (String(a.ETIQUETA || '').toUpperCase() === 'ETIQUETAR' || a.TAG_INVENTARIO === "FALTA ETIQUETAR") && !a._conferido, 'FALTA_ETIQUETAR')}
          />

          <StatBar 
            label="Etiquetado" 
            value={stats.jaEtiquetado} 
            total={stats.total} 
            colorClass="bg-violet-600" 
            icon={Palette} 
            onClick={() => exportFilteredData(a => a.TAG_INVENTARIO === TagInventario.ETIQUETADO, 'ETIQUETADOS_EM_CAMPO')}
          />

          <StatBar 
            label="Divergência" 
            value={stats.divergencia} 
            total={stats.total} 
            colorClass="bg-orange-600" 
            icon={AlertTriangle} 
            onClick={() => exportFilteredData(a => a.TAG_INVENTARIO === TagInventario.DIVERGENCIA, 'DIVERGENCIAS_PLAQUETA')}
          />

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
              label="Etiqueta+1Registro" 
              value={stats.dupInterna} 
              total={stats.total} 
              colorClass="bg-amber-500" 
              icon={ShieldAlert} 
              onClick={() => exportFilteredData(a => a.TAG_DUPLICIDADE === 'ETIQUETA+1REGISTRO', 'ETIQUETA_MAIS_UM_REGISTRO')}
            />
            <StatBar 
              label="Com Plaqueta Física" 
              value={stats.comPlaqueta} 
              total={stats.total} 
              colorClass="bg-blue-600" 
              icon={Hash} 
              onClick={() => exportFilteredData(a => !!a.ETIQUETA && String(a.ETIQUETA).toUpperCase() !== 'ETIQUETAR', 'COM_PLAQUETA')}
            />
            <StatBar 
              label="Sem Identificação" 
              value={stats.semId + stats.semPlaqueta} 
              total={stats.total} 
              colorClass="bg-purple-600" 
              icon={FileWarning} 
              onClick={() => exportFilteredData(a => (a.TAG_DUPLICIDADE === 'SEM IDENTIFICAÇÃO' && String(a.ETIQUETA || '').toUpperCase() !== 'ETIQUETAR') || !a.ETIQUETA, 'SEM_IDENTIFICACAO')}
            />
          </div>
        </section>
      </div>

      {/* OVERLAY EXPLICATIVO (HINT) */}
      {hintOverlay && (
        <div 
          className="fixed inset-0 z-[500] bg-slate-900/40 backdrop-blur-md flex items-center justify-center p-8 animate-fadeIn"
          onClick={() => setHintOverlay(null)}
        >
          <div 
            className="bg-white w-full max-w-sm rounded-[2.5rem] p-10 shadow-2xl animate-slideUp relative overflow-hidden modern-card"
            onClick={e => e.stopPropagation()}
          >
            <div className="absolute top-0 left-0 w-full h-2.5 bg-sky-600" />
            <button 
              onClick={() => setHintOverlay(null)}
              className="absolute top-8 right-8 p-3 bg-slate-50 border border-slate-200 rounded-2xl text-slate-400 active:scale-90 shadow-sm"
            >
              <X size={20} />
            </button>
            
            <div className="flex flex-col items-center text-center mb-8">
              <div className="w-20 h-20 bg-sky-50 rounded-[2rem] flex items-center justify-center text-sky-600 mb-6 border border-sky-100 shadow-sm">
                <Info size={36} />
              </div>
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-[0.3em] mb-2">Critério de Auditoria</span>
              <h3 className="text-2xl font-bold text-slate-900 uppercase tracking-tight">{hintOverlay.label}</h3>
            </div>

            <p className="text-sm font-medium text-slate-600 leading-relaxed text-center italic px-2">
              &quot;{hintOverlay.text}&quot;
            </p>

            <div className="mt-10 pt-8 border-t border-slate-100 flex justify-center">
              <button 
                onClick={() => setHintOverlay(null)}
                className="w-full py-5 bg-slate-900 text-white rounded-2xl text-[11px] font-bold uppercase tracking-[0.2em] active:scale-95 shadow-lg"
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
