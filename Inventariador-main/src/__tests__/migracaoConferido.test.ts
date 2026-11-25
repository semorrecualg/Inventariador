// @vitest-environment jsdom
// ============================================================================
// migracaoConferido.test.ts — as grafias antigas de `_conferido` ficam numa só.
//
// As bases antigas guardam a marca de todas as maneiras: `true`/`false` (Dexie e
// app), `1`/`0` (carga e espelho SQLite), o texto `'true'`/`'1'` (JSON
// importado) e registos cuja única prova é a coluna de auditoria
// (`AUDITOR_STATUS_CONFERENCIA = 'SIM'`). `isConferido` lê todas, mas o registo
// continuava gravado como veio — e a decisão por tempo do pull só compara datas
// quando elas existem.
//
// A migração é única (marcador em `SYSTEM_CONTEXT`), idempotente e NÃO inventa a
// data da leitura: usa `_dataLeitura` e, na falta dela, `_lastUpdated`. Uma
// conferência sem data não pode ganhar o merge por fabrico.
// ============================================================================
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CONFERIDO_MARKER, db, sqliteService } from '../services/sqliteService';
import type { DexieAsset } from '../services/sqliteService';
import { isConferido, normalizarMarcaConferencia } from '../utils/conferencia';

const LEITURA = '2026-11-19T08:00:00.000Z';
const TOQUE = '2026-11-20T10:00:00.000Z';

const linha = (over: Record<string, unknown> = {}): DexieAsset =>
  ({
    id: 'PK-1',
    primarykey: 'PK-1',
    tenantid: 'CICOPAL',
    filial: '010101 CICOPAL GO',
    etiqueta: '007222',
    status: 'CONFERIDO',
    _is_synced: 1,
    _is_deleted: 0,
    ...over
  }) as unknown as DexieAsset;

const semear = async (registo: DexieAsset): Promise<void> => {
  await db.local_assets.put({ ...registo });
  await db.ativos.put({ ...registo });
};

const porEspelho = async (primarykey: string): Promise<Array<DexieAsset | undefined>> => [
  (await db.local_assets.where('primarykey').equals(primarykey).first()) as DexieAsset | undefined,
  (await db.ativos.where('primarykey').equals(primarykey).first()) as DexieAsset | undefined,
];

describe('normalizarMarcaConferencia — a regra pura', () => {
  it('converte as grafias antigas para `1`', () => {
    for (const grafia of [true, '1', 'true', ' 1 ']) {
      expect(normalizarMarcaConferencia({ _conferido: grafia })).toEqual({
        converter: true,
        patch: { _conferido: 1 },
      });
    }
  });

  it('a grafia canónica (`1` número) + data legível não é reescrita', () => {
    expect(
      normalizarMarcaConferencia({ _conferido: 1, _dataLeitura: LEITURA })
    ).toEqual({ converter: false, patch: {} });
  });

  it('a coluna de auditoria sozinha passa a valer como flag', () => {
    expect(
      normalizarMarcaConferencia({ AUDITOR_STATUS_CONFERENCIA: 'SIM' })
    ).toEqual({ converter: true, patch: { _conferido: 1 } });
  });

  it('a data vem da leitura e, na falta dela, do toque — nunca de «agora»', () => {
    // A leitura que já existe fica onde está: só a flag muda.
    expect(
      normalizarMarcaConferencia({ _conferido: '1', _dataLeitura: LEITURA, _lastUpdated: TOQUE })
    ).toEqual({ converter: true, patch: { _conferido: 1 } });

    expect(
      normalizarMarcaConferencia({ _conferido: true, _lastUpdated: TOQUE })
    ).toEqual({ converter: true, patch: { _conferido: 1, _dataLeitura: TOQUE } });

    // Sem data nenhuma, só a flag é normalizada.
    expect(normalizarMarcaConferencia({ _conferido: true })).toEqual({
      converter: true,
      patch: { _conferido: 1 },
    });
    // Data ilegível não conta como data.
    expect(
      normalizarMarcaConferencia({ _conferido: true, _dataLeitura: 'sem data' })
    ).toEqual({ converter: true, patch: { _conferido: 1 } });
  });

  it('não desmarca ninguém: registo sem prova de conferência fica como está', () => {
    expect(normalizarMarcaConferencia({ _conferido: 0 })).toEqual({ converter: false, patch: {} });
    expect(normalizarMarcaConferencia({ _conferido: false, status: 'PENDENTE' })).toEqual({
      converter: false,
      patch: {},
    });
    expect(normalizarMarcaConferencia(null)).toEqual({ converter: false, patch: {} });
  });
});

