// ============================================================================
// baseModeRestart.ts — fecho determinístico do fluxo guiado de troca de base.
// ============================================================================
// O caminho «blindagem removida + troca» termina com um reinício para os
// serviços (Supabase, sync, sqlite) lerem o modo novo. Esse reinício vinha de
// um `setTimeout(350)`: um palpite. Se a auditoria (Dexie) ainda estivesse a
// escrever, o reload perdia o evento sem deixar rasto; se o fecho do modal
// ainda não tivesse sido aplicado, o overlay fechava a meio da navegação.
//
// A ordem passa a ser explícita e observável:
//   1. espera as escritas pendentes (auditoria do desbloqueio, auditoria da
//      troca) — é isto que garante «auditoria gravada antes de reiniciar»;
//   2. fecha o modal (o chamador faz o commit síncrono no DOM);
//   3. só então reinicia.
//
// O prazo (`prazoMs`) não substitui a espera: é o teto de segurança para o
// utilizador nunca ficar preso se o IndexedDB bloquear. No caso normal o
// reinício acontece assim que as escritas terminam, sem espera fixa.
// ============================================================================

/** Teto de segurança para as escritas pendentes (Dexie local responde em ms). */
export const PRAZO_PENDENCIAS_MS = 2000;

export type OrigemFalhaFecho = 'pendencia' | 'fecho' | 'reinicio';

export interface FechoAposTroca {
  /** Escritas que têm de estar duráveis antes do reinício (auditoria, flush). */
  pendentes?: Array<Promise<unknown> | undefined>;
  /** Fecha o diálogo da troca; no chamador, com commit síncrono no DOM. */
  fechar: () => void;
  /** Reinicia a app para os serviços lerem o modo novo. */
  reiniciar: () => void;
  /** Teto de segurança das pendências; por omissão `PRAZO_PENDENCIAS_MS`. */
  prazoMs?: number;
  /** Registo de falhas — nenhuma delas impede o fecho e o reinício. */
  aoFalhar?: (origem: OrigemFalhaFecho, erro: unknown) => void;
}

/**
 * Resolve quando `promessa` terminar ou quando o prazo esgotar — nunca rejeita.
 * Devolve `true` quando a pendência ficou concluída dentro do prazo.
 */
const aguardarComPrazo = async (
  promessa: Promise<unknown>,
  prazoMs: number
): Promise<{ concluida: boolean; erro?: unknown }> => {
  let temporizador: ReturnType<typeof setTimeout> | undefined;
  const prazo = new Promise<{ concluida: boolean; erro?: unknown }>((resolve) => {
    temporizador = setTimeout(() => resolve({ concluida: false }), prazoMs);
  });

  try {
    return await Promise.race([
      promessa.then(
        () => ({ concluida: true }) as { concluida: boolean; erro?: unknown },
        (erro: unknown) => ({ concluida: false, erro }) as { concluida: boolean; erro?: unknown }
      ),
      prazo
    ]);
  } finally {
    if (temporizador !== undefined) clearTimeout(temporizador);
  }
};

/**
 * Fecha a troca de base e reinicia, por esta ordem:
 * pendências duráveis → fecho do modal → reinício.
 *
 * Uma auditoria que falhe (ou um fecho que rebente) fica registada em
 * `aoFalhar` e o reinício acontece à mesma: a troca já foi aplicada, e o
 * utilizador não pode ficar preso num modal que já não representa o estado.
 */
export const fecharComAuditoriaGravada = async ({
  pendentes = [],
  fechar,
  reiniciar,
  prazoMs = PRAZO_PENDENCIAS_MS,
  aoFalhar
}: FechoAposTroca): Promise<void> => {
  for (const pendente of pendentes) {
    if (!pendente) continue;
    const resultado = await aguardarComPrazo(pendente, prazoMs);
    if (resultado.erro !== undefined) aoFalhar?.('pendencia', resultado.erro);
  }

  try {
    fechar();
  } catch (erro) {
    aoFalhar?.('fecho', erro);
  }

  try {
    reiniciar();
  } catch (erro) {
    aoFalhar?.('reinicio', erro);
  }
};
