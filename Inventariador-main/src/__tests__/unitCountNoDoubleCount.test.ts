import { describe, it, expect } from 'vitest';
import {
  unitContextKey,
  splitUnitContextKey,
  matchTenantUnit,
  resolveRowTenant
} from '../utils/unitContextUtils';

/**
 * Regressão do ecrã real: dois cartões com a MESMA filial («010101 CICOPAL GO»),
 * um «SEM CONTRATO» e outro «CICOPAL», cada um com 7061 ativos, e o cabeçalho a
 * somar 14.122 sobre uma base de 7061.
 *
 * Duas causas, ambas cobertas aqui:
 *   1. `matchTenantUnit` tratava `tenantid` vazio como curinga — a unidade «SEM
 *      CONTRATO» absorvia as linhas do contrato e contava-as outra vez.
 *   2. a mesma filial ganhava duas entradas quando metade das linhas não tinha
 *      contrato; a segunda entrada era fantasma.
 */

interface Row { tenantid?: string | null; filial: string }

/**
 * Reproduz a agregação do App: entradas por `(contrato, filial)` — com o
 * anti-fantasma — e contagem por linha, casando contrato + filial.
 */
const summarize = (rows: Row[], activeTenant: string, cloudNames: string[] = []) => {
  const entries = new Map<string, { tenantid: string; name: string }>();
  // 4a — unidades detectadas nas linhas: entradas homónimas em contratos
  // diferentes são legítimas e mantêm-se separadas.
  for (const row of rows) {
    const tenant = resolveRowTenant(row.tenantid, activeTenant);
    const key = unitContextKey(tenant, row.filial);
    if (entries.has(key)) continue;
    entries.set(key, { tenantid: tenant, name: row.filial });
  }
  // 4b/4c — nomes sem dados (perfil/nuvem): anti-fantasma, nunca duplicam uma
  // filial que já existe num contrato.
  for (const nome of cloudNames) {
    const norm = nome.toUpperCase().trim();
    if (entries.has(unitContextKey(activeTenant, nome))) continue;
    const already = Array.from(entries.values()).some((u) => u.name.toUpperCase().trim() === norm);
    if (already) continue;
    entries.set(unitContextKey(activeTenant, nome), { tenantid: activeTenant, name: nome });
  }

  const units = Array.from(entries.keys()).map((key) => {
    const { tenantid, filial } = splitUnitContextKey(key);
    const assetCount = rows.reduce(
      (total, row) =>
        matchTenantUnit(tenantid, filial, resolveRowTenant(row.tenantid, activeTenant), row.filial)
          ? total + 1
          : total,
      0
    );
    return { tenantid, filial, assetCount };
  });

  return { units, total: units.reduce((acc, u) => acc + u.assetCount, 0) };
};

const FILIAL = '010101 CICOPAL GO';

describe('Unidade Operacional — contagem sem duplicação', () => {
  it('linhas legadas sem contrato não criam uma unidade paralela nem duplicam o total', () => {
    // Metade das linhas sem tenantid, metade com contrato — o cenário do ecrã.
    const rows: Row[] = [
      ...Array.from({ length: 10 }, () => ({ tenantid: 'CICOPAL', filial: FILIAL })),
      ...Array.from({ length: 10 }, () => ({ tenantid: '', filial: FILIAL }))
    ];

    const { units, total } = summarize(rows, 'CICOPAL');

    expect(units).toHaveLength(1);
    expect(units[0].tenantid).toBe('CICOPAL');
    expect(units[0].assetCount).toBe(20);
    expect(total).toBe(20); // e não 40 (2 × 20)
  });

  it('sem contrato activo, o dado legado continua visível na sua unidade', () => {
    const rows: Row[] = [
      { tenantid: '', filial: FILIAL },
      { tenantid: '', filial: FILIAL }
    ];

    const { units, total } = summarize(rows, '');

    expect(units).toHaveLength(1);
    expect(units[0].tenantid).toBe('');
    expect(total).toBe(2);
  });

  it('a mesma filial em contratos diferentes mantém-se separada (homónimos reais)', () => {
    const rows: Row[] = [
      { tenantid: 'CICOPAL', filial: FILIAL },
      { tenantid: 'CICOPAL', filial: FILIAL },
      { tenantid: 'CLIENTETESTE', filial: FILIAL }
    ];

    const { units, total } = summarize(rows, 'CICOPAL');

    expect(units).toHaveLength(2);
    expect(units.map((u) => u.assetCount).sort()).toEqual([1, 2]);
    expect(total).toBe(3);
  });

  it('filial listada pela nuvem não cria entrada fantasma quando já existe num contrato', () => {
    const rows: Row[] = [{ tenantid: 'CICOPAL', filial: FILIAL }];

    const { units, total } = summarize(rows, 'CICOPAL', [FILIAL, '010202 OUTRA']);

    expect(units.map((u) => u.filial).sort()).toEqual([FILIAL, '010202 OUTRA']);
    expect(units.find((u) => u.filial === FILIAL)?.assetCount).toBe(1);
    expect(units.find((u) => u.filial === '010202 OUTRA')?.assetCount).toBe(0);
    expect(total).toBe(1);
  });

  it('não duplica a contagem quando uma entrada sem contrato convive com a do contrato', () => {
    // Entrada legada e entrada de contrato, ambas sobre as mesmas linhas.
    expect(matchTenantUnit('', FILIAL, 'CICOPAL', FILIAL)).toBe(false);
    expect(matchTenantUnit('CICOPAL', FILIAL, '', FILIAL)).toBe(false);
  });
});
