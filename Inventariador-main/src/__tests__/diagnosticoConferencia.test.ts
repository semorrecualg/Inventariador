// ============================================================================
// diagnosticoConferencia.test.ts — o SQL de diagnóstico não pode escrever.
//
// `scripts/assets-conferencia-diagnostico.sql` é o passo de verificação da
// conferência na nuvem: corre inteiro no SQL Editor e tem de poder ser repetido
// sem efeito colateral. Um UPDATE que entrasse ali por engano (um backfill
// "para arrumar") passaria despercebido, porque ninguém executa o ficheiro na
// suíte. Este gate lê o ficheiro como texto e falha se sobrar DML/DDL fora dos
// comentários — e falha também se o passo a passo do documento deixar de citar
// os blocos que o SQL tem, ou se o marcador legado divergir da migração.
// ============================================================================
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const ler = (caminho: string) => readFileSync(new URL(caminho, import.meta.url), 'utf8');

const sql = ler('../../scripts/assets-conferencia-diagnostico.sql');
const migracao = ler('../../scripts/assets-conferencia.sql');
const doc = ler('../../docs/DIAGNOSTICO_CONFERENCIA.md');

/** SQL sem comentários: é o que o Postgres executaria. */
const codigo = sql.replace(/--[^\n]*/g, '');

/** Qualquer instrução com efeito na base. `updated_at` não casa (`\b`). */
const ESCRITA =
  /\b(?:insert|update|delete|alter|drop|truncate|create|grant|revoke|copy|call|do|vacuum|reindex|cluster)\b/i;

/** Os sinais de conferência que a migração usa e o diagnóstico tem de espelhar. */
const MARCADOR_LEGADO = [
  "UPPER(COALESCE(status, '')) LIKE '%CONFERIDO%'",
  "UPPER(COALESCE(status, '')) = 'SIM'"
];

const semEspacos = (texto: string) => texto.replace(/\s+/g, ' ');

describe('SQL de diagnóstico da conferência', () => {
  it('é somente leitura (nenhum DML/DDL fora dos comentários)', () => {
    expect(codigo.trim().length).toBeGreaterThan(0);
    expect(codigo).not.toMatch(ESCRITA);
  });

  it('verifica as colunas e o índice que a migração cria', () => {
    const migracaoSemEspacos = semEspacos(migracao);

    expect(migracaoSemEspacos).toContain('ADD COLUMN IF NOT EXISTS conferido');
    expect(migracaoSemEspacos).toContain('assets_tenant_conferido_idx');

    for (const coluna of ['conferido', 'auditor', 'data_leitura']) {
      expect(codigo).toContain(coluna);
    }
    expect(codigo).toContain('public.assets');
    expect(codigo).toContain("'assets_tenant_conferido_idx'");
  });

  it('lê o marcador legado exatamente como a migração', () => {
    const codigoSemEspacos = semEspacos(codigo);
    const migracaoSemEspacos = semEspacos(migracao);

    for (const marcador of MARCADOR_LEGADO) {
      expect(migracaoSemEspacos).toContain(marcador);
      expect(codigoSemEspacos).toContain(marcador);
    }
  });

  it('o passo a passo cita todos os blocos do ficheiro', () => {
    const blocos = Array.from(new Set(sql.match(/\b[A-E]\.\d\b/g) ?? []));

    // A.1–A.3, B.1–B.4, C.1–C.2, D.1–D.2 e o veredicto E.
    expect(blocos.length).toBeGreaterThanOrEqual(11);
    for (const bloco of blocos) {
      expect(doc).toContain(bloco);
    }
    expect(doc).toContain('scripts/assets-conferencia-diagnostico.sql');
  });
});
