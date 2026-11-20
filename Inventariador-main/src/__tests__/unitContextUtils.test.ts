import { describe, it, expect } from 'vitest';
import {
  unitContextKey,
  splitUnitContextKey,
  matchTenantUnit,
  findHomonymUnits,
  resolveUnitFilter,
  resolveBootUnitFilter,
  resolveBootPullPlan,
  normalizeUnitNames,
  unitListScope,
  decideUnitListAction,
  hasFiliaisLocaisDoContrato,
  resolveSyncPullScope
} from '../utils/unitContextUtils';

describe('resolveUnitFilter — filtro de filial dos pulls do fluxo inicial (Etapa 2)', () => {
  it('filial real do perfil → filtro em UPPER/trim (baixa só a filial)', () => {
    expect(resolveUnitFilter('010201 snacks pa')).toBe('010201 SNACKS PA');
  });

  it('sem filial / vazio → undefined (baixa o contrato inteiro)', () => {
    expect(resolveUnitFilter('')).toBeUndefined();
    expect(resolveUnitFilter(null)).toBeUndefined();
    expect(resolveUnitFilter(undefined)).toBeUndefined();
    expect(resolveUnitFilter('   ')).toBeUndefined();
  });

  it('sentinelas TODAS/NULL/UNDEFINED → undefined (sem filtro)', () => {
    expect(resolveUnitFilter('TODAS')).toBeUndefined();
    expect(resolveUnitFilter('todas')).toBeUndefined();
    expect(resolveUnitFilter('NULL')).toBeUndefined();
    expect(resolveUnitFilter('undefined')).toBeUndefined();
  });
});

describe('resolveBootUnitFilter — carga inicial com última escolha (Etapa 5a)', () => {
  const lastCtx = { tenantid: 'CICOPAL', filial: '010201 SNACKS PA' };

  it('filial real do perfil VENCE a última escolha (auditor mantém a própria filial)', () => {
    expect(resolveBootUnitFilter('010301 FEIRA BOA BA', lastCtx, 'CICOPAL')).toBe('010301 FEIRA BOA BA');
  });

  it('perfil TODAS + última escolha do MESMO contrato → usa a filial escolhida', () => {
    expect(resolveBootUnitFilter('TODAS', lastCtx, 'CICOPAL')).toBe('010201 SNACKS PA');
  });

  it('perfil TODAS + última escolha de OUTRO contrato → undefined (muro SRE: contrato inteiro)', () => {
    expect(resolveBootUnitFilter('TODAS', lastCtx, 'CLIENTETESTE')).toBeUndefined();
  });

  it('perfil TODAS + sem última escolha → undefined (contrato inteiro, comportamento atual)', () => {
    expect(resolveBootUnitFilter('TODAS', null, 'CICOPAL')).toBeUndefined();
    expect(resolveBootUnitFilter('TODAS', undefined, 'CICOPAL')).toBeUndefined();
  });

  it('perfil TODAS + última escolha sem filial/sentinela → undefined', () => {
    expect(resolveBootUnitFilter('TODAS', { tenantid: 'CICOPAL', filial: '' }, 'CICOPAL')).toBeUndefined();
    expect(resolveBootUnitFilter('TODAS', { tenantid: 'CICOPAL', filial: 'TODAS' }, 'CICOPAL')).toBeUndefined();
  });

  it('normaliza caixa/trim do contrato e da filial da última escolha', () => {
    expect(resolveBootUnitFilter('todas', { tenantid: '  cicopal ', filial: ' 010201 snacks pa ' }, 'CICOPAL')).toBe('010201 SNACKS PA');
  });

  it('sem contrato no usuário + última escolha → usa a última escolha (tolerância)', () => {
    expect(resolveBootUnitFilter('TODAS', lastCtx, '')).toBe('010201 SNACKS PA');
  });
});

