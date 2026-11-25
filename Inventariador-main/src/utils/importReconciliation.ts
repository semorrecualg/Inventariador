/**
 * RECONCILIAÇÃO DA CARGA: planilha × base local, por filial.
 *
 * Regra do produto: nenhuma linha da planilha pode desaparecer. A carga é
 * append-only na intenção — mas o `bulkPut` grava por chave composta
 * `[tenantid+primarykey]`, portanto uma linha cuja chave já exista é
 * SUBSTITUÍDA (não somada) e uma linha cuja chave coincide com a de outra filial
 * troca de filial. Nos dois casos a planilha tem N linhas e a base fica com
 * menos de N registos daquela carga.
 *
 * Esta função compara o que a planilha mandou gravar com o que a base devolve
 * para as mesmas chaves — e o resultado BLOQUEIA a carga quando os números não
 * batem. Não apaga nada: só mede e explica.
 */

import { sanitizeAssetKey } from './assetKey';

export interface LoadedAssetRef {
  tenantid: string;
  /** Rótulo da filial tal como ficou na base (`filial_raw`, quando existir). */
  filial: string;
  primarykey: string;
  /**
   * Chave de origem (`source_primarykey`) — liga o registo à linha da planilha.
   * Só as linhas com chave de origem entram na deteção de órfãs.
   */
  source_primarykey?: string | null;
  /** Carga (`CARGA-…`) que gravou a linha; só existe nas lidas de volta da base. */
  import_batch?: string | null;
}

/** Registo que ficou na base com uma identidade que esta carga já não usa. */
export interface OrphanAssetRef {
  tenantid: string;
  primarykey: string;
  source_primarykey: string;
  import_batch?: string | null;
}

export interface FilialReconciliation {
  filial: string;
  /** Linhas da planilha desta filial. */
  planilha: number;
  /** Chaves desta filial encontradas na base. */
  gravadas: number;
}

export interface ImportReconciliation {
  ok: boolean;
  /** Linhas da planilha (todas). */
  planilha: number;
  /** Chaves distintas na planilha — o máximo que a base pode guardar. */
  distinctKeys: number;
  /** Linhas da carga encontradas na base. */
  gravadas: number;
  /** Chaves repetidas dentro do próprio arquivo (a última sobrescreve as outras). */
  duplicateKeys: { key: string; rows: number }[];
  /** Chaves da planilha que a base não devolveu. */
  missing: string[];
  /** Chaves que existem, mas noutra filial (colisão entre filiais). */
  wrongFilial: { key: string; expected: string; found: string }[];
  /**
   * Registos de cargas anteriores com a MESMA chave de origem (`source_primarykey`)
   * mas uma identidade que esta carga não usa — sobras de uma reimportação em que
   * a identidade interna da linha mudou. Não perdem linhas da planilha atual e
   * por isso não bloqueiam a carga: só ficam registados para limpeza explícita.
   */
  orphans: OrphanAssetRef[];
  perFilial: FilialReconciliation[];
  /** Texto pronto para o terminal do Gestor de Base. */
  lines: string[];
}

/** Contrato normalizado. */
const tenantOf = (ref: Pick<LoadedAssetRef, 'tenantid'>): string =>
  String(ref.tenantid ?? '').trim().toUpperCase();

/** Chave de comparação: contrato + chave primária. */
const keyOf = (ref: Pick<LoadedAssetRef, 'tenantid' | 'primarykey'>): string =>
  `${tenantOf(ref)}\u0000${String(ref.primarykey ?? '').trim().toUpperCase()}`;

/** Rótulo comparável da filial (caixa/espaços não são divergência). */
const filialOf = (ref: LoadedAssetRef): string =>
  String(ref.filial ?? '').trim().toUpperCase() || '(sem filial)';

const labelOf = (ref: LoadedAssetRef): string =>
  String(ref.filial ?? '').trim() || '(sem filial)';

