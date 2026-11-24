// ============================================================================
// supabaseProjectRef.ts — a que projeto Supabase este build está a ligar.
//
// O ecrã de login mostrava só «AMBIENTE: SUPABASE (WEB)»: qualquer projeto serve
// para essa frase, e um `VITE_SUPABASE_URL` trocado no ambiente produzia o mesmo
// «credenciais inválidas» de uma senha errada. Mostrar o *ref* do projeto deixa
// a comparação com o dashboard ser feita a olho, sem abrir o DevTools.
//
// O ref é público (faz parte do URL e do `iss` do token): não é segredo.
// ============================================================================

/**
 * `https://abcdefghij.supabase.co` → `abcdefghij`
 *
 * Projetos geridos pelo Supabase devolvem o subdomínio; um domínio próprio
 * (self-hosted) devolve o host tal como está, porque não há ref para extrair.
 * URL ausente ou inválida → string vazia (o badge não aparece).
 */
export const refDoProjetoSupabase = (url?: string | null): string => {
  const texto = (url ?? '').trim();
  if (!texto) return '';

  let host = '';
  try {
    host = new URL(texto).hostname.trim().toLowerCase();
  } catch {
    return '';
  }
  if (!host) return '';

  const gerido = host.match(/^([a-z0-9-]+)\.supabase\.(?:co|in)$/);
  return gerido ? gerido[1] : host;
};
