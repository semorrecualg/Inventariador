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
import { normalizeKey } from './schema';
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
    // Deduplica a MESMA filial nas várias grafias da base (`010101_CICOPAL_GO`
    // vs `010101 CICOPAL GO`): a config operacional e os ativos convivem com as
    // duas, e o catálogo não pode devolver dois cartões da mesma unidade.
    const filialKey = normalizeKey(filialRaw);
    if (FILIAL_SENTINELS.has(filialKey)) return;
    const filialLabel = String(filialRaw ?? '').trim();
    const filiais = contractFiliais.get(tenantid)!;
    if (!filiais.has(filialKey)) filiais.set(filialKey, filialLabel);
  };

  try {
    // A.3a.1: `local_assets` já traz o mesmo contrato/filial que `assets`
    // trazia — a segunda varredura era o terceiro espelho a alimentar o
    // catálogo com linhas antigas.
    await db.local_assets.each((asset) => add(asset.tenantid, asset.filial));
  } catch {
    /* base local indisponível — segue com perfis e licenças */
  }

  // CONFIGURAÇÃO OPERACIONAL: uma filial com âncora GPS ou campanha gravada
  // existe no contrato mesmo quando a tabela de ativos ainda não foi baixada.
  // Sem esta fonte, o seletor mostrava o contrato CICOPAL com «SEM FILIAL NA
  // BASE» num aparelho que tinha as âncoras e as campanhas das filiais.
  try {
    await db.unit_configs.each((config) => {
      const row = config as unknown as { tenantid?: unknown; filial?: unknown; unit_id?: unknown };
      add(row.tenantid, row.filial || row.unit_id);
    });
  } catch {
    /* sem tabela/registros de unidades operacionais — segue */
  }

  try {
    await db.campaigns.each((campaign) => {
      const row = campaign as unknown as { tenantid?: unknown; filial?: unknown; unit_id?: unknown; _unitid?: unknown };
      add(row.tenantid, row.filial || row.unit_id || row._unitid);
    });
  } catch {
    /* sem tabela/registros de campanhas — segue */
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
