import { normalizeKey } from './schema';
import { hasUsableTag } from './etiquetaGroup';
import { isConferido, type MarcaDeConferencia } from './conferencia';
import { sanitizeAssetKey } from './assetKey';

/**
 * Identidade de um ativo para efeitos de limpeza de cópias:
 * `tenantid + filial + etiqueta`, todos normalizados.
 *
 * Um registo sem etiqueta NÃO tem identidade — fica de fora do agrupamento e
 * nunca é apagado. Isto é deliberado: apagar por engano um ativo legítimo é pior
 * do que manter uma cópia a mais.
 */
export interface DedupRow {
  primarykey: string;
  tenantid?: string;
  filial?: string;
  filial_raw?: string;
  etiqueta?: string;
  /** Quando a linha desceu da nuvem, traz `updated_at`; nem sempre existe. */
  updated_at?: string;
  /** Todas as grafias que a regra aceita (booleano, 0/1 e o texto legado). */
  _conferido?: MarcaDeConferencia;
  /** Coluna de auditoria, quando a linha desceu da planilha/nuvem. */
  AUDITOR_STATUS_CONFERENCIA?: unknown;
  _is_synced?: number;
  _auditor?: string | null;
  _dataLeitura?: string | null;
  _photoUrl?: string | null;
  _history?: string | null;
  gps_lat?: number | null;
  gps_lng?: number | null;
}

