// ============================================================================
// tenantCatalog — Catálogo de contratos (tenantid) extraído da BASE
// ----------------------------------------------------------------------------
// Regra do produto: o contrato NÃO é uma entidade cadastrada à parte. Ele é o
// `tenantid` — a primeira coluna da base de ativos — que agrupa as empresas de
// um mesmo grupo, determina quais usuários inventariam aquele conjunto e
// segrega os dados entre clientes.
//
// Este módulo responde à pergunta que faltava: "quais contratos existem?".
// Fontes (nesta ordem):
//   1. base local (Dexie: `local_assets` + `assets`) — os tenantids reais,
//      com as filiais de cada contrato;
//   2. perfis de usuários locais (`localDb.users`) — contratos já vinculados;
//   3. licenças provisionadas (localStorage `gbr_provisioned_tenants`).
//
// Somente leitura: não cria, não altera e não cruza dados entre contratos.
// ============================================================================

import { db } from '../services/sqliteService';
import { localDb } from '../services/localDbService';
import { readProvisionedTenants } from '../services/tenantProvisioningService';

export interface ContractSummary {
  tenantid: string;
  /** Filiais reais do contrato na base local (vazio = contrato sem filial). */
  filiais: string[];
}

/** Sentinelas que nunca representam um contrato real. */
const TENANT_SENTINELS = new Set([
  '',
  'NULL',
  'UNDEFINED',
  'TODAS',
  'DEFAULT',
  '0',
  'GBR_SUPER_ADMIN_CORINGA',
]);

/** Sentinelas que nunca representam uma filial real (espelha workContextUtils). */
const FILIAL_SENTINELS = new Set(['', 'NULL', 'UNDEFINED', 'TODAS', 'DEFAULT', '0']);

const normalize = (value: unknown): string => String(value ?? '').trim().toUpperCase();

/**
 * Lista os contratos (tenantid) conhecidos nesta instalação, com as filiais de
 * cada um, ordenados alfabeticamente. Nunca lança: base indisponível devolve o
 * que for possível reunir dos perfis/licenças.
 */
export async function listContracts(): Promise<ContractSummary[]> {
  // tenantid → (FILIAL em maiúsculas → rótulo original da planilha)
  // A chave em maiúsculas deduplica; o valor preserva a grafia exata da base,
  // necessária para atribuir a filial a um perfil sem perder o vínculo com os
  // ativos (que são gravados com o rótulo original).
  const contractFiliais = new Map<string, Map<string, string>>();

  const add = (tenantRaw: unknown, filialRaw: unknown) => {
    const tenantid = normalize(tenantRaw);
    if (TENANT_SENTINELS.has(tenantid)) return;
    if (!contractFiliais.has(tenantid)) contractFiliais.set(tenantid, new Map<string, string>());
    const filialKey = normalize(filialRaw);
    if (FILIAL_SENTINELS.has(filialKey)) return;
    const filialLabel = String(filialRaw ?? '').trim();
    const filiais = contractFiliais.get(tenantid)!;
    if (!filiais.has(filialKey)) filiais.set(filialKey, filialLabel);
  };

  try {
    await db.local_assets.each((asset) => add(asset.tenantid, asset.filial));
    await db.assets.each((asset) => add(asset.tenantid, asset.filial));
  } catch {
    /* base local indisponível — segue com perfis e licenças */
  }

  try {
    const users = await localDb.users.toArray();
    users.forEach((u) => add(u.tenantid, u.filial));
  } catch {
    /* sem tabela de usuários — segue */
  }

  try {
    readProvisionedTenants().forEach((record) => add(record.tenantid, ''));
  } catch {
    /* registro de licenças indisponível — segue */
  }

  return Array.from(contractFiliais.entries())
    .map(([tenantid, filiais]) => ({
      tenantid,
      filiais: Array.from(filiais.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([, label]) => label),
    }))
    .sort((a, b) => a.tenantid.localeCompare(b.tenantid));
}
