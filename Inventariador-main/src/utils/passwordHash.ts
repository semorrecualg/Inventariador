// ============================================================================
// passwordHash.ts — a senha local nunca é guardada em texto.
//
// O registo de utilizador do aparelho (`app_users`, cópia persistida da sessão
// e `localDb.users`) levava `password` em claro: qualquer backup do telemóvel
// ou acesso ao browser lia credenciais de administrador. Aqui fica o
// verificador usado daqui em diante — sal aleatório por registo + hash iterado
// (SHA-256) — e a limpeza de registos antigos, que troca o texto pelo hash no
// momento em que são lidos para a memória.
//
// SHA-256 em JS puro para o verificador ser SÍNCRONO: o arranque do app
// (semente do admin, leitura de `app_users`) não pode depender de WebCrypto
// assíncrono, e a verificação tem de correr no login e nos testes em jsdom.
// ============================================================================

/** Iterações da derivação: manter o login abaixo de ~10 ms por registo. */
const ITERATIONS = 4096;

export interface PasswordVerifier {
  passwordHash?: string;
  passwordSalt?: string;
}

/** Registo que ainda pode ter senha em texto (formato antigo). */
export interface PasswordBearingRecord extends PasswordVerifier {
  password?: string;
}

const K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
];

const rotr = (value: number, shift: number): number => (value >>> shift) | (value << (32 - shift));

/** SHA-256 (hex) de uma string UTF-8. */
export const sha256Hex = (message: string): string => {
  const bytes = new TextEncoder().encode(message);
  const bitLength = bytes.length * 8;
  // Mensagem + 0x80 + tamanho (8 bytes), múltiplo de 64 bytes.
  const padded = new Uint8Array((Math.floor((bytes.length + 9 + 63) / 64)) * 64);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, Math.floor(bitLength / 0x100000000), false);
  view.setUint32(padded.length - 4, bitLength >>> 0, false);

  const h = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
  ];
  const w = new Uint32Array(64);

  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let i = 0; i < 16; i += 1) w[i] = view.getUint32(offset + i * 4, false);
    for (let i = 16; i < 64; i += 1) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }

    let a = h[0];
    let b = h[1];
    let c = h[2];
    let d = h[3];
    let e = h[4];
    let f = h[5];
    let g = h[6];
    let hh = h[7];

    for (let i = 0; i < 64; i += 1) {
      const s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (hh + s1 + ch + K[i] + w[i]) >>> 0;
      const s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (s0 + maj) >>> 0;
      hh = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }

    h[0] = (h[0] + a) >>> 0;
    h[1] = (h[1] + b) >>> 0;
    h[2] = (h[2] + c) >>> 0;
    h[3] = (h[3] + d) >>> 0;
    h[4] = (h[4] + e) >>> 0;
    h[5] = (h[5] + f) >>> 0;
    h[6] = (h[6] + g) >>> 0;
    h[7] = (h[7] + hh) >>> 0;
  }

  return h.map((part) => part.toString(16).padStart(8, '0')).join('');
};

const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');

/** Sal aleatório (16 bytes) por registo: dois utilizadores com a mesma senha não coincidem. */
export const createPasswordSalt = (): string => {
  const bytes = new Uint8Array(16);
  const webCrypto = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined;
  if (webCrypto?.getRandomValues) {
    webCrypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  return toHex(bytes);
};

const stretch = (password: string, salt: string): string => {
  let digest = sha256Hex(`${salt}:${password}`);
  for (let i = 0; i < ITERATIONS; i += 1) digest = sha256Hex(`${digest}:${salt}`);
  return digest;
};

/** Verificador novo para uma senha em texto (usado no cadastro e na troca de senha). */
export const createPasswordVerifier = (
  password: string,
  salt: string = createPasswordSalt()
): Required<PasswordVerifier> => ({
  passwordHash: stretch(password, salt),
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
 * Registos antigos (só `password`) continuam a entrar — são migrados para hash
 * na primeira gravação (`withPasswordVerifier`), para nenhum caminho de escrita
 * voltar a propagar texto.
 */
export const verifyUserPassword = (
  record: PasswordBearingRecord | null | undefined,
  password: string
): boolean => {
  if (!record || typeof password !== 'string' || password === '') return false;
  if (record.passwordHash && record.passwordSalt) {
    return sameValue(stretch(password, record.passwordSalt), record.passwordHash);
  }
  return typeof record.password === 'string' && record.password !== '' && record.password === password;
};

/**
 * Devolve o registo pronto para guardar: calcula o verificador a partir da
 * senha em texto (quando existe) e descarta `password`. Idempotente — um
 * registo que já tem hash não é re-hasheado.
 */
export const withPasswordVerifier = <T extends PasswordBearingRecord>(user: T): Omit<T, 'password'> => {
  const { password, ...rest } = user;
  if (rest.passwordHash && rest.passwordSalt) return rest;
  if (typeof password === 'string' && password !== '') {
    return { ...rest, ...createPasswordVerifier(password) };
  }
  return rest;
};

/** Lista pronta para `localStorage`/Dexie: nenhum registo leva a senha em claro. */
export const sanitizeUsersForStorage = <T extends PasswordBearingRecord>(
  users: T[]
): Array<Omit<T, 'password'>> => (users || []).map((user) => withPasswordVerifier(user));
