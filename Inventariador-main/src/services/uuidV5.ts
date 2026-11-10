// UUID v5 determinístico (RFC 4122) sem dependências.
//
// Porquê: a coluna `public.assets.id` é `uuid PRIMARY KEY` no bootstrap, mas a
// chave de origem do inventário é `primarykey` (ex.: "0101010000004969001").
// Enviar a string da chave em `id` faz o Postgres rejeitar a carga inteira com
// 22P02. Um UUID derivado de (tenantid + primarykey) resolve os dois lados:
// respeita o tipo da coluna e é estável entre execuções, mantendo o upsert
// idempotente em `onConflict: 'tenantid, id'`.

// Namespace fixo do GBR KARDEK Inventariador (nunca trocar: mudar o namespace
// muda os ids derivados e duplicaria ativos no Postgres).
export const GBR_INVENTORY_NAMESPACE = '4f1d7e2a-9c63-5b84-8a3e-6b0c5d7f1a29';

const namespaceBytes = (uuid: string): number[] => {
  const hex = uuid.replace(/-/g, '');
  const out: number[] = [];
  for (let i = 0; i < 32; i += 2) {
    out.push(parseInt(hex.slice(i, i + 2), 16));
  }
  return out;
};

const toUtf8 = (value: string): number[] => Array.from(new TextEncoder().encode(value));

/** SHA-1 (FIPS 180-1) — 20 bytes. */
const sha1 = (bytes: number[]): number[] => {
  const message = bytes.slice();
  const bitLength = message.length * 8;
  message.push(0x80);
  while (message.length % 64 !== 56) message.push(0);

  const high = Math.floor(bitLength / 0x100000000) >>> 0;
  const low = bitLength >>> 0;
  message.push(
    (high >>> 24) & 0xff, (high >>> 16) & 0xff, (high >>> 8) & 0xff, high & 0xff,
    (low >>> 24) & 0xff, (low >>> 16) & 0xff, (low >>> 8) & 0xff, low & 0xff
  );

  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  let h4 = 0xc3d2e1f0;
  const w = new Array<number>(80);

  for (let offset = 0; offset < message.length; offset += 64) {
    for (let j = 0; j < 16; j++) {
      const base = offset + j * 4;
      w[j] = ((message[base] << 24) | (message[base + 1] << 16) | (message[base + 2] << 8) | message[base + 3]) >>> 0;
    }
    for (let j = 16; j < 80; j++) {
      const x = w[j - 3] ^ w[j - 8] ^ w[j - 14] ^ w[j - 16];
      w[j] = ((x << 1) | (x >>> 31)) >>> 0;
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;

    for (let j = 0; j < 80; j++) {
      let f: number;
      let k: number;
      if (j < 20) {
        f = (b & c) | (~b & d);
        k = 0x5a827999;
      } else if (j < 40) {
        f = b ^ c ^ d;
        k = 0x6ed9eba1;
      } else if (j < 60) {
        f = (b & c) | (b & d) | (c & d);
        k = 0x8f1bbcdc;
      } else {
        f = b ^ c ^ d;
        k = 0xca62c1d6;
      }
      const temp = ((((a << 5) | (a >>> 27)) >>> 0) + f + e + k + w[j]) >>> 0;
      e = d;
      d = c;
      c = ((b << 30) | (b >>> 2)) >>> 0;
      b = a;
      a = temp;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
  }

  const out: number[] = [];
  for (const h of [h0, h1, h2, h3, h4]) {
    out.push((h >>> 24) & 0xff, (h >>> 16) & 0xff, (h >>> 8) & 0xff, h & 0xff);
  }
  return out;
};

/** UUID v5 (SHA-1) de `name` no namespace indicado — mesma entrada, mesmo id. */
export const uuidV5 = (name: string, namespace: string = GBR_INVENTORY_NAMESPACE): string => {
  const hash = sha1([...namespaceBytes(namespace), ...toUtf8(name)]);
  const b = hash.slice(0, 16);
  b[6] = (b[6] & 0x0f) | 0x50; // versão 5
  b[8] = (b[8] & 0x3f) | 0x80; // variante RFC 4122
  const hex = b.map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
};

/**
 * Id estável para `public.assets.id` a partir da chave de origem. O tenantid
 * entra na chave: a mesma `primarykey` em contratos diferentes gera ids
 * diferentes (coerente com a PK composta `(tenantid, id)`).
 */
export const assetUuid = (tenantid: string, primarykey: string): string =>
  uuidV5(`${String(tenantid).trim().toUpperCase()}|${String(primarykey).trim()}`);
