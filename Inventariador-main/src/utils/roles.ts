import { UserRole } from '../types';

/**
 * PAPÉIS LEGADOS — leitura apenas
 *
 * A poda de governança eliminou `GESTOR` (remapeado para `ADMIN` na nuvem por
 * `docs/supabase_migracao_papeis_legados.sql`) e fundiu `AUXILIARY_AUDITOR` em
 * `AUDITOR`. Registos antigos ainda podem chegar com a grafia antiga — por
 * exemplo do SQLite local de um dispositivo que não sincronizou desde a poda.
 *
 * Ler essa grafia como o papel canónico evita que o utilizador perca acesso (ou
 * ganhe escopo) no intervalo até ao remapeamento. Nenhum destes valores é
 * atribuível: não existem no enum `UserRole` nem na tela de Acessos.
 */
const LEGACY_ROLE_ALIASES: Readonly<Record<string, string>> = {
  AUXILIARY_AUDITOR: UserRole.AUDITOR,
};

/** Papel canónico (maiúsculas, sem espaços, com a grafia legada já resolvida). */
export const canonicalRole = (role: string | null | undefined): string => {
  const normalized = String(role || '').trim().toUpperCase();
  return LEGACY_ROLE_ALIASES[normalized] ?? normalized;
};

/**
 * Auditor de campo (Trilha B + C). Não inclui ADMIN/MASTER, que administram a
 * unidade, nem DEMO/MOBILE_SINGLE, que são fluxos de licença.
 */
export const isFieldAuditorRole = (role: string | null | undefined): boolean =>
  canonicalRole(role) === UserRole.AUDITOR;