const shortKey = (key: string): string => key.replace('\u0000', ' · ');

/**
 * ÓRFÃS DA REIMPORTAÇÃO — registos que a base ainda tem com a identidade antiga
 * da mesma linha da planilha.
 *
 * A identidade de um registo depende do CONTEÚDO e da chave de origem (Fase 2):
 * se a planilha ganhou uma chave repetida, as suas linhas passam a ter
 * identidades derivadas e a identidade anterior fica na base como sobra. A carga
 * atual está correta (planilha N = base N para as chaves dela); o que sobra é de
 * cargas anteriores. Compara-se por (contrato + filial + chave de origem
 * sanitizada) para não apanhar chaves legítimas de outra filial.
 */
export function findOrphanRows(
  expected: LoadedAssetRef[],
  existing: LoadedAssetRef[]
): OrphanAssetRef[] {
  const expectedKeys = new Set(expected.map(keyOf));
  const expectedBySource = new Map<string, Set<string>>();

  for (const ref of expected) {
    const source = sanitizeAssetKey(ref.source_primarykey);
    if (!source) continue;
    const scope = `${tenantOf(ref)}\u0000${filialOf(ref)}\u0000${source}`;
    const keys = expectedBySource.get(scope) || new Set<string>();
    keys.add(String(ref.primarykey ?? '').trim().toUpperCase());
    expectedBySource.set(scope, keys);
  }
  if (expectedBySource.size === 0) return [];

  const orphans = new Map<string, OrphanAssetRef>();
  for (const row of existing) {
    const source = sanitizeAssetKey(row.source_primarykey);
    if (!source) continue;
    const scope = `${tenantOf(row)}\u0000${filialOf(row)}\u0000${source}`;
    const expectedIds = expectedBySource.get(scope);
    if (!expectedIds) continue;
    const key = keyOf(row);
    if (expectedKeys.has(key)) continue;
    orphans.set(key, {
      tenantid: tenantOf(row),
      primarykey: String(row.primarykey ?? ''),
      source_primarykey: String(row.source_primarykey ?? ''),
      import_batch: row.import_batch ?? null
    });
  }
  return Array.from(orphans.values());
}

/**
 * Compara as linhas da planilha com as linhas que a base devolveu para as
 * mesmas chaves. `found` e `existing` devem conter apenas linhas lidas de volta
 * da base (`existing` nos escopos tocados pela carga, para a deteção de órfãs).
 */
