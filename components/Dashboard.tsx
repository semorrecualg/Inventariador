
import React, { useMemo, useState } from 'react';
import { Asset, TagInventario } from '../types';
import * as XLSX from 'xlsx';
import BackButton from './BackButton';
import { 
  BarChart3, 
  CheckCircle2, 
  AlertTriangle, 
  TrendingUp, 
  ShieldAlert,
  Activity,
  Download,
  Info,
  X,
  Palette,
  MapPin
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
    
    // Base de cálculo para progresso (Ativos + Baixados Localizados)
    const activeAssets = assets.filter(a => !getStatus(a).includes('BAIXADO'));
    const baixadosLocalizados = assets.filter(a => getStatus(a).includes('BAIXADO') && !!a._conferido);
    
    const totalAtivos = activeAssets.length;
    const conferidoAtivos = activeAssets.filter(a => !!a._conferido).length;
    
    const totalConferidoGeral = conferidoAtivos + baixadosLocalizados.length;
    
    const percConferido = totalAtivos > 0 ? Math.round((conferidoAtivos / totalAtivos) * 100) : 0;

    const countAtivos = assets.filter(a => getStatus(a).includes('ATIVO')).length;
    const countBaixados = assets.filter(a => getStatus(a).includes('BAIXADO')).length;

    const comPlaqueta = assets.filter(a => !!a.ETIQUETA && String(a.ETIQUETA).toUpperCase() !== 'ETIQUETAR').length;
    
    const faltaEtiquetar = assets.filter(a => 
      a.TAG_INVENTARIO === TagInventario.FALTA_ETIQUETAR || 
      (String(a._plaquetaMaster || '').toUpperCase() === 'ETIQUETAR' && !a._conferido)
    ).length;

    const jaEtiquetado = assets.filter(a => 
      a.TAG_INVENTARIO === TagInventario.ETIQUETADO ||
      (String(a._plaquetaMaster || '').toUpperCase() === 'ETIQUETAR' && !!a._conferido)
    ).length;
    const divergencia = assets.filter(a => a.TAG_INVENTARIO === TagInventario.DIVERGENCIA).length;
    const novoItem = assets.filter(a => a.TAG_INVENTARIO === TagInventario.NOVO_ITEM).length;
    const adotado = assets.filter(a => a.TAG_INVENTARIO === TagInventario.ADOTADO || a.TAG_INVENTARIO === TagInventario.ADOTADO_EXTERNO).length;
    const readotado = assets.filter(a => a.TAG_INVENTARIO === TagInventario.RE_ADOTADO).length;
    const conferidoOk = assets.filter(a => a.TAG_INVENTARIO === TagInventario.CONFERIDO).length;
    const locChanges = assets.filter(a => a.DE_PARA === 'COM ALTERAÇÃO').length;

    const unico = assets.filter(a => a.TAG_DUPLICIDADE === 'ÚNICO').length;
    const dupInterna = assets.filter(a => a.TAG_DUPLICIDADE === 'ETIQUETA+1REGISTRO').length;
    const dupExterna = assets.filter(a => a.TAG_DUPLICIDADE === 'DUPLICIDADE EXTERNA').length;
    
    const semId = assets.filter(a => 
      a.TAG_DUPLICIDADE === 'SEM IDENTIFICAÇÃO' && 
      String(a.ETIQUETA || '').toUpperCase() !== 'ETIQUETAR' &&
      (!a.ETIQUETA || String(a.ETIQUETA).trim() === "")
    ).length;

    return {
      totalAtivos,
      conferidoAtivos,
      baixadosLocalizados: baixadosLocalizados.length,
      totalConferidoGeral,
      percConferido,
      comPlaqueta,
      faltaEtiquetar,
      jaEtiquetado,
      divergencia,
      novoItem,
      adotado,
      readotado,
      conferidoOk,
      locChanges,
      unico,
      dupInterna,
      dupExterna,
      semId,
      countAtivos,
      countBaixados,
    };
  }, [assets]);

  const exportFilteredData = (filterFn: (a: Asset) => boolean, fileName: string) => {
    const filtered = assets.filter(filterFn);
    if (filtered.length === 0) return;

    const wsData = filtered.map(a => {
      const res: { [key: string]: string | number | boolean | null | undefined } = {};
      
      // Mapeia campos normais (PARA)
      Object.keys(a).forEach(k => { 
        if (!k.startsWith('_') && k !== 'id') {
          const val = a[k];
          const colName = `PARA_${k}`;
          if (Array.isArray(val) || (typeof val === 'object' && val !== null)) {
            res[colName] = JSON.stringify(val);
          } else {
            res[colName] = val as string | number | boolean | null | undefined;
          }
          // Mantém também o nome original para compatibilidade
          res[k] = res[colName];
        }
      });
      
      // Mapeia campos originais (DE)
      const originalValues = a._valoresOriginais;
      if (originalValues) {
        Object.keys(originalValues).forEach(key => {
          const val = originalValues[key];
          const colName = `DE_${key}`;
          if (Array.isArray(val) || (typeof val === 'object' && val !== null)) {
            res[colName] = JSON.stringify(val);
          } else {
            res[colName] = val as string | number | boolean | null | undefined;
          }
        });
      } else {
        // Se não foi alterado, o DE é igual ao PARA
        Object.keys(a).forEach(k => {
          if (!k.startsWith('_') && k !== 'id') {
            res[`DE_${k}`] = a[k] as string | number | boolean | null | undefined;
          }
        });
      }
      
      res['AUDITOR_LOCAL_ORIGINAL'] = a.ENDERECO;
      res['AUDITOR_LOCAL_AUDITADO'] = a._localMaster || a.ENDERECO;
      res['AUDITOR_DE_PARA'] = (a.DE_PARA as string | undefined) || (a._conferido ? (a.ENDERECO === (a._localMaster || a.ENDERECO) ? 'SEM ALTERAÇÃO' : 'COM ALTERAÇÃO') : 'PENDENTE');
      res['AUDITOR_STATUS_CONFERENCIA'] = a._conferido ? 'SIM' : 'NAO';
      res['AUDITOR_TAG_REGRA_OURO'] = (a.TAG_INVENTARIO as string | undefined) || 'PENDENTE';
      res['AUDITOR_DUPLICIDADE'] = (a.TAG_DUPLICIDADE as string | undefined) || 'NAO ANALISADO';
      return res;
    });

    const ws = XLSX.utils.json_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "GBR_AUDIT");
    XLSX.writeFile(wb, `GBR_${fileName}_${new Date().getTime()}.xlsx`);
  };

  const StatCard = ({ label, value, total, colorClass, icon: Icon, onClick }: { label: string; value: number; total: number; colorClass: string; icon: React.ElementType; onClick: () => void }) => {
    const percentage = total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0;
    
    const handleHintTrigger = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (DASHBOARD_HINTS[label]) {
        setHintOverlay({ label, text: DASHBOARD_HINTS[label] });
      }
    };

    return (
      <div 
        onClick={onClick}
        className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm hover:shadow-md transition-all cursor-pointer active:scale-[0.98] group"
      >
        <div className="flex items-center justify-between mb-2">
          <div className={`w-8 h-8 rounded-lg ${colorClass} bg-opacity-10 flex items-center justify-center`}>
            <Icon size={16} className={colorClass.replace('bg-', 'text-')} />
          </div>
          <div className="text-right flex flex-col items-end">
            <div className="flex items-center space-x-1">
              <span className="text-lg font-bold text-slate-900">{value}</span>
              {DASHBOARD_HINTS[label] && (
                <button onClick={handleHintTrigger} className="p-1 text-slate-300 hover:text-blue-500 transition-colors">
                  <Info size={8} />
                </button>
              )}
            </div>
            <p className="text-[7px] font-bold text-slate-400 uppercase tracking-widest">{percentage}%</p>
          </div>
        </div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[8px] font-bold text-slate-500 uppercase tracking-widest">{label}</span>
          <Download size={8} className="text-slate-300 group-hover:text-blue-500 transition-colors" />
        </div>
        <div className="h-1 w-full bg-slate-100 rounded-full overflow-hidden">
          <div className={`h-full ${colorClass} transition-all duration-1000`} style={{ width: `${percentage}%` }} />
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-bg-main animate-fadeIn overflow-hidden">
      <div className="p-4 bg-white border-b border-slate-200 flex items-center justify-between shadow-sm z-20">
        <div className="flex items-center space-x-3">
          <BackButton onClick={onBack} label="Relatórios" subLabel="Analytics Precision V24" />
        </div>
        <div className="w-10 h-10 bg-blue-50 border border-blue-100 rounded-xl flex items-center justify-center text-blue-600 shadow-sm">
          <BarChart3 size={20} />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar pb-24">
        
        {/* BENTO GRID - KPI PRINCIPAIS */}
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 bg-slate-900 rounded-[2rem] p-6 text-white relative overflow-hidden shadow-xl shadow-slate-900/20">
            <div className="absolute top-0 right-0 w-48 h-48 bg-blue-500/10 rounded-full -mr-16 -mt-16 blur-3xl" />
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center space-x-2">
                  <div className="w-8 h-8 bg-white/10 rounded-lg flex items-center justify-center backdrop-blur-md">
                    <TrendingUp size={16} className="text-blue-400" />
                  </div>
                  <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-white/50">Eficiência Global</span>
                </div>
                <div className="bg-emerald-500/20 px-2 py-0.5 rounded-full border border-emerald-500/30">
                  <span className="text-[8px] font-bold text-emerald-400 uppercase tracking-widest">v24.50 PRO</span>
                </div>
              </div>
              
              <div className="flex items-end justify-between">
                <div>
                  <h3 className="text-4xl font-bold tracking-tighter mb-1">{stats.percConferido}%</h3>
                  <p className="text-[9px] font-bold text-white/40 uppercase tracking-widest">Progresso da Base Ativa</p>
                </div>
                <div className="text-right">
                  <span className="text-2xl font-bold text-white/90">{stats.conferidoAtivos}</span>
                  <span className="text-sm font-bold text-white/30 ml-1">/ {stats.totalAtivos}</span>
                </div>
              </div>
              
              <div className="mt-6 h-2 w-full bg-white/10 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-blue-500 to-emerald-500 transition-all duration-1000 ease-out" style={{ width: `${stats.percConferido}%` }} />
              </div>
            </div>
          </div>

          <div 
            onClick={() => exportFilteredData(a => String(a.STATUS || '').toUpperCase().includes('BAIXADO') && !!a._conferido, 'BAIXADOS_LOCALIZADOS')}
            className="bg-white border border-slate-200 rounded-[1.5rem] p-4 shadow-sm active:scale-95 transition-all cursor-pointer group"
          >
            <div className="w-8 h-8 bg-red-50 rounded-lg flex items-center justify-center text-red-600 mb-3 group-hover:bg-red-600 group-hover:text-white transition-colors">
              <AlertTriangle size={16} />
            </div>
            <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest block mb-0.5">Baixados Localizados</span>
            <div className="flex items-baseline space-x-2">
              <span className="text-xl font-bold text-slate-900">{stats.baixadosLocalizados}</span>
              <Download size={10} className="text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </div>

          <div 
            onClick={() => exportFilteredData(a => a.TAG_INVENTARIO === TagInventario.NOVO_ITEM, 'NOVOS_ITENS')}
            className="bg-white border border-slate-200 rounded-[1.5rem] p-4 shadow-sm active:scale-95 transition-all cursor-pointer group"
          >
            <div className="w-8 h-8 bg-orange-50 rounded-lg flex items-center justify-center text-orange-600 mb-3 group-hover:bg-orange-600 group-hover:text-white transition-colors">
              <CheckCircle2 size={16} />
            </div>
            <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest block mb-0.5">Novos Itens (Campo)</span>
            <div className="flex items-baseline space-x-2">
              <span className="text-xl font-bold text-slate-900">{stats.novoItem}</span>
              <Download size={10} className="text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </div>
        </div>

        {/* DISTRIBUIÇÃO POR TAGS - GRID */}
        <section className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center space-x-2">
              <div className="w-1 h-3 bg-blue-600 rounded-full" />
              <h3 className="text-[10px] font-bold text-slate-900 uppercase tracking-widest">Distribuição por Tags</h3>
            </div>
            <button onClick={() => exportFilteredData(() => true, 'BASE_COMPLETA')} className="text-[8px] font-bold text-blue-600 uppercase tracking-widest flex items-center space-x-1">
              <Download size={10} />
              <span>Exportar Tudo</span>
            </button>
          </div>

          <div className="grid grid-cols-1 gap-2">
            <StatCard 
              label="Falta Etiquetar" 
              value={stats.faltaEtiquetar} 
              total={stats.totalAtivos} 
              colorClass="bg-amber-500" 
              icon={AlertTriangle} 
              onClick={() => exportFilteredData(a => a.TAG_INVENTARIO === TagInventario.FALTA_ETIQUETAR || (String(a._plaquetaMaster || '').toUpperCase() === 'ETIQUETAR' && !a._conferido), 'FALTA_ETIQUETAR')}
            />
            <StatCard 
              label="Etiquetado" 
              value={stats.jaEtiquetado} 
              total={stats.totalAtivos} 
              colorClass="bg-violet-600" 
              icon={Palette} 
              onClick={() => exportFilteredData(a => a.TAG_INVENTARIO === TagInventario.ETIQUETADO, 'ETIQUETADOS_EM_CAMPO')}
            />
            <StatCard 
              label="Divergência" 
              value={stats.divergencia} 
              total={stats.totalAtivos} 
              colorClass="bg-rose-600" 
              icon={ShieldAlert} 
              onClick={() => exportFilteredData(a => a.TAG_INVENTARIO === TagInventario.DIVERGENCIA, 'DIVERGENCIAS')}
            />
            <StatCard 
              label="Adotado / Transferido" 
              value={stats.adotado} 
              total={stats.totalAtivos} 
              colorClass="bg-sky-600" 
              icon={MapPin} 
              onClick={() => exportFilteredData(a => a.TAG_INVENTARIO === TagInventario.ADOTADO || a.TAG_INVENTARIO === TagInventario.ADOTADO_EXTERNO, 'ADOTADOS')}
            />
            <StatCard 
              label="Conferido OK" 
              value={stats.conferidoOk} 
              total={stats.totalAtivos} 
              colorClass="bg-emerald-600" 
              icon={CheckCircle2} 
              onClick={() => exportFilteredData(a => a.TAG_INVENTARIO === TagInventario.CONFERIDO, 'CONFERIDOS_OK')}
            />
            <StatCard 
              label="Alterações de Local (DE/PARA)" 
              value={stats.locChanges} 
              total={stats.totalConferidoGeral} 
              colorClass="bg-indigo-600" 
              icon={TrendingUp} 
              onClick={() => exportFilteredData(a => a.DE_PARA === 'COM ALTERAÇÃO', 'ALTERACOES_LOCAL')}
            />
          </div>
        </section>

        {/* INTEGRIDADE DA BASE */}
        <section className="bg-white border border-slate-200 rounded-[2rem] p-6 shadow-sm space-y-4 modern-card">
          <div className="flex items-center space-x-2 mb-1">
            <div className="w-8 h-8 bg-slate-50 rounded-lg flex items-center justify-center text-slate-600">
              <ShieldAlert size={16} />
            </div>
            <div>
              <h3 className="text-[10px] font-bold text-slate-900 uppercase tracking-widest">Integridade da Base</h3>
              <p className="text-[7px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Análise de Duplicidade v24</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between group cursor-pointer" onClick={() => exportFilteredData(a => a.TAG_DUPLICIDADE === 'ÚNICO', 'PLAQUETAS_UNICAS')}>
              <div className="flex items-center space-x-3">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span className="text-[9px] font-bold text-slate-600 uppercase tracking-widest">Plaquetas Únicas</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-xs font-bold text-slate-900">{stats.unico}</span>
                <Download size={10} className="text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </div>

            <div className="flex items-center justify-between group cursor-pointer" onClick={() => exportFilteredData(a => a.TAG_DUPLICIDADE === 'ETIQUETA+1REGISTRO', 'DUPLICIDADES_INTERNAS')}>
              <div className="flex items-center space-x-3">
                <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                <span className="text-[9px] font-bold text-slate-600 uppercase tracking-widest">Etiqueta +1 Registro</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-xs font-bold text-slate-900">{stats.dupInterna}</span>
                <Download size={10} className="text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </div>

            <div className="flex items-center justify-between group cursor-pointer" onClick={() => exportFilteredData(a => (a.TAG_DUPLICIDADE === 'SEM IDENTIFICAÇÃO' && String(a.ETIQUETA || '').toUpperCase() !== 'ETIQUETAR') || !a.ETIQUETA, 'SEM_IDENTIFICACAO')}>
              <div className="flex items-center space-x-3">
                <div className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                <span className="text-[9px] font-bold text-slate-600 uppercase tracking-widest">Sem Identificação</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-xs font-bold text-slate-900">{stats.semId}</span>
                <Download size={10} className="text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </div>
          </div>
        </section>

        {/* RESUMO CONTÁBIL */}
        <section className="bg-slate-50 border border-slate-200 rounded-[2rem] p-6 shadow-inner space-y-4">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center text-slate-600 border border-slate-200 shadow-sm">
              <Activity size={16} />
            </div>
            <h3 className="text-[10px] font-bold text-slate-900 uppercase tracking-widest">Resumo Contábil</h3>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col">
              <span className="text-[7px] font-bold text-slate-400 uppercase tracking-widest mb-1">Registros Ativos</span>
              <span className="text-xl font-bold text-slate-900">{stats.countAtivos}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-[7px] font-bold text-slate-400 uppercase tracking-widest mb-1">Registros Baixados</span>
              <span className="text-xl font-bold text-slate-900">{stats.countBaixados}</span>
            </div>
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
