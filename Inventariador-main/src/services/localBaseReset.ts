// ============================================================================
// Preparação do dispositivo para uma NOVA CARGA
// ----------------------------------------------------------------------------
// Depois de a base da nuvem ser reiniciada (scripts/reset-test-database.sql), a
// base local ainda tem as linhas antigas. Sem este passo, o primeiro sync
// reenvia tudo o que está gravado e o reset da nuvem perde o efeito.
//
// Esta rotina limpa o inventário local, o espelho virtual, os endereços, a
// trilha local e a fila durável da âncora, deixando o dispositivo pronto para
// carregar a planilha de novo. É destrutiva por natureza: o ecrã do Gestor de
// Base pede confirmação antes de a chamar.
// ============================================================================

import { db } from './sqliteService';
import { clearVirtualSnapshot } from './localDbService';
import { ANCORA_PENDENTE_KEY } from '../utils/ancoraPendente';
import { limparSeloBase } from '../utils/baseGeneration';

export interface FreshLoadResetResult {
  /** Linhas que existiam em `local_assets` antes da limpeza. */
  clearedAssets: number;
  /** `true` quando havia âncoras por subir e a fila foi removida. */
  clearedPendingAnchors: boolean;
}

export async function resetLocalBaseForFreshLoad(): Promise<FreshLoadResetResult> {
  let clearedAssets = 0;

  await db.transaction('rw', [db.local_assets, db.ativos, db.addresses, db.audit_logs], async () => {
    clearedAssets = await db.local_assets.count();
    await db.local_assets.clear();
    await db.ativos.clear();
    await db.addresses.clear();
    // A trilha local também sai: as chaves a que se refere deixam de existir e
    // o reset da nuvem já limpou `audit_logs` do lado do servidor.
    await db.audit_logs.clear();
  });

  // Espelho virtual (sandbox): alimentava a Unidade Operacional com a base
  // antiga mesmo depois de o Dexie ser limpo.
  await clearVirtualSnapshot();

  // Selo de geração: sai com a base antiga. A base local está vazia, por isso o
  // próximo envio adota sem risco a geração corrente da nuvem.
  limparSeloBase();

  // Âncora que ficou por subir: aponta para um contrato que acabou de ser
  // reiniciado, por isso não pode voltar a ser empurrada no arranque.
  let clearedPendingAnchors = false;
  if (typeof localStorage !== 'undefined') {
    try {
      clearedPendingAnchors = localStorage.getItem(ANCORA_PENDENTE_KEY) !== null;
      localStorage.removeItem(ANCORA_PENDENTE_KEY);
    } catch {
      /* storage indisponível: nada a limpar */
    }
  }

  return { clearedAssets, clearedPendingAnchors };
}
