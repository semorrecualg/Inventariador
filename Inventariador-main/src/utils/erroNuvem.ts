/**
 * ERRO DA NUVEM COM A CARA REAL
 * ============================================================================
 * O PostgREST responde com um objeto `{ code, message, details, hint }` que NÃO
 * é uma instância de `Error`. Os leitores da base usavam `error.message ||
 * 'Erro de esquema.'`: quando o servidor devolvia um corpo sem mensagem (401 do
 * gateway, 5xx do projeto, resposta vazia), o operador via «Erro de esquema.» —
 * um texto que o próprio app inventava e que não distingue causa nenhuma.
 *
 * Esta função é o único formatador desses erros. Nunca devolve string vazia e
 * nunca substitui o motivo real por uma suposição: mostra o que veio e, quando
 * não veio nada, diz exactamente isso.
 */

type ErroNuvem = {
  code?: unknown;
  message?: unknown;
  details?: unknown;
  hint?: unknown;
  status?: unknown;
  statusCode?: unknown;
  name?: unknown;
};

const texto = (valor: unknown): string =>
  typeof valor === 'string' ? valor.trim() : (typeof valor === 'number' ? String(valor) : '');

/**
 * Descreve um erro da nuvem para o operador e para os logs.
 *
 * Formatos:
 *   `[42501] permission denied for table dics · detalhe: … · dica: …`
 *   `[PGRST205] Could not find the table …`
 *   `(sem mensagem do servidor) · HTTP 401`   ← erro com estado, sem mensagem
 *   `resposta sem código nem mensagem do servidor`
 *   `TypeError: Failed to fetch`
 */
export const descreverErroNuvem = (err: unknown): string => {
  if (err === null || err === undefined) return 'resposta vazia da nuvem (sem erro nem dados)';

  if (typeof err === 'string') return err.trim() || 'erro sem texto';
  if (typeof err !== 'object') return String(err);

  const e = err as ErroNuvem;
  const nome = err instanceof Error && texto(e.name) && texto(e.name) !== 'Error' ? `${texto(e.name)}: ` : '';
  const codigo = texto(e.code);
  const mensagem = texto(e.message);
  const detalhe = texto(e.details);
  const dica = texto(e.hint);
  const estado = texto(e.status) || texto(e.statusCode);

  // Sem nenhum campo útil: não inventar causa. Mostra o corpo, se houver.
  if (!codigo && !mensagem && !detalhe && !dica && !estado) {
    if (err instanceof Error) return `${nome}(sem mensagem do servidor)`;
    try {
      const bruto = JSON.stringify(err);
      if (bruto && bruto !== '{}') return `erro sem código nem mensagem: ${bruto}`;
    } catch {
      return 'erro sem código nem mensagem (não serializável)';
    }
    return 'resposta sem código nem mensagem do servidor';
  }

  // Código e mensagem formam o motivo; sem mensagem, o código não fica solto.
  const principal = codigo
    ? `[${codigo}]${mensagem ? ` ${mensagem}` : ' (sem mensagem do servidor)'}`
    : (mensagem || '(sem mensagem do servidor)');
  const partes = [
    principal,
    estado ? `HTTP ${estado}` : '',
    detalhe ? `detalhe: ${detalhe}` : '',
    dica ? `dica: ${dica}` : ''
  ].filter(Boolean);

  return `${nome}${partes.join(' · ')}`;
};
