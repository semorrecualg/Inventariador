import { describe, it, expect, afterEach, vi } from 'vitest';
import { buildAccessRows, SEM_GRUPO } from '../utils/accessTree';
import { User, UserRole } from '../types';

/**
 * Organização do CONTROLE DE ACESSOS: dono no topo, depois uma secção por
 * empresa (tenantid), com o MASTER do contrato antes dos complementares —
 * estes indentados sob o master. Sem essa ordem a lista fica plana e, com
 * várias empresas, não se localiza nenhum perfil.
 */
const make = (partial: Partial<User>): User => ({
  username: 'user',
  name: 'Usuário',
  email: 'user@empresa.com',
  password: 'x',
  role: UserRole.AUDITOR,
  tenantid: '',
  ...partial,
} as User);

const label = (rows: ReturnType<typeof buildAccessRows>) =>
  rows.map((r) => (r.kind === 'header' ? `#${r.title}` : r.kind === 'user'
    ? `${r.indent ? '  ' : ''}${r.user.username}`
    : ''));

describe('accessTree — organização da lista de acessos', () => {
  afterEach(() => vi.unstubAllEnvs());

  const admins = make({
    username: 'DONO_APP',
    email: 'dono@plataforma.com',
    role: UserRole.ADMIN,
    isAdmin: true,
  });

  const users: User[] = [
    make({ username: 'auditor1', name: 'B Auditor', role: UserRole.AUDITOR, tenantid: 'CICOPAL' }),
    make({ username: 'master1', name: 'A Master', role: UserRole.MASTER, tenantid: 'CICOPAL' }),
    make({ username: 'operador1', name: 'C Operador', role: UserRole.USER, tenantid: 'CICOPAL' }),
    make({ username: 'master2', name: 'D Master', role: UserRole.MASTER, tenantid: 'ACME' }),
    make({ username: 'legado', name: 'E Sem Grupo', role: UserRole.AUDITOR, tenantid: '' }),
    admins,
  ];

  it('abre com o dono da plataforma e a seguir as empresas', () => {
    vi.stubEnv('VITE_ADMIN_EMAIL', 'dono@plataforma.com');
    const rows = buildAccessRows(users, admins);

    expect(rows[0]).toMatchObject({ kind: 'header', title: 'Dono da plataforma' });
    expect(rows[1]).toMatchObject({ kind: 'user' });
    expect(label(rows)[0]).toBe('#Dono da plataforma');
    expect(label(rows)[1]).toBe('DONO_APP');
    expect(label(rows)[2]).toBe('#ACME');
  });

  it('dentro da empresa, MASTER primeiro e complementares indentados', () => {
    vi.stubEnv('VITE_ADMIN_EMAIL', 'dono@plataforma.com');
    const rows = buildAccessRows(users, admins);
    const cicopal = label(rows).filter((_, i) => {
      const start = label(rows).indexOf('#CICOPAL');
      return i >= start;
    });

    expect(cicopal[0]).toBe('#CICOPAL');
    expect(cicopal[1]).toBe('master1');
    expect(cicopal[2]).toBe('  auditor1');
    expect(cicopal[3]).toBe('  operador1');
  });

  it('empresa sem MASTER não indenta ninguém (não há pai)', () => {
    vi.stubEnv('VITE_ADMIN_EMAIL', 'dono@plataforma.com');
    const solo = [make({ username: 'sozinho', role: UserRole.AUDITOR, tenantid: 'SOLO' })];
    const rows = buildAccessRows(solo, admins);
    const idx = label(rows).indexOf('#SOLO');
    expect(label(rows)[idx + 1]).toBe('sozinho');
  });

  it('contrato indefinido fica no fim, na secção «Sem grupo»', () => {
    vi.stubEnv('VITE_ADMIN_EMAIL', 'dono@plataforma.com');
    const rows = buildAccessRows(users, admins);
    const lastHeader = [...rows].reverse().find((r) => r.kind === 'header') as { title: string };
    expect(lastHeader.title).toBe('Sem grupo');
    expect(SEM_GRUPO).toBe('SEM GRUPO');
  });

  it('MASTER continua a ver apenas o próprio contrato', () => {
    vi.stubEnv('VITE_ADMIN_EMAIL', 'dono@plataforma.com');
    const master = users.find((u) => u.username === 'master1')!;
    const rows = buildAccessRows(users, master);
    const usernames = rows.flatMap((r) => (r.kind === 'user' ? [r.user.username] : []));
    expect(usernames).toEqual(expect.arrayContaining(['master1', 'auditor1', 'operador1']));
    expect(usernames).not.toContain('master2');
    expect(usernames).not.toContain('DONO_APP');
  });
});
