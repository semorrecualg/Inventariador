// @vitest-environment jsdom
// src/__tests__/workContextUtils.test.ts
// Contextos de Trabalho (contrato + filial): o app exige a escolha pós-login
// quando o usuário está autorizado em MAIS DE UM contexto. Estes testes fixam
// as regras de construção/deduplicação da lista de contextos.
import { describe, it, expect, beforeEach } from 'vitest';
import type { User } from '../types';
import { UserRole } from '../types';
import {
  buildWorkContexts,
  groupContextsByTenant,
  persistWorkContext,
  persistLastWorkContext,
  readLastWorkContext,
  clearLastWorkContext,
  isValidLastContext,
  splitTenantList,
  type WorkContext
} from '../utils/workContextUtils';
import { AppModule } from '../types';

function user(overrides: Partial<User>): User {
  return {
    username: 'user',
    email: 'user@cliente.com',
    role: UserRole.AUDITOR,
    tenantid: '',
    ...overrides
  };
}

describe('buildWorkContexts — lista de contextos autorizados', () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  it('tenant único sem unidades → 1 contexto (sem seletor)', () => {
    const ctxs = buildWorkContexts(user({ tenantid: 'CICOPAL' }));
    expect(ctxs).toEqual([{ tenantid: 'CICOPAL', filial: '' }]);
  });

  it('tenant único com 2 filiais → 2 contextos (multi-filial)', () => {
    const ctxs = buildWorkContexts(user({
      tenantid: 'CICOPAL',
      units: ['010101 CICOPAL GO', '010102 CICOPAL SP']
    }));
    expect(ctxs).toHaveLength(2);
    expect(ctxs.map(c => c.filial).sort()).toEqual(['010101 CICOPAL GO', '010102 CICOPAL SP']);
    expect(ctxs.every(c => c.tenantid === 'CICOPAL')).toBe(true);
  });

  it('unidades compostas "TENANTID::FILIAL" declaram filiais de outro contrato', () => {
    const ctxs = buildWorkContexts(user({
      tenantid: 'CICOPAL',
      units: ['CICOPAL::010101 CICOPAL GO', 'CLIENTETESTE::020202 CLIENTETESTE GO']
    }));
    expect(ctxs).toHaveLength(2);
    expect(ctxs).toContainEqual({ tenantid: 'CICOPAL', filial: '010101 CICOPAL GO' });
    expect(ctxs).toContainEqual({ tenantid: 'CLIENTETESTE', filial: '020202 CLIENTETESTE GO' });
  });

  it('tenantid multi-valor por vírgula → um contexto por contrato', () => {
    const ctxs = buildWorkContexts(user({
      tenantid: 'CICOPAL,CLIENTETESTE',
      filial: '010101 CICOPAL GO'
    }));
    expect(ctxs).toHaveLength(2);
    expect(ctxs).toContainEqual({ tenantid: 'CICOPAL', filial: '010101 CICOPAL GO' });
    expect(ctxs).toContainEqual({ tenantid: 'CLIENTETESTE', filial: '010101 CICOPAL GO' });
  });

  it('dedup: mesma combinação tenant+filial não duplica', () => {
    const ctxs = buildWorkContexts(user({
      tenantid: 'CICOPAL',
      units: ['010101 CICOPAL GO'],
      filial: '010101 CICOPAL GO'
    }));
    expect(ctxs).toHaveLength(1);
  });

  it('registros locais com o mesmo e-mail e outro tenant são mesclados (offline-first)', () => {
    const extra: User[] = [user({
      username: 'user',
      email: 'user@cliente.com',
      tenantid: 'CLIENTETESTE',
      filial: '020202 CLIENTETESTE GO'
    })];
    const ctxs = buildWorkContexts(user({ tenantid: 'CICOPAL', units: ['010101 CICOPAL GO'] }), extra);
    expect(ctxs).toHaveLength(2);
    expect(ctxs).toContainEqual({ tenantid: 'CLIENTETESTE', filial: '020202 CLIENTETESTE GO' });
  });

  it('registro local com filial obsoleta (MATRIZ) + base com filiais reais → base vence', () => {
    const base: Record<string, string[]> = {
      CICOPAL: ['010101 CICOPAL GO', '010201 SNACKS PA', '010401 CARPER BA']
    };
    const extra: User[] = [user({
      username: 'user',
      email: 'user@cliente.com',
      tenantid: 'CICOPAL',
      filial: 'MATRIZ',
      units: []
    })];
    const ctxs = buildWorkContexts(user({ tenantid: 'CICOPAL', filial: 'TODAS', units: [] }), extra, base);
    expect(ctxs.map(c => c.filial).sort()).toEqual(['010101 CICOPAL GO', '010201 SNACKS PA', '010401 CARPER BA']);
    expect(ctxs.map(c => c.filial)).not.toContain('MATRIZ');
  });

  it('registro local com filial REAL existente na base → autorização explícita mantida', () => {
    const base: Record<string, string[]> = {
      CICOPAL: ['010101 CICOPAL GO', '010201 SNACKS PA', '010401 CARPER BA']
    };
    const extra: User[] = [user({
      username: 'user',
      email: 'user@cliente.com',
      tenantid: 'CICOPAL',
      filial: '010201 SNACKS PA',
      units: ['010201 SNACKS PA']
    })];
    const ctxs = buildWorkContexts(user({ tenantid: 'CICOPAL', filial: 'TODAS', units: [] }), extra, base);
    expect(ctxs).toEqual([{ tenantid: 'CICOPAL', filial: '010201 SNACKS PA' }]);
  });

  it('e-mails diferentes NÃO mesclam registros locais', () => {
    const extra: User[] = [user({
      email: 'outro@cliente.com',
      tenantid: 'CLIENTETESTE'
    })];
    const ctxs = buildWorkContexts(user({ tenantid: 'CICOPAL' }), extra);
    expect(ctxs).toHaveLength(1);
    expect(ctxs[0].tenantid).toBe('CICOPAL');
  });

  it('dono (admin global sem tenant) → zero contextos (nunca mostra o seletor)', () => {
    const ctxs = buildWorkContexts(user({
      email: 'semorr@gmail.com',
      role: UserRole.ADMIN,
      tenantid: '',
      units: ['010101 CICOPAL GO']
    }));
    expect(ctxs).toHaveLength(0);
  });

  it('sentinelas NULL/UNDEFINED/TODAS são descartadas', () => {
    const ctxs = buildWorkContexts(user({
      tenantid: 'CICOPAL',
      filial: 'TODAS',
      units: ['NULL', 'UNDEFINED', '010101 CICOPAL GO']
    }));
    expect(ctxs).toEqual([{ tenantid: 'CICOPAL', filial: '010101 CICOPAL GO' }]);
  });

  it('filial igual ao próprio tenant é descartada (não é filial real)', () => {
    const ctxs = buildWorkContexts(user({
      tenantid: 'CICOPAL',
      units: ['CICOPAL']
    }));
    expect(ctxs).toEqual([{ tenantid: 'CICOPAL', filial: '' }]);
  });

  it('CICOPAL multi-filial na base: perfil sem units → 1 contexto por filial (6 filiais)', () => {
    const base: Record<string, string[]> = {
      CICOPAL: [
        '010101 CICOPAL GO',
        '010102 CICOPAL SP',
        '010103 CICOPAL RJ',
        '010104 CICOPAL MG',
        '010105 CICOPAL PA',
        '010106 CICOPAL BA'
      ]
    };
    const ctxs = buildWorkContexts(user({ tenantid: 'CICOPAL' }), undefined, base);
    expect(ctxs).toHaveLength(6);
    expect(ctxs.every(c => c.tenantid === 'CICOPAL')).toBe(true);
    expect(ctxs.map(c => c.filial)).toContain('010101 CICOPAL GO');
    expect(ctxs.map(c => c.filial)).toContain('010106 CICOPAL BA');
  });

  it('units declaradas no perfil TÊM prioridade sobre as filiais da base (autorização)', () => {
    const base: Record<string, string[]> = {
      CICOPAL: ['010101 CICOPAL GO', '010102 CICOPAL SP', '010103 CICOPAL RJ']
    };
    const ctxs = buildWorkContexts(
      user({ tenantid: 'CICOPAL', units: ['010101 CICOPAL GO'] }),
      undefined,
      base
    );
    expect(ctxs).toEqual([{ tenantid: 'CICOPAL', filial: '010101 CICOPAL GO' }]);
  });

  it('base sem filiais para o contrato → contexto somente de contrato', () => {
    const ctxs = buildWorkContexts(user({ tenantid: 'CLIENTETESTE' }), undefined, { CICOPAL: ['010101 CICOPAL GO'] });
    expect(ctxs).toEqual([{ tenantid: 'CLIENTETESTE', filial: '' }]);
  });

  it('sentinelas DEFAULT/NULL/0 na base são ignoradas como filiais', () => {
    const base: Record<string, string[]> = {
      CICOPAL: ['010101 CICOPAL GO', 'DEFAULT', 'NULL', '0', 'TODAS']
    };
    const ctxs = buildWorkContexts(user({ tenantid: 'CICOPAL' }), undefined, base);
    expect(ctxs).toEqual([{ tenantid: 'CICOPAL', filial: '010101 CICOPAL GO' }]);
  });
});