export function reconcileImport(
  expected: LoadedAssetRef[],
  found: LoadedAssetRef[],
  existing: LoadedAssetRef[] = []
): ImportReconciliation {
  const expectedByKey = new Map<string, LoadedAssetRef>();
  const countsByKey = new Map<string, number>();
  const perFilialMap = new Map<string, FilialReconciliation>();

  for (const ref of expected) {
    const key = keyOf(ref);
    countsByKey.set(key, (countsByKey.get(key) ?? 0) + 1);
    if (!expectedByKey.has(key)) expectedByKey.set(key, ref);

    const filialKey = filialOf(ref);
    const entry = perFilialMap.get(filialKey) || { filial: labelOf(ref), planilha: 0, gravadas: 0 };
    entry.planilha += 1;
    perFilialMap.set(filialKey, entry);
  }

  const foundByKey = new Map<string, LoadedAssetRef>();
  for (const ref of found) {
    const key = keyOf(ref);
    if (!foundByKey.has(key)) foundByKey.set(key, ref);
  }

  const duplicateKeys: ImportReconciliation['duplicateKeys'] = [];
  countsByKey.forEach((rows, key) => {
    if (rows > 1) duplicateKeys.push({ key, rows });
  });

  const missing: string[] = [];
  const wrongFilial: ImportReconciliation['wrongFilial'] = [];
  let gravadas = 0;

  expectedByKey.forEach((ref, key) => {
    const stored = foundByKey.get(key);
    if (!stored) {
      missing.push(key);
      return;
    }
    if (filialOf(stored) !== filialOf(ref)) {
      wrongFilial.push({ key, expected: filialOf(ref), found: filialOf(stored) });
      // A linha existe, mas na filial errada: conta na filial onde a base a tem.
      const foundEntry = perFilialMap.get(filialOf(stored));
      if (foundEntry) foundEntry.gravadas += 1;
      return;
    }
    gravadas += 1;
    const entry = perFilialMap.get(filialOf(ref));
    if (entry) entry.gravadas += 1;
  });

  const orphans = findOrphanRows(expected, existing);

  // Chaves repetidas no arquivo perdem linhas na gravação: contam como
  // divergência mesmo que a base devolva a chave uma vez.
  const ok = missing.length === 0 && wrongFilial.length === 0 && duplicateKeys.length === 0;

  const perFilial = Array.from(perFilialMap.values()).sort((a, b) => b.planilha - a.planilha);

  const lines: string[] = [
    ok
      ? `[CARGA OK] planilha ${expected.length} · base ${gravadas} · ${expectedByKey.size} chave(s) distinta(s) em ${perFilial.length} filial(is).`
      : `[CARGA BLOQUEADA] planilha ${expected.length} linha(s) · base ${gravadas} — ${missing.length} ausente(s), ${wrongFilial.length} noutra filial, ${duplicateKeys.length} chave(s) repetida(s) no arquivo.`
  ];

  perFilial.forEach((entry) => {
    lines.push(`[CARGA] ${entry.filial}: planilha ${entry.planilha} → base ${entry.gravadas}`);
  });
  if (orphans.length > 0) {
    lines.push(
      `[CARGA] ${orphans.length} registo(s) órfão(s) de carga anterior (mesma chave de origem, identidade antiga) — nada é apagado automaticamente.`
    );
    orphans.slice(0, 5).forEach((orphan) => {
      const carga = orphan.import_batch ? ` · carga ${orphan.import_batch}` : '';
      lines.push(`[CARGA] órfão: ${shortKey(keyOf(orphan))} · origem ${orphan.source_primarykey}${carga}`);
    });
    if (orphans.length > 5) lines.push(`[CARGA] … e mais ${orphans.length - 5} órfão(s).`);
  }
  duplicateKeys.slice(0, 5).forEach((dup) => {
    lines.push(`[CARGA] chave repetida no arquivo (${dup.rows} linhas): ${shortKey(dup.key)}`);
  });
  if (duplicateKeys.length > 5) lines.push(`[CARGA] … e mais ${duplicateKeys.length - 5} chave(s) repetida(s).`);
  missing.slice(0, 5).forEach((key) => lines.push(`[CARGA] ausente na base: ${shortKey(key)}`));
  if (missing.length > 5) lines.push(`[CARGA] … e mais ${missing.length - 5} ausente(s).`);
  wrongFilial.slice(0, 5).forEach((item) => {
    lines.push(`[CARGA] ${shortKey(item.key)}: planilha ${item.expected} × base ${item.found}`);
  });
  if (wrongFilial.length > 5) lines.push(`[CARGA] … e mais ${wrongFilial.length - 5} linha(s) noutra filial.`);
  if (!ok) {
    lines.push('Nenhum registo é apagado pela carga: corrija a planilha (chaves repetidas) ou limpe a base e reimporte.');
  }

  return {
    ok,
    planilha: expected.length,
    distinctKeys: expectedByKey.size,
    gravadas,
    duplicateKeys,
    missing,
    wrongFilial,
    orphans,
    perFilial,
    lines
  };
}

/** Erro de integridade da carga — bloqueia, não é falha de rede. */
export class ImportReconciliationError extends Error {
  readonly report: ImportReconciliation;

  constructor(report: ImportReconciliation) {
    super(report.lines[0] ?? 'Carga bloqueada: planilha e base não batem.');
    this.name = 'ImportReconciliationError';
    this.report = report;
  }
}