describe('unitContextUtils — muro multi-tenant de Unidades Operacionais', () => {
  it('unitContextKey monta a chave composta [tenantid+filial] em UPPER/trim', () => {
    expect(unitContextKey('cicopal', '010201 SNACKS PA')).toBe('CICOPAL|010201 SNACKS PA');
    expect(unitContextKey('  ', '  Filial X ')).toBe('|FILIAL X');
  });

  it('splitUnitContextKey inverte a chave composta', () => {
    expect(splitUnitContextKey('CICOPAL|010201 SNACKS PA')).toEqual({
      tenantid: 'CICOPAL',
      filial: '010201 SNACKS PA'
    });
    expect(splitUnitContextKey('010201 SNACKS PA')).toEqual({
      tenantid: '',
      filial: '010201 SNACKS PA'
    });
  });

  it('matchTenantUnit exige o mesmo tenant quando ambos os lados têm contrato', () => {
    // Mesmo nome + mesmo tenant → casa
    expect(matchTenantUnit('CICOPAL', '010201 SNACKS PA', 'CICOPAL', '010201 SNACKS PA')).toBe(true);
    // Mesmo nome + tenants diferentes → NÃO casa (o muro)
    expect(matchTenantUnit('CICOPAL', '010201 SNACKS PA', 'CLIENTETESTE', '010201 SNACKS PA')).toBe(false);
    // Tenant vazio de um lado → tolerância por nome
    expect(matchTenantUnit('', '010201 SNACKS PA', 'CICOPAL', '010201 SNACKS PA')).toBe(true);
    // Prefixo numérico resiliente dentro do mesmo tenant
    expect(matchTenantUnit('CICOPAL', '010101 CICOPAL GO', 'CICOPAL', '010101')).toBe(true);
  });

  it('findHomonymUnits detecta apenas filiais presentes em mais de um tenant', () => {
    const units = [
      { filial: '010201 SNACKS PA', tenantid: 'CICOPAL' },
      { filial: '010201 SNACKS PA', tenantid: 'CLIENTETESTE' },
      { filial: '010101 CICOPAL GO', tenantid: 'CICOPAL' }
    ];
    const homonyms = findHomonymUnits(units);
    expect(homonyms.has('010201 SNACKS PA')).toBe(true);
    expect(homonyms.has('010101 CICOPAL GO')).toBe(false);
  });

  it('findHomonymUnits considera sem-contrato um tenant distinto', () => {
    const homonyms = findHomonymUnits([
      { filial: 'FILIAL X', tenantid: '' },
      { filial: 'FILIAL X', tenantid: 'CICOPAL' }
    ]);
    expect(homonyms.has('FILIAL X')).toBe(true);
  });
});

describe('resolveBootPullPlan — o boot nunca baixa o contrato inteiro', () => {
  it('filial real no perfil → baixa só essa filial', () => {
    const plano = resolveBootPullPlan('010201 snacks pa', null, 'CICOPAL');
    expect(plano).toEqual({ unit: '010201 SNACKS PA', requiresUnitSelection: false });
  });

  it('perfil TODAS + última escolha do MESMO contrato → baixa só a filial escolhida', () => {
    const plano = resolveBootPullPlan('TODAS', { tenantid: 'CICOPAL', filial: '010101 CICOPAL GO' }, 'CICOPAL');
    expect(plano.unit).toBe('010101 CICOPAL GO');
    expect(plano.requiresUnitSelection).toBe(false);
  });

  it('sem filial e sem última escolha → NÃO baixa nada e exige a escolha', () => {
    expect(resolveBootPullPlan('TODAS', null, 'CICOPAL'))
      .toEqual({ requiresUnitSelection: true });
    expect(resolveBootPullPlan(null, null, 'CICOPAL').unit).toBeUndefined();
    expect(resolveBootPullPlan(undefined, null, 'CICOPAL').requiresUnitSelection).toBe(true);
  });

  it('última escolha de OUTRO contrato não serve (muro multi-tenant)', () => {
    const plano = resolveBootPullPlan('', { tenantid: 'CLIENTETESTE', filial: '010101 CICOPAL GO' }, 'CICOPAL');
    expect(plano).toEqual({ requiresUnitSelection: true });
  });

  it('última escolha com sentinela (TODAS/NULL) não serve', () => {
    expect(resolveBootPullPlan('TODAS', { tenantid: 'CICOPAL', filial: 'TODAS' }, 'CICOPAL'))
      .toEqual({ requiresUnitSelection: true });
    expect(resolveBootPullPlan('', { tenantid: 'CICOPAL', filial: '' }, 'CICOPAL'))
      .toEqual({ requiresUnitSelection: true });
  });

  it('nunca devolve plano de pull sem unidade', () => {
    const casos = [
      resolveBootPullPlan(null, null, null),
      resolveBootPullPlan('TODAS', null, 'CICOPAL'),
      resolveBootPullPlan('', { tenantid: 'OUTRO', filial: '010101 CICOPAL GO' }, 'CICOPAL'),
    ];
    for (const plano of casos) {
      expect(plano.unit).toBeUndefined();
      expect(plano.requiresUnitSelection).toBe(true);
    }
  });
});

