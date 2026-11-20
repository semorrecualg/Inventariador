import type { Asset } from '../types';
import { preservarGpsMaisRecente } from './assetGps';

/**
 * O DELTA DO PULL — quem vence e quem volta ao disco
 * ============================================================================
 * O delta é o pull do dia a dia: chegam da nuvem as linhas alteradas desde o
 * checkpoint e o estado local é remontado por cima (as alterações por enviar
 * continuam a prevalecer). O download já gravou essas linhas nos espelhos; o
 * que precisa de uma escrita extra é só aquilo que a decisão DESTE aparelho
 * repôs por cima delas:
 *
 *   · GPS local mais recente (`preservarGpsMaisRecente` — item 9);
 *   · edição local ainda por enviar (`dirtyIds`).
 *
 * Uma linha que veio da nuvem e não tem decisão local não ganha escrita: é
 * exactamente o mesmo conteúdo que o download acabou de gravar. A lista
 * `decisaoLocal` é a entrada da única escrita do delta
 * (`sqliteService.persistAssetsBatch`), e é por isso que ela é devolvida em
 * separado do estado.
 *
 * Regras que NÃO mudam com isto: uma linha nova da nuvem entra no estado; uma
 * pendência local que não veio no delta continua no estado (já está no disco) e
 * não é reescrita.
 */
export interface EntradaDoDelta {
  /** O estado em memória antes do delta. */
  prevAssets: Asset[];
  /** Só as linhas que o delta trouxe (e que o download acabou de gravar). */
  cloudAssets: Asset[];
  /** `primarykey`s com alteração local por enviar. */
  dirtyIds: string[];
}

export interface ResultadoDoDelta {
  /** O estado remontado, na ordem anterior + as linhas novas do delta. */
  assets: Asset[];
  /** Linhas cuja decisão local venceu a da nuvem — as únicas a regravar. */
  decisaoLocal: Asset[];
}

export const mergeDeltaPull = ({
  prevAssets,
  cloudAssets,
  dirtyIds
}: EntradaDoDelta): ResultadoDoDelta => {
  const byId = new Map(prevAssets.map(a => [String(a.id), a]));
  const decisaoLocal: Asset[] = [];

  for (const daNuvem of cloudAssets) {
    const local = byId.get(String(daNuvem.id));
    if (!local) {
      // Linha nova: o download já a gravou e o estado passa a tê-la.
      byId.set(String(daNuvem.id), daNuvem);
      continue;
    }
    // O delta também não regride a coordenada: a linha da nuvem só substitui o
    // ponto quando é mais recente que a leitura local.
    const gpsDaqui = preservarGpsMaisRecente(local, daNuvem) as Record<string, unknown>;
    const merged = { ...daNuvem, ...gpsDaqui } as Asset;
    byId.set(String(daNuvem.id), merged);
    if (Object.keys(gpsDaqui).length > 0) decisaoLocal.push(merged);
  }

  const assets = Array.from(byId.values());

  if (dirtyIds.length > 0) {
    const veioNoDelta = new Set(cloudAssets.map(a => String(a.id)));
    for (const id of dirtyIds) {
      const localDirty = prevAssets.find(a => String(a.id) === id);
      if (!localDirty) continue;
      const index = assets.findIndex(a => String(a.id) === id);
      if (index === -1) {
        // Pendência que não veio no delta: já está no disco, entra só no estado.
        assets.push(localDirty);
        continue;
      }
      assets[index] = { ...assets[index], ...localDirty };
      // Só a linha que o download acabou de sobrescrever precisa de voltar ao
      // disco; uma pendência fora do delta ficou intacta nos espelhos.
      if (veioNoDelta.has(String(localDirty.id))) decisaoLocal.push(assets[index]);
    }
  }

  return { assets, decisaoLocal };
};
