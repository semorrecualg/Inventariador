import type { User } from '../types';

/**
 * RBAC SERVICE — Governança de Acesso por Função (GBR KARDEK)
 *
 * Camada única e canônica de decisão de permissões por papel (UserRole).
 * Substitui a dispersão de checagens inline (isAdmin/isAuditor) por uma
 * matriz declarativa, conforme o "Relatório Canônico de Governança e
 * Mapeamento de Rotinas RBAC".
 *
 * TRILHA A — ADMINISTRATIVO (ADMIN / MASTER)
 * TRILHA B — AUDITORIA E CONCORDÂNCIA (AUDITOR / AUXILIARY_AUDITOR / ADMIN)
 * TRILHA C — OPERAÇÃO DE CAMPO (USER / OPERADOR e demais perfis de campo)
 *
 * Obs.: o arquivo permissionsService.ts continua sendo o que é hoje
 * (permissões de HARDWARE — câmera/GPS) e NÃO deve ser confundido com este.
 */

export type UserPermission =
  // TRILHA A — Administrativo
  | 'manage_campaigns'      // Gestão de Campanhas de Inventário
  | 'configure_fields'      // Parametrização de Campos Editáveis
  | 'configure_qr_code'     // Mapeamento de Estrutura de QR Code
  | 'manage_users'          // Gerenciamento de Acessos e Usuários
  | 'configure_units'       // Configurador e Sincronizador de Filiais
  | 'manage_database'       // Gerenciamento e Limpeza do Banco de Dados
  // TRILHA B — Auditoria e Concordância
  | 'view_reconciliation'   // Conciliação e Reconciliação Contábil
  | 'view_impairment'       // Relatório de Recuperabilidade / Impairment
  | 'view_audit_logs'       // Trilha de Auditoria e Logs de Alteração
  | 'view_soft_delete'      // Relatório de Desmobilização e Deletados
  | 'view_global_performance' // Painel de Performance Global
  | 'sign_documents'        // Coleta de Assinatura Digital de Encerramento
  // TRILHA C — Operação de Campo
  | 'field_inventory'       // Coleta Física / Inventário
  | 'field_labeling'        // Identificação e Etiquetagem
  | 'field_consultation'    // Consulta Rápida / Ficha do Ativo
  | 'field_active_search';  // Busca Ativa por Proximidade/RST

const OWNER_EMAIL = import.meta.env.VITE_ADMIN_EMAIL || '';

/** Permissões completas (TRILHA A + B + C) — ADMIN / MASTER e afins. */
const FULL_PERMISSIONS: ReadonlySet<UserPermission> = new Set<UserPermission>([
  'manage_campaigns',
  'configure_fields',
  'configure_qr_code',
  'manage_users',
  'configure_units',
  'manage_database',
  'view_reconciliation',
  'view_impairment',
  'view_audit_logs',
  'view_soft_delete',
  'view_global_performance',
  'sign_documents',
  'field_inventory',
  'field_labeling',
  'field_consultation',
  'field_active_search',
]);

/** Permissões de auditoria + campo (TRILHA B + C) — AUDITOR / AUXILIARY_AUDITOR. */
const AUDIT_AND_FIELD_PERMISSIONS: ReadonlySet<UserPermission> = new Set<UserPermission>([
  'view_reconciliation',
  'view_impairment',
  'view_audit_logs',
  'view_soft_delete',
  'view_global_performance',
  'sign_documents',
  'field_inventory',
  'field_labeling',
  'field_consultation',
  'field_active_search',
]);

/** Permissões exclusivamente operacionais (TRILHA C) — USER / OPERADOR. */
const FIELD_PERMISSIONS: ReadonlySet<UserPermission> = new Set<UserPermission>([
  'field_inventory',
  'field_labeling',
  'field_consultation',
  'field_active_search',
]);

/** Papéis com governança total (TRILHA A + B + C). */
const FULL_ACCESS_ROLES: ReadonlySet<string> = new Set([
  'ADMIN',
  'MASTER',
  'GESTOR',           // legado: já era tratado como admin em checkIsAdmin
  'DEMO',             // demonstração enxerga tudo (paridade com comportamento atual)
  'MOBILE_SINGLE',    // perfil single-device: já possuía acesso amplo (backup cloud)
]);

/** Papéis de auditoria (TRILHA B + C). */
const AUDITOR_ROLES: ReadonlySet<string> = new Set([
  'AUDITOR',
  'AUXILIARY_AUDITOR',
]);

