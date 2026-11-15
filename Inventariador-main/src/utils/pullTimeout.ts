// ============================================================================
// pullTimeout.ts — nenhum pedido do pull pode ficar pendurado para sempre.
//
// O overlay "SINCRONIZANDO BASE / aguarde, baixando dados da nuvem" só fecha no
// `finally` do sync. Se um socket fica meio-aberto (WebView, rede móvel, proxy),
// a promessa do Supabase nunca resolve nem rejeita — o `finally` nunca corre e o
// operador fica preso no spinner indefinidamente, sem erro e sem saída.
//
// Aqui cada pedido tem prazo: ao fim do tempo, rejeita com uma mensagem que diz
// o que aconteceu. O sync cai no seu tratamento de erro e o overlay fecha.
// ============================================================================

/** 45 s por página de 1.000 ativos: folgado para rede móvel, finito. */
export const PULL_PAGE_TIMEOUT_MS = 45_000;

/** Aplica um prazo a uma promessa, sem alterar o valor resolvido. */
export const comTimeout = <T>(
  promessa: PromiseLike<T>,
  ms: number,
  mensagem: string
): Promise<T> => {
  if (!Number.isFinite(ms) || ms <= 0) return Promise.resolve(promessa);

  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(mensagem)), ms);
    Promise.resolve(promessa).then(
      (valor) => {
        clearTimeout(timer);
        resolve(valor);
      },
      (erro) => {
        clearTimeout(timer);
        reject(erro);
      }
    );
  });
};
