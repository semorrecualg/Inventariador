// @vitest-environment jsdom
// ============================================================================
// restoreAudit.test.ts — resumo e auditoria dos restauros de backup.
//
// O restauro não bloqueia snapshots de vários contratos (é recuperação), mas sai
// de lá com um resumo do que repôs: `tenants` por contrato e `adopted` com as
// pks que vieram sem `tenantid`. Restauros cruzados e adopções ficam em
// `audit_logs` para revisão; nada disso pode impedir o restauro.
// ============================================================================
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db } from '../services/sqliteService';
import type { DexieAsset } from '../services/sqliteService';
import { restoreBackupSnapshot, verifyAndRestorePhysicalBackup } from '../services/DatabaseLoaderService';

// O ficheiro físico do restauro de boot: o teste troca o conteúdo entre chamadas.
const { arquivoFisico } = vi.hoisted(() => ({ arquivoFisico: { conteudo: '[]' } }));

vi.mock('@capacitor/filesystem', () => ({
  Filesystem: { readFile: async () => ({ data: arquivoFisico.conteudo }) },
  Directory: { Documents: 'DOCUMENTS' },
  Encoding: { UTF8: 'utf8' }
}));

const TENANT = 'CICOPAL';
const ESPELHOS = ['local_assets', 'ativos', 'assets'] as const;

const linha = (tenantid: string, pk: string): DexieAsset => ({
  id: pk, primarykey: pk, tenantid, filial: 'MATRIZ'
} as DexieAsset);

const logsDe = async (acao: string) => db.audit_logs.filter(l => l.acao === acao).toArray();

beforeEach(async () => {
  localStorage.clear();
  sessionStorage.clear();
  sessionStorage.setItem('app_current_user', JSON.stringify({ tenantid: TENANT }));
  for (const table of ESPELHOS) await db[table].clear();
  await db.audit_logs.clear();
  await db.SYSTEM_CONTEXT.clear();
  arquivoFisico.conteudo = '[]';
});

describe('resumo do restauro', () => {
  it('conta as linhas por contrato e separa as que vieram sem tenantid', async () => {
    const resumo = await restoreBackupSnapshot([
      linha(TENANT, 'A'),
      linha('cicopal', 'B'),
      linha('', 'C')
    ]);

    expect(resumo.total).toBe(3);
    expect(resumo.tenants).toEqual({ [TENANT]: 3 });
    expect(resumo.adopted).toEqual(['C']);
    // A base recebeu os três, todos sob o contrato da sessão.
    for (const table of ESPELHOS) {
      expect(await db[table].get([TENANT, 'C'])).toBeDefined();
    }
  });

  it('backup vazio devolve resumo vazio e não toca na base', async () => {
    await db.local_assets.put(linha(TENANT, 'EXISTENTE'));

    const resumo = await restoreBackupSnapshot([]);

    expect(resumo).toEqual({ total: 0, tenants: {}, adopted: [] });
    expect(await db.local_assets.get([TENANT, 'EXISTENTE'])).toBeDefined();
  });
});

