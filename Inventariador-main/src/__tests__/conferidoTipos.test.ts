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
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from '../services/sqliteService';
import type { DexieAsset } from '../services/sqliteService';
import { localDb, mergeCopiasDeAtivo } from '../services/localDbService';
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

describe('getLocationsWithStats — a mesma chave em duas tabelas conta uma vez', () => {
  const TENANT = 'CONTRATO-A';
  const UNIT = '010101 CONTRATO GO';

  /** Linha completa de uma das três tabelas de ativos (chave composta). */
  const linhaDaTabela = (over: Record<string, unknown>): DexieAsset =>
    ({
      id: 'PK-1',
      primarykey: 'PK-1',
      tenantid: TENANT,
      filial: UNIT,
      status: 'EM USO',
      etiqueta: 'ABC-123',
      qt: 1,
      descricaodoativo: 'ATIVO MESCLADO',
      serial: null,
      dataaqusic: null,
      cnpj: null,
      nomefornecedor: null,
      notafiscal: null,
      endereco: 'RUA UM',
      registro: null,
      subreg: null,
      databaixa: null,
      contacontabil: null,
      centrodecusto: null,
      vlraquisic: 0,
      sn1_recno: null,
      sn3_recno: null,
      _is_synced: 0,
      _is_deleted: 0,
      _conferido: 0,
      _plaquetado: 0,
      _aprovado: 0,
      _isNew: 0,
      _is_unitized: 0,
      _is_divergent_baixa: 0,
      _history: null,
      DE_PARA: null,
      _photoUrl: null,
      gps_lat: null,
      gps_lng: null,
      ...over
    }) as unknown as DexieAsset;

  /** Estatística da localidade «RUA UM» tal como o ecrã a recebe. */
  const ruaUm = async () => {
    const locais = await localDb.assets.getLocationsWithStats(UNIT);
    const alvo = locais.filter(local => local.displayName.trim().toUpperCase() === 'RUA UM');
    return { total: alvo[0]?.total ?? 0, checked: alvo[0]?.checked ?? 0, ocorrencias: alvo.length };
  };

  beforeEach(async () => {
    // `getLocationsWithStats` resolve o contrato pela sessão.
    const store = new Map<string, string>();
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v); },
      removeItem: (k: string) => { store.delete(k); },
      clear: () => store.clear()
    };
    vi.stubGlobal('sessionStorage', storage);
    vi.stubGlobal('localStorage', storage);
    store.set('app_current_user', JSON.stringify({ tenantid: TENANT }));

    await db.ativos.clear();
    await db.assets.clear();
    await db.local_assets.clear();
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await db.ativos.clear();
    await db.assets.clear();
    await db.local_assets.clear();
  });

  it('grafias diferentes da mesma conferência contam 1 de 1, não 2', async () => {
    await db.ativos.put(linhaDaTabela({ _conferido: '1' }));
    await db.assets.put(linhaDaTabela({ _conferido: true }));

    expect(await ruaUm()).toEqual({ total: 1, checked: 1, ocorrencias: 1 });
  });

  it('conferido só na cópia do baseline (`local_assets`) também conta (e uma vez só)', async () => {
    // A.3a.1: a união de leitura é `ativos` + `local_assets`; a cópia que ainda
    // não recebeu a conferência fica neste último espelho.
    await db.ativos.put(linhaDaTabela({ _conferido: 0 }));
    await db.local_assets.put(linhaDaTabela({ _conferido: 'true' }));

    expect(await ruaUm()).toEqual({ total: 1, checked: 1, ocorrencias: 1 });
  });

  it('pendente em todas as cópias continua 0 de 1', async () => {
    await db.ativos.put(linhaDaTabela({ _conferido: '0' }));
    await db.assets.put(linhaDaTabela({ _conferido: false }));

    expect(await ruaUm()).toEqual({ total: 1, checked: 0, ocorrencias: 1 });
  });

  it('conferido só pela coluna de auditoria conta pela regra', async () => {
    await db.ativos.put(linhaDaTabela({ _conferido: 0, AUDITOR_STATUS_CONFERENCIA: 'SIM' }));
    await db.assets.put(linhaDaTabela({ _conferido: '0' }));

    expect(await ruaUm()).toEqual({ total: 1, checked: 1, ocorrencias: 1 });
  });

  it('a terceira cópia (baseline) não inflaciona o total', async () => {
    await db.ativos.put(linhaDaTabela({ _conferido: '1' }));
    await db.assets.put(linhaDaTabela({ _conferido: 1 }));
    await db.local_assets.put(linhaDaTabela({ _conferido: 'true' }));

    expect(await ruaUm()).toEqual({ total: 1, checked: 1, ocorrencias: 1 });
  });

  it('desmarcar pelo caminho do ecrã (três tabelas) volta a 0 de 1', async () => {
    // É esta transacção que sustenta a decisão: a desmarcação escreve as três
    // cópias, por isso o OR do merge vê três zeros e não uma cópia atrasada.
    await db.ativos.put(
      linhaDaTabela({ _conferido: '1', _dataLeitura: '2026-11-19T10:00:00.000Z' })
    );
    await db.assets.put(linhaDaTabela({ _conferido: true }));
    await db.local_assets.put(linhaDaTabela({ _conferido: 1 }));
    expect((await ruaUm()).checked).toBe(1);

    await localDb.assets.update('PK-1', {
      tenantid: TENANT,
      _conferido: false,
      _dataLeitura: undefined,
      status: 'PENDENTE'
    });

    expect(await ruaUm()).toEqual({ total: 1, checked: 0, ocorrencias: 1 });
  });
});

