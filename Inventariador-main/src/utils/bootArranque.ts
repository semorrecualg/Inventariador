// ============================================================================
// bootArranque.ts — o arranque não pode morrer por uma falha transitória.
//
// No browser, um F5 volta a pedir a árvore de módulos ao servidor. Se um único
// pedido falhar (503 do proxy, ERR_ABORTED, chunk em falta), o `import()` de
// `App.tsx` rejeita e o React cai no ErrorBoundary — o utilizador fica com o
// loader estático por cima do erro e o botão «Recarregar» inalcançável.
//
// Aqui ficam as peças testáveis dessa blindagem:
//   1. reconhecer a falha de módulo (e não confundi-la com um bug de código);
//   2. repetir o carregamento com espera crescente;
//   3. recarregar a página UMA vez, com janela de guarda contra ciclos;
//   4. retirar o loader estático quando o app entra em erro;
//   5. vigia do arranque que liberta a tela mesmo quando o init trava;
//   6. guardas `blocked`/`versionchange` do Dexie (abas antigas a segurar a base).
// ============================================================================
import { logger } from './logger';

/** Marca, em `sessionStorage`, a última recarga automática do arranque. */
export const CHAVE_RECARGA_BOOT = 'gbr_boot_recarga_em';

/** Dentro desta janela não se recarrega outra vez: um erro persistente não pode virar loop. */
export const JANELA_RECARGA_MS = 20_000;

/** Mensagens com que um browser/Vite sinaliza um módulo que não chegou. */
const PADROES_ERRO_DE_MODULO: RegExp[] = [
  /failed to fetch dynamically imported module/i,
  /error loading dynamically imported module/i,
  /dynamically imported module/i,
  /importing a module script failed/i,
  /loading chunk [\d-]+ failed/i,
  /outdated optimize dep/i,
];

/**
 * Distingue «o ficheiro não chegou» de «o código rebentou». Só o primeiro se
 * resolve a repetir o pedido ou a recarregar; repetir um bug só atrasa o erro.
 */
export function ehErroDeModulo(erro: unknown): boolean {
  const mensagem = erro instanceof Error ? erro.message : String(erro ?? '');
  return PADROES_ERRO_DE_MODULO.some((padrao) => padrao.test(mensagem));
}

export interface OpcoesCarregarComRetry {
  /** Total de tentativas, incluindo a primeira. Mínimo 1. */
  tentativas?: number;
  /** Espera base entre tentativas (cresce com o número da tentativa). */
  esperaMs?: number;
  /** Injectável nos testes; por omissão usa `setTimeout`. */
  dormir?: (ms: number) => Promise<void>;
  /** Observação de cada falha (logs/testes). */
  aoFalhar?: (erro: unknown, tentativa: number) => void;
}

/**
 * Carrega um módulo repetindo apenas as falhas de módulo. Um erro de código
 * (ex.: `Cannot read properties of undefined`) propaga-se logo à primeira.
 */
export async function carregarComRetry<T>(
  carregar: () => Promise<T>,
  opcoes: OpcoesCarregarComRetry = {},
): Promise<T> {
  const tentativas = Math.max(1, opcoes.tentativas ?? 3);
  const esperaMs = Math.max(0, opcoes.esperaMs ?? 300);
  const dormir = opcoes.dormir ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  let ultimoErro: unknown;
  for (let tentativa = 1; tentativa <= tentativas; tentativa++) {
    try {
      return await carregar();
    } catch (erro) {
      ultimoErro = erro;
      opcoes.aoFalhar?.(erro, tentativa);
      if (!ehErroDeModulo(erro) || tentativa === tentativas) break;
      await dormir(esperaMs * tentativa);
    }
  }
  throw ultimoErro;
}

/** Apenas o contrato de `sessionStorage`/`localStorage` que a guarda usa. */
export interface ArmazenamentoSimples {
  getItem(chave: string): string | null;
  setItem(chave: string, valor: string): void;
}

/** `true` quando já passou a janela desde a última recarga automática. */
export function podeRecarregarBootstrap(
  armazenamento: ArmazenamentoSimples | null | undefined,
  agora: number = Date.now(),
  janelaMs: number = JANELA_RECARGA_MS,
): boolean {
  if (!armazenamento) return true;
  try {
    const bruto = armazenamento.getItem(CHAVE_RECARGA_BOOT);
    const anterior = bruto ? Number(bruto) : 0;
    return !Number.isFinite(anterior) || anterior <= 0 || agora - anterior > janelaMs;
  } catch {
    return true;
  }
}

/** Regista o instante da recarga automática (antes de recarregar). */
export function marcarRecargaBootstrap(
  armazenamento: ArmazenamentoSimples | null | undefined,
  agora: number = Date.now(),
): void {
  if (!armazenamento) return;
  try {
    armazenamento.setItem(CHAVE_RECARGA_BOOT, String(agora));
  } catch {
    /* armazenamento indisponível: a guarda fica sem memória, não falha o arranque */
  }
}

