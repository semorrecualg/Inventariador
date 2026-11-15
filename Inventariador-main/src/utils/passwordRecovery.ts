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

export const marcarRecuperacaoDeSenha = (): void => {
  try {
    sessionStorage.setItem(CHAVE_RECUPERACAO, 'true');
  } catch {
    /* storage bloqueado: a marca em memória do App continua a valer */
  }
};

export const emRecuperacaoDeSenha = (): boolean => {
  try {
    return sessionStorage.getItem(CHAVE_RECUPERACAO) === 'true';
  } catch {
    return false;
  }
};

export const limparRecuperacaoDeSenha = (): void => {
  try {
    sessionStorage.removeItem(CHAVE_RECUPERACAO);
  } catch {
    /* nada a limpar */
  }
};