describe('normalizeUnitNames — lista de filiais vinda da nuvem (sem ativos)', () => {
  it('normaliza caixa/espaços e remove duplicados', () => {
    expect(normalizeUnitNames([
      { filial: '010101 cicopal go' },
      { filial: '  010101   CICOPAL GO ' },
      { filial: '010201 snacks pa' }
    ])).toEqual(['010101 CICOPAL GO', '010201 SNACKS PA']);
  });

  it('descarta sentinelas e vazios', () => {
    expect(normalizeUnitNames([
      { filial: '' }, { filial: null }, { filial: 'TODAS' }, { filial: 'NULL' },
      { filial: 'UNDEFINED' }, { filial: '0' }, { filial: 'DEFAULT' },
      { filial: 'SEM FILIAL' }, { filial: 'FILIAL X' }
    ])).toEqual(['FILIAL X']);
  });

  it('aceita strings soltas e ignora nulos da lista', () => {
    expect(normalizeUnitNames(['filial y', null, undefined, 'FILIAL X']))
      .toEqual(['FILIAL X', 'FILIAL Y']);
  });

  it('lista vazia permanece vazia', () => {
    expect(normalizeUnitNames([])).toEqual([]);
    expect(normalizeUnitNames([{ filial: '   ' }])).toEqual([]);
  });

  it('ordena para a tela de seleção não dançar entre cargas', () => {
    expect(normalizeUnitNames(['B', 'A', 'C'])).toEqual(['A', 'B', 'C']);
  });
});

describe('unitListScope — lista de filiais presa ao utilizador e ao contrato', () => {
  it('só coincide com a mesma conta no mesmo contrato', () => {
    const base = unitListScope('auditor@x.com', 'CICOPAL');
    expect(unitListScope(' auditor@X.com ', ' cicopal ')).toBe(base); // mesma conta, mesmo contrato
    expect(unitListScope('auditor@x.com', 'CLIENTETESTE')).not.toBe(base); // outro contrato
    expect(unitListScope('outro@x.com', 'CICOPAL')).not.toBe(base); // outra conta
    expect(unitListScope(null, 'CICOPAL')).not.toBe(base); // sem sessão
  });
});

describe('decideUnitListAction — o que fazer com a lista de filiais guardada', () => {
  const base = {
    storedScope: null as string | null,
    scope: unitListScope('auditor@x.com', 'CICOPAL'),
    tenantid: 'CICOPAL',
    isLocalDatabase: false,
    online: true,
    hasLocalBase: false
  };

  it('sem lista guardada, com contrato e rede: busca a lista do contrato', () => {
    expect(decideUnitListAction(base)).toEqual({ type: 'fetch', tenant: 'CICOPAL' });
    expect(decideUnitListAction({ ...base, tenantid: '  cicopal ' }))
      .toEqual({ type: 'fetch', tenant: 'CICOPAL' });
  });

  it('lista do MESMO escopo já em memória: não busca outra vez', () => {
    expect(decideUnitListAction({ ...base, storedScope: base.scope })).toEqual({ type: 'idle' });
  });

  it('outro utilizador no mesmo aparelho: limpa a lista antiga', () => {
    const outroUsuario = { ...base, scope: unitListScope('outro@x.com', 'CICOPAL') };
    expect(decideUnitListAction({ ...outroUsuario, storedScope: base.scope }))
      .toEqual({ type: 'clear' });
    // depois de limpa, o mesmo estado passa a buscar a lista do novo escopo
    expect(decideUnitListAction({ ...outroUsuario, storedScope: null }))
      .toEqual({ type: 'fetch', tenant: 'CICOPAL' });
  });

  it('outro contrato no mesmo aparelho: limpa e busca só o novo contrato', () => {
    const outroContrato = {
      ...base,
      scope: unitListScope('auditor@x.com', 'CLIENTETESTE'),
      tenantid: 'CLIENTETESTE'
    };
    expect(decideUnitListAction({ ...outroContrato, storedScope: base.scope }))
      .toEqual({ type: 'clear' });
    expect(decideUnitListAction({ ...outroContrato, storedScope: null }))
      .toEqual({ type: 'fetch', tenant: 'CLIENTETESTE' });
  });

  it('logout (lista guardada de uma sessão que já saiu): limpa', () => {
    expect(decideUnitListAction({ ...base, scope: unitListScope(null, null), tenantid: '', storedScope: base.scope }))
      .toEqual({ type: 'clear' });
  });

  it('sem contrato, sem rede ou com base local: não busca nada', () => {
    expect(decideUnitListAction({ ...base, tenantid: '' })).toEqual({ type: 'idle' });
    expect(decideUnitListAction({ ...base, tenantid: null })).toEqual({ type: 'idle' });
    expect(decideUnitListAction({ ...base, online: false })).toEqual({ type: 'idle' });
    expect(decideUnitListAction({ ...base, isLocalDatabase: true })).toEqual({ type: 'idle' });
    expect(decideUnitListAction({ ...base, hasLocalBase: true })).toEqual({ type: 'idle' });
  });
});

