/**
 * Texto do campo `details` da trilha de auditoria.
 *
 * O `details` nasce como texto no aparelho (`audit_logs` do Dexie) e no
 * `docs/supabase_bootstrap.sql` está declarado como `text`. A tabela de
 * produção, porém, tem `details` como **json**: uma linha lida da nuvem chega
 * como objeto (ou array), e passar isso a `.toLowerCase()`, `.match()` ou a um
 * nó React rebenta o ecrã.
 *
 * Esta função é o único ponto de conversão: devolve sempre string, preserva o
 * texto quando já é texto e serializa objetos em JSON legível (a contagem de
 * ativos do histórico, por exemplo, continua a ser encontrada dentro do JSON).
 */
export const textoDoDetails = (details: unknown): string => {
  if (details === null || details === undefined) return '';
  if (typeof details === 'string') return details;
  if (typeof details === 'number' || typeof details === 'boolean' || typeof details === 'bigint') {
    return String(details);
  }
  try {
    return JSON.stringify(details) ?? '';
  } catch {
    // Objetos circulares ou com `toJSON` que lança: não vale derrubar a trilha.
    return '';
  }
};
