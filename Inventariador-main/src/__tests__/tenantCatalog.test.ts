import { describe, it, expect, vi, beforeEach } from 'vitest';
import { listContracts } from '../utils/tenantCatalog';

// ============================================================================
// tenantCatalog.test.ts — regressão do seletor de contrato vazio.
//
// O contrato CICOPAL aparecia com «SEM FILIAL NA BASE» num aparelho que tinha
// âncoras GPS e campanhas gravadas nas filiais: o catálogo só olhava as tabelas
// de ativos. Uma filial com âncora/campanha EXISTE e tem de aparecer.
// ============================================================================

const data = vi.hoisted(() => ({
  localAssets: [] as Array<Record<string, unknown>>,
  assets: [] as Array<Record<string, unknown>>,
  unitConfigs: [] as Array<Record<string, unknown>>,
  campaigns: [] as Array<Record<string, unknown>>,
  users: [] as Array<Record<string, unknown>>,
  provisioned: [] as Array<Record<string, unknown>>
}));

// As fábricas do `vi.mock` são hoisted: não podem capturar helpers do módulo.
vi.mock('../services/sqliteService', () => {
  const each = (rows: Array<Record<string, unknown>>) => async (
    visit: (row: Record<string, unknown>) => void
  ) => {
    rows.forEach(visit);
  };
  return {
    db: {
      local_assets: { each: each(data.localAssets) },
      assets: { each: each(data.assets) },
      unit_configs: { each: each(data.unitConfigs) },
      campaigns: { each: each(data.campaigns) }
    }
  };
});

vi.mock('../services/localDbService', () => ({
  localDb: { users: { toArray: async () => data.users } }
}));

vi.mock('../services/tenantProvisioningService', () => ({
  readProvisionedTenants: () => data.provisioned
}));

describe('listContracts — filiais da configuração operacional', () => {
  beforeEach(() => {
    data.localAssets.length = 0;
    data.assets.length = 0;
    data.unitConfigs.length = 0;
    data.campaigns.length = 0;
    data.users.length = 0;
    data.provisioned.length = 0;
  });

  it('inclui a filial com âncora GPS e a filial com campanha, sem ativos baixados', async () => {
    data.unitConfigs.push(
      { tenantid: 'CICOPAL', filial: '010101 CICOPAL GO', lat: -16.6, lng: -49.2 },
      // Mesma unidade noutra grafia: um único cartão.
      { tenantid: 'CICOPAL', filial: '010101_CICOPAL_GO' },
      { tenantid: 'CICOPAL', unit_id: '010401 CARPER BA' }
    );
    data.campaigns.push(
      { tenantid: 'CICOPAL', filial: '010201 SNACKS PA', status: 'ACTIVE' },
      { tenantid: 'OUTRO', _unitid: '020101 OUTRA UNIDADE', status: 'CREATED' }
    );

    const contratos = await listContracts();
    const cicopal = contratos.find((c) => c.tenantid === 'CICOPAL');
    const outro = contratos.find((c) => c.tenantid === 'OUTRO');

    expect(cicopal?.filiais).toEqual([
      '010101 CICOPAL GO',
      '010201 SNACKS PA',
      '010401 CARPER BA'
    ]);
    expect(outro?.filiais).toEqual(['020101 OUTRA UNIDADE']);
  });

  it('mantém as fontes antigas (ativos, perfis e licenças) e ignora sentinelas', async () => {
    data.assets.push({ tenantid: 'CICOPAL', filial: '010105 CICOPAL PA' });
    data.users.push({ tenantid: 'CICOPAL', filial: '010301 FEIRA BOA BA' });
    data.provisioned.push({ tenantid: 'NOVO_CONTRATO' });
    data.unitConfigs.push({ tenantid: 'CICOPAL', filial: 'TODAS' });

    const contratos = await listContracts();
    const cicopal = contratos.find((c) => c.tenantid === 'CICOPAL');

    expect(cicopal?.filiais).toEqual(['010105 CICOPAL PA', '010301 FEIRA BOA BA']);
    expect(contratos.find((c) => c.tenantid === 'NOVO_CONTRATO')?.filiais).toEqual([]);
  });
});