describe('resolveSyncPullScope — o pull automático nunca desce o contrato inteiro', () => {
  const lastCtx = { tenantid: 'CICOPAL', filial: '010201 SNACKS PA' };

  it('sem filial pedida e sem última escolha: BLOCKED (escolher no contrato)', () => {
    expect(resolveSyncPullScope({ tenantid: 'CICOPAL', filialDoPerfil: 'TODAS' }))
      .toEqual({ type: 'blocked' });
    expect(resolveSyncPullScope({ tenantid: 'CICOPAL', filialDoPerfil: null, lastCtx: null }))
      .toEqual({ type: 'blocked' });
  });

  it('filial pedida pelo chamador vence tudo (e é normalizada)', () => {
    expect(
      resolveSyncPullScope({ tenantid: 'CICOPAL', explicitUnitId: ' 010105 cicopal pa ', filialDoPerfil: 'TODAS' })
    ).toEqual({ type: 'unit', unit: '010105 CICOPAL PA' });
  });

  it('perfil com filial fixa (auditor) ou última escolha do MESMO contrato → filial', () => {
    expect(resolveSyncPullScope({ tenantid: 'CICOPAL', filialDoPerfil: '010101 CICOPAL GO' }))
      .toEqual({ type: 'unit', unit: '010101 CICOPAL GO' });
    expect(resolveSyncPullScope({ tenantid: 'CICOPAL', filialDoPerfil: 'TODAS', lastCtx }))
      .toEqual({ type: 'unit', unit: '010201 SNACKS PA' });
  });

  it('última escolha de OUTRO contrato não autoriza o pull (muro SRE)', () => {
    expect(
      resolveSyncPullScope({
        tenantid: 'CICOPAL',
        filialDoPerfil: 'TODAS',
        lastCtx: { tenantid: 'CLIENTETESTE', filial: '010101 CICOPAL GO' }
      })
    ).toEqual({ type: 'blocked' });
  });

  it('«Sincronizar tudo» (explícita) pode pedir o contrato inteiro', () => {
    expect(
      resolveSyncPullScope({ tenantid: 'CICOPAL', filialDoPerfil: 'TODAS', explicitForceFull: true })
    ).toEqual({ type: 'full' });
  });

  it('sem contrato resolvido (dono global) ou vários contratos: mantém o comportamento', () => {
    expect(resolveSyncPullScope({ filialDoPerfil: 'TODAS' })).toEqual({ type: 'full' });
    expect(resolveSyncPullScope({ tenantid: ['CICOPAL', 'CLIENTETESTE'] })).toEqual({ type: 'full' });
  });
});

