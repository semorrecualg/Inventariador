import { db } from './sqliteService';
import type { DexieAsset } from './sqliteService';
import {
  describeRecnoCollision,
  findRecnoCollisions,
  recnoCollisionKindOf,
  recnoKeyOf,
  sameRecnoData,
  summarizeRecnoRow,
  type RecnoCandidate,
  type RecnoCollision,
  type RecnoRowSummary
} from '../utils/recnoGuard';
import { logger } from '../utils/logger';

/**
 * GUARDIÃO SUAVE DE DUPLICIDADE POR RECNO (serviço)
 * ============================================================================
 * Compara `tenantid + filial + sn1_recno` na carga da planilha e na conferência
 * de campo. Quando o mesmo recno aparece com etiqueta, descrição ou valor
 * diferentes, o caso vai para `audit_logs` (`ASSET_DUP_SUSPECT`) e para o
 * relatório do Gestor de Base. NUNCA bloqueia a gravação e NUNCA apaga nada —
 * o operador decide. Ver `utils/recnoGuard.ts` para a razão de não ser chave
 * única (15 grupos reais com ativos diferentes).
 */

export const RECNO_AUDIT_ACTION = 'ASSET_DUP_SUSPECT';

export type RecnoGuardSource = 'CARGA_PLANILHA' | 'CONFERENCIA' | 'GESTOR_BASE';

interface RecnoIndexEntry {
  primarykey: string;
  etiqueta: string;
  descricao: string;
  valor: number;
  candidate: RecnoCandidate;
}

const INDEX_TTL_MS = 30_000;

let cache: Map<string, RecnoIndexEntry[]> | null = null;
let cacheBuiltAt = 0;

/** Esquece o índice em memória (após carga, limpeza de cópias ou restauro). */
export const invalidateRecnoGuardIndex = (): void => {
  cache = null;
  cacheBuiltAt = 0;
};

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  // Qualquer rotina que mexa na base avisa por este evento (carga, limpeza, pull).
  window.addEventListener('gbr_local_assets_changed', invalidateRecnoGuardIndex);
}

const buildIndex = async (): Promise<Map<string, RecnoIndexEntry[]>> => {
  const rows = (await db.local_assets.toArray()) as unknown as RecnoCandidate[];
  const map = new Map<string, RecnoIndexEntry[]>();
  for (const row of rows) {
    const key = recnoKeyOf(row);
    if (!key) continue;
    const summary = summarizeRecnoRow(row);
    const entry: RecnoIndexEntry = { ...summary, candidate: row };
    const bucket = map.get(key);
    if (bucket) bucket.push(entry);
    else map.set(key, [entry]);
  }
  cache = map;
  cacheBuiltAt = Date.now();
  return map;
};

const getIndex = async (): Promise<Map<string, RecnoIndexEntry[]>> => {
  if (cache && Date.now() - cacheBuiltAt < INDEX_TTL_MS) return cache;
  return buildIndex();
};

const currentUserEmail = (): string => {
  try {
    const raw = typeof window !== 'undefined' ? sessionStorage.getItem('app_current_user') : null;
    if (!raw) return '';
    const parsed = JSON.parse(raw) as { email?: string };
    return String(parsed?.email || '').trim();
  } catch {
    return '';
  }
};

/**
 * Conflitos de um ativo contra o que já está na base (mesmo recno, dados
 * diferentes). `[]` quando não há recno utilizável ou nada diverge.
 */
export async function findRecnoConflictsForAsset(asset: RecnoCandidate): Promise<RecnoCandidate[]> {
  const key = recnoKeyOf(asset);
  if (!key) return [];
  const index = await getIndex();
  const bucket = index.get(key) || [];
  const ownKey = String(asset.primarykey ?? '').trim();
  return bucket
    .filter((entry) => entry.primarykey !== ownKey && !sameRecnoData(asset, entry.candidate))
    .map((entry) => entry.candidate);
}

/** Todos os casos existentes na base local (relatório, sem escrever nada). */
export async function previewRecnoCollisions(): Promise<RecnoCollision[]> {
  const rows = (await db.local_assets.toArray()) as unknown as DexieAsset[];
  return findRecnoCollisions(rows as unknown as RecnoCandidate[]);
}