export const assetIdentityKey = (row: DedupRow): string => {
  // Placeholder (`ETIQUETAR`, `SEM ETIQUETA`, `0`, `S/N`) não identifica ativo:
  // a unitarização cria vários filhos com `etiqueta = 'ETIQUETAR'` e cada um é
  // um ativo distinto. Tratá-los como cópias apagava-os na limpeza e bloqueava
  // o envio — sem etiqueta utilizável, a linha fica fora do agrupamento.
  if (!hasUsableTag(row.etiqueta)) return '';
  const tenant = String(row.tenantid ?? '').trim().toUpperCase();
  const filial = normalizeKey(row.filial_raw || row.filial);
  const etiqueta = normalizeKey(row.etiqueta);
  return `${tenant}|${filial}|${etiqueta}`;
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
    if (isConferido(row) !== isConferido(best)) {
      return isConferido(row) ? row : best;
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
  /** Linhas sem etiqueta: nunca entram no agrupamento. */
  withoutIdentity: number;
}

/** Campos de um ativo que o ecrã lê para decidir se duas linhas são o MESMO bem. */
type AtivoDeEcra = {
  primarykey?: unknown;
  tenantid?: unknown;
  etiqueta?: unknown;
  filial?: unknown;
  filial_raw?: unknown;
  descricaodoativo?: unknown;
  serial?: unknown;
  dataaqusic?: unknown;
  qt?: unknown;
  _conferido?: unknown;
  _is_synced?: unknown;
};

const chavePrimariaDe = (row: AtivoDeEcra): string => String(row.primarykey ?? '').trim().toUpperCase();
const contratoDe = (row: AtivoDeEcra): string => String(row.tenantid ?? '').trim().toUpperCase();

/**
 * Identidade visível do ativo, SEM o contrato: `FILIAL|ETIQUETA`. É a mesma
 * identidade de conteúdo de `assetIdentityKey`, mas sem o `tenantid` — serve para
 * reconhecer a MESMA linha gravada em escopos de contrato diferentes (o caso da
 * carga antiga sem contrato).
 */
export const assetDisplayIdentityKey = (
  row: Pick<AtivoDeEcra, 'filial' | 'filial_raw' | 'etiqueta'>
): string => {
  if (!hasUsableTag(row.etiqueta)) return '';
  return `${normalizeKey(row.filial_raw || row.filial)}|${normalizeKey(row.etiqueta)}`;
};

/** Campos que descrevem o BEM (não a cópia): duas linhas só são o mesmo ativo
 *  com chave diferente se descreverem o mesmo bem. Campos de auditoria/sincronia
 *  (`_conferido`, `registro`, endereço, selo) ficam de fora de propósito. */
const CAMPOS_DO_BEM = ['descricaodoativo', 'serial', 'dataaqusic', 'qt'] as const;

const chaveDoBem = (row: AtivoDeEcra): string => {
  const identidade = assetDisplayIdentityKey(row);
  if (!identidade) return '';
  const bem = CAMPOS_DO_BEM.map((campo) => sanitizeAssetKey((row as Record<string, unknown>)[campo])).join('|');
  return `${identidade}#${bem}`;
};

/**
 * UMA LINHA POR ATIVO PARA ECRÃ (contagem e lista) — sem apagar nada.
 *
 * A chave local é composta `[tenantid + primarykey]`, e a mesma linha pode viver
 * no aparelho mais de uma vez:
 *
 *  1. com dois `tenantid` (resíduo de carga antiga sem contrato + carga
 *     canónica) → mesma `primarykey`;
 *  2. com `primarykey` diferentes, mas a MESMA filial, etiqueta e descrição do
 *     bem → a mesma linha importada duas vezes.
 *
 * Os espelhos ficam corretos, mas o ecrã lia as duas cópias: a consulta mostrava
 * o ativo duas vezes e a contagem do contrato somava as duas listas (12.636
 * viravam 25.272). Aqui fica uma linha por `primarykey` e, depois, uma por
 * `FILIAL|ETIQUETA` + descrição/série/data/quantidade. A cópia do contrato
 * ativo (`preferredTenant`) e a conferida são as que ficam; registos que
 * descrevem bens diferentes continuam todos, e linhas sem chave ficam na lista.
 * Nada é apagado da base.
 */
export function uniqueAssetsForDisplay<T extends AtivoDeEcra>(
  rows: T[],
  preferredTenant?: string | null
): T[] {
  const tenant = String(preferredTenant || '').trim().toUpperCase();

  const escolher = (bucket: T[]): T => {
    const doContrato = tenant ? bucket.filter((row) => contratoDe(row) === tenant) : [];
    const candidatos = doContrato.length > 0 ? doContrato : bucket;
    return pickKeeper(candidatos as unknown as DedupRow[]) as unknown as T;
  };

  const colapsar = (lista: T[], chave: (row: T) => string): T[] => {
    const buckets = new Map<string, T[]>();
    for (const row of lista) {
      const key = chave(row);
      if (!key) continue;
      const bucket = buckets.get(key);
      if (bucket) bucket.push(row);
      else buckets.set(key, [row]);
    }
    const keeperByKey = new Map<string, T>();
    buckets.forEach((bucket, key) => keeperByKey.set(key, escolher(bucket)));

    const emitted = new Set<string>();
    const out: T[] = [];
    for (const row of lista) {
      const key = chave(row);
      if (!key) {
        out.push(row);
        continue;
      }
      if (emitted.has(key)) continue;
      emitted.add(key);
      out.push(keeperByKey.get(key) as T);
    }
    return out;
  };

  return colapsar(colapsar(rows, chavePrimariaDe), chaveDoBem);
}

/** Um grupo de linhas que representam o MESMO ativo (filial + etiqueta). */
export interface GrupoRepetido {
  /** Rótulo legível: `FILIAL · ETIQUETA`. */
  identidade: string;
  linhas: number;
  /** `primarykey`s distintas encontradas no grupo. */
  chaves: string[];
  /** `true` quando todas as linhas do grupo partilham a mesma primarykey. */
  mesmaChave: boolean;
}

export interface ResumoRepetidos {
  /** Identidades (filial + etiqueta) com mais de uma linha no aparelho. */
  grupos: number;
  /** Grupos em que todas as linhas têm a MESMA primarykey (cópia por contrato). */
  mesmaChave: number;
  /** Grupos com primarykeys DIFERENTES (registos distintos ou importação repetida). */
  chavesDiferentes: number;
  /** Até `maxExemplos` grupos, para o dono reconhecer a etiqueta no aparelho. */
  exemplos: GrupoRepetido[];
}

/**
 * DIAGNÓSTICO: mede os ativos repetidos sem tocar em nada. A pergunta que
 * responde («as duas linhas do 005046 têm a mesma primarykey ou chaves
 * diferentes?») decide a correção: mesma chave é cópia por contrato; chaves
 * diferentes com o mesmo bem é importação repetida.
 */
export function summarizeDuplicateAssetKeys<T extends AtivoDeEcra>(
  rows: T[],
  maxExemplos = 5
): ResumoRepetidos {
  const porIdentidade = new Map<string, { identidade: string; chaves: Set<string>; linhas: number }>();

  for (const row of rows) {
    const key = assetDisplayIdentityKey(row);
    if (!key) continue;
    const entrada = porIdentidade.get(key) || {
      identidade: `${String(row.filial_raw || row.filial || '').trim() || '(sem filial)'} · ${String(row.etiqueta || '').trim()}`,
      chaves: new Set<string>(),
      linhas: 0
    };
    entrada.linhas += 1;
    entrada.chaves.add(chavePrimariaDe(row) || '(sem chave)');
    porIdentidade.set(key, entrada);
  }

  const grupos: GrupoRepetido[] = [];
  porIdentidade.forEach((entrada) => {
    if (entrada.linhas < 2) return;
    const chaves = Array.from(entrada.chaves).sort();
    grupos.push({
      identidade: entrada.identidade,
      linhas: entrada.linhas,
      chaves,
      mesmaChave: chaves.length === 1
    });
  });
  grupos.sort((a, b) => b.linhas - a.linhas || a.identidade.localeCompare(b.identidade));

  return {
    grupos: grupos.length,
    mesmaChave: grupos.filter((grupo) => grupo.mesmaChave).length,
    chavesDiferentes: grupos.filter((grupo) => !grupo.mesmaChave).length,
    exemplos: grupos.slice(0, maxExemplos)
  };
}

export function buildDedupPlan(rows: DedupRow[]): DedupPlan {
  const byKey = new Map<string, DedupRow[]>();
  let withoutIdentity = 0;

  for (const row of rows) {
    const key = assetIdentityKey(row);
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
    const conferida = bucket.find((row) => isConferido(row));
    const patch: DedupGroup['patch'] = {};
    if (conferida) {
      if (!isConferido(keeper)) patch._conferido = 1;
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
