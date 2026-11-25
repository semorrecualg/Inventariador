// ============================================================================
// migrationEspelhoAssets.ts — A.3a.4: resgate e extinção do terceiro espelho.
//
// Vive fora do construtor da base de propósito: o teste de migração chama
// ESTA função, a mesma que o upgrade real corre, em vez de reimplementar a
// migração (que passaria a proteger uma cópia e não o código de produção).
//
// Dois passos, porque o Dexie não expõe uma store no upgrade que a apaga
// (dexie#275/#276):
//   v10 — resgate: lê `assets`, compara por `[tenantid+primarykey]` com as
//         duas tabelas vivas e copia para cada uma SÓ o que falta. Linha
//         existente não é sobrescrita: o espelho que o app lê é a fonte de
//         verdade. Nada é apagado.
//   v11 — extinção: `assets: null` apaga a store.
// ============================================================================
import type Dexie from 'dexie';
import { logger } from '../utils/logger';

export const ESPELHO_LEGADO = 'assets';
export const TABELAS_VIVAS = ['local_assets', 'ativos'] as const;
export type TabelaViva = (typeof TABELAS_VIVAS)[number];

type Linha = Record<string, unknown>;

/**
 * Superfície mínima de `Dexie.Transaction` usada pelo resgate. Permite testar
 * a função sem montar uma transacção real, mantendo a assinatura do upgrade.
 */
export interface TxDeResgate {
  table(nome: string): {
    get(chave: [string, string]): Promise<Linha | undefined>;
    put(linha: Linha): Promise<unknown>;
    toArray(): Promise<Linha[]>;
  };
}

/**
 * Copia para `local_assets` e `ativos` as linhas de `assets` que não têm par.
 * Devolve quantas cópias foram escritas (0 quando o espelho estava vazio ou
 * era réplica integral das tabelas vivas).
 */
export const resgatarEspelhoAssets = async (tx: TxDeResgate): Promise<number> => {
  const origens = await tx.table(ESPELHO_LEGADO).toArray();
  let resgatadas = 0;

  for (const linha of origens) {
    const tenantid = String(linha.tenantid ?? '').trim().toUpperCase();
    const primarykey = String(linha.primarykey ?? linha.id ?? '').trim();
    // Sem chave de origem não há como comparar: a linha não é recuperável.
    if (!primarykey) continue;

    const chave: [string, string] = [tenantid, primarykey];
    const copia: Linha = { ...linha, tenantid, id: primarykey };

    for (const tabela of TABELAS_VIVAS) {
      if (await tx.table(tabela).get(chave)) continue;
      await tx.table(tabela).put(copia);
      resgatadas += 1;
    }
  }

  if (resgatadas > 0) {
    logger.warn(
      `[MigrationV10] ${resgatadas} linha(s) existentes só no espelho 'assets' copiadas para local_assets/ativos antes da remoção.`
    );
  }
  return resgatadas;
};

// Assinatura das tabelas de ativos: chave composta `[tenantid+primarykey]` e
// os mesmos índices das tabelas vivas (v6/v7). Repetida aqui porque a v10 é
// declarada neste módulo.
const SPEC_ATIVOS = '[tenantid+primarykey], primarykey, filial, _is_synced, [tenantid+filial]';

/**
 * Declara na base as versões da A.3a.4. Chamada pelo construtor de
 * `InventoryDexieDatabase` e pelo teste de migração — a mesma função, para o
 * teste cobrir o upgrade real.
 */
export const registarResgateEExtincaoDoEspelho = (db: Dexie): void => {
  db.version(10)
    .stores({ [ESPELHO_LEGADO]: SPEC_ATIVOS })
    .upgrade((tx) => resgatarEspelhoAssets(tx as unknown as TxDeResgate));

  db.version(11).stores({ [ESPELHO_LEGADO]: null });
};
