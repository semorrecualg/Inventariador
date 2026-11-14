// @vitest-environment jsdom
// ============================================================================
// dexieCompositeKeys.test.ts — chave primária composta desde o schema v7.
//
// `ativos`/`assets`/`local_assets` têm PK `[tenantid+primarykey]`. Um acesso
// `db.ativos.get('CODE')` (ou `update`/`delete` pela mesma chave simples) não
// encontra nada: a chave não coincide com `[tenantid, primarykey]` e o registo
// fica inoperante. Este teste fixa as duas metades: o comportamento do Dexie e
// uma guarda estática contra literais de chave simples no código.
// ============================================================================
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { db, DexieAsset } from '../services/sqliteService';

const TENANT = 'TENANT-A';
const PK = 'PAT-001';
type Espelho = 'ativos' | 'assets' | 'local_assets';
const ESPELHOS: Espelho[] = ['ativos', 'assets', 'local_assets'];
// O próprio TypeScript rejeita uma chave simples nestas tabelas (é o que impede
// o bug de voltar); aqui forçamos o tipo para provar o comportamento do Dexie.
const chaveSimples = PK as unknown as [string, string];

const row = (over: Partial<DexieAsset> = {}): DexieAsset => ({
  id: PK,
  primarykey: PK,
  tenantid: TENANT,
  filial: 'MATRIZ',
  descricaodoativo: 'Cadeira',
  ...over,
}) as DexieAsset;

beforeEach(async () => {
  await db.open();
  for (const t of ESPELHOS) {
    await db[t].clear();
    await db[t].bulkPut([row()]);
  }
});

afterEach(async () => {
  for (const t of ESPELHOS) await db[t].clear();
  await db.close();
});

describe('Dexie · chave primária composta [tenantid+primarykey]', () => {
  it('a PK declarada das três tabelas é o par composto', () => {
    for (const t of ESPELHOS) {
      expect(db[t].schema.primKey.keyPath).toEqual(['tenantid', 'primarykey']);
    }
  });

  it('get() com um único argumento não encontra o registo', async () => {
    for (const t of ESPELHOS) {
      expect(await db[t].get(chaveSimples)).toBeUndefined();
    }
  });

  it('get() com [tenantid, primarykey] encontra o registo', async () => {
    for (const t of ESPELHOS) {
      const found = await db[t].get([TENANT, PK]);
      expect(found?.primarykey).toBe(PK);
    }
  });

  it('update() pela chave simples não altera nada; pelo par composto altera', async () => {
    for (const t of ESPELHOS) {
      await db[t].update(chaveSimples, { descricaodoativo: 'NÃO DEVE APLICAR' } as unknown as DexieAsset).catch(() => 0);
      expect((await db[t].get([TENANT, PK]))?.descricaodoativo).toBe('Cadeira');

      await db[t].update([TENANT, PK], { descricaodoativo: 'Mesa' });
      expect((await db[t].get([TENANT, PK]))?.descricaodoativo).toBe('Mesa');
    }
  });

  it('delete() pela chave simples não remove; pelo par composto remove', async () => {
    for (const t of ESPELHOS) {
      await db[t].delete(chaveSimples).catch(() => 0);
      expect(await db[t].get([TENANT, PK])).toBeDefined();

      await db[t].delete([TENANT, PK]);
      expect(await db[t].get([TENANT, PK])).toBeUndefined();
    }
  });
});

/** APIs do Dexie que exigem a chave primária completa. */
const APIS_POR_CHAVE = 'get|update|delete|bulkGet|bulkDelete';
const CHAVE_SIMPLES = new RegExp(
  `db\\.(?:${ESPELHOS.join('|')})\\.(?:${APIS_POR_CHAVE})\\(\\s*['"\`]`,
  'g'
);

function listarFontes(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === '__tests__') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...listarFontes(full));
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

describe('Dexie · guarda estática de chaves simples', () => {
  it('nenhum acesso por chave usa um literal em vez de [tenantid, primarykey]', () => {
    const infracoes: string[] = [];

    for (const arquivo of listarFontes(join(process.cwd(), 'src'))) {
      const fonte = readFileSync(arquivo, 'utf8');
      for (const match of fonte.matchAll(CHAVE_SIMPLES)) {
        const linha = fonte.slice(0, match.index).split('\n').length;
        infracoes.push(`${arquivo}:${linha} ${match[0]}…`);
      }
    }

    expect(infracoes).toEqual([]);
  });
});
