/**
 * O hash da URL como fonte de verdade da navegação (F5).
 *
 * O roteamento do app sempre foi dirigido pelo estado (`history`/`screen`) e o
 * hash era só escrito: um F5 em `#/audit-logs` voltava sempre ao contrato de
 * trabalho e o «voltar/avançar» do browser mudava a URL sem mudar o ecrã.
 * Estas funções fecham a outra metade — ler a tela a partir do hash no
 * arranque e traduzir `hashchange` numa pilha coerente.
 */
import { AppScreen } from '../types';
import { telaDoEstado } from '../router/routes';

/** Telas de entrada: quando a URL as pede, mandam sozinhas. */
const TELAS_DE_ENTRADA: AppScreen[] = [
  AppScreen.LOGIN,
  AppScreen.REGISTER,
  AppScreen.ONBOARDING,
];

/** Hash atual, com proteção para ambientes sem `window` (testes/SSR). */
export function hashAtual(): string {
  return typeof window === 'undefined' ? '' : window.location.hash || '';
}

/**
 * Pilha de arranque: a âncora habitual (o contrato de trabalho) com a tela
 * pedida pela URL por cima, para o «voltar» ter destino e o F5 cair no ecrã
 * certo. Só conta a tela desenhada pelo estado: as rotas com `<Route>` própria
 * (login, menu, gestor de base, dashboard) já são desenhadas pela URL.
 */
export function historicoDeAncoragem(
  ancora: AppScreen,
  hash: string = hashAtual()
): AppScreen[] {
  const alvo = telaDoEstado(hash);
  if (!alvo) return [ancora];
  if (TELAS_DE_ENTRADA.includes(alvo)) return [alvo];
  if (alvo === ancora) return [ancora];
  return [ancora, alvo];
}

/**
 * Pilha resultante de um `hashchange`: voltar atrás corta a pilha até à tela
 * visitada; ir em frente (ou saltar por URL) empurra. O login reinicia, como
 * em `pushScreen`; o hub não — voltar ao hub tem de cortar a pilha, não
 * apagá-la.
 */
export function proximaPilha(anterior: AppScreen[], alvo: AppScreen): AppScreen[] {
  if (alvo === AppScreen.LOGIN) return [alvo];
  const indice = anterior.lastIndexOf(alvo);
  return indice >= 0 ? anterior.slice(0, indice + 1) : [...anterior, alvo];
}

/**
 * Escreve o hash só quando muda: o efeito estado → URL nunca duplica uma
 * entrada de histórico nem dispara um `hashchange` inútil.
 */
export function escreverHash(path: string): void {
  if (typeof window === 'undefined') return;
  if (window.location.hash === `#${path}`) return;
  window.location.hash = path;
}
