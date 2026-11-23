/**
 * GUARDA DE SAÍDA — quando é que fechar/recarregar merece uma confirmação?
 * ============================================================================
 * O `beforeunload` do app pedia confirmação **sempre que houvesse ativos
 * carregados**. Com a base toda sincronizada o F5 abria o diálogo nativo à
 * mesma e, sem resposta, a recarga ficava retida — num build de produção isso
 * parece um separador «preso» (o achado de 23/11: reload quente em
 * `#/audit-logs` e em `#/contexto`).
 *
 * A regra certa não é «tem dados no ecrã»: é «há escritas que ainda não
 * subiram». As filas que o app já mostra como pendências contam-se assim:
 * `ativos` (`local_assets` com `_is_synced = 0`), `fotos` (fila de envio de
 * fotos) e `auditoria` (`audit_logs` com `_synced !== 1`).
 *
 * A regra é pura para poder ser provada sem montar o `App` — os contadores
 * vêm dos mesmos sítios que alimentam o selo «N pendentes».
 */

/** As três filas que o app pode ter por subir. */
export interface EscritasPendentes {
  /** Ativos alterados ou conferidos no aparelho e ainda não confirmados. */
  ativos: number;
  /** Fotos na fila de envio. */
  fotos: number;
  /** Eventos da trilha de auditoria ainda fora da nuvem. */
  auditoria: number;
}

/**
 * Soma as pendências. Valores inválidos (NaN, negativos, decimais) não podem
 * inventar uma confirmação nem escondê-la: cada parcela é normalizada para um
 * inteiro ≥ 0.
 */
export const totalDeEscritasPendentes = (pendentes: Partial<EscritasPendentes>): number => {
  const normalizar = (valor: unknown): number => {
    const numero = Number(valor);
    return Number.isFinite(numero) && numero > 0 ? Math.floor(numero) : 0;
  };
  return (
    normalizar(pendentes.ativos) +
    normalizar(pendentes.fotos) +
    normalizar(pendentes.auditoria)
  );
};

/**
 * `true` só quando há, de facto, algo por enviar. Uma base carregada e
 * sincronizada (12.636 ativos, zero pendências) devolve `false` — é esta a
 * diferença face ao comportamento antigo.
 */
export const devePedirConfirmacaoAoFechar = (pendentes: Partial<EscritasPendentes>): boolean =>
  totalDeEscritasPendentes(pendentes) > 0;

/**
 * Texto do diálogo. O browser atual mostra uma mensagem própria e ignora esta
 * (só o Firefox a apresenta), mas o texto certo serve o WebView do APK e diz ao
 * operador o que fica por subir — e que nada se perde no aparelho.
 */
export const mensagemDeSaida = (total: number): string => {
  const normalizado = Number.isFinite(total) && total > 0 ? Math.floor(total) : 0;
  if (normalizado === 0) return '';
  return normalizado === 1
    ? 'Há 1 alteração por enviar para a nuvem. Sair agora mantém tudo no aparelho, mas adia o envio.'
    : `Há ${normalizado} alterações por enviar para a nuvem. Sair agora mantém tudo no aparelho, mas adia o envio.`;
};
