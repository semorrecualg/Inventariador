// ============================================================================
// loginErrors.ts — traduzir o que o Supabase Auth realmente responde.
//
// O teste de credencial inválida procurava `'invalid credentials'`, mas o
// Supabase responde `Invalid login credentials` — `"invalid login credentials"`
// NÃO contém `"invalid credentials"` (o "login" fica no meio). O ramo
// localizado nunca corria e o formulário mostrava o texto cru em inglês.
// ============================================================================

const normalizar = (mensagem: string): string => (mensagem || '').toLowerCase();

/** Textos que o Supabase usa para "não existe / senha errada" (mesma resposta). */
const CREDENCIAL_INVALIDA = [
  'invalid login credentials', // resposta real do GoTrue
  'invalid credentials',
  'invalid_credentials',
  'invalid_grant',
  'invalid grant',
  'invalid password',
  'invalid email',
  'user not found',
  'user_not_found',
  'incorrect',
  // Mensagens já traduzidas dentro da app (evita que percam o ramo localizado).
  'senha incorret',
  'senha invál',
  'e-mail ou senha',
  'usuário ou senha',
  'usuario ou senha'
];

/** Textos de e-mail por confirmar (conta criada por convite/registo). */
const EMAIL_NAO_CONFIRMADO = [
  'email not confirmed',
  'email_not_confirmed',
  'email link is invalid',
  'signup is disabled'
];

/**
 * O Supabase devolve a MESMA resposta para senha errada e conta inexistente
 * (não revela qual dos dois). A mensagem tem de dizer as duas hipóteses — e a
 * dica do autofill, porque o preenchimento automático do navegador repõe a
 * senha antiga depois de um reset e o 400 parece um problema de conta.
 */
export const MENSAGEM_CREDENCIAL_INVALIDA =
  'E-mail/senha incorretos, ou a conta ainda não existe neste ambiente. Se a senha foi alterada há pouco, escreva-a à mão no campo (sem autofill do navegador — ele costuma repor a senha antiga). Verifique os dados ou peça ao administrador para criar o acesso.';

export const MENSAGEM_EMAIL_NAO_CONFIRMADO =
  'E-mail ainda não confirmado. Abra o link do convite enviado para a sua caixa de entrada e tente novamente.';

export const ehCredencialInvalida = (mensagem: string): boolean =>
  CREDENCIAL_INVALIDA.some((termo) => normalizar(mensagem).includes(termo));

export const emailNaoConfirmado = (mensagem: string): boolean =>
  EMAIL_NAO_CONFIRMADO.some((termo) => normalizar(mensagem).includes(termo));

/**
 * Acrescenta o código/estado devolvido pelo Auth, entre parênteses rectos.
 *
 * Sem isto, "credenciais inválidas" é indistinguível de conta banida, conta
 * apagada, e-mail por confirmar ou limite de pedidos — todas chegam ao ecrã como
 * a mesma frase, e o diagnóstico fica a adivinhar.
 */
/**
 * Linha do SRE Monitor para uma entrada recusada.
 *
 * O `[INVALID_CREDENTIALS]` no formulário diz *que* foi recusada, mas não
 * responde às duas perguntas do diagnóstico: o Auth devolveu que código, e
 * contra que projeto Supabase? Sem isto, comparar com o dashboard obrigava a
 * abrir o DevTools no aparelho onde o login falhou.
 *
 * O ref e o URL do projeto são públicos (fazem parte do pedido); a senha nunca
 * entra na linha.
 */
export interface FalhaDeLoginSre {
  codigo?: unknown;
  motivo: string;
  projectRef?: string | null;
  projetoUrl?: string | null;
  utilizador?: string | null;
}

const textoDoCodigo = (codigo: unknown): string =>
  typeof codigo === 'string' || typeof codigo === 'number' ? String(codigo).trim() : '';

/**
 * Resumo curto mostrado no PRÓPRIO ecrã de login.
 *
 * O SRE Monitor só abre depois de autenticar — inútil para quem está bloqueado
 * na porta. Estes três campos são os que respondem a «por que razão a entrada
 * é recusada» sem DevTools: código do Auth, projeto e utilizador tentado.
 */
export const resumoDaRecusaDeLogin = (
  falha: FalhaDeLoginSre
): { codigo: string; projeto: string; utilizador: string } => ({
  codigo: textoDoCodigo(falha.codigo),
  projeto: (falha.projectRef || '').trim() || 'desconhecido',
  utilizador: (falha.utilizador || '').trim() || '-'
});

export const linhaSreDeLoginRecusado = (falha: FalhaDeLoginSre): string => {
  const { codigo, projeto, utilizador } = resumoDaRecusaDeLogin(falha);
  const url = (falha.projetoUrl || '').trim();

  return [
    `[Login] Entrada recusada${codigo ? ` [${codigo}]` : ''}: ${falha.motivo}`,
    `projeto ${projeto}${url ? ` (${url})` : ''}`,
    `utilizador ${utilizador}`
  ].join(' · ');
};

export const comCodigoTecnico = (mensagem: string, codigo?: unknown): string => {
  const texto = typeof codigo === 'string' || typeof codigo === 'number'
    ? String(codigo).trim()
    : '';
  return texto ? `${mensagem} [${texto}]` : mensagem;
};
