// ============================================================================
// schemaTenantid.test.ts — o contrato do ativo não se perde na normalização.
//
// `normalizeAssetContract` garante a assinatura canónica do ativo (campos
// minúsculos) e apaga as grafias legadas. A coluna `tenantid` é a grafia
// canónica gravada na base; quando ficou fora da cadeia de leitura, um ativo
// que só trazia essa coluna era normalizado para `''` — o contrato desaparecia
// em memória, voltava a ser gravado sem contrato e o Diagnóstico dizia
// «no contrato: 0 · só sem contrato: 12636» com a base do contrato carregada.
// ============================================================================
import { describe, it, expect } from 'vitest';
import { normalizeAssetContract } from '../utils/schema';

describe('normalizeAssetContract — o tenantid canónico sobrevive', () => {
  it('mantém a coluna canónica `tenantid` (o caso da base do aparelho)', () => {
    const ativo = { primarykey: 'PK-1', tenantid: 'CICOPAL', filial: '010101 CICOPAL GO' };

    expect(normalizeAssetContract(ativo).tenantid).toBe('CICOPAL');
  });

  it('lê as grafias legadas quando só elas existem', () => {
    for (const legado of [
      { tenantId: 'CARPER' },
      { _tenantid: 'CARPER' },
      { tenant_id: 'CARPER' },
      { group_id: 'CARPER' },
      { GRUPO_EMPRESARIAL: 'CARPER' }
    ]) {
      expect(normalizeAssetContract({ primarykey: 'A', ...legado }).tenantid).toBe('CARPER');
    }
  });

  it('o canónico vence a grafia legada da planilha', () => {
    const ativo = {
      primarykey: 'A',
      tenantid: 'CICOPAL',
      GRUPO_EMPRESARIAL: 'OUTRO'
    };

    expect(normalizeAssetContract(ativo).tenantid).toBe('CICOPAL');
  });

  it('sem nenhuma grafia, o contrato fica vazio (não inventa contrato)', () => {
    expect(normalizeAssetContract({ primarykey: 'A' }).tenantid).toBe('');
  });

  it('remove as aliases legadas depois de as ler', () => {
    const ativo = normalizeAssetContract({ primarykey: 'A', tenantId: 'CICOPAL' }) as Record<
      string,
      unknown
    >;

    expect(ativo.tenantid).toBe('CICOPAL');
    expect(ativo.tenantId).toBeUndefined();
    expect(ativo._tenantid).toBeUndefined();
    expect(ativo.tenant_id).toBeUndefined();
  });
});
