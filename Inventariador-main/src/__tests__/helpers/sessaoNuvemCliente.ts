/**
 * SESSÃO DA NUVEM NOS TESTES DE ENVIO
 * ============================================================================
 * `syncAssetsToCloud` recusa enviar sem token do Supabase
 * (`garantirSessaoNuvemParaEnvio`): sem sessão o pedido chegaria ao PostgREST
 * como `anon` e o RLS responderia `42501 permission denied for table assets`.
 *
 * Os testes de payload, conflito e carimbo correm como um utilizador já
 * autenticado — esta função dá ao cliente stub a sessão que a app teria depois
 * do login. Um teste que queira o cenário sem sessão simplesmente não a chama
 * (ou limpa o mock).
 */
import { vi } from 'vitest';

export const autenticarClienteDeTeste = (cliente: unknown, email = 'semorr@gmail.com'): void => {
  const auth = (cliente as { auth?: { getSession?: () => unknown } } | null)?.auth;
  if (!auth || typeof auth.getSession !== 'function') return;
  vi.spyOn(auth as { getSession: () => unknown }, 'getSession').mockResolvedValue({
    data: { session: { access_token: 'jwt-de-teste', user: { email } } },
    error: null
  } as never);
};