describe('splitTenantList — tenantid multi-valor', () => {
  it('separa por vírgula e normaliza para uppercase', () => {
    expect(splitTenantList('cicopal, CLIENTETESTE ')).toEqual(['CICOPAL', 'CLIENTETESTE']);
  });

  it('descarta vazios e sentinelas', () => {
    expect(splitTenantList('CICOPAL,,NULL,UNDEFINED')).toEqual(['CICOPAL']);
  });
});

describe('lembrar escolha (Etapa 4 FLUXO_ACESSO_INICIAL)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('persiste e lê a última escolha normalizada (tenant/filial uppercase)', () => {
    persistLastWorkContext({ tenantid: 'cicopal', filial: ' 010201 snacks pa ' }, AppModule.INVENTORY);
    const stored = readLastWorkContext();
    expect(stored?.tenantid).toBe('CICOPAL');
    expect(stored?.filial).toBe('010201 SNACKS PA');
    expect(stored?.module).toBe(AppModule.INVENTORY);
    expect(stored?.savedAt).toBeTruthy();
  });

  it('readLastWorkContext retorna null sem escolha salva ou com dados corrompidos', () => {
    expect(readLastWorkContext()).toBeNull();
    localStorage.setItem('app_last_work_context', 'not-json{');
    expect(readLastWorkContext()).toBeNull();
    localStorage.setItem('app_last_work_context', JSON.stringify({ filial: 'X' })); // sem tenantid/module
    expect(readLastWorkContext()).toBeNull();
  });

  it('clearLastWorkContext remove a escolha', () => {
    persistLastWorkContext({ tenantid: 'CICOPAL', filial: '010201 SNACKS PA' }, AppModule.INVENTORY);
    clearLastWorkContext();
    expect(readLastWorkContext()).toBeNull();
  });

  it('isValidLastContext: contexto na lista autorizada → true; fora → false', () => {
    const contexts: WorkContext[] = [
      { tenantid: 'CICOPAL', filial: '010201 SNACKS PA' },
      { tenantid: 'CICOPAL', filial: '010101 CICOPAL GO' }
    ];
    const stored = { tenantid: 'CICOPAL', filial: '010201 SNACKS PA', module: AppModule.INVENTORY, savedAt: '' };
    const auditor = { role: 'AUDITOR', tenantid: 'CICOPAL', units: ['010201 SNACKS PA'], filial: '010201 SNACKS PA' };
    expect(isValidLastContext(stored, contexts, auditor)).toBe(true);
    expect(isValidLastContext({ ...stored, filial: '010999 OUTRA FILIAL' }, contexts, auditor)).toBe(false);
    expect(isValidLastContext(null, contexts, auditor)).toBe(false);
    expect(isValidLastContext(stored, [], auditor)).toBe(false);
  });

  it('isValidLastContext: dono/admin sem units é autorizado para QUALQUER filial do próprio contrato (Etapa 4)', () => {
    const stored = { tenantid: 'CICOPAL', filial: '010201 SNACKS PA', module: AppModule.INVENTORY, savedAt: '' };
    const owner = { role: 'ADMIN', tenantid: 'CICOPAL', units: [], filial: 'TODAS' };
    // Base ainda não carregou (contexts só com o placeholder de contrato) → mesmo assim válido.
    expect(isValidLastContext(stored, [{ tenantid: 'CICOPAL', filial: '' }], owner)).toBe(true);
    // Contrato diferente do do usuário → inválido (muro multi-tenant).
    expect(isValidLastContext(stored, [], { ...owner, tenantid: 'CLIENTETESTE' })).toBe(false);
    // Admin COM units declaradas volta para a regra da lista autorizada.
    const scopedAdmin = { role: 'ADMIN', tenantid: 'CICOPAL', units: ['010101 CICOPAL GO'], filial: '010101 CICOPAL GO' };
    expect(isValidLastContext(stored, [{ tenantid: 'CICOPAL', filial: '010101 CICOPAL GO' }], scopedAdmin)).toBe(false);
    expect(isValidLastContext(stored, [{ tenantid: 'CICOPAL', filial: '010201 SNACKS PA' }], scopedAdmin)).toBe(true);
  });

  it('isValidLastContext bloqueia CONTROLE DE ATIVO para auditor', () => {
    const contexts: WorkContext[] = [{ tenantid: 'CICOPAL', filial: '010201 SNACKS PA' }];
    const stored = { tenantid: 'CICOPAL', filial: '010201 SNACKS PA', module: AppModule.ASSET_CONTROL, savedAt: '' };
    const auditor = { role: 'AUDITOR', tenantid: 'CICOPAL', units: ['010201 SNACKS PA'], filial: '010201 SNACKS PA' };
    expect(isValidLastContext(stored, contexts, auditor)).toBe(false);
    expect(isValidLastContext(stored, contexts, { ...auditor, role: 'AUXILIARY_AUDITOR' })).toBe(false);
    const owner = { role: 'ADMIN', tenantid: 'CICOPAL', units: [], filial: 'TODAS' };
    expect(isValidLastContext(stored, contexts, owner)).toBe(true);
  });
});

