import { normalizeKey } from './schema';
import { contractAssetKey, filialCode } from './assetKey';

/**
 * Identidade de um ativo para efeitos de limpeza de cópias.
 *
 * A etiqueta NÃO identifica um ativo: a planilha contábil repete-a entre linhas
 * (contas, sub-registros, baixas), e essas linhas são ativos distintos que a
 * carga passou a preservar. Agrupar por etiqueta apagava-as.
 *
 * Regra:
 *   1. identidade do ERP — `tenantid + código da filial + registro + subreg`;
 *   2. assinatura do conteúdo (descrição, serial, quantidade, valor, conta…) —
 *      duas linhas só são cópias se descreverem o MESMO ativo;
 *   3. sem identidade de ERP, a etiqueta só serve de agrupamento quando quem
 *      chama pede confirmação explícita (`confirmEtiquetaDuplicates`).
 *
 * Um registo sem identidade fica de fora do agrupamento e nunca é apagado.
 * Apagar por engano um ativo legítimo é pior do que manter uma cópia a mais.
 */
export interface DedupRow {
  primarykey: string;
  tenantid?: string;
  filial?: string;
  filial_raw?: string;
  etiqueta?: string;
  registro?: string | number | null;
  subreg?: string | number | null;
  descricaodoativo?: string | null;
  serial?: string | null;
  qt?: string | number | null;
  vlraquisic?: string | number | null;
  contacontabil?: string | null;
  centrodecusto?: string | null;
  databaixa?: string | null;
  /** Quando a linha desceu da nuvem, traz `updated_at`; nem sempre existe. */
  updated_at?: string;
  _conferido?: number;
  _is_synced?: number;
  _auditor?: string | null;
  _dataLeitura?: string | null;
  _photoUrl?: string | null;
  _history?: string | null;
  gps_lat?: number | null;
  gps_lng?: number | null;
}

export interface DedupOptions {
  /**
   * Agrupar também linhas SEM identidade de ERP pela etiqueta (comportamento
   * antigo). Exige confirmação explícita: com a chave do contrato, etiqueta
   * repetida é normal e apagá-la destrói ativos legítimos.
   */
  confirmEtiquetaDuplicates?: boolean;
}

/**
 * Assinatura do conteúdo do ativo. Entra na identidade de propósito: duas
 * linhas com a mesma identidade de contrato mas descrições diferentes são
 * ativos distintos (a carga dá-lhes `-2`, `-3`), não cópias.
 */
export const contentSignatureOf = (row: DedupRow): string =>
  [
    row.descricaodoativo,
    row.serial,
    row.qt,
    row.vlraquisic,
    row.contacontabil,
    row.centrodecusto,
    row.databaixa
  ]
    .map((value) => normalizeKey(value))
    .join('|');

/** Identidade do ERP: contrato + `código da filial + registro + subreg`. */
export const erpIdentityOf = (row: DedupRow): string => {
  const tenant = String(row.tenantid ?? '').trim().toUpperCase();
  const erpKey = contractAssetKey({
    filial: row.filial_raw || row.filial,
    registro: row.registro,
    subreg: row.subreg
  });
  return erpKey ? `${tenant}|ERP|${erpKey}` : '';
};

export const assetIdentityKey = (row: DedupRow, options: DedupOptions = {}): string => {
  const signature = contentSignatureOf(row);
  const erp = erpIdentityOf(row);
  if (erp) return `${erp}|${signature}`;

  if (!options.confirmEtiquetaDuplicates) return '';
  const tenant = String(row.tenantid ?? '').trim().toUpperCase();
  const filial = normalizeKey(row.filial_raw || row.filial) || filialCode(row.filial_raw || row.filial);
  const etiqueta = normalizeKey(row.etiqueta);
  if (!etiqueta) return '';
  return `${tenant}|ETQ|${filial}|${etiqueta}|${signature}`;
};