const alreadyLogged = async (collision: RecnoCollision): Promise<boolean> => {
  const entries = await db.audit_logs
    .filter((log) => log.acao === RECNO_AUDIT_ACTION && log.registro_id === collision.key)
    .toArray();
  return entries.some((log) => {
    try {
      return JSON.parse(String(log.delta || '{}')).signature === collision.signature;
    } catch {
      return false;
    }
  });
};

const logCollision = async (collision: RecnoCollision, source: RecnoGuardSource): Promise<boolean> => {
  if (await alreadyLogged(collision)) return false;
  await db.audit_logs.put({
    id: `DUP_${Date.now()}_${Math.random().toString(36).slice(2, 9).toUpperCase()}`,
    usuario: currentUserEmail() || 'SISTEMA',
    acao: RECNO_AUDIT_ACTION,
    tabela: 'assets',
    registro_id: collision.key,
    details: `Possível duplicidade por recno (${source}): ${describeRecnoCollision(collision)}. Nada foi bloqueado nem apagado.`,
    delta: JSON.stringify({
      signature: collision.signature,
      source,
      tenantid: collision.tenantid,
      filial: collision.filial,
      recno: collision.recno,
      rows: collision.rows
    }),
    updated_at: new Date().toISOString()
  });
  logger.warn(`>>> [RECNO] Possível duplicidade registrada: ${describeRecnoCollision(collision)}`);
  return true;
};

export interface RecnoReport {
  collisions: RecnoCollision[];
  /** Entradas novas gravadas em `audit_logs` (as já registadas não repetem). */
  logged: number;
}

/** Percorre a base, devolve os casos e audita os que ainda não estavam registados. */
export async function reportRecnoCollisions(source: RecnoGuardSource): Promise<RecnoReport> {
  invalidateRecnoGuardIndex();
  const collisions = await previewRecnoCollisions();
  let logged = 0;
  for (const collision of collisions) {
    if (await logCollision(collision, source)) logged += 1;
  }
  invalidateRecnoGuardIndex();
  return { collisions, logged };
}

/**
 * Verificação de UM ativo (conferência de campo): compara com a base e, se o
 * recno repetir com dados diferentes, devolve os conflitos e audita.
 */
export async function reportRecnoConflictForAsset(
  asset: RecnoCandidate,
  source: RecnoGuardSource = 'CONFERENCIA'
): Promise<RecnoReport> {
  const conflicts = await findRecnoConflictsForAsset(asset);
  if (conflicts.length === 0) return { collisions: [], logged: 0 };

  const group = [asset, ...conflicts];
  const rows = group.map((row): RecnoRowSummary => summarizeRecnoRow(row));
  const collision: RecnoCollision = {
    key: recnoKeyOf(asset),
    tenantid: String(asset.tenantid ?? '').trim().toUpperCase(),
    filial: String(asset.filial_raw || asset.filial || '').trim(),
    recno: Number(asset.sn1_recno),
    kind: recnoCollisionKindOf(rows),
    rows,
    signature: rows
      .map((row) => `${row.etiqueta}~${row.valor.toFixed(2)}~${row.descricao}`)
      .sort()
      .join('||')
  };

  const logged = (await logCollision(collision, source)) ? 1 : 0;
  return { collisions: [collision], logged };
}

/** Quantos casos cada seção do relatório mostra no log antes de resumir. */
const RECNO_REPORT_SECTION_LIMIT = 20;

const countRows = (collisions: ReadonlyArray<RecnoCollision>): number =>
  collisions.reduce((total, collision) => total + collision.rows.length, 0);

/**
 * Linhas de relatório para o log do Gestor de Base, separadas por diagnóstico:
 * recno repetido na LINHA SEGUINTE (mesmo registro, etiquetas vizinhas) e
 * ativos de ORIGENS DIFERENTES (recno compartilhado entre registos).
 */