describe('persistWorkContext + groupContextsByTenant', () => {
  it('persiste nas chaves canônicas de sessão e local', () => {
    const ctx: WorkContext = { tenantid: 'cliente teste', filial: '020202 cliente teste go' };
    persistWorkContext(ctx);
    expect(sessionStorage.getItem('tenantid')).toBe('CLIENTE TESTE');
    expect(sessionStorage.getItem('filial')).toBe('020202 CLIENTE TESTE GO');
    expect(sessionStorage.getItem('selectedUnit')).toBe('020202 CLIENTE TESTE GO');
    expect(sessionStorage.getItem('gbr_active_tenant')).toBe('CLIENTE TESTE');
    expect(localStorage.getItem('tenantid')).toBe('CLIENTE TESTE');
    expect(localStorage.getItem('filial')).toBe('020202 CLIENTE TESTE GO');
  });

  it('agrupa contextos por contrato para renderização em cards', () => {
    const ctxs: WorkContext[] = [
      { tenantid: 'CICOPAL', filial: '010101 CICOPAL GO' },
      { tenantid: 'CICOPAL', filial: '010102 CICOPAL SP' },
      { tenantid: 'CLIENTETESTE', filial: '020202 CLIENTETESTE GO' },
      { tenantid: 'CLIENTETESTE', filial: '' }
    ];
    const groups = groupContextsByTenant(ctxs);
    expect(groups).toHaveLength(2);
    expect(groups.find(g => g.tenantid === 'CICOPAL')?.filiais).toEqual(['010101 CICOPAL GO', '010102 CICOPAL SP']);
    expect(groups.find(g => g.tenantid === 'CLIENTETESTE')?.filiais).toEqual(['020202 CLIENTETESTE GO']);
  });
});
