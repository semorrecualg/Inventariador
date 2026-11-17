import pkg from '../../package.json';

/**
 * Protocolo fixo de comunicação do SRE: a versão do app é a PRIMEIRA linha de
 * tudo o que sai do Gestor de Base de Dados (tela, terminal, log copiado e
 * pacote de diagnóstico). Assim o chat/ticket identifica sempre o build, sem
 * depender do estado da sessão nem de quem escreveu a mensagem.
 */
export const APP_VERSION = String(pkg?.version ?? 'desconhecida').trim() || 'desconhecida';

/** Primeira linha fixa do SRE. */
export const SRE_PROTOCOL_LINE = `INVENTARIADOR v${APP_VERSION} · SRE · GESTOR DE BASE DE DADOS`;

export type CloudBaseState = 'loading' | 'online' | 'offline' | 'internal' | 'error';

export interface CloudBaseCount {
  state: CloudBaseState;
  /** Total lido na Nuvem; `null` quando a leitura não chegou a acontecer. */
  count: number | null;
  message?: string;
}

export const CLOUD_STATE_LABEL: Record<CloudBaseState, string> = {
  loading: 'consultando',
  online: 'online · lido agora',
  offline: 'offline · sem conexão',
  internal: 'não configurado',
  error: 'erro na leitura',
};

/** `LOCAL 12636 · SUPABASE 12636 · ONLINE` — placar das duas bases numa linha. */
export const formatBasesLine = (local: number, cloud: CloudBaseCount): string => {
  const base = `LOCAL ${local} · SUPABASE ${cloud.count ?? '—'}`;
  switch (cloud.state) {
    case 'online':
      return `${base} · ONLINE`;
    case 'loading':
      return `${base} · CONSULTANDO`;
    case 'offline':
      return `${base} · OFFLINE`;
    case 'internal':
      return `${base} · NÃO CONFIGURADO`;
    default:
      return `${base} · ERRO`;
  }
};
