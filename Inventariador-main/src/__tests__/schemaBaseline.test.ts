// src/__tests__/schemaBaseline.test.ts
// CONTRATO DE CONGELAMENTO DO SCHEMA LOCAL (Fase 0 — docs/MIGRACAO_HIBRIDA.md).
//
// Trava o baseline canônico `InventoryLocalStore` v4:
//  - `db.verno === 4`
//  - conjunto exato das 9 tabelas Dexie
//  - assinatura de chave primária + índices de cada tabela (order-insensitive)
//  - os 21 canônicos do contrato de carga presentes em DB_ASSET_COLUMNS
//
// Referência congelada: docs/SCHEMA_BASELINE.md. Qualquer evolução do schema exige
// nova version(n) no InventoryDexieDatabase, atualização do doc E deste contrato.
import { describe, it, expect } from 'vitest';
import type { Table } from 'dexie';
import { db } from '../services/sqliteService';
import { DB_ASSET_COLUMNS } from '../constants/schema';

/** Serializa o keyPath (string | string[] | undefined) para a notação canônica Dexie. */
function keyPathString(keyPath: string | string[] | undefined): string {
  if (keyPath === undefined) return '';
  return Array.isArray(keyPath) ? `[${keyPath.join('+')}]` : String(keyPath);
}

/** Assinatura da tabela: primária (+auto) seguida dos índices declarados. */
function tableSignature(table: Table): string {
  const prim = table.schema.primKey;
  const pk = (prim.auto ? '++' : '') + keyPathString(prim.keyPath);
  const indexes = table.schema.indexes
    .map((i) => keyPathString(i.keyPath))
    .sort();
  return [pk, ...indexes].join(', ');
}

/** Comparação order-insensitive (a ordem dos índices declarados não é contrato). */
function normalize(sig: string): string {
  return sig
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .sort()
    .join(', ');
}

// Baseline congelado (docs/SCHEMA_BASELINE.md §2) — schema v4 canônico `tenantid`.
const BASELINE: Record<string, string> = {
  local_assets: 'primarykey, [tenantid+filial], filial, _is_synced',
  ativos: 'primarykey, [tenantid+filial], filial, _is_synced',
  assets: 'primarykey, [tenantid+filial], filial, _is_synced',
  audit_logs: 'id, updated_at',
  campaigns: 'id, tenantid',
  SYSTEM_CONTEXT: 'key',
  unit_configs: 'id, filial',
  campaign_snapshots: 'id, campaign_id',
  addresses: '++id, [tenantid+filial], codigo_endereco, setor, bloco, _is_synced'
};

// Contrato do loader: exatamente 21 colunas canônicas (nome e ordem fixas,
// tenantid na posição 0 — docs/ARCHITECTURE.md §7.2).
const LOADER_CONTRACT_21 = [
  'tenantid', 'filial', 'status', 'etiqueta', 'qt',
  'descricaodoativo', 'serial', 'dataaqusic', 'cnpj', 'nomefornecedor',
  'notafiscal', 'endereco', 'registro', 'subreg', 'databaixa',
  'contacontabil', 'primarykey', 'centrodecusto', 'vlraquisic', 'sn1_recno', 'sn3_recno'
];

describe('schemaBaseline — congelamento do InventoryLocalStore (Fase 0)', () => {
  it('banco canônico `InventoryLocalStore` na versão de schema v4', () => {
    expect(db.name).toBe('InventoryLocalStore');
    expect(db.verno).toBe(4);
  });

  it('conjunto exato de 9 tabelas (sem tabelas órfãs nem faltantes)', () => {
    const names = db.tables.map((t) => t.name).sort();
    expect(names).toEqual(Object.keys(BASELINE).sort());
  });

  it('assinatura de chave primária + índices de cada tabela corresponde ao baseline v4', () => {
    for (const table of db.tables) {
      expect(normalize(tableSignature(table)), `tabela: ${table.name}`).toBe(
        normalize(BASELINE[table.name])
      );
    }
  });

  it('DB_ASSET_COLUMNS contém os 21 canônicos do contrato de carga', () => {
    for (const col of LOADER_CONTRACT_21) {
      expect(DB_ASSET_COLUMNS, `coluna do contrato ausente: ${col}`).toContain(col);
    }
  });
});
