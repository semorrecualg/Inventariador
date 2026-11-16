// ============================================================================
// Preparação do dispositivo para uma NOVA CARGA
// ----------------------------------------------------------------------------
// Depois de a base da nuvem ser reiniciada, a base local ainda tem as linhas e
// as chaves antigas. Sem este passo, o primeiro sync reenvia tudo o que está
// gravado e as migrações de chave não voltam a correr — as flags ficam
// `done` —, de modo que o reset da nuvem perde o efeito.
//
// Esta rotina limpa o inventário local, o espelho virtual e as flags de
// migração/reparação, deixando o dispositivo pronto para carregar a planilha de
// novo. É destrutiva por natureza: o ecrã do Gestor de Base pede confirmação
// antes de a chamar.
// ============================================================================

import { db } from './sqliteService';
import { clearVirtualSnapshot } from './localDbService';
import { ASSET_KEY_MIGRATION_FLAG } from './assetKeyMigration';
import { FISCAL_ACCOUNT_REPAIR_FLAG } from './syncService';

/** Flags que voltam a correr na primeira carga depois do reset. */
export const FRESH_LOAD_FLAGS = [ASSET_KEY_MIGRATION_FLAG, FISCAL_ACCOUNT_REPAIR_FLAG] as const;

export interface FreshLoadResetResult {
  /** Linhas que existiam em `local_assets` antes da limpeza. */
  clearedAssets: number;
  /** Flags que estavam definidas e foram removidas. */
  clearedFlags: string[];
}

export async function resetLocalBaseForFreshLoad(): Promise<FreshLoadResetResult> {
  let clearedAssets = 0;

  await db.transaction('rw', [db.local_assets, db.ativos, db.assets, db.addresses, db.audit_logs], async () => {
    clearedAssets = await db.local_assets.count();
    await db.local_assets.clear();
    await db.ativos.clear();
    await db.assets.clear();
    await db.addresses.clear();
    // A trilha local também sai: as chaves a que se refere deixam de existir e
    // o reset da nuvem já limpou `audit_logs` do lado do servidor.
    await db.audit_logs.clear();
  });

  // Espelho virtual (sandbox): alimentava a Unidade Operacional com a base
  // antiga mesmo depois de o Dexie ser limpo.
  await clearVirtualSnapshot();

  const clearedFlags: string[] = [];
  if (typeof localStorage !== 'undefined') {
    for (const flag of FRESH_LOAD_FLAGS) {
      try {
        if (localStorage.getItem(flag) !== null) clearedFlags.push(flag);
        localStorage.removeItem(flag);
      } catch {
        /* storage indisponível: nada a limpar */
      }
    }
  }

  return { clearedAssets, clearedFlags };
}
