// ============================================================================
// ENVIO EM MASSA DA BASE LOCAL PARA A NUVEM — portão de entrada
// ----------------------------------------------------------------------------
// Em BASE LOCAL (modo INTERNAL, sem credenciais do build) a nuvem está
// desligada por desenho: não há a quem pedir token e o envio não pode nem
// tentar. Fora desse caso, o envio em massa (Gestor de Base de Dados →
// «Espelhamento em Massa — Supabase») exige duas coisas antes de subir:
//   1. rede (offline → não tenta);
//   2. sessão da nuvem (sem token → o pedido chegaria como `anon` e o
//      PostgREST responderia 42501).
//
// O motivo é calculado aqui, de forma pura, para ser testável sem jsdom nem
// Supabase. `null` significa «pode enviar» (sessão autenticada ou
// indeterminada — o portão não bloqueia por não conseguir perguntar).
// A ordem de precedência é: sem-credenciais > offline > sem-sessao.
// ============================================================================
import type { EstadoSessaoNuvem } from './sessaoNuvem';

export type MotivoBloqueioEnvioEmMassa =
  | 'sem-credenciais'
  | 'offline'
  | 'sem-sessao'
  | null;

export interface EntradaNuvemEnvioInput {
  /** Modo de base é INTERNAL (build sem credenciais Supabase). */
  isInternalMode?: boolean;
  /** Existe sessão da nuvem (token presente). */
  temCredenciaisDoBuild?: boolean;
  /** Modo de base textual (ex.: 'INTERNAL', 'INTERNAL_PLUS', 'SUPABASE'). */
  modoBase?: string | null;
  /** Há ligação à rede. */
  online?: boolean;
  isOnline?: boolean;
  navigatorOnLine?: boolean;
  /** Estado da sessão da nuvem. */
  estadoSessao?: EstadoSessaoNuvem;
  estado?: EstadoSessaoNuvem;
  sessionState?: EstadoSessaoNuvem;
  sessao?: EstadoSessaoNuvem;
}

const normalizarInternal = (input: EntradaNuvemEnvioInput): boolean => {
  if (typeof input.isInternalMode === 'boolean') return input.isInternalMode;
  if (typeof input.temCredenciaisDoBuild === 'boolean') return !input.temCredenciaisDoBuild;
  if (typeof input.modoBase === 'string') return String(input.modoBase).startsWith('INTERNAL');
  return false;
};

const normalizarOnline = (input: EntradaNuvemEnvioInput): boolean => {
  if (typeof input.online === 'boolean') return input.online;
  if (typeof input.isOnline === 'boolean') return input.isOnline;
  if (typeof input.navigatorOnLine === 'boolean') return input.navigatorOnLine;
  return true;
};

const normalizarEstado = (input: EntradaNuvemEnvioInput): EstadoSessaoNuvem => {
  const v = input.estadoSessao ?? input.estado ?? input.sessionState ?? input.sessao;
  if (v === 'autenticada' || v === 'ausente' || v === 'indeterminado') return v;
  return 'indeterminado';
};

export const motivoDoBloqueioDoEnvioEmMassa = (
  ...args: [EntradaNuvemEnvioInput] | [boolean, boolean, EstadoSessaoNuvem] | [boolean, boolean, string]
): MotivoBloqueioEnvioEmMassa => {
  let input: EntradaNuvemEnvioInput;
  const n = args.length as number;
  if (n === 1 && args[0] && typeof args[0] === 'object' && !Array.isArray(args[0])) {
    input = args[0] as EntradaNuvemEnvioInput;
  } else if (n >= 3) {
    input = {
      isInternalMode: Boolean(args[0]),
      online: Boolean(args[1]),
      estadoSessao: args[2] as EstadoSessaoNuvem
    };
  } else if (n === 2) {
    // (isInternalMode, online) — sessão indeterminada por omissão (não bloqueia).
    input = { isInternalMode: Boolean(args[0]), online: Boolean(args[1]) };
  } else if (n === 1 && typeof args[0] === 'boolean') {
    input = { isInternalMode: Boolean(args[0]) };
  } else {
    input = {};
  }

  if (normalizarInternal(input)) return 'sem-credenciais';
  if (!normalizarOnline(input)) return 'offline';
  if (normalizarEstado(input) === 'ausente') return 'sem-sessao';
  return null;
};

export const MENSAGENS_BLOQUEIO_ENVIO_EM_MASSA: Record<
  Exclude<MotivoBloqueioEnvioEmMassa, null>,
  string
> = {
  'sem-credenciais': 'Supabase não configurado neste ambiente (BASE LOCAL).',
  'offline': 'Aparelho sem conexão com a rede.',
  'sem-sessao': 'Sem sessão da nuvem neste aparelho — entre com e-mail e senha para enviar.'
};