export function formatRecnoReport(report: RecnoReport): string[] {
  if (report.collisions.length === 0) {
    return ['[RECNO] Nenhuma duplicidade por tenantid + filial + sn1_recno na base local.'];
  }

  const linhaSeguinte = report.collisions.filter((collision) => collision.kind === 'LINHA_SEGUINTE');
  const origensDiferentes = report.collisions.filter((collision) => collision.kind === 'ORIGENS_DIFERENTES');
  const lines = [
    `[RECNO] ${report.collisions.length} caso(s) · ${countRows(report.collisions)} linha(s) · ${report.logged} novo(s) em audit_logs`
  ];

  const pushSection = (title: string, cases: ReadonlyArray<RecnoCollision>): void => {
    if (cases.length === 0) return;
    lines.push(`[RECNO] ${title} — ${cases.length} caso(s) · ${countRows(cases)} linha(s)`);
    cases
      .slice(0, RECNO_REPORT_SECTION_LIMIT)
      .forEach((collision) => lines.push(`  ${describeRecnoCollision(collision)}`));
    if (cases.length > RECNO_REPORT_SECTION_LIMIT) {
      lines.push(`  ... e ${cases.length - RECNO_REPORT_SECTION_LIMIT} caso(s) — veja o CSV exportado.`);
    }
  };

  pushSection('Recno repetido na LINHA SEGUINTE (mesmo registro, etiquetas vizinhas)', linhaSeguinte);
  pushSection('Ativos de ORIGENS DIFERENTES (recno compartilhado)', origensDiferentes);
  lines.push('[RECNO] Nada foi bloqueado nem apagado. Use EXPORTAR CSV para levar a lista ao Protheus.');
  return lines;
}

/**
 * Colunas do CSV do relatório — o que o operador confere no Protheus (SN1).
 * A primeira coluna separa os dois diagnósticos do relatório.
 */
export const RECNO_CSV_COLUMNS = [
  'tipo',
  'tenantid',
  'filial',
  'recno',
  'registro',
  'etiqueta',
  'primarykey',
  'descricao',
  'valor',
  'qt',
  'status',
  'databaixa',
  'endereco',
  'notafiscal',
  'nomefornecedor',
  'dataaqusic',
  'contacontabil',
  'centrodecusto',
  'grupo'
] as const;

const csvCell = (value: string): string => {
  const escaped = value.replace(/"/g, '""');
  return /[";\r\n]/.test(value) ? `"${escaped}"` : escaped;
};

const kindOrder = (kind: RecnoCollision['kind']): number => (kind === 'LINHA_SEGUINTE' ? 0 : 1);

const sortForReport = (a: RecnoCollision, b: RecnoCollision): number =>
  kindOrder(a.kind) - kindOrder(b.kind) || a.filial.localeCompare(b.filial) || a.recno - b.recno;

/**
 * CSV do relatório (separador `;`, BOM para o Excel pt-BR abrir acentos).
 * Uma linha por ATIVO envolvido; a coluna `grupo` (R1, R2, …) amarra as linhas
 * do mesmo recno, e `tipo` diz se é repetição na linha seguinte ou origem
 * diferente.
 */
export function recnoReportToCsv(report: RecnoReport): string {
  const lines = [RECNO_CSV_COLUMNS.join(';')];
  const ordered = [...report.collisions].sort(sortForReport);

  ordered.forEach((collision, index) => {
    const grupo = `R${index + 1}`;
    collision.rows.forEach((row) => {
      const values: Record<(typeof RECNO_CSV_COLUMNS)[number], string> = {
        tipo: collision.kind,
        tenantid: collision.tenantid,
        filial: collision.filial,
        recno: String(collision.recno),
        registro: row.registro,
        etiqueta: row.etiqueta,
        primarykey: row.primarykey,
        descricao: row.descricao,
        valor: row.valor.toFixed(2),
        qt: row.qt,
        status: row.status,
        databaixa: row.databaixa,
        endereco: row.endereco,
        notafiscal: row.notafiscal,
        nomefornecedor: row.nomefornecedor,
        dataaqusic: row.dataaqusic,
        contacontabil: row.contacontabil,
        centrodecusto: row.centrodecusto,
        grupo
      };
      lines.push(RECNO_CSV_COLUMNS.map((column) => csvCell(values[column])).join(';'));
    });
  });

  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

/** Nome do ficheiro exportado (um por dia, fácil de reconhecer no telemóvel). */
export function recnoReportCsvFileName(date: Date = new Date()): string {
  return `RECNO_DUPLICIDADE_${date.toISOString().slice(0, 10).replace(/-/g, '')}.csv`;
}

/**
 * Baixa o CSV no navegador/telemóvel. Devolve o nome do ficheiro para o log
 * (no teste, sem `document`, o nome sai igual e nada é descarregado).
 */
export function downloadRecnoReportCsv(report: RecnoReport): string {
  const fileName = recnoReportCsvFileName();
  const csv = recnoReportToCsv(report);
  if (typeof document === 'undefined') return fileName;

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  return fileName;
}
