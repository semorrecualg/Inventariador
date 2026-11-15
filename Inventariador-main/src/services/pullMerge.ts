// ============================================================================
// pullMerge.ts — o que fica da base local quando um pull da nuvem chega.
//
// Em BASE OFICIAL, o pull substituía o inventário pelo que a nuvem devolveu.
// Uma planilha carregada há pouco (gravada localmente, `_is_synced = 0`) ainda
// não está na nuvem: sumia do ecrã e a Unidade Operacional dizia "nenhum dado
// importado" com os ativos carregados no aparelho.
//
// A regra é conservadora e explícita:
//  - as linhas da nuvem mandam (são a base oficial);
//  - sobrevivem as linhas LOCAIS que (a) ainda não subiram (`_is_synced = 0`),
//    (b) pertencem ao contrato activo e (c) não existem na nuvem;
//  - linhas de OUTRO contrato nunca sobrevivem, mesmo pendentes;
//  - linhas já sincronizadas que a nuvem deixou de devolver foram apagadas lá —
//    não ressuscitam por estarem no aparelho.
// ============================================================================

export interface PullMergeResult {
  /** Nuvem + pendentes locais do contrato, prontos para o inventário. */
  assets: Record<string, unknown>[];
  /** Linhas locais pendentes que a nuvem ainda não tinha (contadas para o log). */
  mantidos: number;
  /** Linhas locais de outro contrato deixadas de fora (isolamento). */
  deOutroContrato: number;
}

const normalizar = (valor: unknown): string => String(valor ?? '').trim().toUpperCase();

const chave = (linha: Record<string, unknown>): string =>
  String(linha.id ?? linha.primarykey ?? '');

export const fundirPullComPendentes = (params: {
  daNuvem: Record<string, unknown>[];
  locais: Record<string, unknown>[];
  contratoAtivo: string;
}): PullMergeResult => {
  const contrato = normalizar(params.contratoAtivo);
  const naNuvem = new Set(params.daNuvem.map(chave).filter(Boolean));
  const assets = [...params.daNuvem];
  let mantidos = 0;
  let deOutroContrato = 0;

  for (const linha of params.locais) {
    const id = chave(linha);
    if (id && naNuvem.has(id)) continue; // a nuvem manda sobre esta chave
    if (Number(linha._is_synced) !== 0) continue; // já subiu: se sumiu da nuvem, foi apagada lá

    const dono = normalizar(linha.tenantid);
    if (!contrato || !dono || dono !== contrato) {
      deOutroContrato += dono !== contrato ? 1 : 0;
      continue;
    }

    assets.push(linha);
    naNuvem.add(id);
    mantidos += 1;
  }

  return { assets, mantidos, deOutroContrato };
};
