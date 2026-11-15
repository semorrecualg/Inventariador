// ============================================================================
// sreMonitor.ts — ponte entre o logger e o SRE Monitor do Gestor de Base.
//
// As linhas `[App]` e `[Sync]` (login, modo, pull, dedup) só existiam na consola
// do browser: validar um login obrigava a abrir o DevTools no telemóvel. Aqui
// ficam num buffer circular em memória, e o Gestor de Base assina-o para as
// mostrar no SRE Monitor.
//
// Não é telemetria: nada é enviado para fora, nada é persistido.
// ============================================================================

export const LIMITE_LINHAS_SRE = 120;

export interface LinhaSre {
  hora: string;
  mensagem: string;
}

/** Prefixos que interessam ao operador. O resto do log fica só na consola. */
const PREFIXOS = ['[App]', '[Sync]', '[Supabase]', '[Auth', '[SRE', '[ModeSwitch]', '[Login]'];

/**
 * Ruído de alta frequência: repetia-se a cada render e enchia as 15 linhas do
 * painel, escondendo exactamente as linhas de login/pull que se quer validar.
 */
const RUIDO = ['GPS Configs'];

const linhas: LinhaSre[] = [];
const ouvintes = new Set<(linha: LinhaSre) => void>();

/** `true` se a mensagem pertence ao conjunto que o SRE Monitor mostra. */
export const interessaAoSreMonitor = (mensagem: string): boolean =>
  PREFIXOS.some((prefixo) => mensagem.includes(prefixo)) &&
  !RUIDO.some((ruido) => mensagem.includes(ruido));

const formatar = (args: unknown[]): string =>
  args
    .map((arg) => {
      if (typeof arg === 'string') return arg;
      if (arg instanceof Error) return arg.message;
      try {
        return JSON.stringify(arg);
      } catch {
        return String(arg);
      }
    })
    .join(' ');

/** Regista uma linha no buffer e entrega-a a quem estiver a ouvir. */
export const publicarLinhaSre = (args: unknown[]): void => {
  const mensagem = formatar(args).trim();
  if (!mensagem || !interessaAoSreMonitor(mensagem)) return;

  // Repetição consecutiva idêntica não acrescenta nada à validação.
  if (linhas[linhas.length - 1]?.mensagem === mensagem) return;

  const linha: LinhaSre = { hora: new Date().toLocaleTimeString('pt-BR'), mensagem };
  linhas.push(linha);
  if (linhas.length > LIMITE_LINHAS_SRE) linhas.splice(0, linhas.length - LIMITE_LINHAS_SRE);

  ouvintes.forEach((ouvinte) => {
    try {
      ouvinte(linha);
    } catch {
      /* um ouvinte partido não pode derrubar o log */
    }
  });
};

/** Cópia das linhas já registadas (para quem abre o ecrã a meio da sessão). */
export const lerLinhasSre = (): LinhaSre[] => linhas.map((linha) => ({ ...linha }));

/** Assina o monitor. Devolve a função que cancela a assinatura. */
export const assinarLinhasSre = (ouvinte: (linha: LinhaSre) => void): (() => void) => {
  ouvintes.add(ouvinte);
  return () => {
    ouvintes.delete(ouvinte);
  };
};

/** Só para testes: limpa buffer e ouvintes. */
export const limparLinhasSre = (): void => {
  linhas.length = 0;
  ouvintes.clear();
};
