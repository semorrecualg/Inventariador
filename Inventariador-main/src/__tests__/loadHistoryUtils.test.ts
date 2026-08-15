import { describe, it, expect } from 'vitest';
import {
  parseAssetCountFromDetails,
  normalizeTenantLabel,
  groupLoadHistory,
  formatLoadTimestamp,
  isDeltaSyncEntry,
} from '../utils/loadHistoryUtils';

describe('parseAssetCountFromDetails', () => {
  it('extrai contagem de "ativos" no details', () => {
    expect(parseAssetCountFromDetails('Carga de planilha x.xlsx: 12636 ativos injetados (contrato CICOPAL).')).toBe(12636);
    expect(parseAssetCountFromDetails('Sincronização de 2066 ativos da nuvem para o local.')).toBe(2066);
    expect(parseAssetCountFromDetails('Sincronização de 0 ativos da nuvem para o local.')).toBe(0);
  });

  it('retorna null para detalhes sem contagem', () => {
    expect(parseAssetCountFromDetails('Falha ao sincronizar configuração de unidade.')).toBeNull();
    expect(parseAssetCountFromDetails('')).toBeNull();
    expect(parseAssetCountFromDetails(null)).toBeNull();
    expect(parseAssetCountFromDetails(undefined)).toBeNull();
  });

  it('não captura números que não precedem "ativos"', () => {
    expect(parseAssetCountFromDetails('Lote 42 concluído.')).toBeNull();
  });

  it('extrai a contagem real do SYNC_PULL incremental (Etapa 5b)', () => {
    expect(parseAssetCountFromDetails('Sincronização incremental de 36 ativos da nuvem para o local (delta).')).toBe(36);
    expect(parseAssetCountFromDetails('Sincronização incremental de 0 ativos da nuvem para o local (delta).')).toBe(0);
    expect(parseAssetCountFromDetails('Sincronização incremental de 5586 ativos da nuvem para o local (delta).')).toBe(5586);
  });
});

describe('isDeltaSyncEntry', () => {
  it('reconhece o formato da Etapa 5b (incremental + (delta))', () => {
    expect(isDeltaSyncEntry({ details: 'Sincronização incremental de 36 ativos da nuvem para o local (delta).' })).toBe(true);
    expect(isDeltaSyncEntry({ details: 'Sincronização incremental de 0 ativos da nuvem para o local (delta).' })).toBe(true);
  });

  it('reconhece só o marcador (delta) em outros formatos', () => {
    expect(isDeltaSyncEntry({ details: 'Sincronização de 100 ativos (delta).' })).toBe(true);
  });

  it('NÃO marca pulls completos / outros eventos', () => {
    expect(isDeltaSyncEntry({ details: 'Sincronização de 12636 ativos da nuvem para o local.' })).toBe(false);
    expect(isDeltaSyncEntry({ details: 'Sincronização de 2066 ativos da nuvem para o local (boot loader) (contrato CICOPAL).' })).toBe(false);
    expect(isDeltaSyncEntry({ details: 'Carga de planilha: 2066 ativos injetados.' })).toBe(false);
    expect(isDeltaSyncEntry({ details: 'Falha ao sincronizar configuração.' })).toBe(false);
    expect(isDeltaSyncEntry({ details: null })).toBe(false);
    expect(isDeltaSyncEntry({ details: '' })).toBe(false);
  });
});

describe('normalizeTenantLabel', () => {
  it('normaliza para maiúsculas', () => {
    expect(normalizeTenantLabel('cicopal')).toBe('CICOPAL');
    expect(normalizeTenantLabel('  ClienteTeste ')).toBe('CLIENTETESTE');
  });

  it('rotula vazio como SEM CONTRATO', () => {
    expect(normalizeTenantLabel('')).toBe('SEM CONTRATO');
    expect(normalizeTenantLabel(null)).toBe('SEM CONTRATO');
    expect(normalizeTenantLabel(undefined)).toBe('SEM CONTRATO');
  });
});

