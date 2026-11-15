// ============================================================================
// accessTree — organização da lista do CONTROLE DE ACESSOS
// ----------------------------------------------------------------------------
// Com várias empresas, uma lista plana de perfis deixa de ser navegável. A
// leitura passa a ser em árvore:
//
//   Dono da plataforma   (quem não pertence a contrato)
//   EMPRESA A
//     MASTER do contrato
//       complementares (auditor / auxiliar / operador)
//   EMPRESA B
//     ...
//
// A indentação dos complementares só faz sentido quando o contrato tem MASTER —
// sem ele, o perfil fica no nível da empresa (não há pai para pendurar).
// ============================================================================

import { User, UserRole } from '../types';
import { isAdminEmail } from './authUtils';

export const SEM_GRUPO = 'SEM GRUPO';

export type AccessRow =
  | { kind: 'header'; title: string; subtitle: string; icon: 'owner' | 'company' }
  | { kind: 'user'; user: User; indent?: boolean };

/** Perfis que o usuário logado pode ver (mesma regra de antes: admin vê tudo). */
export const canSeeEveryProfile = (currentUser: User | null | undefined): boolean =>
  isAdminEmail(currentUser?.email) || currentUser?.role === UserRole.ADMIN;

const isOwnerRow = (u: User): boolean =>
  isAdminEmail(u.email) ||
  (!String(u.tenantid || '').trim() && (u.role === UserRole.ADMIN || u.role === UserRole.MASTER));

const byName = (a: User, b: User): number =>
  String(a.name || a.username || '').localeCompare(String(b.name || b.username || ''));

/**
 * Achata os perfis visíveis em linhas de cabeçalho + linhas de usuário, já na
 * ordem de leitura dono → empresa → master → complementares.
 */
export function buildAccessRows(
  users: User[],
  currentUser: User | null | undefined,
): AccessRow[] {
  const visible = users.filter((u) => {
    if (canSeeEveryProfile(currentUser)) return true;
    if (currentUser?.role === UserRole.MASTER) return u.tenantid === currentUser.tenantid;
    return u.email === currentUser?.email;
  });

  const owner = visible.filter(isOwnerRow).sort(byName);
  const rest = visible.filter((u) => !isOwnerRow(u));

  const byTenant = new Map<string, User[]>();
  rest.forEach((u) => {
    const key = String(u.tenantid || '').trim().toUpperCase() || SEM_GRUPO;
    if (!byTenant.has(key)) byTenant.set(key, []);
    byTenant.get(key)!.push(u);
  });

  const rows: AccessRow[] = [];
  rows.push({
    kind: 'header',
    title: 'Dono da plataforma',
    subtitle: owner.length ? `${owner.length}` : '—',
    icon: 'owner',
  });
  owner.forEach((u) => rows.push({ kind: 'user', user: u }));

  Array.from(byTenant.keys())
    .sort((a, b) => (a === SEM_GRUPO ? 1 : b === SEM_GRUPO ? -1 : a.localeCompare(b)))
    .forEach((tenant) => {
      const group = byTenant.get(tenant)!;
      const masters = group.filter((u) => u.role === UserRole.MASTER).sort(byName);
      const others = group.filter((u) => u.role !== UserRole.MASTER).sort(byName);

      rows.push({
        kind: 'header',
        title: tenant === SEM_GRUPO ? 'Sem grupo' : tenant,
        subtitle: `${group.length} ${group.length === 1 ? 'acesso' : 'acessos'}`,
        icon: 'company',
      });

      masters.forEach((u) => rows.push({ kind: 'user', user: u }));
      others.forEach((u) => rows.push({ kind: 'user', user: u, indent: masters.length > 0 }));
    });

  return rows;
}