describe('auditoria de restauro', () => {
  it('regista RESTORE_CROSS_TENANT quando o backup não contém o contrato activo', async () => {
    const resumo = await restoreBackupSnapshot([
      linha('OUTRO_CLIENTE', 'X'),
      linha('OUTRO_CLIENTE', 'Y')
    ]);

    // Restauro acontece — a política é avisar, não bloquear.
    expect(resumo.total).toBe(2);
    expect(await db.local_assets.get(['OUTRO_CLIENTE', 'X'])).toBeDefined();

    const [log] = await logsDe('RESTORE_CROSS_TENANT');
    expect(log).toBeDefined();
    expect(log.registro_id).toBe('BACKUP_MANUAL');
    expect(log.details).toContain('2 ativo(s) de 1 contrato(s)');
    expect(log.details).toContain('contrato activo CICOPAL AUSENTE do backup');
    expect(JSON.parse(log.delta ?? '{}')).toMatchObject({
      origem: 'BACKUP_MANUAL',
      total: 2,
      tenants: { OUTRO_CLIENTE: 2 },
      contrato_ativo: 'CICOPAL'
    });
  });

  it('regista RESTORE_CROSS_TENANT quando o backup mistura contratos, mesmo com o activo presente', async () => {
    await restoreBackupSnapshot([linha(TENANT, 'A'), linha('OUTRO_CLIENTE', 'B')]);

    const [log] = await logsDe('RESTORE_CROSS_TENANT');
    expect(log).toBeDefined();
    expect(log.details).toContain('2 ativo(s) de 2 contrato(s)');
    expect(log.details).toContain('CICOPAL: 1');
    expect(log.details).not.toContain('AUSENTE');
  });

  it('regista as pks que adoptaram o contrato da sessão', async () => {
    const semTenant = Array.from({ length: 3 }, (_, i) => linha('', `SEM-TENANT-${i}`));
    await restoreBackupSnapshot(semTenant);

    const [adocao] = await logsDe('RESTORE_TENANT_ADOPTED');
    expect(adocao).toBeDefined();
    expect(adocao.details).toContain('3 linha(s) sem tenantid adoptaram o contrato da sessão (CICOPAL)');
    expect(adocao.details).toContain('SEM-TENANT-0, SEM-TENANT-1, SEM-TENANT-2');
    expect(JSON.parse(adocao.delta ?? '{}').primarykeys).toEqual(['SEM-TENANT-0', 'SEM-TENANT-1', 'SEM-TENANT-2']);
  });

  it('não repete a auditoria quando o mesmo resumo é restaurado outra vez', async () => {
    const snapshot = [linha('OUTRO_CLIENTE', 'X'), linha('', 'Y')];

    await restoreBackupSnapshot(snapshot);
    const primeiro = await db.audit_logs.count();
    expect(primeiro).toBe(2);

    await restoreBackupSnapshot(snapshot);
    expect(await db.audit_logs.count()).toBe(primeiro);

    // Resumo diferente (outra linha) volta a registar.
    await restoreBackupSnapshot([linha('OUTRO_CLIENTE', 'X')]);
    expect(await db.audit_logs.count()).toBeGreaterThan(primeiro);
  });

  it('boot com o mesmo ficheiro físico audita uma só vez', async () => {
    arquivoFisico.conteudo = JSON.stringify([
      linha('OUTRO_CLIENTE', 'X'),
      linha('', 'Y'),
      linha(TENANT, 'Z')
    ]);

    await expect(verifyAndRestorePhysicalBackup()).resolves.toBe(true);
    const depoisDoPrimeiroBoot = await db.audit_logs.count();
    expect(depoisDoPrimeiroBoot).toBe(2);

    // Segundo e terceiro arranques com o MESMO ficheiro: nada de repetições.
    await expect(verifyAndRestorePhysicalBackup()).resolves.toBe(true);
    await expect(verifyAndRestorePhysicalBackup()).resolves.toBe(true);
    expect(await db.audit_logs.count()).toBe(depoisDoPrimeiroBoot);

    const [cross] = await logsDe('RESTORE_CROSS_TENANT');
    expect(cross.registro_id).toBe('BACKUP_FISICO');
  });

  it('boot audita outra vez quando o ficheiro físico muda', async () => {
    arquivoFisico.conteudo = JSON.stringify([linha('OUTRO_CLIENTE', 'X')]);
    await verifyAndRestorePhysicalBackup();
    const primeiro = await db.audit_logs.count();

    // Outro cliente no .dat: resumo diferente, novo registo.
    arquivoFisico.conteudo = JSON.stringify([linha('TERCEIRO_CLIENTE', 'X')]);
    await verifyAndRestorePhysicalBackup();

    const logs = await logsDe('RESTORE_CROSS_TENANT');
    expect(await db.audit_logs.count()).toBeGreaterThan(primeiro);
    expect(logs.map(l => l.details).some(d => d.includes('TERCEIRO_CLIENTE'))).toBe(true);
  });

  it('não audita restauro de um só contrato sem adopções', async () => {
    await restoreBackupSnapshot([linha(TENANT, 'A'), linha('CICOPAL', 'B')]);

    expect(await db.audit_logs.count()).toBe(0);
  });
});