describe('migrateLegacyConferencia — uma passagem, idempotente', () => {
  beforeEach(async () => {
    await db.local_assets.clear();
    await db.ativos.clear();
    await db.SYSTEM_CONTEXT.delete(CONFERIDO_MARKER);
  });

  it('normaliza as quatro grafias numa só base e relata quantos registos', async () => {
    await semear(linha({ primarykey: 'PK-TRUE', id: 'PK-TRUE', _conferido: true, _dataLeitura: LEITURA }));
    await semear(linha({ primarykey: 'PK-ONE', id: 'PK-ONE', _conferido: 1 }));
    await semear(linha({ primarykey: 'PK-TEXT', id: 'PK-TEXT', _conferido: '1', _lastUpdated: TOQUE }));
    await semear(linha({ primarykey: 'PK-COL', id: 'PK-COL', AUDITOR_STATUS_CONFERENCIA: 'SIM' }));
    const desmarcado = linha({ primarykey: 'PK-OFF', id: 'PK-OFF', _conferido: 0, status: 'PENDENTE' });
    await semear(desmarcado);

    const resultado = await sqliteService.migrateLegacyConferencia();

    expect(resultado.jaCorrida).toBe(false);
    // PK-ONE já está canónico (1) e sem data — a migração não inventa datas,
    // por isso não é convertido: 3 dos 4 registos mudam.
    expect(resultado.convertidos).toBe(3);

    for (const key of ['PK-TRUE', 'PK-TEXT', 'PK-COL']) {
      for (const registo of await porEspelho(key)) {
        expect(registo?._conferido).toBe(1);
        expect(isConferido(registo ?? {})).toBe(true);
      }
    }

    // A data de leitura existente é preservada; a do toque preenche a que falta.
    expect((await porEspelho('PK-TRUE'))[0]?._dataLeitura).toBe(LEITURA);
    expect((await porEspelho('PK-TEXT'))[0]?._dataLeitura).toBe(TOQUE);
    // Sem data de origem, não se inventa nenhuma.
    expect((await porEspelho('PK-COL'))[0]?._dataLeitura).toBeUndefined();

    // Desmarcado continua desmarcado, nas três tabelas.
    for (const registo of await porEspelho('PK-OFF')) {
      expect(Number(registo?._conferido)).toBe(0);
      expect(registo?.status).toBe('PENDENTE');
    }

    expect(await db.SYSTEM_CONTEXT.get(CONFERIDO_MARKER)).toBeTruthy();
  });

  it('correr duas vezes dá o mesmo resultado', async () => {
    await semear(linha({ primarykey: 'PK-TEXT', id: 'PK-TEXT', _conferido: '1', _lastUpdated: TOQUE }));

    const primeira = await sqliteService.migrateLegacyConferencia();
    const estado = await porEspelho('PK-TEXT');

    const segunda = await sqliteService.migrateLegacyConferencia();

    expect(primeira.convertidos).toBe(1);
    expect(segunda).toEqual({ convertidos: 0, linhas: 0, jaCorrida: true });
    expect(await porEspelho('PK-TEXT')).toEqual(estado);
  });

  it('base já canónica: nada a converter e o marcador fica posto', async () => {
    await semear(linha({ primarykey: 'PK-CANON', id: 'PK-CANON', _conferido: 1, _dataLeitura: LEITURA }));

    const resultado = await sqliteService.migrateLegacyConferencia();

    expect(resultado).toMatchObject({ convertidos: 0, linhas: 0, jaCorrida: false });
    expect(await db.SYSTEM_CONTEXT.get(CONFERIDO_MARKER)).toBeTruthy();
  });
});

describe('migração — o arranque corre a passagem única', () => {
  it('o boot chama migrateLegacyConferencia a seguir ao casing', () => {
    const fonte = readFileSync(join(process.cwd(), 'src', 'App.tsx'), 'utf8');
    const casing = fonte.indexOf('migrateLegacyTenantids()');
    const conferido = fonte.indexOf('migrateLegacyConferencia()');

    expect(casing).toBeGreaterThan(-1);
    expect(conferido).toBeGreaterThan(casing);
  });
});
