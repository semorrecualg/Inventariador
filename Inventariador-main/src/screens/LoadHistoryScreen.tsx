import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { ArrowLeft, Database, History, RefreshCw, ChevronDown, ChevronRight, FileUp, DownloadCloud, UploadCloud, AlertTriangle, Package } from 'lucide-react';
import { AppScreen } from '../types';
import { fetchLoadHistory } from '../services/supabaseService';
import { logger } from '../utils/logger';
import {
  groupLoadHistory,
  normalizeTenantLabel,
  formatLoadTimestamp,
  LoadHistoryEntry,
  LoadHistorySummary,
} from '../utils/loadHistoryUtils';

interface LoadHistoryScreenProps {
  onBack: () => void;
  /** Contrato ativo do usuário logado; vazio = dono global (vê todos). */
  tenantid?: string;
}

const ACTION_META: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  IMPORT: { label: 'CARGA DE PLANILHA', icon: <FileUp size={12} />, color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
  SYNC_PULL: { label: 'SYNC PULL (NUVEM→LOCAL)', icon: <DownloadCloud size={12} />, color: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
  SYNC_PUSH: { label: 'SYNC PUSH (LOCAL→NUVEM)', icon: <UploadCloud size={12} />, color: 'bg-violet-500/15 text-violet-400 border-violet-500/30' },
  LOAD: { label: 'CARGA', icon: <Package size={12} />, color: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
  CARGA: { label: 'CARGA', icon: <Package size={12} />, color: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
  RESTORE: { label: 'RESTAURAÇÃO', icon: <Database size={12} />, color: 'bg-sky-500/15 text-sky-400 border-sky-500/30' },
  BACKUP: { label: 'BACKUP', icon: <Database size={12} />, color: 'bg-sky-500/15 text-sky-400 border-sky-500/30' },
};

const actionMeta = (action: string | null | undefined) =>
  ACTION_META[String(action || '').toUpperCase()] || {
    label: String(action || 'OUTRO').toUpperCase(),
    icon: <Package size={12} />,
    color: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
  };

const SummaryCard = ({ s, expanded, onToggle }: {
  s: LoadHistorySummary;
  expanded: boolean;
  onToggle: () => void;
}) => (
  <button
    onClick={onToggle}
    className="w-full text-left p-4 bg-slate-900/60 border border-slate-800/80 rounded-xl transition-all hover:border-slate-700"
  >
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-9 h-9 bg-indigo-500/15 text-indigo-400 rounded-lg flex items-center justify-center border border-indigo-500/30 shrink-0">
          <Database size={16} />
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-black uppercase tracking-wide text-slate-100 truncate">{s.tenant}</h3>
          <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">
            {s.totalEventos} evento{s.totalEventos === 1 ? '' : 's'} · {s.ultimaOcorrencia ? formatLoadTimestamp(s.ultimaOcorrencia) : '—'}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <div className="text-right">
          <p className="text-lg font-black text-emerald-400 leading-none">{s.totalAtivos.toLocaleString('pt-BR')}</p>
          <p className="text-[8px] font-bold text-slate-500 uppercase tracking-widest">ativos</p>
        </div>
        {expanded ? <ChevronDown size={16} className="text-slate-500" /> : <ChevronRight size={16} className="text-slate-500" />}
      </div>
    </div>
    <div className="mt-3 flex flex-wrap gap-1.5">
      {Object.entries(s.acoes).map(([action, count]) => {
        const meta = actionMeta(action);
        return (
          <span key={action} className={`px-2 py-0.5 rounded-md border text-[8px] font-black uppercase tracking-widest ${meta.color}`}>
            {meta.label}: {count}
          </span>
        );
      })}
    </div>
  </button>
);

export const LoadHistoryScreen: React.FC<LoadHistoryScreenProps> = ({ onBack, tenantid }) => {
  const [entries, setEntries] = useState<LoadHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedTenants, setExpandedTenants] = useState<Set<string>>(new Set());
  const [filterTenant, setFilterTenant] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const raw = await fetchLoadHistory(tenantid || '');
      setEntries(raw as LoadHistoryEntry[]);
    } catch (err) {
      logger.error('[LOAD_HISTORY] Falha ao carregar histórico:', err);
      setError('Não foi possível carregar o histórico da nuvem. Verifique a conexão e tente novamente.');
    } finally {
      setLoading(false);
    }
  }, [tenantid]);

  useEffect(() => {
    load();
  }, [load]);

  const { summary, events } = useMemo(() => groupLoadHistory(entries), [entries]);

  const visibleEvents = useMemo(
    () => (filterTenant ? events.filter((e) => normalizeTenantLabel(e.tenantid) === filterTenant) : events),
    [events, filterTenant]
  );

  const totals = useMemo(
    () => ({
      eventos: events.length,
      ativos: summary.reduce((acc, s) => acc + s.totalAtivos, 0),
    }),
    [events, summary]
  );

  const goBack = () => {
    if (onBack) {
      onBack();
    } else {
      const hasPush = typeof window !== 'undefined' && typeof (window as { pushScreen?: (s: AppScreen) => void }).pushScreen === 'function';
      if (hasPush) {
        (window as { pushScreen?: (s: AppScreen) => void }).pushScreen?.(AppScreen.MODULE_SELECTION);
      } else {
        localStorage.setItem('gbr_kardek_history', JSON.stringify([AppScreen.MODULE_SELECTION]));
      }
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col p-6 font-sans">
      {/* Header */}
      <div className="flex items-center justify-between mb-8 pb-4 border-b border-slate-800">
        <div className="flex items-center space-x-3">
          <History className="w-6 h-6 text-blue-400" />
          <div>
            <h1 className="text-sm font-black tracking-wider uppercase text-slate-100">
              Histórico de Cargas & Sincronizações
            </h1>
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">
              Rastreio de IMPORT / SYNC por contrato · audit_logs
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 border border-blue-500 text-xs font-bold uppercase tracking-wider text-white transition-all cursor-pointer disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            <span>Atualizar</span>
          </button>
          <button
            onClick={goBack}
            className="flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs font-bold uppercase tracking-wider text-slate-400 transition-all cursor-pointer"
          >
            <ArrowLeft size={14} />
            <span>Voltar</span>
          </button>
        </div>
      </div>

      {/* Filtro por contrato + totais */}
      <div className="mb-6 grid grid-cols-2 gap-4">
        <div className="p-4 bg-slate-900/30 border border-slate-800/50 rounded-xl">
          <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Eventos registrados</span>
          <p className="mt-1 text-2xl font-black text-slate-100">{totals.eventos}</p>
        </div>
        <div className="p-4 bg-slate-900/30 border border-slate-800/50 rounded-xl">
          <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Ativos movimentados</span>
          <p className="mt-1 text-2xl font-black text-emerald-400">{totals.ativos.toLocaleString('pt-BR')}</p>
        </div>
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        <button
          onClick={() => setFilterTenant(null)}
          className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest border transition-all ${
            filterTenant === null
              ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40'
              : 'bg-slate-900 text-slate-400 border-slate-800 hover:border-slate-700'
          }`}
        >
          Todos
        </button>
        {summary.map((s) => (
          <button
            key={s.tenant}
            onClick={() => setFilterTenant(s.tenant)}
            className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest border transition-all ${
              filterTenant === s.tenant
                ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40'
                : 'bg-slate-900 text-slate-400 border-slate-800 hover:border-slate-700'
            }`}
          >
            {s.tenant} · {s.totalAtivos.toLocaleString('pt-BR')}
          </button>
        ))}
      </div>

      {/* Conteúdo */}
      {loading ? (
        <div className="flex-1 flex flex-col items-center justify-center space-y-4">
          <RefreshCw size={28} className="text-blue-400 animate-spin" />
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Carregando histórico da nuvem...</p>
        </div>
      ) : error ? (
        <div className="flex-1 flex flex-col items-center justify-center space-y-4">
          <AlertTriangle size={28} className="text-amber-400" />
          <p className="text-xs text-slate-400 text-center max-w-md">{error}</p>
        </div>
      ) : events.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center space-y-4 opacity-60">
          <History size={32} className="text-slate-600" />
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest text-center">
            Nenhuma carga ou sincronização registrada ainda.
          </p>
          <p className="text-[9px] text-slate-600 uppercase tracking-widest text-center max-w-sm">
            As cargas de planilha (IMPORT) e os pulls do boot (SYNC_PULL) passam a ser registrados no audit_logs com o contrato e a contagem.
          </p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto pr-1 space-y-3">
          {(filterTenant ? summary.filter((s) => s.tenant === filterTenant) : summary).map((s) => {
            const isExpanded = expandedTenants.has(s.tenant);
            const tenantEvents = visibleEvents.filter((e) => normalizeTenantLabel(e.tenantid) === s.tenant);
            return (
              <div key={s.tenant} className="space-y-2">
                <SummaryCard
                  s={s}
                  expanded={isExpanded}
                  onToggle={() => {
                    setExpandedTenants((prev) => {
                      const next = new Set(prev);
                      if (next.has(s.tenant)) next.delete(s.tenant);
                      else next.add(s.tenant);
                      return next;
                    });
                  }}
                />
                {isExpanded && (
                  <div className="pl-4 space-y-2">
                    {tenantEvents.map((e) => {
                      const meta = actionMeta(e.action);
                      return (
                        <div key={String(e.id || `${e.timestamp}-${e.action}-${Math.random()}`)} className="p-3 bg-slate-900/40 border border-slate-800/60 rounded-lg">
                          <div className="flex items-center justify-between gap-3 flex-wrap">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className={`px-2 py-0.5 rounded-md border text-[8px] font-black uppercase tracking-widest shrink-0 ${meta.color}`}>
                                {meta.label}
                              </span>
                              <span className="text-[10px] font-black uppercase tracking-wider text-indigo-300 truncate">
                                {normalizeTenantLabel(e.tenantid)}
                              </span>
                            </div>
                            <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest shrink-0">
                              {formatLoadTimestamp(e.timestamp)}
                            </span>
                          </div>
                          <p className="mt-2 text-[11px] text-slate-300 break-words">{e.details || '(sem detalhes)'}</p>
                          <p className="mt-1 text-[9px] font-bold text-slate-500 uppercase tracking-widest">
                            {e.user_email || 'unknown'}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default LoadHistoryScreen;
