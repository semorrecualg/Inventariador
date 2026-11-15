import { describe, it, expect, vi, beforeEach } from 'vitest';
import { normalizeAssetContract } from '../utils/schema';

/**
 * A lista de unidades de um acesso espelha a coluna `filial` da base do
 * cliente. Dois pontos garantem isso:
 *
 *  1. a normalização da base NÃO inventa filial quando a linha não tem coluna
 *     de filial (antes virava 'MATRIZ' e criava uma unidade fantasma em
 *     contratos que não têm matriz);
 *  2. o catálogo de contratos (tenantCatalog) tira as filiais apenas dos ativos
 *     — o perfil de um usuário antigo não devolve 'MATRIZ' para a lista.
 */
describe('Filial espelhada da base (sem MATRIZ fabricada)', () => {
  it('linha sem coluna de filial não ganha filial inventada', () => {
    const asset = normalizeAssetContract({ tenantid: 'CICOPAL', tag: 'X1' });
    expect(asset.filial).toBe('');
  });

  it('filial real da planilha é preservada, inclusive quando se chama MATRIZ', () => {
    expect(normalizeAssetContract({ tenantid: 'CICOPAL', filial: '010103 CICOPAL SP' }).filial)
      .toBe('010103 CICOPAL SP');
    expect(normalizeAssetContract({ tenantid: 'CICOPAL', filial: 'MATRIZ' }).filial).toBe('MATRIZ');
  });
});

const state = vi.hoisted(() => ({
  assets: [] as Array<{ tenantid: string; filial: string }>,
  users: [] as Array<{ tenantid: string; filial: string }>,
  licensed: [] as Array<{ tenantid: string }>,
}));

vi.mock('../services/sqliteService', () => ({
  db: {
    local_assets: { each: (cb: (a: unknown) => void) => { state.assets.forEach(cb); return Promise.resolve(); } },
    assets: { each: (cb: (a: unknown) => void) => { state.assets.forEach(cb); return Promise.resolve(); } },
  },
}));

vi.mock('../services/localDbService', () => ({
  localDb: { users: { toArray: () => Promise.resolve(state.users) } },
}));

vi.mock('../services/tenantProvisioningService', () => ({
  readProvisionedTenants: () => state.licensed,
}));

const { listContracts } = await import('../utils/tenantCatalog');

describe('tenantCatalog: filiais vêm só da base', () => {
  beforeEach(() => {
    state.assets = [];
    state.users = [];
    state.licensed = [];
  });

  it('contrato sem coluna de filial fica sem filiais (nada de MATRIZ)', async () => {
    state.assets = [{ tenantid: 'CICOPAL', filial: '' }];
    const [contract] = await listContracts();
    expect(contract.tenantid).toBe('CICOPAL');
    expect(contract.filiais).toEqual([]);
  });

  it('espelha as filiais reais da base, na grafia da planilha', async () => {
    state.assets = [
      { tenantid: 'CICOPAL', filial: '010101 CICOPAL SP' },
      { tenantid: 'CICOPAL', filial: '010102 CICOPAL RJ' },
    ];
    const [contract] = await listContracts();
    expect(contract.filiais).toEqual(['010101 CICOPAL SP', '010102 CICOPAL RJ']);
  });

  it('mantém MATRIZ quando ela existe de facto na base', async () => {
    state.assets = [{ tenantid: 'ACME', filial: 'MATRIZ' }];
    const [contract] = await listContracts();
    expect(contract.filiais).toEqual(['MATRIZ']);
  });

  it('perfil antigo com filial MATRIZ não contamina a lista do contrato', async () => {
    state.users = [{ tenantid: 'CICOPAL', filial: 'MATRIZ' }];
    const [contract] = await listContracts();
    expect(contract.tenantid).toBe('CICOPAL');
    expect(contract.filiais).toEqual([]);
  });
});
