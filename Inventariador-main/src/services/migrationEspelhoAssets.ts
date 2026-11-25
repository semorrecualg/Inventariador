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
//         duas tabelas vivas e acerta os espelhos. A linha viva manda: quando
//         a chave já existe numa delas, é essa que se copia para a que falta,
//         não a versão atrasada de `assets` — assim os dois espelhos não
//         ficam divergentes. Quem só existe em `assets` (sem par em nenhuma
//         das duas) é copiado para ambas. Nada é apagado.
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
 * Acerta `local_assets` e `ativos` com base nas chaves que existem em
 * `assets`. A linha viva ganha sempre: se a chave está numa das tabelas vivas,
 * é essa linha que se copia para a outra, mantendo os dois espelhos iguais; a
 * versão de `assets` só é usada quando a chave não existe em nenhuma das duas.
 * Devolve quantas cópias foram escritas.
 */
export const resgatarEspelhoAssets = async (tx: TxDeResgate): Promise<number> => {
  const origens = await tx.table(ESPELHO_LEGADO).toArray();
  let alinhadas = 0;

  for (const linha of origens) {
    const tenantid = String(linha.tenantid ?? '').trim().toUpperCase();
    const primarykey = String(linha.primarykey ?? linha.id ?? '').trim();
    // Sem chave de origem não há como comparar: a linha não é recuperável.
    if (!primarykey) continue;

    const chave: [string, string] = [tenantid, primarykey];
    const vivas = await Promise.all(TABELAS_VIVAS.map((tabela) => tx.table(tabela).get(chave)));
    // Primeira linha viva encontrada (ordem de TABELAS_VIVAS) é a fonte.
    const fonte: Linha =
      vivas.find((viva): viva is Linha => viva !== undefined) ?? {
        ...linha,
        tenantid,
        id: primarykey
      };

    for (let i = 0; i < TABELAS_VIVAS.length; i += 1) {
      if (vivas[i]) continue;
      await tx.table(TABELAS_VIVAS[i]).put(fonte);
      alinhadas += 1;
    }
  }

  if (alinhadas > 0) {
    logger.warn(
      `[MigrationV10] ${alinhadas} linha(s) copiadas entre local_assets/ativos a partir do espelho 'assets' antes da remoção.`
    );
  }
  return alinhadas;
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
