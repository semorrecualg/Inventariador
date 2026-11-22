// ============================================================================
// passwordHash.ts — a senha local nunca é guardada em texto.
//
// O registo de utilizador do aparelho (`app_users`, cópia persistida da sessão
// e `localDb.users`) levava `password` em claro: qualquer backup do telemóvel
// ou acesso ao browser lia credenciais de administrador. Aqui fica o
// verificador usado daqui em diante — **PBKDF2-HMAC-SHA256 do WebCrypto**
// (100 000 iterações, sal aleatório por registo) — e os auxiliares que
// descartam o texto antigo de qualquer escrita.
// ============================================================================

/** Iterações do PBKDF2: o custo fica no atacante, não no login. */
const ITERATIONS = 100_000;
const KEY_BITS = 256;

export interface PasswordVerifier {
  passwordHash?: string;
  passwordSalt?: string;
}

/** Registo que ainda pode ter senha em texto (formato antigo). */
export interface PasswordBearingRecord extends PasswordVerifier {
  password?: string;
}

/**
 * Verificador da senha padrão `admin` (PBKDF2, sal fixo).
 *
 * A semente do administrador local é criada de forma síncrona no arranque, por
 * isso o valor é calculado uma vez e fixado aqui. O sal não é segredo e a
 * senha padrão é pública por desenho; quem trocar a senha recebe um sal novo.
 */
export const ADMIN_SEED_VERIFIER: Required<PasswordVerifier> = {
  passwordSalt: 'tdq0tXvb4P8BfQ6lBdzeKw==',
  passwordHash: 'RqYp1xf6lh5wWAAYw+eevF2PYLJo4RPodQzieO1+YG0='
};

const getSubtle = (): SubtleCrypto => {
  const webCrypto = globalThis.crypto;
  if (!webCrypto?.subtle) {
    throw new Error('WebCrypto indisponível: não é possível verificar a senha local neste aparelho.');
  }
  return webCrypto.subtle;
};

const bytesToBase64 = (bytes: Uint8Array): string => {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
};

const base64ToBytes = (value: string): Uint8Array<ArrayBuffer> => {
  const binary = atob(value);
  // ArrayBuffer próprio: `salt` tem de ser um `BufferSource` (WebCrypto).
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

/** Sal aleatório (16 bytes) por registo: dois utilizadores com a mesma senha não coincidem. */
export const createPasswordSalt = (): string => {
  const bytes = new Uint8Array(16);
  const webCrypto = globalThis.crypto;
  if (!webCrypto?.getRandomValues) {
    throw new Error('WebCrypto indisponível: não é possível gerar o sal da senha local.');
  }
  webCrypto.getRandomValues(bytes);
  return bytesToBase64(bytes);
};

const derive = async (password: string, salt: string): Promise<string> => {
  const subtle = getSubtle();
  const key = await subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, [
    'deriveBits'
  ]);
  const bits = await subtle.deriveBits(
    { name: 'PBKDF2', salt: base64ToBytes(salt), iterations: ITERATIONS, hash: 'SHA-256' },
    key,
    KEY_BITS
  );
  return bytesToBase64(new Uint8Array(bits));
};

/** Verificador novo para uma senha em texto (usado no cadastro e na troca de senha). */
export const createPasswordVerifier = async (
  password: string,
  salt: string = createPasswordSalt()
): Promise<Required<PasswordVerifier>> => ({
  passwordHash: await derive(password, salt),
  passwordSalt: salt
});

const sameValue = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
};

/**
 * Confere a senha contra o verificador do registo.
 *
 * Registos antigos (só `password`) continuam a entrar enquanto não forem
 * migrados — são convertidos no arranque (`localDb.users.migrateLocalUserPasswords`)
 * e em qualquer gravação, para nenhum caminho voltar a propagar texto.
 */
export const verifyUserPassword = async (
  record: PasswordBearingRecord | null | undefined,
  password: string
): Promise<boolean> => {
  if (!record || typeof password !== 'string' || password === '') return false;
  if (record.passwordHash && record.passwordSalt) {
    return sameValue(await derive(password, record.passwordSalt), record.passwordHash);
  }
  return typeof record.password === 'string' && record.password !== '' && record.password === password;
};

/** `true` quando o registo ainda guarda a senha em texto (formato antigo). */
export const hasPlaintextPassword = (record: PasswordBearingRecord | null | undefined): boolean =>
  !!record && typeof record.password === 'string' && record.password !== '';

/**
 * Devolve o registo pronto para guardar: calcula o verificador a partir da
 * senha em texto (quando existe) e descarta `password`. Idempotente — um
 * registo que já tem hash não é re-derivado.
 */
export const withPasswordVerifier = async <T extends PasswordBearingRecord>(
  user: T
): Promise<Omit<T, 'password'>> => {
  const { password, ...rest } = user;
  if (rest.passwordHash && rest.passwordSalt) return rest;
  if (typeof password === 'string' && password !== '') {
    return { ...rest, ...(await createPasswordVerifier(password)) };
  }
  return rest;
};

/**
 * Remove a senha sem derivar nada. Para cópias que não autenticam (sessão
 * persistida, `sessionStorage`): o perfil não precisa da senha para nada.
 */
export const stripUserSecrets = <T extends PasswordBearingRecord>(user: T): Omit<T, 'password'> => {
  const copy = { ...user };
  delete copy.password;
  return copy;
};

/** Lista pronta para `localStorage`/Dexie: nenhum registo leva a senha em claro. */
export const sanitizeUsersForStorage = async <T extends PasswordBearingRecord>(
  users: T[]
): Promise<Array<Omit<T, 'password'>>> => Promise.all((users || []).map((user) => withPasswordVerifier(user)));