const recencyOf = (row: DedupRow): number => {
  const parsed = Date.parse(String(row.updated_at || ''));
  return Number.isNaN(parsed) ? 0 : parsed;
};

const completenessOf = (row: DedupRow): number =>
  [row._photoUrl, row._history, row.gps_lat, row.gps_lng, row._auditor, row._dataLeitura].filter(
    (value) => value !== null && value !== undefined && value !== ''
  ).length;

/**
 * Escolhe a linha que fica.
 *
 * 1. Conferida primeiro — a conferência é o dado de auditoria e não pode
 *    desaparecer na limpeza.
 * 2. `updated_at` mais recente (quando a linha veio da nuvem).
 * 3. Já sincronizada com a nuvem.
 * 4. Mais campos preenchidos (foto, GPS, histórico, autor, data).
 * 5. Desempate determinístico pelo `primarykey` — a limpeza tem de ser repetível.
 *
 * Nota: os ativos não guardam data de criação local. Sem `updated_at`, "mais
 * recente" é aproximado pelos critérios 3 a 5, e a escolha é sempre a mesma em
 * qualquer dispositivo.
 */
export const pickKeeper = (rows: DedupRow[]): DedupRow =>
  rows.reduce((best, row) => {
    if (Number(row._conferido) === 1 !== (Number(best._conferido) === 1)) {
      return Number(row._conferido) === 1 ? row : best;
    }
    if (recencyOf(row) !== recencyOf(best)) return recencyOf(row) > recencyOf(best) ? row : best;
    if (Number(row._is_synced) === 1 !== (Number(best._is_synced) === 1)) {
      return Number(row._is_synced) === 1 ? row : best;
    }
    const fill = completenessOf(row) - completenessOf(best);
    if (fill !== 0) return fill > 0 ? row : best;
    return String(row.primarykey) > String(best.primarykey) ? row : best;
  });

export interface DedupGroup {
  key: string;
  keeper: DedupRow;
  removed: DedupRow[];
  /** Campos de conferência que vêm de outra cópia (o keeper não os tinha). */
  patch: Partial<Pick<DedupRow, '_auditor' | '_dataLeitura' | '_conferido'>>;
}

export interface DedupPlan {
  groups: DedupGroup[];
  /** Total de linhas analisadas (todas, inclusive as que ficam). */
  total: number;
  /** Cópias a remover. */
  duplicates: number;
  /** Linhas sem identidade de ERP (ou sem etiqueta, no modo antigo). */
  withoutIdentity: number;
}

export function buildDedupPlan(rows: DedupRow[], options: DedupOptions = {}): DedupPlan {
  const byKey = new Map<string, DedupRow[]>();
  let withoutIdentity = 0;

  for (const row of rows) {
    const key = assetIdentityKey(row, options);
    if (!key) {
      withoutIdentity += 1;
      continue;
    }
    const bucket = byKey.get(key);
    if (bucket) bucket.push(row);
    else byKey.set(key, [row]);
  }

  const groups: DedupGroup[] = [];
  let duplicates = 0;

  byKey.forEach((bucket, key) => {
    if (bucket.length < 2) return;
    const keeper = pickKeeper(bucket);
    const removed = bucket.filter((row) => row !== keeper);
    // Conferência de qualquer cópia é preservada no keeper.
    const conferida = bucket.find((row) => Number(row._conferido) === 1);
    const patch: DedupGroup['patch'] = {};
    if (conferida) {
      if (Number(keeper._conferido) !== 1) patch._conferido = 1;
      const auditor = bucket.find((row) => row._auditor);
      const dataLeitura = bucket.find((row) => row._dataLeitura);
      if (!keeper._auditor && auditor?._auditor) patch._auditor = auditor._auditor;
      if (!keeper._dataLeitura && dataLeitura?._dataLeitura) patch._dataLeitura = dataLeitura._dataLeitura;
    }
    duplicates += removed.length;
    groups.push({ key, keeper, removed, patch });
  });

  return { groups, total: rows.length, duplicates, withoutIdentity };
}
