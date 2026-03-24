
import React, { useMemo, useState } from 'react';
import { Asset, TagInventario, AuditLogEntry } from '../types';
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
  MapPin,
  History,
  User,
  PackageSearch
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
  onOpenActiveSearch?: () => void;
  user: {
    tenantId?: string;
    unitId?: string;
  } | null;
}

const Dashboard: React.FC<DashboardProps> = ({ assets, onBack, onOpenActiveSearch, user }) => {
  const [hintOverlay, setHintOverlay] = useState<{label: string, text: string} | null>(null);

  const stats = useMemo(() => {
    const s = {
      totalAtivos: 0,
      conferidoAtivos: 0,
      baixadosLocalizados: 0,
      totalConferidoGeral: 0,
      percConferido: 0,
      comPlaqueta: 0,
      faltaEtiquetar: 0,
      jaEtiquetado: 0,
      divergencia: 0,
      novoItem: 0,
      adotado: 0,
      readotado: 0,
      conferidoOk: 0,
      locChanges: 0,
      unico: 0,
      dupInterna: 0,
      dupExterna: 0,
      semId: 0,
      countAtivos: 0,
      countBaixados: 0,
      criticalDivergence: 0,
    };

    for (let i = 0; i < assets.length; i++) {
      const a = assets[i];
      const statusUpper = String(a.STATUS || a.SITUACAO || '').toUpperCase();
      const isBaixado = statusUpper.includes('BAIXADO');
      const isConferido = !!a._conferido || String(a.AUDITOR_STATUS_CONFERENCIA || '').toUpperCase() === 'SIM';
      const tag = a.TAG_INVENTARIO;
      const etq = String(a.ETIQUETA || '').toUpperCase().trim();
      const plaquetaMaster = String(a._plaquetaMaster || '').toUpperCase().trim();

      // Valor de aquisição para divergência crítica
      const valorStr = String(a.VLRAQUISIC || '0').replace(/[^\d.,]/g, '').replace(',', '.');
      const valor = parseFloat(valorStr) || 0;

      if (!isBaixado) {
        s.totalAtivos++;
        if (isConferido) s.conferidoAtivos++;
      } else if (isConferido) {
        s.baixadosLocalizados++;
      }

      if (statusUpper.includes('ATIVO')) s.countAtivos++;
      if (isBaixado) s.countBaixados++;

      if (etq && etq !== 'ETIQUETAR') s.comPlaqueta++;

      if (tag === TagInventario.FALTA_ETIQUETAR || (plaquetaMaster === 'ETIQUETAR' && !isConferido)) {
        s.faltaEtiquetar++;
      }
      if (tag === TagInventario.ETIQUETADO || (plaquetaMaster === 'ETIQUETAR' && isConferido)) {
        s.jaEtiquetado++;
      }

      if (tag === TagInventario.DIVERGENCIA) {
        s.divergencia++;
        if (valor >= 5000) s.criticalDivergence++;
      }
      if (tag === TagInventario.NOVO_ITEM || a._isNew) s.novoItem++;
      if (tag === TagInventario.ADOTADO || tag === TagInventario.ADOTADO_EXTERNO) s.adotado++;
      if (tag === TagInventario.RE_ADOTADO) s.readotado++;
      if (tag === TagInventario.CONFERIDO) s.conferidoOk++;
      if (a.DE_PARA === 'COM ALTERAÇÃO') s.locChanges++;

      if (a.TAG_DUPLICIDADE === 'ÚNICO') s.unico++;
      if (a.TAG_DUPLICIDADE === 'ETIQUETA+1REGISTRO') s.dupInterna++;
      if (a.TAG_DUPLICIDADE === 'DUPLICIDADE EXTERNA') s.dupExterna++;

      if (a.TAG_DUPLICIDADE === 'SEM IDENTIFICAÇÃO' && etq !== 'ETIQUETAR' && !etq) {
        s.semId++;
      }
    }

    s.totalConferidoGeral = s.conferidoAtivos + s.baixadosLocalizados;
    s.percConferido = s.totalAtivos > 0 ? Math.round((s.conferidoAtivos / s.totalAtivos) * 100) : 0;

    return s;
  }, [assets]);

  const recentActivity = useMemo(() => {
    const allHistory: (AuditLogEntry & { assetId: string | number; assetTag?: string; assetDesc?: string })[] = [];
    assets.forEach(a => {
      if (a._history && Array.isArray(a._history)) {
        a._history.forEach(h => {
          allHistory.push({
            ...h,
            assetId: a.id,
            assetTag: a.ETIQUETA,
            assetDesc: a.DESCRICAODOATIVO
          });
        });
      }
    });
    
    return allHistory
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 5);
  }, [assets]);

  const exportFilteredData = (filterFn: (a: Asset) => boolean, fileName: string) => {
    const filtered = assets.filter(filterFn);
    if (filtered.length === 0) return;

    const wsData = filtered.map(a => {
      const res: { [key: string]: string | number | boolean | null | undefined } = {
        'TENANT': a._tenantId || user?.tenantId || '',
        'UNIDADE': a._unitId || user?.unitId || '',
      };
      
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
        className="bg-white border border-border rounded-xl p-3 shadow-sm hover:shadow-md transition-all cursor-pointer active:scale-[0.98] group"
      >
        <div className="flex items-center justify-between mb-2">
          <div className={`w-8 h-8 rounded-lg ${colorClass} bg-opacity-20 flex items-center justify-center`}>
            <Icon size={16} className={colorClass.replace('bg-', 'text-').replace('400', '500')} />
          </div>
          <div className="text-right flex flex-col items-end">
            <div className="flex items-center space-x-1">
              <span className="text-lg font-bold text-ink">{value}</span>
              {DASHBOARD_HINTS[label] && (
                <button onClick={handleHintTrigger} className="p-1 text-ink-muted/30 hover:text-accent transition-colors">
                  <Info size={8} />
                </button>
              )}
            </div>
            <p className="text-[7px] font-bold text-ink-muted uppercase tracking-widest">{percentage}%</p>
          </div>
        </div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[8px] font-bold text-ink-muted uppercase tracking-widest">{label}</span>
          <Download size={8} className="text-ink-muted/30 group-hover:text-accent transition-colors" />
        </div>
        <div className="h-1 w-full bg-bg-main rounded-full overflow-hidden">
          <div className={`h-full ${colorClass} transition-all duration-1000`} style={{ width: `${percentage}%` }} />
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-[100dvh] bg-bg-main animate-fadeIn overflow-hidden">
      <div className="pt-12 pb-4 px-4 bg-white border-b border-border flex items-center justify-between shadow-sm z-20">
        <div className="flex items-center space-x-3">
          <BackButton onClick={onBack} label="Voltar" subLabel={`${user?.tenantId || 'S/ TENANT'} | ${user?.unitId || 'S/ UNIDADE'}`} />
        </div>
        <div className="w-10 h-10 bg-accent-soft border border-accent/10 rounded-xl flex items-center justify-center text-accent shadow-sm">
          <BarChart3 size={20} />
        </div>
      </div>

      {localStorage.getItem('gbr_gps_bypass') === 'true' && (
        <div className="mx-4 mt-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <ShieldAlert size={14} className="text-amber-600" />
            <span className="text-[9px] font-bold text-amber-900 uppercase tracking-widest">Modo Desenvolvedor Ativo</span>
          </div>
          <button 
            onClick={() => {
              localStorage.removeItem('gbr_gps_bypass');
              window.location.reload();
            }}
            className="px-3 py-1 bg-amber-600 text-white rounded-lg text-[8px] font-bold uppercase tracking-widest active:scale-95 transition-all"
          >
            Resetar GPS
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar pb-24">
        
        {/* BENTO GRID - KPI PRINCIPAIS */}
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 bg-accent rounded-[2rem] p-6 text-white relative overflow-hidden shadow-xl shadow-accent/20">
            <div className="absolute top-0 right-0 w-48 h-48 bg-white/10 rounded-full -mr-16 -mt-16 blur-3xl" />
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center space-x-2">
                  <div className="w-8 h-8 bg-white/10 rounded-lg flex items-center justify-center backdrop-blur-md">
                    <TrendingUp size={16} className="text-white" />
                  </div>
                  <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-white/70">Eficiência Global</span>
                </div>
                <div className="bg-white/20 px-2 py-0.5 rounded-full border border-white/30">
                  <span className="text-[8px] font-bold text-white uppercase tracking-widest">v24.50 PRO</span>
                </div>
              </div>
              
              <div className="flex items-end justify-between">
                <div>
                  <h3 className="text-4xl font-bold tracking-tighter mb-1">{stats.percConferido}%</h3>
                  <p className="text-[9px] font-bold text-white/60 uppercase tracking-widest">Progresso da Base Ativa</p>
                </div>
                <div className="text-right">
                  <span className="text-2xl font-bold text-white/90">{stats.conferidoAtivos}</span>
                  <span className="text-sm font-bold text-white/40 ml-1">/ {stats.totalAtivos}</span>
                </div>
              </div>
              
              <div className="mt-6 h-2 w-full bg-white/20 rounded-full overflow-hidden">
                <div className="h-full bg-white transition-all duration-1000 ease-out" style={{ width: `${stats.percConferido}%` }} />
              </div>
            </div>
          </div>

          <div 
            onClick={() => {
              exportFilteredData(a => {
                const valorStr = String(a.VLRAQUISIC || '0').replace(/[^\d.,]/g, '').replace(',', '.');
                const valor = parseFloat(valorStr) || 0;
                return a.TAG_INVENTARIO === TagInventario.DIVERGENCIA && valor >= 5000;
              }, 'DIVERGENCIAS_CRITICAS');
            }}
            className="bg-rose-50 border border-rose-200 rounded-[1.5rem] p-4 shadow-sm active:scale-95 transition-all cursor-pointer group"
          >
            <div className="w-8 h-8 bg-rose-600 rounded-lg flex items-center justify-center text-white mb-3 shadow-lg shadow-rose-900/20">
              <ShieldAlert size={16} />
            </div>
            <span className="text-[8px] font-bold text-rose-900 uppercase tracking-widest block mb-0.5">Divergências Críticas</span>
            <div className="flex items-baseline space-x-2">
              <span className="text-xl font-bold text-rose-950">{stats.criticalDivergence}</span>
              <span className="text-[8px] font-bold text-rose-600 uppercase tracking-widest">Valor &gt; R$ 5k</span>
              <Download size={10} className="text-rose-900/30 opacity-0 group-hover:opacity-100 transition-opacity ml-auto" />
            </div>
          </div>

          <div 
            onClick={() => exportFilteredData(a => String(a.STATUS || '').toUpperCase().includes('BAIXADO') && !!a._conferido, 'BAIXADOS_LOCALIZADOS')}
            className="bg-white border border-border rounded-[1.5rem] p-4 shadow-sm active:scale-95 transition-all cursor-pointer group"
          >
            <div className="w-8 h-8 bg-danger/10 rounded-lg flex items-center justify-center text-danger mb-3 group-hover:bg-danger group-hover:text-white transition-colors">
              <AlertTriangle size={16} />
            </div>
            <span className="text-[8px] font-bold text-ink-muted uppercase tracking-widest block mb-0.5">Baixados Localizados</span>
            <div className="flex items-baseline space-x-2">
              <span className="text-xl font-bold text-ink">{stats.baixadosLocalizados}</span>
              <Download size={10} className="text-ink-muted/30 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </div>

          <div 
            onClick={() => exportFilteredData(a => a.TAG_INVENTARIO === TagInventario.NOVO_ITEM, 'NOVOS_ITENS')}
            className="bg-white border border-border rounded-[1.5rem] p-4 shadow-sm active:scale-95 transition-all cursor-pointer group"
          >
            <div className="w-8 h-8 bg-warning/10 rounded-lg flex items-center justify-center text-warning mb-3 group-hover:bg-warning group-hover:text-white transition-colors">
              <CheckCircle2 size={16} />
            </div>
            <span className="text-[8px] font-bold text-ink-muted uppercase tracking-widest block mb-0.5">Novos Itens (Campo)</span>
            <div className="flex items-baseline space-x-2">
              <span className="text-xl font-bold text-ink">{stats.novoItem}</span>
              <Download size={10} className="text-ink-muted/30 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </div>

          <div 
            onClick={() => onOpenActiveSearch && onOpenActiveSearch()}
            className="col-span-2 bg-amber-500 border border-amber-400 rounded-[1.5rem] p-4 shadow-sm active:scale-95 transition-all cursor-pointer group relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/20 rounded-full -mr-16 -mt-16 blur-2xl" />
            <div className="relative z-10 flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-amber-600 shadow-lg shadow-amber-900/10">
                  <PackageSearch size={20} />
                </div>
                <div>
                  <span className="text-[8px] font-bold text-amber-900 uppercase tracking-widest block mb-0.5">Busca Ativa</span>
                  <h4 className="text-sm font-bold text-amber-950 uppercase tracking-tight">Itens Não Localizados</h4>
                </div>
              </div>
              <div className="text-right">
                <span className="text-lg font-bold text-amber-950">{assets.filter(a => !a._conferido).length}</span>
                <p className="text-[7px] font-bold text-amber-900 uppercase tracking-widest">Faltantes</p>
              </div>
            </div>
          </div>
        </div>

        {/* DISTRIBUIÇÃO POR TAGS - GRID */}
        <section className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center space-x-2">
              <div className="w-1 h-3 bg-accent rounded-full" />
              <h3 className="text-[10px] font-bold text-ink uppercase tracking-widest">Distribuição por Tags</h3>
            </div>
            <button onClick={() => exportFilteredData(() => true, 'BASE_COMPLETA')} className="text-[8px] font-bold text-accent uppercase tracking-widest flex items-center space-x-1">
              <Download size={10} />
              <span>Exportar Tudo</span>
            </button>
          </div>

          <div className="grid grid-cols-1 gap-2">
            <StatCard 
              label="Falta Etiquetar" 
              value={stats.faltaEtiquetar} 
              total={stats.totalAtivos} 
              colorClass="bg-amber-400" 
              icon={AlertTriangle} 
              onClick={() => exportFilteredData(a => a.TAG_INVENTARIO === TagInventario.FALTA_ETIQUETAR || (String(a._plaquetaMaster || '').toUpperCase() === 'ETIQUETAR' && !a._conferido), 'FALTA_ETIQUETAR')}
            />
            <StatCard 
              label="Etiquetado" 
              value={stats.jaEtiquetado} 
              total={stats.totalAtivos} 
              colorClass="bg-violet-400" 
              icon={Palette} 
              onClick={() => exportFilteredData(a => a.TAG_INVENTARIO === TagInventario.ETIQUETADO, 'ETIQUETADOS_EM_CAMPO')}
            />
            <StatCard 
              label="Divergência" 
              value={stats.divergencia} 
              total={stats.totalAtivos} 
              colorClass="bg-rose-400" 
              icon={ShieldAlert} 
              onClick={() => exportFilteredData(a => a.TAG_INVENTARIO === TagInventario.DIVERGENCIA, 'DIVERGENCIAS')}
            />
            <StatCard 
              label="Adotado / Transferido" 
              value={stats.adotado} 
              total={stats.totalAtivos} 
              colorClass="bg-sky-400" 
              icon={MapPin} 
              onClick={() => exportFilteredData(a => a.TAG_INVENTARIO === TagInventario.ADOTADO || a.TAG_INVENTARIO === TagInventario.ADOTADO_EXTERNO, 'ADOTADOS')}
            />
            <StatCard 
              label="Conferido OK" 
              value={stats.conferidoOk} 
              total={stats.totalAtivos} 
              colorClass="bg-emerald-400" 
              icon={CheckCircle2} 
              onClick={() => exportFilteredData(a => a.TAG_INVENTARIO === TagInventario.CONFERIDO, 'CONFERIDOS_OK')}
            />
            <StatCard 
              label="Alterações de Local (DE/PARA)" 
              value={stats.locChanges} 
              total={stats.totalConferidoGeral} 
              colorClass="bg-indigo-400" 
              icon={TrendingUp} 
              onClick={() => exportFilteredData(a => a.DE_PARA === 'COM ALTERAÇÃO', 'ALTERACOES_LOCAL')}
            />
          </div>
        </section>

        {/* INTEGRIDADE DA BASE */}
        <section className="bg-white border border-border rounded-[2rem] p-6 shadow-sm space-y-4 modern-card">
          <div className="flex items-center space-x-2 mb-1">
            <div className="w-8 h-8 bg-accent-soft rounded-lg flex items-center justify-center text-accent">
              <ShieldAlert size={16} />
            </div>
            <div>
              <h3 className="text-[10px] font-bold text-ink uppercase tracking-widest">Integridade da Base</h3>
              <p className="text-[7px] font-bold text-ink-muted uppercase tracking-widest mt-0.5">Análise de Duplicidade v24</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between group cursor-pointer" onClick={() => exportFilteredData(a => a.TAG_DUPLICIDADE === 'ÚNICO', 'PLAQUETAS_UNICAS')}>
              <div className="flex items-center space-x-3">
                <div className="w-1.5 h-1.5 rounded-full bg-success" />
                <span className="text-[9px] font-bold text-ink-muted uppercase tracking-widest">Plaquetas Únicas</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-xs font-bold text-ink">{stats.unico}</span>
                <Download size={10} className="text-ink-muted opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </div>

            <div className="flex items-center justify-between group cursor-pointer" onClick={() => exportFilteredData(a => a.TAG_DUPLICIDADE === 'ETIQUETA+1REGISTRO', 'DUPLICIDADES_INTERNAS')}>
              <div className="flex items-center space-x-3">
                <div className="w-1.5 h-1.5 rounded-full bg-warning" />
                <span className="text-[9px] font-bold text-ink-muted uppercase tracking-widest">Etiqueta +1 Registro</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-xs font-bold text-ink">{stats.dupInterna}</span>
                <Download size={10} className="text-ink-muted opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </div>

            <div className="flex items-center justify-between group cursor-pointer" onClick={() => exportFilteredData(a => (a.TAG_DUPLICIDADE === 'SEM IDENTIFICAÇÃO' && String(a.ETIQUETA || '').toUpperCase() !== 'ETIQUETAR') || !a.ETIQUETA, 'SEM_IDENTIFICACAO')}>
              <div className="flex items-center space-x-3">
                <div className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                <span className="text-[9px] font-bold text-ink-muted uppercase tracking-widest">Sem Identificação</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-xs font-bold text-ink">{stats.semId}</span>
                <Download size={10} className="text-ink-muted opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </div>
          </div>
        </section>

        {/* RESUMO CONTÁBIL */}
        <section className="bg-accent-soft border border-accent/10 rounded-[2rem] p-6 shadow-inner space-y-4">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center text-accent border border-accent/10 shadow-sm">
              <Activity size={16} />
            </div>
            <h3 className="text-[10px] font-bold text-ink uppercase tracking-widest">Resumo Contábil</h3>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col">
              <span className="text-[7px] font-bold text-ink-muted uppercase tracking-widest mb-1">Registros Ativos</span>
              <span className="text-xl font-bold text-ink">{stats.countAtivos}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-[7px] font-bold text-ink-muted uppercase tracking-widest mb-1">Registros Baixados</span>
              <span className="text-xl font-bold text-ink">{stats.countBaixados}</span>
            </div>
          </div>
        </section>

        {/* RECENT ACTIVITY FEED */}
        <section className="bg-white border border-border rounded-[2.5rem] p-8 shadow-sm modern-card space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-accent/10 rounded-2xl flex items-center justify-center text-accent border border-accent/20 shadow-sm">
                <History size={20} />
              </div>
              <div>
                <h3 className="text-[11px] font-black text-ink uppercase tracking-[0.2em]">Atividade Recente</h3>
                <p className="text-[8px] font-bold text-ink-muted uppercase tracking-widest mt-0.5">Últimas 5 alterações de ativos</p>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            {recentActivity.length > 0 ? (
              recentActivity.map((activity, idx) => (
                <div key={idx} className="flex items-start space-x-4 group">
                  <div className="w-1 h-12 bg-border group-hover:bg-accent transition-colors rounded-full mt-1" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[8px] font-black text-accent uppercase tracking-widest">{activity.action}</span>
                      <span className="text-[7px] font-bold text-ink-muted uppercase">{new Date(activity.timestamp).toLocaleString('pt-BR')}</span>
                    </div>
                    <p className="text-[10px] font-bold text-ink truncate uppercase tracking-tight">{activity.details}</p>
                    <div className="flex items-center space-x-1.5 mt-1">
                      <User size={8} className="text-ink-muted" />
                      <span className="text-[7px] font-bold text-ink-muted uppercase tracking-widest">{activity.user}</span>
                      <span className="text-[7px] font-bold text-accent/50 uppercase tracking-widest ml-auto">TAG: {activity.assetTag || '---'}</span>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="py-10 text-center">
                <p className="text-[9px] font-bold text-ink-muted uppercase tracking-[0.2em]">Nenhuma atividade registrada</p>
              </div>
            )}
          </div>
        </section>
      </div>

      {/* OVERLAY EXPLICATIVO (HINT) */}
      {hintOverlay && (
        <div 
          className="fixed inset-0 z-[500] bg-slate-950/40 backdrop-blur-md flex items-center justify-center p-8 animate-fadeIn"
          onClick={() => setHintOverlay(null)}
        >
          <div 
            className="bg-white w-full max-w-sm rounded-[2.5rem] p-10 shadow-2xl animate-slideUp relative overflow-hidden modern-card"
            onClick={e => e.stopPropagation()}
          >
            <div className="absolute top-0 left-0 w-full h-2.5 bg-accent" />
            <button 
              onClick={() => setHintOverlay(null)}
              className="absolute top-8 right-8 p-3 bg-accent-soft border border-accent/10 rounded-2xl text-accent active:scale-90 shadow-sm"
            >
              <X size={20} />
            </button>
            
            <div className="flex flex-col items-center text-center mb-8">
              <div className="w-20 h-20 bg-accent-soft rounded-[2rem] flex items-center justify-center text-accent mb-6 border border-accent/10 shadow-sm">
                <Info size={36} />
              </div>
              <span className="text-[11px] font-bold text-ink-muted uppercase tracking-[0.3em] mb-2">Critério de Auditoria</span>
              <h3 className="text-2xl font-bold text-ink uppercase tracking-tight">{hintOverlay.label}</h3>
            </div>

            <p className="text-sm font-medium text-ink-muted leading-relaxed text-center italic px-2">
              &quot;{hintOverlay.text}&quot;
            </p>

            <div className="mt-10 pt-8 border-t border-accent/10 flex justify-center">
              <button 
                onClick={() => setHintOverlay(null)}
                className="w-full py-5 bg-accent text-white rounded-2xl text-[11px] font-bold uppercase tracking-[0.2em] active:scale-95 shadow-lg shadow-accent/20"
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
