/**
 * TECTO DE TEMPO PARA UMA PROMESSA DE REDE
 * ============================================================================
 * O `fetch` de uma WebView pode ficar pendurado sem nunca resolver nem
 * rejeitar (ligação que morre a meio, portal cativo, pedido que o sistema não
 * fecha). Quem faz `await` a uma promessa dessas fica preso para sempre — foi
 * assim que o ecrã «SINCRONIZANDO BASE / Aguarde, baixando dados da nuvem»
 * ficava a rodar sem fim: o pull da nuvem não tinha tecto.
 *
 * `comTecto` devolve o valor da promessa ou rejeita com `TempoEsgotadoError`
 * ao fim de `ms`. A promessa original continua a correr (não há abort) — quem
 * chama fica livre para seguir, avisar o operador e libertar o selo de
 * reentrância da sincronização.
 */
export class TempoEsgotadoError extends Error {
  constructor(etiqueta: string, ms: number) {
    super(`${etiqueta}: tempo esgotado após ${Math.max(1, Math.round(ms / 1000))}s`);
    this.name = 'TempoEsgotadoError';
  }
}

export const comTecto = async <T>(
  promessa: PromiseLike<T>,
  ms: number,
  etiqueta = 'operação'
): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promessa,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new TempoEsgotadoError(etiqueta, ms)), ms);
      })
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
};
