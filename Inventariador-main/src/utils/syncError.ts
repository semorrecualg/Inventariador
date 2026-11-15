// ============================================================================
// syncError.ts — a mensagem de erro do sync diz o que realmente falhou.
//
// O `catch` do pull gravava sempre "Erro de tráfego em rede WebView. Chaveado
// para contingência local.", mesmo quando NADA foi chaveado e a causa era outra
// (prazo de uma página a estourar, RLS a negar, contrato sem config). O operador
// via uma pílula vermelha "Erro" no cabeçalho e um texto que mentia sobre a
// contingência, sem forma de saber o que aconteceu.
// ============================================================================

/**
 * Texto para o estado `syncError` a partir do erro real.
 *
 * Aceita `Error`, erros do PostgREST (objetos com `message`) e strings.
 * Sem detalhe aproveitável, cai numa frase genérica honesta — nunca numa
 * alegação de contingência que não aconteceu.
 */
export const mensagemDeErroDeSync = (erro: unknown): string => {
  const detalhe = detalheDoErro(erro);
  return detalhe
    ? `Falha ao sincronizar com a nuvem: ${detalhe}`
    : 'Falha ao sincronizar com a nuvem. Tente novamente.';
};

const detalheDoErro = (erro: unknown): string => {
  if (erro instanceof Error) return erro.message.trim();
  if (typeof erro === 'string') return erro.trim();
  if (typeof erro === 'object' && erro !== null) {
    const mensagem = (erro as { message?: unknown }).message;
    if (typeof mensagem === 'string') return mensagem.trim();
  }
  return '';
};
