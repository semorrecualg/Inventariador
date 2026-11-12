// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { mapCloudAssetRow } from '../services/supabaseService';

describe('mapCloudAssetRow — conferência que desce da nuvem', () => {
  it('recupera quem conferiu e quando a partir das colunas novas', () => {
    const asset = mapCloudAssetRow({
      id: 'X1',
      tenantid: 'cicopal',
      filial: '010101 cicopal go',
      status: 'CONFERIDO',
      conferido: true,
      auditor: 'ana@gbr.com',
      data_leitura: '2026-11-01T10:00:00.000Z',
    });

    expect(asset._conferido).toBe(true);
    expect(asset._auditor).toBe('ana@gbr.com');
    expect(asset._dataLeitura).toBe('2026-11-01T10:00:00.000Z');
    // Contrato segue normalizado
    expect(asset.tenantid).toBe('CICOPAL');
    expect(asset.filial).toBe('010101 CICOPAL GO');
  });

  it('sem as colunas novas, status CONFERIDO basta para o item voltar conferido', () => {
    const asset = mapCloudAssetRow({
      id: 'X2',
      tenantid: 'CICOPAL',
      filial: '010101 CICOPAL GO',
      status: 'conferido',
    });

    expect(asset._conferido).toBe(true);
    expect(asset._auditor).toBeUndefined();
    expect(asset._dataLeitura).toBeUndefined();
  });

  it('ativo não conferido continua pendente, mesmo com status de carga', () => {
    const asset = mapCloudAssetRow({
      id: 'X3',
      tenantid: 'CICOPAL',
      filial: '010101 CICOPAL GO',
      status: 'PENDENTE',
      conferido: false,
    });

    expect(asset._conferido).toBe(false);
  });
});
