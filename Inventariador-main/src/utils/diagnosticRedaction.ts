/**
 * Redação/anonimização do pacote de diagnóstico do SRE Diagnostics Monitor.
 *
 * O pacote é feito para ser partilhado fora do aparelho (ticket, chat, suporte),
 * logo o texto exportado passa por aqui antes de virar ficheiro. As máscaras
 * preservam a *forma* do dado (domínio/TLD, prefixo do código, número de
 * parâmetros de URL) — o suficiente para correlacionar o incidente — e escondem
 * o que identifica pessoas, contratos e credenciais.
 *
 * Funções puras, sem dependências: o resultado é determinístico para o mesmo
 * texto, o que permite conferir o pacote sem surpresas entre exportações.
 */

const MASK = '***';

/** `ana.silva@empresa.com.br` → `a***@e***.com.br` (sufixo do domínio intacto). */
const maskEmail = (local: string, domain: string): string => {
  const labels = domain.split('.');
  // 1 rótulo a mascarar (`empresa`) + sufixo legível (`com.br`/`co.uk`).
  const suffix = labels.slice(1).join('.');
  const hostMask = `${labels[0].slice(0, 1)}${MASK}`;
  return `${local.slice(0, 1)}${MASK}@${hostMask}${suffix ? `.${suffix}` : ''}`;
};

/** Mantém os primeiros caracteres do identificador e o comprimento visível. */
const maskIdentifier = (value: string, keep = 2): string =>
  value.length <= keep ? MASK : `${value.slice(0, keep)}${MASK}`;

/**
 * URL: esconde credenciais (`user:senha@`) e os VALORES dos parâmetros de
 * consulta/fragmento, mantendo esquema, host, caminho e nomes dos parâmetros.
 */
const maskUrl = (raw: string): string => {
  try {
    const url = new URL(raw);
    const params = Array.from(url.searchParams.keys());
    const search = params.length > 0 ? `?${params.map((name) => `${name}=${MASK}`).join('&')}` : '';
    const hash = url.hash ? `#${MASK}` : '';
    // Credenciais embutidas (`user:senha@host`) caem para `***@host`.
    const credentials = url.username || url.password ? `${MASK}@` : '';
    return `${url.protocol}//${credentials}${url.host}${url.pathname}${search}${hash}`;
  } catch {
    // URL inválida/relativa: máscara mínima, sem perder o prefixo legível.
    return raw
      .replace(/\/\/[^/@\s]+@/, `//${MASK}@`)
      .replace(/([?&][^=&\s]+)=[^&\s]*/g, `$1=${MASK}`)
      .replace(/#.*$/, `#${MASK}`);
  }
};

/**
 * Chaves cujo valor identifica o contrato/tenant — nunca vai cru.
 * Aceita o rótulo entre parênteses do painel (`Contrato Ativo (tenantid): …`).
 */
const TENANT_KEY_RE =
  /\b(tenantid|tenant_id|tenant|contrato|contratos)\b("?\s*\)?\s*[:=]\s*"?)([A-Za-z0-9._-]{2,})/gi;

/** Chaves (e o esquema Bearer) cujo valor é credencial. */
const SECRET_KEY_RE =
  /\b(client_secret|service_role|api[_-]?key|apikey|access[_-]?token|refresh[_-]?token|auth[_-]?token|token|secret|senha|password|authorization)\b("?\s*[:=]\s*"?)(?:bearer\s+)?([^\s"',;]{4,})/gi;

const JWT_RE = /\beyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{4,}\b/g;
const BEARER_RE = /\b(bearer)\s+([A-Za-z0-9._~+/-]{8,}=*)/gi;
const EMAIL_RE = /([A-Za-z0-9._%+-]+)@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,})/g;
const URL_RE = /https?:\/\/[^\s"'`<>)\]]+/g;
const UUID_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
/**
 * Hash/chave longa (hex/base64url) — identificador opaco, não ajuda o suporte.
 *
 * O limite à esquerda é um grupo de captura (e não um lookbehind): Safari em
 * iOS anterior ao 16.4 não suporta `(?<=…)` e o regex falharia ao compilar no
 * aparelho, deixando o pacote sair sem redação.
 */
const LONG_OPAQUE_RE = /(^|[^A-Za-z0-9_-])([A-Za-z0-9_-]{32,})(?![A-Za-z0-9_-])/g;

/**
 * Tenant/contrato em texto corrido: «contrato GBR001», «tenant (ABC12)».
 *
 * Só apanha códigos em MAIÚSCULAS (`[A-Z]…`), por isso «Contrato Ativo» ou
 * «contrato de serviço» continuam legíveis; a lista curta evita mascarar
 * rótulos que não identificam ninguém.
 */
const TENANT_PROSE_RE =
  /\b([Cc]ontratos?|[Tt]enant(?:Id|ID|id|_id)?)\b(\s*(?:[:=]\s*)?\(?\s*)([A-Z][A-Z0-9._-]{2,})(?![A-Za-z0-9._-])/g;

/** Códigos que são rótulo, não identificador de contrato. */
const NON_TENANT_CODES = new Set(['GLOBAL', 'GERAL', 'TODOS', 'TODAS', 'SEM']);

/**
 * Texto pronto para partilha: e-mails, tenantids/contratos, credenciais,
 * URLs com parâmetros, UUIDs e hashes opacos ficam mascarados.
 *
 * A ordem importa: primeiro o que tem estrutura (URL, chave=valor), depois os
 * padrões soltos, para não mascarar as próprias máscaras nem partir tokens.
 */
export const redactDiagnosticText = (text: string): string => {
  if (!text) return '';
  let out = text;

  // 1. URL completa (credenciais + query + fragmento).
  out = out.replace(URL_RE, (match) => maskUrl(match));

  // 2. Credenciais nomeadas e Bearer.
  out = out.replace(SECRET_KEY_RE, (_match, key: string, sep: string) => `${key}${sep}${MASK}`);
  out = out.replace(BEARER_RE, (_match, scheme: string) => `${scheme} ${MASK}`);

  // 3. JWT e chaves longas opacas.
  out = out.replace(JWT_RE, `[JWT redigido]`);
  out = out.replace(
    LONG_OPAQUE_RE,
    (_match, prefix: string, value: string) => `${prefix}${value.slice(0, 6)}${MASK}`
  );

  // 4. E-mails (depois das URLs, que já podem conter `user@host`).
  out = out.replace(EMAIL_RE, (_match, local: string, domain: string) => maskEmail(local, domain));

  // 5. Contrato/tenant (chave=valor, chave: valor, JSON).
  // `\b` em ambos os lados evita apanhar `contratosDaCarga`/`tenantidMap`.
  out = out.replace(TENANT_KEY_RE, (_match, key: string, sep: string, value: string) =>
    `${key}${sep}${maskIdentifier(value)}`
  );

  // 6. Texto corrido («contrato GBR001»), depois da forma chave=valor para não
  // apanhar duas vezes o mesmo código.
  out = out.replace(TENANT_PROSE_RE, (match, key: string, sep: string, value: string) =>
    NON_TENANT_CODES.has(value.toUpperCase()) ? match : `${key}${sep}${maskIdentifier(value)}`
  );

  // 7. UUIDs.
  out = out.replace(UUID_RE, (match) => `${match.slice(0, 8)}-${MASK}`);

  return out;
};
