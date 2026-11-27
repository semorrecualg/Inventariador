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

export interface EntradaNuvemEnvio {
  /** Modo de base é INTERNAL (build sem credenciais Supabase). */
  isInternalMode?: boolean;
  /** Há ligação à rede (omissão: sim). */
  online?: boolean;
  /** Estado da sessão da nuvem (omissão: indeterminado — não bloqueia). */
  estadoSessao?: EstadoSessaoNuvem;
}

export const motivoDoBloqueioDoEnvioEmMassa = ({
  isInternalMode = false,
  online = true,
  estadoSessao = 'indeterminado'
}: EntradaNuvemEnvio = {}): MotivoBloqueioEnvioEmMassa => {
  if (isInternalMode) return 'sem-credenciais';
  if (!online) return 'offline';
  if (estadoSessao === 'ausente') return 'sem-sessao';
  return null;
};
