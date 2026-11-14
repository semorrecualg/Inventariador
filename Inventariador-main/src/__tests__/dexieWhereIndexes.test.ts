// @vitest-environment node
// ============================================================================
// dexieWhereIndexes.test.ts — guarda contra `where()` em colunas sem índice.
//
// Contexto: `db.ativos.where('currentCampaignId')` e `db.ativos.where('etiqueta')`
// lançam SchemaError e só se manifestam em runtime (exclusão de campanha e
// leitura por código de barras). Este teste varre o código e falha se aparecer
// um `db.<tabela>.where('<coluna>')` cuja coluna não esteja nos índices do
// schema Dexie v7.
// ============================================================================
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** Índices do schema Dexie v7 (`sqliteService.ts`, último `version(N).stores`). */
const SCHEMA: Record<string, string[]> = {
  local_assets: ['[tenantid+primarykey]', 'primarykey', 'filial', '_is_synced', '[tenantid+filial]'],
  ativos: ['[tenantid+primarykey]', 'primarykey', 'filial', '_is_synced', '[tenantid+filial]'],
  assets: ['[tenantid+primarykey]', 'primarykey', 'filial', '_is_synced', '[tenantid+filial]'],
  audit_logs: ['id', 'updated_at'],
  campaigns: ['id', 'tenantid'],
  SYSTEM_CONTEXT: ['key'],
  unit_configs: ['id', 'filial'],
  campaign_snapshots: ['id', 'campaign_id'],
  addresses: ['++id', '[tenantid+filial]', 'codigo_endereco', 'setor', 'bloco', '_is_synced'],
};

const SEM_INDICE = /(?<![\w.])(?!localDb\b|this\b)(\w+)\.(\w+)\.where\(\s*'([^']+)'/g;

function listarFontes(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === '__tests__') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...listarFontes(full));
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

describe('Dexie · where() só em colunas indexadas', () => {
  it('nenhuma query usa coluna fora dos índices do schema', () => {
    const infracoes: string[] = [];

    for (const arquivo of listarFontes(join(process.cwd(), 'src'))) {
      const fonte = readFileSync(arquivo, 'utf8');
      for (const match of fonte.matchAll(SEM_INDICE)) {
        const [, holder, tabela, coluna] = match;
        if (holder !== 'db') continue;
        const indices = SCHEMA[tabela];
        const linha = fonte.slice(0, match.index).split('\n').length;
        if (!indices) {
          infracoes.push(`${arquivo}:${linha} tabela desconhecida '${tabela}'`);
          continue;
        }
        const normalizada = (c: string) => c.replace(/^[+&*]+/, '');
        if (!indices.map(normalizada).includes(normalizada(coluna))) {
          infracoes.push(`${arquivo}:${linha} db.${tabela}.where('${coluna}') — sem índice`);
        }
      }
    }

    expect(infracoes).toEqual([]);
  });
});