/** Papéis exclusivamente operacionais de campo (TRILHA C). */
const OPERATOR_ROLES: ReadonlySet<string> = new Set([
  'USER',             // OPERADOR de campo
]);

/** Permissões concedidas por papel. */
const ROLE_PERMISSIONS: Record<string, ReadonlySet<UserPermission>> = {
  ADMIN: FULL_PERMISSIONS,
  MASTER: FULL_PERMISSIONS,
  GESTOR: FULL_PERMISSIONS,
  DEMO: FULL_PERMISSIONS,
  MOBILE_SINGLE: FULL_PERMISSIONS,
  AUDITOR: AUDIT_AND_FIELD_PERMISSIONS,
  AUXILIARY_AUDITOR: AUDIT_AND_FIELD_PERMISSIONS,
  USER: FIELD_PERMISSIONS,
};

/** Papéis desconhecidos (futuros/legados) mantêm a operação de campo — nunca ficam sem acesso. */
const FALLBACK_PERMISSIONS: ReadonlySet<UserPermission> = FIELD_PERMISSIONS;

/** Normaliza o papel para comparação segura (maiúsculas, sem espaços). */
const normalizeRole = (role: string | null | undefined): string =>
  String(role || '').trim().toUpperCase();

/** Indica se o usuário é o proprietário global (email VITE_ADMIN_EMAIL). */
export const isOwnerEmail = (email: string | null | undefined): boolean =>
  !!email && OWNER_EMAIL !== '' && email.toLowerCase() === OWNER_EMAIL.toLowerCase();

/** Papel é administrativo (TRILHA A — governança total). */
export const isAdminRole = (role: string | null | undefined): boolean => {
  const r = normalizeRole(role);
  return FULL_ACCESS_ROLES.has(r) || r === 'ADMIN' || r === 'MASTER';
};

/** Papel é de auditoria (TRILHA B). */
export const isAuditorRole = (role: string | null | undefined): boolean => {
  const r = normalizeRole(role);
  return AUDITOR_ROLES.has(r) || isAdminRole(role);
};

/** Papel é operacional de campo (TRILHA C). */
export const isOperatorRole = (role: string | null | undefined): boolean => {
  const r = normalizeRole(role);
  return OPERATOR_ROLES.has(r) || AUDITOR_ROLES.has(r) || isAdminRole(role);
};

/** Permissões concedidas a um papel (para exibição/diagnóstico). */
export const getRolePermissions = (role: string | null | undefined): ReadonlySet<UserPermission> => {
  const r = normalizeRole(role);
  return ROLE_PERMISSIONS[r] ?? FALLBACK_PERMISSIONS;
};

/**
 * Verifica se um papel possui uma permissão específica.
 * Papéis administrativos sempre possuem TODAS as permissões.
 */
export const hasPermission = (
  role: string | null | undefined,
  permission: UserPermission,
): boolean => {
  const r = normalizeRole(role);
  if (FULL_ACCESS_ROLES.has(r)) return true;
  return getRolePermissions(r).has(permission);
};

/**
 * Verifica se um usuário (objeto User) possui a permissão, respeitando também
 * os flags legados (is_admin/isAdmin) e o email do proprietário global.
 */
export const userHasPermission = (
  user: Pick<Partial<User>, 'role' | 'email' | 'is_admin' | 'isAdmin'> | null | undefined,
  permission: UserPermission,
): boolean => {
  if (!user) return false;
  if (user.is_admin || user.isAdmin || isOwnerEmail(user.email)) return true;
  return hasPermission(user.role, permission);
};

/**
 * Equivalente moderno das checagens inline de "isAdmin" espalhadas no código:
 * ADMIN/MASTER/GESTOR/DEMO/MOBILE_SINGLE + flags legados + email proprietário.
 */
export const isAdminUser = (
  user: Pick<Partial<User>, 'role' | 'email' | 'is_admin' | 'isAdmin'> | null | undefined,
): boolean => {
  if (!user) return false;
  if (user.is_admin || user.isAdmin || isOwnerEmail(user.email)) return true;
  return isAdminRole(user.role);
};

/** Equivalente moderno de "isAuditor || isAdmin". */
export const isAuditorUser = (
  user: Pick<Partial<User>, 'role' | 'email' | 'is_admin' | 'isAdmin'> | null | undefined,
): boolean => {
  if (!user) return false;
  if (user.is_admin || user.isAdmin || isOwnerEmail(user.email)) return true;
  return isAuditorRole(user.role);
};
