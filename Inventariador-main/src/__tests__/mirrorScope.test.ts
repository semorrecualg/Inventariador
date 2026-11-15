// @vitest-environment node
// ============================================================================
// mirrorScope.test.ts — âmbito do espelhamento (isolamento por contrato).
//
// O card "Espelhamento em Massa — Supabase" enviava a base local inteira quando
// não havia contrato ativo, e o cache do aparelho pode ter mais de um contrato
// (ex.: CICOPAL de sessão anterior). Estes testes fixam a regra: só sobe um
// contrato identificado; base ambígua não envia nada.
// ============================================================================
import { describe, it, expect } from 'vitest';
import { resolverEscopoEspelhamento, contratosDaBase } from '../services/mirrorScope';

const ativo = (tenantid: unknown, id: string) => ({ tenantid, id, primarykey: id });

describe('resolverEscopoEspelhamento', () => {
  it('com contrato ativo envia apenas as linhas desse contrato', () => {
    const escopo = resolverEscopoEspelhamento(
      [ativo('CICOPAL', '1'), ativo('CLIENTETESTE', '2'), ativo('cicopal', '3')],
      'CICOPAL'
    );

    expect(escopo.ok).toBe(true);
    if (!escopo.ok) return;
    expect(escopo.tenant).toBe('CICOPAL');
    expect(escopo.rows.map((r) => r.id)).toEqual(['1', '3']);
  });

  it('com contrato ativo e nenhuma linha dele, não envia nada', () => {
    const escopo = resolverEscopoEspelhamento([ativo('CLIENTETESTE', '2')], 'CICOPAL');

    expect(escopo.ok).toBe(false);
    if (escopo.ok) return;
    expect(escopo.reason).toBe('vazio-no-contrato');
  });

  it('sem contrato ativo e base de contrato único, envia tudo', () => {
    const escopo = resolverEscopoEspelhamento(
      [ativo('CICOPAL', '1'), ativo('CICOPAL', '2')],
      ''
    );

    expect(escopo.ok).toBe(true);
    if (!escopo.ok) return;
    expect(escopo.rows).toHaveLength(2);
    expect(escopo.tenant).toBe('CICOPAL');
  });

  it('sem contrato ativo e base com dois contratos, recusa o envio', () => {
    const escopo = resolverEscopoEspelhamento(
      [ativo('CICOPAL', '1'), ativo('CLIENTETESTE', '2')],
      ''
    );

    expect(escopo.ok).toBe(false);
    if (escopo.ok) return;
    expect(escopo.reason).toBe('multi-contrato');
    expect(escopo.contratos.sort()).toEqual(['CICOPAL', 'CLIENTETESTE']);
  });

  it('linhas sem contrato ficam fora do envio e são contadas', () => {
    const escopo = resolverEscopoEspelhamento(
      [ativo('CICOPAL', '1'), ativo('', '2'), ativo(null, '3'), ativo('undefined', '4')],
      ''
    );

    expect(escopo.ok).toBe(true);
    if (!escopo.ok) return;
    expect(escopo.rows.map((r) => r.id)).toEqual(['1']);
    expect(escopo.ignoradas).toBe(3);
  });

  it('base sem contrato nenhum não sobe', () => {
    const escopo = resolverEscopoEspelhamento([ativo('', '1')], '');

    expect(escopo.ok).toBe(false);
    if (escopo.ok) return;
    expect(escopo.reason).toBe('sem-contrato');
  });

  it('base vazia não sobe', () => {
    const escopo = resolverEscopoEspelhamento([], 'CICOPAL');

    expect(escopo.ok).toBe(false);
    if (escopo.ok) return;
    expect(escopo.reason).toBe('vazia');
  });

  it('contrato escrito com espaços à volta ou minúsculas é o mesmo contrato', () => {
    const escopo = resolverEscopoEspelhamento([ativo('  cicopal ', '1')], 'CICOPAL');

    expect(escopo.ok).toBe(true);
    if (!escopo.ok) return;
    expect(escopo.tenant).toBe('CICOPAL');
    expect(escopo.rows.map((r) => r.id)).toEqual(['1']);
  });

  it('contrato com espaço no meio é outro contrato e não é enviado', () => {
    const escopo = resolverEscopoEspelhamento([ativo('c icopal', '1')], 'CICOPAL');

    expect(escopo.ok).toBe(false);
    if (escopo.ok) return;
    expect(escopo.reason).toBe('vazio-no-contrato');
  });
});

describe('contratosDaBase', () => {
  it('lista contratos normalizados, sem duplicados nem marcas vazias', () => {
    expect(
      contratosDaBase([ativo('cicopal', '1'), ativo('CICOPAL', '2'), ativo('null', '3'), ativo('', '4')])
    ).toEqual(['CICOPAL']);
  });
});
