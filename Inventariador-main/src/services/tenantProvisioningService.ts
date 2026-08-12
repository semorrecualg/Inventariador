import { UserRole, type User } from '../types';
import { validateStrongPassword } from '../utils/passwordPolicy';
import { provisionUserInAuth } from './supabaseService';
import { localDb } from './localDbService';

/**
 * PROVISIONAMENTO DE LICENÇA — GBR KARDEK
 *
 * Fluxo comercial: o DONO (admin/proprietário) vende uma licença a um novo
 * cliente → cria um novo TENANT e o usuário MASTER desse contrato.
 * O MASTER (autenticação completa, senha forte validada) passa a administrar
 * os sub-usuários de "login rápido" do próprio tenant (ver UserManagement).
 *
 *  - `buildLicenseProvisionPlan` — lógica pura (validável por teste).
 *  - `provisionLicense` — orquestra nuvem (Supabase Auth + user_permissions)
 *    e reflexo local (localDb.users + registro de licenças).
 *  - Registro local de licenças: localStorage `gbr_provisioned_tenants`.
 */

const TENANT_REGISTRY_KEY = 'gbr_provisioned_tenants';

export interface LicenseProvisionInput {
  clientName: string;
  masterEmail: string;
  masterUsername: string;
  masterName?: string;
  masterPassword: string;
  units?: string[];
}

export interface LicenseProvisionPlan {
  valid: boolean;
  tenantid: string;
  errors: string[];
  master?: User;
}

export interface ProvisionedTenantRecord {
  tenantid: string;
  clientName: string;
  masterEmail: string;
  createdAt: string;
}

export interface LicenseProvisionResult {
  success: boolean;
  tenantid: string;
  masterEmail: string;
  message: string;
  warnings?: string[];
}

/** Normaliza o nome do cliente para o tenantid canônico (sem acentos, maiúsculo, alfanumérico). */
export const normalizeTenantId = (clientName: string): string =>
  (clientName || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 20);

const isValidEmail = (email: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

/**
 * Lógica pura do provisionamento: valida entradas, deriva o tenantid e monta
 * o perfil MASTER. Não toca em I/O — testável em isolamento.
 */
export const buildLicenseProvisionPlan = (
  input: LicenseProvisionInput,
  existing: { tenants: string[]; emails: string[]; usernames: string[] },
): LicenseProvisionPlan => {
  const errors: string[] = [];
  const tenantid = normalizeTenantId(input.clientName || '');

  if (!input.clientName?.trim()) {
    errors.push('Informe o nome do cliente.');
  }
  if (!tenantid) {
    errors.push('Não foi possível derivar o tenantid do nome do cliente.');
  }
  if (tenantid && existing.tenants.some((t) => t.toUpperCase() === tenantid)) {
    errors.push(`Já existe uma licença para o tenant ${tenantid}.`);
  }

  const email = (input.masterEmail || '').trim().toLowerCase();
  if (!isValidEmail(email)) {
    errors.push('E-mail do MASTER inválido.');
  } else if (existing.emails.some((e) => e.toLowerCase() === email)) {
    errors.push('Este e-mail já está cadastrado no sistema.');
  }

  const username = (input.masterUsername || '').trim().toLowerCase();
  if (!username) {
    errors.push('Informe o username do MASTER.');
  } else if (existing.usernames.some((u) => u.toLowerCase() === username)) {
    errors.push('Este username já está em uso.');
  }

  const pw = validateStrongPassword(input.masterPassword || '');
  if (!pw.valid) {
    errors.push(`Senha forte obrigatória: ${pw.errors.join('; ')}.`);
  }

  const valid = errors.length === 0;
  const master: User | undefined = valid
    ? {
        username,
        name: (input.masterName || '').trim() || username,
        email,
        password: input.masterPassword,
        role: UserRole.MASTER,
        is_admin: true,
        isAdmin: true,
        mustChangePassword: true,
        tenantid,
        filial: input.units?.[0] || '',
        units: input.units || [],
      }
    : undefined;

  return { valid, tenantid, errors, master };
};

/** Lê o registro local de licenças provisionadas (localStorage). */
export const readProvisionedTenants = (): ProvisionedTenantRecord[] => {
  try {
    const raw = localStorage.getItem(TENANT_REGISTRY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

/** Registra (ou atualiza) uma licença no registro local. */
export const recordProvisionedTenant = (record: ProvisionedTenantRecord): void => {
  const all = readProvisionedTenants();
  const without = all.filter((r) => r.tenantid !== record.tenantid);
  without.push(record);
  localStorage.setItem(TENANT_REGISTRY_KEY, JSON.stringify(without));
};

/**
 * Orquestra o provisionamento de ponta a ponta:
 *  1. valida (plano puro) contra dados existentes (local + nuvem);
 *  2. cria o MASTER no Supabase Auth (role MASTER + tenantid);
 *  3. persiste o MASTER localmente (localDb.users) + registro de licença.
 *
 * Filosofia local-first: se a nuvem falhar, o MASTER ainda é criado localmente
 * e o aviso é devolvido em `warnings` (o usuário pode reativar depois).
 */
export const provisionLicense = async (
  input: LicenseProvisionInput,
): Promise<LicenseProvisionResult> => {
  const localUsers = await localDb.users.toArray();
  const existing = {
    tenants: [
      ...new Set([
        ...readProvisionedTenants().map((r) => r.tenantid),
        ...localUsers.map((u) => (u.tenantid || '').toUpperCase()).filter(Boolean),
      ]),
    ],
    emails: localUsers.map((u) => u.email),
    usernames: localUsers.map((u) => u.username),
  };

  const plan = buildLicenseProvisionPlan(input, existing);
  if (!plan.valid || !plan.master) {
    return {
      success: false,
      tenantid: plan.tenantid,
      masterEmail: (input.masterEmail || '').trim().toLowerCase(),
      message: plan.errors.join(' '),
    };
  }

  const master = plan.master;
  const warnings: string[] = [];

  // 1. Nuvem: provisiona o MASTER no Supabase Auth + perfil user_permissions
  try {
    const result = await provisionUserInAuth(
      master.email,
      master.password,
      master.username,
      'MASTER',
      master.tenantid,
      master.name,
      master.filial,
      master.units,
    );
    if (result && result.existing) {
      warnings.push('O e-mail do MASTER já existia na nuvem; permissões sincronizadas.');
    }
  } catch (err) {
    warnings.push(
      `Não foi possível ativar o MASTER na nuvem agora: ${
        err instanceof Error ? err.message : String(err)
      }. Criado localmente — reative depois em Acessos.`,
    );
  }

  // 2. Reflexo local: usuário MASTER + registro de licença
  try {
    await localDb.users.add(master);
  } catch (err) {
    warnings.push(
      `Falha ao persistir o MASTER no armazenamento local: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
  recordProvisionedTenant({
    tenantid: master.tenantid,
    clientName: (input.clientName || '').trim(),
    masterEmail: master.email,
    createdAt: new Date().toISOString(),
  });

  return {
    success: true,
    tenantid: master.tenantid,
    masterEmail: master.email,
    message: `Licença provisionada: tenant ${master.tenantid} com o MASTER ${master.email}.`,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
};
