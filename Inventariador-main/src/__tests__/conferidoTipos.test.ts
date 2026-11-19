// ============================================================================
// conferidoTipos.test.ts — as grafias de `_conferido` e as leituras cruas.
//
// A regra (`utils/conferencia.ts`) aceita `true`/`false`, `1`/`0` e o texto
// `'true'`/`'1'`/`'0'`, porque são as grafias que existem nos registos: Dexie
// booleano, carga e espelho SQLite 0/1, JSON importado e linhas antigas texto.
// Este ficheiro fixa três coisas:
//
//   1. `marcaLocalConferida` responde pela FLAG (e só por ela);
//   2. a fronteira do banco normaliza as grafias nos dois sentidos (escrever
//      `'true'` grava 1, ler `'1'` entrega `true`) — sem isso o tipo
//      `MarcaDeConferencia` seria uma promessa que a UI não cumpre;
//   3. nenhum ficheiro de `src/` volta a decidir pela marca crua
//      (`!x._conferido`, `x._conferido === 1`, `Number(x._conferido)`...): a
//      decisão é `isConferido`, a normalização é `marcaLocalConferida`.
// ============================================================================
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from '../services/sqliteService';
import type { DexieAsset } from '../services/sqliteService';
import { localDb } from '../services/localDbService';
import type { Asset } from '../types';
import {
  isConferido,
  marcaLocalConferida,
  type MarcaDeConferencia
} from '../utils/conferencia';

const srcRoot = fileURLToPath(new URL('..', import.meta.url));
const conferencia = join(srcRoot, 'utils', 'conferencia.ts');

/**
 * O tipo admite as grafias que a regra aceita. Estas linhas só existem para o
 * `tsc` as validar: se `_conferido` voltar a ser `boolean`, a compilação falha.
 */
const marcaEmTexto: MarcaDeConferencia = 'true';
const marcaComoAtivo: Asset['_conferido'] = '1';
const marcaComoDexie: DexieAsset['_conferido'] = 'true';

const ativo = (over: Record<string, unknown>): Asset =>
  ({
    id: 'PK-1',
    primarykey: 'PK-1',
    tenantid: 'CONTRATO-A',
    filial: '010101 CONTRATO GO',
    status: 'PENDENTE',
    etiqueta: 'ABC-123',
    qt: 1,
    ...over
  }) as Asset;

describe('marcaLocalConferida — só a flag local, em qualquer grafia', () => {
  it.each([true, 1, '1', 'true', 'TRUE'])('reconhece %p como marca canónica', (valor) => {
    expect(marcaLocalConferida({ _conferido: valor })).toBe(true);
  });

  it.each([false, 0, '0', 'false', '', null, undefined])(
    'não reconhece %p como marca canónica',
    (valor) => {
      expect(marcaLocalConferida({ _conferido: valor })).toBe(false);
    }
  );

  it('ignora a coluna de auditoria e o status (isso é a decisão, não a marca)', () => {
    expect(marcaLocalConferida({ _conferido: 0, AUDITOR_STATUS_CONFERENCIA: 'SIM' })).toBe(false);
    expect(marcaLocalConferida({ _conferido: 0, status: 'CONFERIDO' })).toBe(false);
    // A decisão continua a ser `isConferido`.
    expect(isConferido({ _conferido: 0, AUDITOR_STATUS_CONFERENCIA: 'SIM' })).toBe(true);
  });
});

describe('fronteira do banco — as grafias sobrevivem à ida e volta', () => {
  beforeEach(async () => {
    await db.ativos.clear();
    await db.assets.clear();
    await db.local_assets.clear();
  });

  it('grava `\'true\'`/`\'1\'` como 1 e `\'0\'`/`\'false\'` como 0', async () => {
    await localDb.ativos.bulkPut([
      ativo({ id: 'PK-1', primarykey: 'PK-1', _conferido: 'true' }),
      ativo({ id: 'PK-2', primarykey: 'PK-2', _conferido: '1' }),
      ativo({ id: 'PK-3', primarykey: 'PK-3', _conferido: '0' }),
      ativo({ id: 'PK-4', primarykey: 'PK-4', _conferido: false }),
      ativo({ id: 'PK-5', primarykey: 'PK-5', _conferido: 1 })
    ]);

    const linhas = await db.ativos.toArray();
    const porChave = new Map(linhas.map(linha => [String(linha.primarykey), linha._conferido]));

    expect(porChave.get('PK-1')).toBe(1);
    expect(porChave.get('PK-2')).toBe(1);
    expect(porChave.get('PK-3')).toBe(0);
    expect(porChave.get('PK-4')).toBe(0);
    expect(porChave.get('PK-5')).toBe(1);
  });

  it('devolve booleano para a UI, inclusive para o texto legado', async () => {
    await db.ativos.bulkPut([
      ativo({ id: 'PK-1', primarykey: 'PK-1', _conferido: '1' }),
      ativo({ id: 'PK-2', primarykey: 'PK-2', _conferido: 'true' }),
      ativo({ id: 'PK-3', primarykey: 'PK-3', _conferido: 0 }),
      ativo({ id: 'PK-4', primarykey: 'PK-4', _conferido: '0' })
    ] as unknown as DexieAsset[]);

    const devolvidos = await localDb.ativos.toArray();
    const porChave = new Map(devolvidos.map(item => [String(item.primarykey), item._conferido]));

    expect(porChave.get('PK-1')).toBe(true);
    expect(porChave.get('PK-2')).toBe(true);
    expect(porChave.get('PK-3')).toBe(false);
    expect(porChave.get('PK-4')).toBe(false);
  });
});

/** A decisão sobre a marca crua: negação, comparação, coerção e fallback. */
const LEITURA_CRUA = [
  /!\s*[\w$.\]]+\._conferido\b/,
  /[\w$.\]]+\._conferido\s*(?:===?|!==?)\s*(?:1|0|true|false)\b/,
  /(?:Number|Boolean)\(\s*[\w$.\]]+\._conferido/,
  /[\w$.\]]+\._conferido\s*\?\?/
];

function ficheirosFonte(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entrada => {
    const caminho = join(dir, entrada.name);
    if (entrada.isDirectory()) {
      return entrada.name === '__tests__' ? [] : ficheirosFonte(caminho);
    }
    return /\.tsx?$/.test(entrada.name) ? [caminho] : [];
  });
}

const leiturasCruas = (): string[] =>
  ficheirosFonte(srcRoot)
    .filter(ficheiro => ficheiro !== conferencia)
    .flatMap(ficheiro => {
      const linhas = readFileSync(ficheiro, 'utf8').split('\n');
      return linhas
        .filter(linha => LEITURA_CRUA.some(padrao => padrao.test(linha)))
        .map(linha => `${ficheiro.slice(srcRoot.length).replace(/^[\\/]/, '')}: ${linha.trim()}`);
    });

describe('nenhuma leitura crua da marca', () => {
  it('a decisão passa sempre pela regra, nunca por `!x._conferido`', () => {
    expect(leiturasCruas()).toEqual([]);
  });

  it('o tipo das estruturas concretas admite as grafias', () => {
    // As constantes acima são validadas pelo `tsc`; aqui só se garante que o
    // valor não é coerido no caminho.
    expect(marcaEmTexto).toBe('true');
    expect(marcaComoAtivo).toBe('1');
    expect(marcaComoDexie).toBe('true');
  });
});
