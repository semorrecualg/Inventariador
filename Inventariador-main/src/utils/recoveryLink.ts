// ============================================================================
// recoveryLink.ts — o link de recuperação quando a app corre no telemóvel.
//
// `getAppBaseUrl()` devolve o origin do WebView (`https://localhost`) no APK.
// Nenhum browser abre esse endereço, por isso o e-mail de recuperação morria
// num "não foi possível aceder" e a senha nunca era trocada — o login ficava
// em `invalid_credentials` para sempre.
//
// No nativo o link aponta para o esquema próprio da app
// (`com.gbr.kardek://recovery`), que o Android entrega à MainActivity; o App
// escuta `appUrlOpen`, troca os tokens por sessão e abre "Definir Nova Senha".
// ============================================================================

import { getAppBaseUrl } from './urlUtils';

/** Deep link registado no `AndroidManifest.xml` (intent-filter). */
export const ESQUEMA_RECUPERACAO = 'com.gbr.kardek://recovery';

export interface TokensDeRecuperacao {
  accessToken: string;
  refreshToken: string;
}

/**
 * Para onde o e-mail deve mandar o utilizador.
 *
 * Nativo → esquema próprio (abre a app). Web/dev → o origin actual, como antes.
 */
export const urlDeRecuperacao = (nativo: boolean): string =>
  nativo ? ESQUEMA_RECUPERACAO : getAppBaseUrl();

/**
 * Tokens que o Supabase põe depois do `#` ao redireccionar o link.
 *
 * Só aceita `type=recovery` (um link de convite/magic-link não pode abrir a
 * troca de senha) e exige os dois tokens: sem `refresh_token` não há sessão
 * renovável e o ecrã de nova senha falharia ao gravar.
 */
export const tokensDoLinkDeRecuperacao = (url?: string | null): TokensDeRecuperacao | null => {
  const texto = (url ?? '').trim();
  if (!texto) return null;

  const hashIndex = texto.indexOf('#');
  const hash = hashIndex >= 0 ? texto.slice(hashIndex + 1) : '';
  if (!hash) return null;

  const params = new URLSearchParams(hash);
  const tipo = (params.get('type') || '').toLowerCase();
  if (tipo && tipo !== 'recovery') return null;

  const accessToken = params.get('access_token') || '';
  const refreshToken = params.get('refresh_token') || '';
  if (!accessToken || !refreshToken) return null;

  return { accessToken, refreshToken };
};
