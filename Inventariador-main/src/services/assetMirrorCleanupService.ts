import { db, invalidateTenantCaseMarker } from './sqliteService';
import { ASSET_MIRROR_TABLES, type AssetMirrorTable } from './assetDedupService';
import { pickKeeper, type DedupRow } from '../utils/dedupAssets';
import { sanitizeAssetKey } from '../utils/assetKey';

/**
 * LIMPEZA DE CÓPIAS EXATAS do aparelho — uma linha por ativo.
 *
 * O que este serviço faz (e o que NÃO faz):
 *  · Cópia exata = MESMA `primarykey` normalizada **e** conteúdo idêntico em
 *    todos os campos do bem. Nada mais é removido.
 *  · `primarykey`s diferentes NUNCA são fundidas, mesmo com a mesma filial,
 *    etiqueta e descrição: no aparelho a etiqueta `008488 CCPL` tem 18 linhas e
 *    9 chaves (`…CX01` a `…CX09`) — são bens distintos (ver
 *    `utils/dedupAssets.uniqueAssetsForDisplay`).
 *  · Contratos diferentes com a mesma chave continuam intocados: o modelo é
 *    multi-tenant por desenho (`docs/RECONCILIACAO_IDENTIDADES.md` §5). Com um
 *    contrato ativo, só entram linhas desse contrato e as sem contrato
 *    (`tenantid` vazio, resíduo de carga antiga).
 *  · Toda remoção é gravada ANTES numa cópia de segurança, na MESMA transação:
 *    ou fica tudo (backup + linhas apagadas), ou não fica nada. O backup é o
 *    que permite `restoreExactCopyCleanup` (botão «DESFAZER»).
 *
 * O diagnóstico de `assetDedupService` (mesmo tenantid + filial + etiqueta)
 * continua a ser só leitura e é outra pergunta: «que grafias criaram a cópia?».
 * Aqui a pergunta é «que linha é literalmente a mesma linha?».
 */

/** Campos que não fazem parte do conteúdo do bem. */
const FORA_DO_CONTEUDO = new Set([
  // Escopo e chave: é justamente o que difere entre as duas cópias.
  'tenantid',
  'primarykey',
  'id',
  // Proveniência da carga: duas cargas do mesmo ficheiro não são dois bens.
  'source_primarykey',
  'source_row',
  'import_batch',
  // Carimbos de sincronização: não são dados do ativo.
  '_is_synced',
  'updated_at',
  '_lastPulledAt',
  'lastPulledAt',
  '_syncFailAt',
  '_syncFailReason'
]);

type Linha = Record<string, unknown>;

export interface ExactCopyTableReport {
  table: AssetMirrorTable;
  before: number;
  after: number;
  removed: number;
  groups: number;
}

export interface ExactCopyReport {
  /** Contrato ativo da limpeza (`''` = qualquer contrato, sem cruzar contratos). */
  tenantid: string;
  /** `false` na pré-visualização: nada foi escrito. */
  applied: boolean;
  /** Linhas e cópias do espelho canónico (`local_assets`). */
  before: number;
  after: number;
  removed: number;
  /** Cópias removidas somando os três espelhos. */
  removedTotal: number;
  /** Chaves distintas (uma por `primarykey`) antes e depois — têm de ser iguais. */
  distinctBefore: number;
  distinctAfter: number;
  groups: number;
  /** Grupos com a mesma chave mas conteúdo diferente: preservados, não são cópia. */
  skippedDifferentContent: number;
  withoutKey: number;
  tables: ExactCopyTableReport[];
  examples: { chave: string; filial: string; mantida: string; removidas: number }[];
  backupId?: string;
}

interface Remocao {
  /** Chave composta REAL guardada no Dexie: [tenantid, primarykey]. */
  key: [string, string];
  row: Linha;
  keeper: Linha;
}

interface PlanoTabela {
  table: AssetMirrorTable;
  rows: Linha[];
  removals: Remocao[];
  /** Chaves com cópia exata (uma por identidade, não uma por linha). */
  groupKeys: Set<string>;
  /** Chaves com a mesma identidade e conteúdo diferente: preservadas. */
  skippedKeys: Set<string>;
  withoutKey: number;
}

