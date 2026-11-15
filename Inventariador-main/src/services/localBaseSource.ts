// ============================================================================
// localBaseSource.ts — fonte única da base local para o Gestor de Base.
//
// A base local vive em TRÊS espelhos (local_assets · ativos · assets) e, em
// circunstâncias normais, têm o mesmo conteúdo. Quando divergem, o cartão
// contava o maior (`countAssetMirrors`) enquanto o espelhamento lia só
// `db.ativos` — dois números diferentes no mesmo ecrã, e o envio mandava menos
// ativos do que o cartão anunciava.
//
// Aqui a escolha do espelho é feita UMA vez e devolve as linhas, não só a
// contagem: quem mostra e quem envia usam a mesma lista.
// ============================================================================
import { db, sqliteService } from './sqliteService';

export type EspelhoNome = 'local_assets' | 'ativos' | 'assets';

export interface ContagensEspelhos {
  local_assets: number;
  ativos: number;
  assets: number;
}

export interface BaseLocalUnificada {
  /** Linhas do espelho escolhido (já filtradas pelo contrato, se pedido). */
  rows: Record<string, unknown>[];
  /** Contagem de cada espelho, para o cartão mostrar a contra-prova. */
  mirrors: ContagensEspelhos;
  /** Espelho de onde as linhas vieram; `null` quando a base está vazia. */
  fonte: EspelhoNome | null;
}

/**
 * Espelho com mais linhas (empate resolvido por esta ordem). É a mesma regra do
 * `countAssetMirrors`, que usa `Math.max` para o total.
 */
export const escolherEspelho = (contagens: ContagensEspelhos): EspelhoNome | null => {
  const ordem: EspelhoNome[] = ['local_assets', 'ativos', 'assets'];
  let escolhido: EspelhoNome | null = null;
  for (const nome of ordem) {
    if (contagens[nome] > 0 && (escolhido === null || contagens[nome] > contagens[escolhido])) {
      escolhido = nome;
    }
  }
  return escolhido;
};

/**
 * Lê a base local a partir do espelho mais completo.
 *
 * @param tenantid contrato a considerar; vazio/nulo = base inteira
 */
export const lerBaseLocalUnificada = async (
  tenantid?: string | null
): Promise<BaseLocalUnificada> => {
  const contagens = await sqliteService.countAssetMirrors(tenantid ?? null);
  const mirrors: ContagensEspelhos = {
    local_assets: contagens.local_assets,
    ativos: contagens.ativos,
    assets: contagens.assets
  };

  const fonte = escolherEspelho(mirrors);
  if (!fonte) return { rows: [], mirrors, fonte: null };

  const contrato = String(tenantid || '').trim().toUpperCase();
  const brutos = (await db[fonte].toArray()) as unknown as Record<string, unknown>[];
  const rows = contrato
    ? brutos.filter((linha) => String(linha.tenantid ?? '').trim().toUpperCase() === contrato)
    : brutos;

  return { rows, mirrors, fonte };
};
