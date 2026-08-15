/**
 * Utils puros do histórico de cargas/sincronizações (tela LoadHistoryScreen).
 * Mantidos fora do componente para serem testáveis e reutilizáveis.
 */

/** Ações que caracterizam eventos de carga/sincronização no audit_logs. */
export const LOAD_HISTORY_ACTIONS = [
  'IMPORT',
  'SYNC_PULL',
  'SYNC_PUSH',
  'LOAD',
  'CARGA',
  'RESTORE',
  'BACKUP',
] as const;

/** Entrada mínima de um evento lido do audit_logs. */
export interface LoadHistoryEntry {
  id?: string;
  tenantid?: string | null;
  action?: string | null;
  timestamp?: string | null;
  user_email?: string | null;
  table_name?: string | null;
  details?: string | null;
}

/** Extrai a contagem de ativos do campo details (ex.: "12636 ativos"). */
export const parseAssetCountFromDetails = (details?: string | null): number | null => {
  if (!details) return null;
  const match = details.match(/([0-9]+)[^0-9]*ativos/);
  if (!match) return null;
  const count = parseInt(match[1], 10);
  return Number.isFinite(count) ? count : null;
};

/**
 * Detecta um SYNC_PULL INCREMENTAL (delta) pelo details — o formato gravado
 * pela Etapa 5b: "Sincronização incremental de N ativos da nuvem para o local
 * (delta)." — e também o formato antigo "(delta)"/"incremental".
 */
export const isDeltaSyncEntry = (e: Pick<LoadHistoryEntry, 'details'>): boolean => {
  if (!e.details) return false;
  return /\(delta\)|incremental/i.test(e.details);
};

/** Normaliza o tenantid para exibição/agrupamento (vazio → SEM CONTRATO). */
export const normalizeTenantLabel = (tenantid?: string | null): string => {
  const t = String(tenantid || '').trim();
  return t ? t.toUpperCase() : 'SEM CONTRATO';
};

/** Resumo agregado por contrato. */
export interface LoadHistorySummary {
  tenant: string;
  totalEventos: number;
  totalAtivos: number;
  primeiraOcorrencia: string | null;
  ultimaOcorrencia: string | null;
  acoes: Record<string, number>;
}

/** Agrupa os eventos por contrato e agrega contagens e períodos. */
export const groupLoadHistory = (
  entries: LoadHistoryEntry[],
): { summary: LoadHistorySummary[]; events: LoadHistoryEntry[] } => {
  const events = [...entries].sort((a, b) => {
    const ta = a.timestamp ? new Date(a.timestamp).getTime() : 0;
    const tb = b.timestamp ? new Date(b.timestamp).getTime() : 0;
    return tb - ta;
  });

  const byTenant = new Map<string, LoadHistorySummary>();
  for (const e of events) {
    const tenant = normalizeTenantLabel(e.tenantid);
    let s = byTenant.get(tenant);
    if (!s) {
      s = {
        tenant,
        totalEventos: 0,
        totalAtivos: 0,
        primeiraOcorrencia: e.timestamp || null,
        ultimaOcorrencia: e.timestamp || null,
        acoes: {},
      };
      byTenant.set(tenant, s);
    }
    s.totalEventos += 1;
    const count = parseAssetCountFromDetails(e.details);
    if (count !== null) s.totalAtivos += count;
    const action = String(e.action || 'OUTRO').toUpperCase();
    s.acoes[action] = (s.acoes[action] || 0) + 1;
    if (e.timestamp) {
      if (!s.primeiraOcorrencia || new Date(e.timestamp) < new Date(s.primeiraOcorrencia)) {
        s.primeiraOcorrencia = e.timestamp;
      }
      if (!s.ultimaOcorrencia || new Date(e.timestamp) > new Date(s.ultimaOcorrencia)) {
        s.ultimaOcorrencia = e.timestamp;
      }
    }
  }

  const summary = [...byTenant.values()].sort((a, b) => b.totalAtivos - a.totalAtivos || b.totalEventos - a.totalEventos);
  return { summary, events };
};

/** Formata ISO para exibição local (dd/mm/aaaa hh:mm). */
export const formatLoadTimestamp = (iso?: string | null): string => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
