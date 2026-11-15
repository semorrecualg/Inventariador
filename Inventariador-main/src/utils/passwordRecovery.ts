// ============================================================================
// passwordRecovery.ts — detectar o link de recuperação de senha do Supabase.
//
// O `resetPassword` envia o e-mail com `redirectTo` para a app, e o link volta
// como `#access_token=…&type=recovery` (fluxo implícito) ou `?code=…` (PKCE).
// Sem reconhecer isso, o supabase-js estabelecia sessão e a app entrava como se
// fosse um login normal: o utilizador ficava dentro com a senha antiga e sem
// nenhum ecrã para definir a nova — redefinir era um beco sem saída.
// ============================================================================

/** Marca a sessão como "veio de um link de recuperação" (sobrevive a reload). */
export const CHAVE_RECUPERACAO = 'gbr_password_recovery';

/** `true` quando o URL que abriu a app é um link de recuperação do Supabase. */
export const ehLinkDeRecuperacao = (hash: string, search = ''): boolean => {
  const temParametro = (texto: string): boolean =>
    /(?:^|[#?&])type=recovery(?:&|$)/.test(texto || '');
  return temParametro(hash) || temParametro(search);
};

/**
 * Marca em memória. O supabase-js consome e limpa o `#access_token` quando o
 * cliente é construído, por isso a leitura do URL tem de acontecer ANTES disso
 * (ver a captura no fim deste módulo, importada primeiro por `index.tsx`).
 */
let recuperacaoEmMemoria = false;

export const marcarRecuperacaoDeSenha = (): void => {
  recuperacaoEmMemoria = true;
  try {
    sessionStorage.setItem(CHAVE_RECUPERACAO, 'true');
  } catch {
    /* storage bloqueado: a marca em memória continua a valer */
  }
};

/**
 * Lê o URL e marca a recuperação. Chamada na avaliação deste módulo, que
 * `index.tsx` importa antes do App/supabaseService — ordem determinística de
 * ESM, para apanhar o hash antes de o cliente o apagar.
 */
export const capturarLinkDeRecuperacao = (): boolean => {
  if (typeof window === 'undefined') return false;
  const doLink = ehLinkDeRecuperacao(window.location.hash, window.location.search);
  if (doLink) marcarRecuperacaoDeSenha();
  return doLink;
};

capturarLinkDeRecuperacao();

export const emRecuperacaoDeSenha = (): boolean => {
  if (recuperacaoEmMemoria) return true;
  try {
    return sessionStorage.getItem(CHAVE_RECUPERACAO) === 'true';
  } catch {
    return false;
  }
};

export const limparRecuperacaoDeSenha = (): void => {
  recuperacaoEmMemoria = false;
  try {
    sessionStorage.removeItem(CHAVE_RECUPERACAO);
  } catch {
    /* nada a limpar */
  }
};