export interface OpcoesRecarregarBootstrap {
  armazenamento?: ArmazenamentoSimples | null;
  agora?: number;
  janelaMs?: number;
  /** Injects nos testes; por omissão `location.reload()`. */
  recarregar?: () => void;
}

/**
 * Recarrega a página no máximo uma vez por janela. Devolve `false` quando a
 * recarga já foi tentada há pouco — nesse caso mostra-se o erro em vez de
 * entrar num ciclo de F5.
 */
export function recarregarBootstrapUmaVez(opcoes: OpcoesRecarregarBootstrap = {}): boolean {
  const armazenamento =
    opcoes.armazenamento !== undefined
      ? opcoes.armazenamento
      : typeof sessionStorage !== 'undefined'
        ? sessionStorage
        : null;
  const agora = opcoes.agora ?? Date.now();

  if (!podeRecarregarBootstrap(armazenamento, agora, opcoes.janelaMs)) {
    logger.warn('[BOOT] Recarga automática travada pela guarda: o arranque já falhou há instantes.');
    return false;
  }

  marcarRecargaBootstrap(armazenamento, agora);
  const recarregar = opcoes.recarregar ?? (() => window.location.reload());
  logger.warn('[BOOT] A recarregar a aplicação para buscar os módulos em falta.');
  recarregar();
  return true;
}

/**
 * Remove o loader estático do `index.html`. Vive por cima de tudo (`z-index`
 * 9999), por isso é o que esconde o cartão de erro e o botão de recarregar
 * quando o `App` não chega a montar.
 */
export function removerLoaderDeArranque(doc?: Document | null): boolean {
  const alvo = doc ?? (typeof document !== 'undefined' ? document : null);
  if (!alvo) return false;
  const loader =
    alvo.getElementById('gbr-initial-loader') || alvo.getElementById('app-loader');
  if (!loader) return false;
  try {
    loader.style.opacity = '0';
    loader.style.display = 'none';
    loader.remove();
    return true;
  } catch {
    return false;
  }
}

export interface OpcoesVigiaArranque {
  /** Limite até libertar a tela. Por omissão 6 s. */
  atrasoMs?: number;
  /** Continua a valer a pena libertar? (ex.: ainda a inicializar, sem erro). */
  estaBloqueado: () => boolean;
  /** Liberta a tela: limpa todos os sinais do splash. */
  liberar: () => void;
  aoExpirar?: () => void;
}

/**
 * Vigia do arranque. Liberta a tela quando o init passa do limite — o splash
 * era `sqliteStatus.loading || isInitializing || authLoading`, por isso limpar
 * só dois dos três (como acontecia) deixava o `authLoading` a segurar tudo.
 * Devolve o cancelamento para o `useEffect`.
 */
export function vigiarArranque(opcoes: OpcoesVigiaArranque): () => void {
  const timer = setTimeout(() => {
    if (!opcoes.estaBloqueado()) return;
    opcoes.aoExpirar?.();
    opcoes.liberar();
  }, opcoes.atrasoMs ?? 6000);
  return () => clearTimeout(timer);
}

export type MotivoBloqueioDexie = 'blocked' | 'versionchange';

export interface AcoesBloqueioDexie {
  fechar: () => void;
  avisar?: (motivo: MotivoBloqueioDexie, mensagem: string) => void;
}

/** Contrato mínimo de um `Dexie` para os testes poderem usar um duplo. */
export interface BaseComEventosDexie {
  on(evento: string, callback: () => void): unknown;
}

export const MENSAGENS_BLOQUEIO_DEXIE: Record<MotivoBloqueioDexie, string> = {
  blocked:
    'Outra aba do Inventariador está a segurar a base local numa versão antiga. Feche as outras abas para o arranque terminar.',
  versionchange:
    'A base local mudou de versão noutra aba; esta ligação foi fechada para não bloquear a migração. Recarregue a página.',
};

/**
 * Um Dexie com 8 versões sem tratamento de `blocked` fica à espera para sempre
 * quando outra aba segura a base. Fechar a ligação liberta a migração e o
 * vigia do arranque trata do resto.
 */
export function registarGuardasDexie(
  base: BaseComEventosDexie,
  acoes: AcoesBloqueioDexie,
): void {
  const fecharEAvisar = (motivo: MotivoBloqueioDexie) => {
    try {
      acoes.fechar();
    } catch (erro) {
      logger.warn(`[Dexie] Falha ao fechar a ligação depois de "${motivo}".`, erro);
    }
    const mensagem = MENSAGENS_BLOQUEIO_DEXIE[motivo];
    logger.warn(`[Dexie] ${mensagem}`);
    acoes.avisar?.(motivo, mensagem);
  };

  base.on('blocked', () => fecharEAvisar('blocked'));
  base.on('versionchange', () => fecharEAvisar('versionchange'));
}