describe('hasFiliaisLocaisDoContrato — ter base não é ter as filiais do contrato', () => {
  it('ativos de OUTRO contrato não dispensam a lista da nuvem', () => {
    // Base de demonstração no aparelho e sessão no CICOPAL: a lista local não
    // responde pelas filiais do CICOPAL — era aqui que o contrato ficava sem
    // filiais e o INVENTARIADOR inacessível.
    expect(
      hasFiliaisLocaisDoContrato('CICOPAL', { DEMO_DEFAULT: ['MATRIZ'] }, [])
    ).toBe(false);
  });

  it('ativos do contrato sem filial também não contam', () => {
    expect(hasFiliaisLocaisDoContrato('CICOPAL', { CICOPAL: [] }, [])).toBe(false);
    expect(hasFiliaisLocaisDoContrato('CICOPAL', { CICOPAL: ['  '] }, [])).toBe(false);
  });

  it('filial real na base em memória ou nas unidades lidas do SQL conta', () => {
    expect(hasFiliaisLocaisDoContrato('CICOPAL', { CICOPAL: ['010101 CICOPAL GO'] }, [])).toBe(true);
    expect(
      hasFiliaisLocaisDoContrato(' cicopal ', undefined, [
        { tenantid: 'CICOPAL', filial: '010101 CICOPAL GO' }
      ])
    ).toBe(true);
  });

  it('unidade SQL de outro contrato (ou sem filial) não conta', () => {
    expect(
      hasFiliaisLocaisDoContrato('CICOPAL', undefined, [
        { tenantid: 'DEMO_DEFAULT', filial: 'MATRIZ' },
        { tenantid: 'CICOPAL', filial: '   ' }
      ])
    ).toBe(false);
  });

  it('sem contrato resolvido não há filiais locais a declarar', () => {
    expect(hasFiliaisLocaisDoContrato('', { CICOPAL: ['010101 CICOPAL GO'] }, [])).toBe(false);
    expect(hasFiliaisLocaisDoContrato(null, { CICOPAL: ['010101 CICOPAL GO'] }, [])).toBe(false);
  });
});

describe('CONTRATO DE TRABALHO — base local sem o contrato pede as filiais à nuvem', () => {
  // Cenário do aparelho do dono: base local só com o contrato de demonstração
  // e sessão no CICOPAL. As 5 filiais do CICOPAL existem apenas na nuvem — é de
  // lá que o contrato tem de as listar. Aqui as duas peças da decisão são
  // exercitadas juntas, na ordem em que o App as chama.
  const scope = unitListScope('semorr@gmail.com', 'CICOPAL');
  const baseDeOutroContrato = { DEMO_DEFAULT: ['MATRIZ'] };
  const unidadesSqlDeOutroContrato = [{ tenantid: 'DEMO_DEFAULT', filial: 'MATRIZ' }];
  /** Linhas de `assets?select=filial&tenantid=eq.CICOPAL` (5 unidades reais). */
  const filiaisDaNuvem = [
    { filial: '010101 CICOPAL GO' },
    { filial: '010105 CICOPAL PA' },
    { filial: '010201 SNACKS PA' },
    { filial: '010301 FEIRA BOA BA' },
    { filial: '010401 CARPER BA' }
  ];

  it('sem filial do contrato na base local, a decisão manda consultar a nuvem', () => {
    const hasLocalBase = hasFiliaisLocaisDoContrato(
      'CICOPAL',
      baseDeOutroContrato,
      unidadesSqlDeOutroContrato
    );
    expect(hasLocalBase).toBe(false);

    expect(
      decideUnitListAction({
        storedScope: null,
        scope,
        tenantid: 'CICOPAL',
        isLocalDatabase: false,
        online: true,
        hasLocalBase
      })
    ).toEqual({ type: 'fetch', tenant: 'CICOPAL' });
  });

  it('os nomes devolvidos pela nuvem são as 5 filiais reais do contrato', () => {
    expect(normalizeUnitNames(filiaisDaNuvem)).toEqual([
      '010101 CICOPAL GO',
      '010105 CICOPAL PA',
      '010201 SNACKS PA',
      '010301 FEIRA BOA BA',
      '010401 CARPER BA'
    ]);
  });

  it('com as filiais do contrato já na base local, a nuvem não é consultada', () => {
    const hasLocalBase = hasFiliaisLocaisDoContrato(
      'CICOPAL',
      { CICOPAL: ['010101 CICOPAL GO'] },
      []
    );
    expect(
      decideUnitListAction({
        storedScope: null,
        scope,
        tenantid: 'CICOPAL',
        isLocalDatabase: false,
        online: true,
        hasLocalBase
      })
    ).toEqual({ type: 'idle' });
  });
});