describe('groupLoadHistory', () => {
  const base = {
    action: 'IMPORT',
    details: 'Carga: 100 ativos injetados.',
  };

  it('agrega por contrato com totais de eventos e ativos', () => {
    const { summary, events } = groupLoadHistory([
      { ...base, id: '1', tenantid: 'CICOPAL', timestamp: '2026-08-12T00:41:58Z', details: 'Carga: 12636 ativos injetados.' },
      { ...base, id: '2', tenantid: 'CICOPAL', timestamp: '2026-08-13T00:00:00Z', details: 'Sync de 100 ativos.' },
      { ...base, id: '3', tenantid: 'CLIENTETESTE', timestamp: '2026-08-12T00:58:55Z', details: 'Carga: 2066 ativos injetados.' },
    ]);

    expect(events).toHaveLength(3);
    expect(summary).toHaveLength(2);

    const cicopal = summary.find((s) => s.tenant === 'CICOPAL');
    expect(cicopal?.totalEventos).toBe(2);
    expect(cicopal?.totalAtivos).toBe(12736);
    expect(cicopal?.ultimaOcorrencia).toBe('2026-08-13T00:00:00Z');

    const ct = summary.find((s) => s.tenant === 'CLIENTETESTE');
    expect(ct?.totalEventos).toBe(1);
    expect(ct?.totalAtivos).toBe(2066);
  });

  it('agrupa tenantid vazio em SEM CONTRATO sem quebrar', () => {
    const { summary } = groupLoadHistory([
      { ...base, id: '1', tenantid: '', timestamp: '2026-08-12T00:41:58Z', details: 'Carga: 50 ativos injetados.' },
      { ...base, id: '2', tenantid: undefined, timestamp: '2026-08-12T01:00:00Z', details: 'Carga: 25 ativos injetados.' },
    ]);

    expect(summary).toHaveLength(1);
    expect(summary[0].tenant).toBe('SEM CONTRATO');
    expect(summary[0].totalAtivos).toBe(75);
    expect(summary[0].totalEventos).toBe(2);
  });

  it('conta ações distintas por contrato', () => {
    const { summary } = groupLoadHistory([
      { ...base, id: '1', tenantid: 'CICOPAL', timestamp: '2026-08-12T00:00:00Z', action: 'IMPORT' },
      { ...base, id: '2', tenantid: 'CICOPAL', timestamp: '2026-08-12T01:00:00Z', action: 'SYNC_PULL' },
      { ...base, id: '3', tenantid: 'CICOPAL', timestamp: '2026-08-12T02:00:00Z', action: 'SYNC_PULL' },
    ]);

    const cicopal = summary.find((s) => s.tenant === 'CICOPAL');
    expect(cicopal?.acoes).toEqual({ IMPORT: 1, SYNC_PULL: 2 });
  });

  it('ordena eventos do mais recente para o mais antigo', () => {
    const { events } = groupLoadHistory([
      { ...base, id: '1', tenantid: 'X', timestamp: '2026-08-12T00:00:00Z' },
      { ...base, id: '2', tenantid: 'X', timestamp: '2026-08-13T00:00:00Z' },
      { ...base, id: '3', tenantid: 'X', timestamp: '2026-08-11T00:00:00Z' },
    ]);
    expect(events[0].id).toBe('2');
    expect(events[1].id).toBe('1');
    expect(events[2].id).toBe('3');
  });

  it('ignora contagens ausentes sem afetar o total', () => {
    const { summary } = groupLoadHistory([
      { ...base, id: '1', tenantid: 'X', timestamp: '2026-08-12T00:00:00Z', details: 'Falha ao sincronizar.' },
      { ...base, id: '2', tenantid: 'X', timestamp: '2026-08-13T00:00:00Z', details: 'Carga: 10 ativos injetados.' },
    ]);
    expect(summary[0].totalAtivos).toBe(10);
    expect(summary[0].totalEventos).toBe(2);
  });
});

describe('formatLoadTimestamp', () => {
  it('formata ISO para data/hora local', () => {
    expect(formatLoadTimestamp('2026-08-12T15:30:00Z')).toMatch(/12\/08\/2026/);
  });

  it('retorna placeholder para vazio/inválido', () => {
    expect(formatLoadTimestamp(null)).toBe('—');
    expect(formatLoadTimestamp('')).toBe('—');
  });
});