/** União das chaves de todos os espelhos — os três espelhos são o mesmo inventário. */
const uniaoDeChaves = (planos: PlanoTabela[], campo: 'groupKeys' | 'skippedKeys'): number => {
  const chaves = new Set<string>();
  planos.forEach((plano) => plano[campo].forEach((chave) => chaves.add(chave)));
  return chaves.size;
};

const tenantKeyOf = (row: Linha): string => String(row.tenantid ?? '').trim().toUpperCase();
const rawKeyOf = (row: Linha): string => String(row.primarykey ?? row.id ?? '');
/** Identidade do ativo: `primarykey` canónica (trim, caixa alta, sem lixo). */
const chaveOf = (row: Linha): string => sanitizeAssetKey(rawKeyOf(row));
const filialOf = (row: Linha): string =>
  String(row.filial_raw || row.filial || '').trim() || '(sem filial)';

/** JSON estável (chaves ordenadas) — a comparação não pode depender da ordem. */
const jsonEstavel = (value: unknown): string => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(jsonEstavel).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const pares = Object.keys(obj)
    .filter((key) => obj[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${jsonEstavel(obj[key])}`);
  return `{${pares.join(',')}}`;
};

/** Conteúdo do bem, sem escopo, sem proveniência e sem carimbos de envio. */
export const assetContentFingerprint = (row: Linha): string => {
  const conteudo: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (FORA_DO_CONTEUDO.has(key)) continue;
    conteudo[key] = value;
  }
  return jsonEstavel(conteudo);
};

/**
 * Preferência da linha que FICA: primeiro o contrato ativo (nunca deixar o ativo
 * fora do contrato), depois a grafia canónica da chave (a que a nuvem usa).
 * Empate resolvido por `pickKeeper` (conferida → mais recente → sincronizada →
 * mais completa → chave maior), que é determinístico.
 */
const preferenciaDe = (row: Linha, contrato: string): number => {
  const tenant = tenantKeyOf(row);
  const doContrato = contrato ? (tenant === contrato ? 2 : tenant === '' ? 1 : 0) : tenant ? 1 : 0;
  const canonica = rawKeyOf(row) === chaveOf(row) ? 1 : 0;
  return doContrato * 2 + canonica;
};

const escolherKeeper = (rows: Linha[], contrato: string): Linha => {
  const topo = Math.max(...rows.map((row) => preferenciaDe(row, contrato)));
  const finalistas = rows.filter((row) => preferenciaDe(row, contrato) === topo);
  return pickKeeper(finalistas as unknown as DedupRow[]) as unknown as Linha;
};

const planoDaTabela = (table: AssetMirrorTable, rows: Linha[], contrato: string): PlanoTabela => {
  const porChave = new Map<string, Linha[]>();
  let withoutKey = 0;

  for (const row of rows) {
    const chave = chaveOf(row);
    if (!chave) {
      withoutKey += 1;
      continue;
    }
    const bucket = porChave.get(chave);
    if (bucket) bucket.push(row);
    else porChave.set(chave, [row]);
  }

  const removals: Remocao[] = [];
  const groupKeys = new Set<string>();
  const skippedKeys = new Set<string>();

  porChave.forEach((bucket, chave) => {
    if (bucket.length < 2) return;

    // Grupo que toca outro contrato fica inteiro: o mesmo `primarykey` em
    // contratos distintos é legítimo (base multi-tenant), não é cópia.
    const contratosDoGrupo = new Set(bucket.map(tenantKeyOf).filter(Boolean));
    if (contratosDoGrupo.size > 1) return;
    if (contrato && bucket.some((row) => tenantKeyOf(row) !== '' && tenantKeyOf(row) !== contrato)) return;

    // Mesma chave, conteúdo diferente = registos distintos: preserva ambos.
    const porConteudo = new Map<string, Linha[]>();
    for (const row of bucket) {
      const impressao = assetContentFingerprint(row);
      const iguais = porConteudo.get(impressao);
      if (iguais) iguais.push(row);
      else porConteudo.set(impressao, [row]);
    }
    if (porConteudo.size > 1) skippedKeys.add(chave);

    porConteudo.forEach((iguais) => {
      if (iguais.length < 2) return;
      const keeper = escolherKeeper(iguais, contrato);
      groupKeys.add(chave);
      for (const row of iguais) {
        if (row === keeper) continue;
        removals.push({
          key: [String(row.tenantid ?? ''), String(row.primarykey ?? '')],
          row,
          keeper
        });
      }
    });
  });

  return { table, rows, removals, groupKeys, skippedKeys, withoutKey };
};

const contarChavesDistintas = (rowsPorTabela: Linha[][]): number => {
  const chaves = new Set<string>();
  for (const rows of rowsPorTabela) {
    for (const row of rows) {
      const chave = chaveOf(row);
      if (chave) chaves.add(chave);
    }
  }
  return chaves.size;
};

const resumoRelatorio = (
  contrato: string,
  planos: PlanoTabela[],
  applied: boolean,
  incluirBackup: boolean,
  backupId?: string
): ExactCopyReport => {
  const tables: ExactCopyTableReport[] = planos.map((plano) => ({
    table: plano.table,
    before: plano.rows.length,
    after: plano.rows.length - plano.removals.length,
    removed: plano.removals.length,
    groups: plano.groupKeys.size
  }));

  const localAssets = tables.find((table) => table.table === 'local_assets');
  const removidasPorChave = new Map<string, { filial: string; mantida: string; removidas: number }>();
  for (const plano of planos) {
    for (const remocao of plano.removals) {
      const chave = chaveOf(remocao.row);
      const entrada = removidasPorChave.get(chave) || {
        filial: filialOf(remocao.row),
        mantida: rawKeyOf(remocao.keeper),
        removidas: 0
      };
      entrada.removidas += 1;
      removidasPorChave.set(chave, entrada);
    }
  }

  // Comparar chaves distintas antes/depois em O(n): uma varredura só, com o
  // conjunto das linhas removidas (nunca `some` dentro de `filter`).
  const removidas = new Set<Linha>();
  planos.forEach((plano) => plano.removals.forEach((remocao) => removidas.add(remocao.row)));

  return {
    tenantid: contrato,
    applied,
    before: localAssets?.before ?? 0,
    after: localAssets?.after ?? 0,
    removed: localAssets?.removed ?? 0,
    removedTotal: tables.reduce((total, table) => total + table.removed, 0),
    distinctBefore: contarChavesDistintas(planos.map((plano) => plano.rows)),
    distinctAfter: contarChavesDistintas(
      planos.map((plano) => plano.rows.filter((row) => !removidas.has(row)))
    ),
    groups: uniaoDeChaves(planos, 'groupKeys'),
    skippedDifferentContent: uniaoDeChaves(planos, 'skippedKeys'),
    withoutKey: planos.reduce((total, plano) => total + plano.withoutKey, 0),
    tables,
    examples: Array.from(removidasPorChave.entries())
      .slice(0, 5)
      .map(([chave, entrada]) => ({ chave, ...entrada })),
    backupId: incluirBackup ? backupId : undefined
  };
};

/** Pré-visualização: mesmas contagens da limpeza, sem escrever nada. */
export async function previewExactCopyCleanup(tenantid?: string | null): Promise<ExactCopyReport> {
  const contrato = String(tenantid || '').trim().toUpperCase();
  const planos: PlanoTabela[] = [];
  for (const table of ASSET_MIRROR_TABLES) {
    const rows = (await db[table].toArray()) as unknown as Linha[];
    planos.push(planoDaTabela(table, rows, contrato));
  }
  return resumoRelatorio(contrato, planos, false, false);
}

const BACKUP_CHUNK = 1000;

const novoCleanupId = (): string =>
  `CLN_${new Date().toISOString().replace(/[-:.TZ]/g, '')}_${Math.random().toString(36).slice(2, 8)}`;

/**
 * Remove as cópias exatas e devolve as contagens antes/depois. Backup + remoções
 * correm na mesma transação — uma falha a meio deixa a base exatamente como
 * estava.
 */
export async function cleanExactAssetCopies(tenantid?: string | null): Promise<ExactCopyReport> {
  const contrato = String(tenantid || '').trim().toUpperCase();
  const cleanupId = novoCleanupId();
  const createdAt = new Date().toISOString();
  let relatorio: ExactCopyReport | null = null;

  await db.transaction(
    'rw',
    db.local_assets,
    db.ativos,
    db.assets,
    db.asset_cleanup_backups,
    async () => {
      const planos: PlanoTabela[] = [];
      for (const table of ASSET_MIRROR_TABLES) {
        const rows = (await db[table].toArray()) as unknown as Linha[];
        planos.push(planoDaTabela(table, rows, contrato));
      }

      relatorio = resumoRelatorio(contrato, planos, true, false);
      // A limpeza só remove cópias da MESMA chave: o número de ativos (chaves
      // distintas) não pode mudar. Se mudasse, aborta antes de tocar em nada.
      if (relatorio.distinctAfter !== relatorio.distinctBefore) {
        throw new Error(
          `Limpeza abortada: ${relatorio.distinctBefore} chaves distintas antes, ${relatorio.distinctAfter} depois.`
        );
      }
      if (relatorio.removedTotal === 0) {
        relatorio = { ...relatorio, backupId: undefined };
        return;
      }

      // 1. Backup PRIMEIRO, na mesma transação.
      let chunk = 0;
      for (const plano of planos) {
        for (let inicio = 0; inicio < plano.removals.length; inicio += BACKUP_CHUNK) {
          const rows = plano.removals.slice(inicio, inicio + BACKUP_CHUNK).map((remocao) => remocao.row);
          await db.asset_cleanup_backups.add({
            cleanup_id: cleanupId,
            kind: 'rows',
            table: plano.table,
            chunk,
            rows: JSON.stringify(rows),
            created_at: createdAt
          });
          chunk += 1;
        }
      }
      await db.asset_cleanup_backups.add({
        cleanup_id: cleanupId,
        kind: 'meta',
        table: 'meta',
        chunk: 0,
        rows: JSON.stringify({
          tenantid: contrato,
          removed: relatorio.removed,
          removedTotal: relatorio.removedTotal,
          groups: relatorio.groups,
          distinctBefore: relatorio.distinctBefore,
          distinctAfter: relatorio.distinctAfter,
          tables: relatorio.tables
        }),
        created_at: createdAt
      });

      // 2. A linha que fica herda o estado de sincronização das cópias — sem
      // isso, apagar a cópia já sincronizada marcava o ativo para reenvio.
      for (const plano of planos) {
        const porKeeper = new Map<Linha, Linha[]>();
        for (const remocao of plano.removals) {
          const lista = porKeeper.get(remocao.keeper);
          if (lista) lista.push(remocao.row);
          else porKeeper.set(remocao.keeper, [remocao.row]);
        }
        for (const [keeper, removidas] of porKeeper) {
          const patch: Linha = {};
          if (Number(keeper._is_synced) !== 1 && removidas.some((row) => Number(row._is_synced) === 1)) {
            patch._is_synced = 1;
          }
          if (!keeper._syncFailAt) {
            const falha = removidas.find((row) => row._syncFailAt);
            if (falha) {
              patch._syncFailAt = falha._syncFailAt;
              patch._syncFailReason = falha._syncFailReason ?? null;
            }
          }
          if (Object.keys(patch).length > 0) {
            await db[plano.table].put({ ...keeper, ...patch } as never);
          }
        }
      }

      // 3. Só agora as cópias saem.
      for (const plano of planos) {
        if (plano.removals.length === 0) continue;
        await db[plano.table].bulkDelete(plano.removals.map((remocao) => remocao.key));
      }

      relatorio = { ...relatorio, backupId: cleanupId };
    }
  );

  if (!relatorio) throw new Error('Limpeza não executada: transação terminou sem relatório.');
  return relatorio;
}

export interface ExactCopyBackupInfo {
  id: string;
  createdAt: string;
  removed: number;
  removedTotal: number;
  groups: number;
}

/** Última limpeza com backup guardado — é o que o botão «DESFAZER» usa. */
export async function latestExactCopyBackup(): Promise<ExactCopyBackupInfo | null> {
  const metas = await db.asset_cleanup_backups.where('kind').equals('meta').toArray();
  if (metas.length === 0) return null;
  const ultima = metas.reduce((best, meta) => (meta.created_at > best.created_at ? meta : best));
  const detalhe = JSON.parse(ultima.rows) as {
    removed?: number;
    removedTotal?: number;
    groups?: number;
  };
  return {
    id: ultima.cleanup_id,
    createdAt: ultima.created_at,
    removed: Number(detalhe.removed ?? 0),
    removedTotal: Number(detalhe.removedTotal ?? 0),
    groups: Number(detalhe.groups ?? 0)
  };
}

/**
 * Reverte uma limpeza: devolve as linhas removidas aos três espelhos, com as
 * chaves exatas que tinham (inclusive `tenantid` vazio e grafia da chave).
 * `bulkPut` é idempotente — repetir não duplica. O backup NÃO é apagado.
 */
export async function restoreExactCopyCleanup(cleanupId: string): Promise<{ restored: number }> {
  const registos = await db.asset_cleanup_backups.where('cleanup_id').equals(cleanupId).toArray();
  const porTabela = new Map<AssetMirrorTable, Linha[]>();
  for (const registo of registos) {
    if (registo.kind !== 'rows') continue;
    if (!ASSET_MIRROR_TABLES.includes(registo.table as AssetMirrorTable)) continue;
    const rows = JSON.parse(registo.rows) as Linha[];
    const lista = porTabela.get(registo.table as AssetMirrorTable) || [];
    lista.push(...rows);
    porTabela.set(registo.table as AssetMirrorTable, lista);
  }

  let restored = 0;
  await db.transaction('rw', db.local_assets, db.ativos, db.assets, async () => {
    for (const [table, rows] of porTabela) {
      if (rows.length === 0) continue;
      await db[table].bulkPut(rows as never[]);
      restored += rows.length;
    }
  });
  await invalidateTenantCaseMarker();
  return { restored };
}

/** Linhas do relatório para o log do Gestor de Base. */
export function formatExactCopyReport(report: ExactCopyReport): string[] {
  const espelhos = report.tables
    .map((table) => `${table.table}=${table.after}`)
    .join(' · ');
  const espelhosAntes = report.tables
    .map((table) => `${table.table}=${table.before}`)
    .join(' · ');
  const linhas = [
    `[DEDUP] CÓPIA EXATA — ANTES: ${espelhosAntes}`,
    report.applied
      ? `[DEDUP] CÓPIA EXATA — DEPOIS: ${espelhos} · ${report.removedTotal} linha(s) removida(s)`
      : `[DEDUP] CÓPIA EXATA — DEPOIS (projeção): ${espelhos} · ${report.removedTotal} linha(s) a remover`,
    `[DEDUP] Chaves distintas (um ativo por primarykey): ${report.distinctBefore} → ${report.distinctAfter} · grupos de cópia: ${report.groups}`,
    `[DEDUP] Preservados: ${report.skippedDifferentContent} grupo(s) com a mesma chave e conteúdo diferente · ${report.withoutKey} linha(s) sem chave`
  ];
  report.examples.forEach((example) => {
    linhas.push(
      `[DEDUP] ex. ${example.filial} · chave mantida "${example.mantida}" · ${example.removidas} cópia(s)`
    );
  });
  if (report.applied) {
    linhas.push(
      report.backupId
        ? `[DEDUP] Backup ${report.backupId}: «DESFAZER LIMPEZA» devolve estas linhas; o JSON de backup do Gestor restaura a base inteira.`
        : '[DEDUP] Nenhuma cópia exata — nada foi apagado.'
    );
  }
  return linhas;
}