describe('mergeCopiasDeAtivo — a decisão de docs/DECISAO_MERGE_CONFERIDO.md', () => {
  const conferida = {
    _conferido: 1,
    _dataLeitura: '2026-11-19T10:00:00.000Z',
    _auditor: 'ana@contrato'
  };

  it('a conferência de uma cópia não se perde quando a outra está atrasada', () => {
    const unida = mergeCopiasDeAtivo({ _conferido: 0 }, { ...conferida });

    expect(unida._conferido).toBe(1);
  });

  it('a prova (data e autor) vem da cópia que conferiu', () => {
    const unida = mergeCopiasDeAtivo({ _conferido: '0', _dataLeitura: undefined }, { ...conferida });

    expect(unida._dataLeitura).toBe(conferida._dataLeitura);
    expect(unida._auditor).toBe(conferida._auditor);
  });

  it('sem conferência em nenhuma cópia, a marca e a prova ficam vazias', () => {
    const unida = mergeCopiasDeAtivo(
      { _conferido: '0', _dataLeitura: '2026-01-01T00:00:00.000Z' },
      { _conferido: false }
    );

    expect(unida._conferido).toBe(0);
    expect(unida._dataLeitura).toBeUndefined();
    expect(unida._auditor).toBeUndefined();
  });

  it('com as duas conferidas, a prova é a da cópia de maior precedência', () => {
    const unida = mergeCopiasDeAtivo({ ...conferida, _auditor: 'bia@contrato' }, { ...conferida });

    expect(unida._auditor).toBe('bia@contrato');
  });

  it('a coluna de auditoria sozinha confere e traz a prova de onde veio', () => {
    const unida = mergeCopiasDeAtivo(
      { _conferido: 0 },
      {
        _conferido: 0,
        AUDITOR_STATUS_CONFERENCIA: 'SIM',
        _dataLeitura: '2026-11-18T08:00:00.000Z'
      }
    );

    expect(unida._conferido).toBe(1);
    expect(unida._dataLeitura).toBe('2026-11-18T08:00:00.000Z');
  });

  it('a baixa continua a vir da cópia viva (precedência de `_is_deleted`)', () => {
    const unida = mergeCopiasDeAtivo({ _is_deleted: 0 }, { _is_deleted: 1 });

    expect(unida._is_deleted).toBe(0);
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
