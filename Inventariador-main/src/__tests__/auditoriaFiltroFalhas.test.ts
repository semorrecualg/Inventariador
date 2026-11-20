// src/__tests__/auditoriaFiltroFalhas.test.ts
// ============================================================================
// «SÓ FALHAS DE ENVIO» NA TRILHA DE AUDITORIA
//
// A aba «Ativos» pintava as recusas do envio a vermelho, mas não havia como
// isolar só essas linhas nem levá-las dali. O filtro e a exportação vivem em
// `utils/falhasDeEnvio` para poderem ser verificados sem renderizar a trilha.
// As colunas do ficheiro são o contrato: `primarykey`, `motivo`, `data`.
// ============================================================================
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  falhasDeEnvio,
  falhasDeEnvioCsv,
  falhasDeEnvioJson,
  linhasDeFalha,
} from '../utils/falhasDeEnvio';

const falha = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  action: 'SYNC_RECORD_FAIL',
  record_id: '01010100000005000001',
  details: 'new row violates row-level security policy (42501)',
  timestamp: '2026-11-20T09:00:00.000Z',
  ...over,
});

const conferencia = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  action: 'UPDATE',
  record_id: '01010100000005000002',
  details: 'Conferência registada no campo',
  timestamp: '2026-11-20T09:05:00.000Z',
  ...over,
});

describe('falhasDeEnvio — o filtro da aba «Ativos»', () => {
  it('deixa passar a recusa e descarta a conferência', () => {
    const logs = [conferencia(), falha(), conferencia({ record_id: 'X-2' })];

    const resultado = falhasDeEnvio(logs);

    expect(resultado).toHaveLength(1);
    expect(resultado[0]).toBe(logs[1]);
  });

  it('aceita as duas ações de recusa, seja qual for a caixa', () => {
    const logs = [
      falha({ action: 'SYNC_RECORD_FAIL' }),
      falha({ action: 'sync_record_exception' }),
      falha({ action: 'SYNC_PUSH' }),
    ];

    expect(falhasDeEnvio(logs)).toHaveLength(2);
  });

  it('não inventa falhas numa lista sem nenhuma', () => {
    expect(falhasDeEnvio([conferencia()])).toEqual([]);
    expect(falhasDeEnvio([])).toEqual([]);
  });
});

describe('exportação das falhas — as três colunas', () => {
  it('o CSV traz o cabeçalho e a linha da falha', () => {
    const csv = falhasDeEnvioCsv([falha()]);

    expect(csv.split('\n')[0]).toBe('primarykey,motivo,data');
    expect(csv).toContain('"01010100000005000001"');
    expect(csv).toContain('"new row violates row-level security policy (42501)"');
    expect(csv).toContain('"2026-11-20T09:00:00.000Z"');
  });

  it('o CSV exporta só as falhas, mesmo com a lista completa', () => {
    const csv = falhasDeEnvioCsv([conferencia(), falha()]);
    const linhas = csv.split('\n');

    expect(linhas).toHaveLength(2);
    expect(csv).not.toContain('01010100000005000002');
  });

  it('aspas no motivo não partem o CSV', () => {
    const csv = falhasDeEnvioCsv([
      falha({ details: 'recusado pela política "tenant_isolation"' }),
    ]);

    expect(csv.split('\n')[1]).toContain('""tenant_isolation""');
  });

  it('registo antigo sem motivo nem chave própria não fica com célula vazia', () => {
    const [linha] = linhasDeFalha([falha({ record_id: '', primarykey: undefined, details: '' })]);

    expect(linha).toEqual({ primarykey: '—', motivo: 'sem motivo registado', data: '2026-11-20T09:00:00.000Z' });
  });

  it('a chave vem do campo próprio quando a origem o traz', () => {
    const [linha] = linhasDeFalha([falha({ primarykey: 'PK-9', record_id: 'OUTRA' })]);

    expect(linha.primarykey).toBe('PK-9');
  });

  it('o JSON traz um objeto por falha, com as mesmas três chaves', () => {
    const json = JSON.parse(falhasDeEnvioJson([conferencia(), falha()]));

    expect(json).toEqual([
      {
        primarykey: '01010100000005000001',
        motivo: 'new row violates row-level security policy (42501)',
        data: '2026-11-20T09:00:00.000Z',
      },
    ]);
  });
});

describe('trilha de auditoria — o filtro e o export estão ligados ao ecrã', () => {
  const fonte = readFileSync(join(process.cwd(), 'src', 'components', 'AuditLogs.tsx'), 'utf8');

  it('o ecrã filtra pela mesma regra do resto da app', () => {
    expect(fonte).toContain('ehFalhaDeEnvio(log.action)');
    expect(fonte).toContain('const [onlyFailures, setOnlyFailures] = useState(false)');
  });

  it('o ecrã oferece a exportação das falhas em CSV e JSON', () => {
    expect(fonte).toContain('falhasDeEnvioCsv(linhas)');
    expect(fonte).toContain('falhasDeEnvioJson(linhas)');
    expect(fonte).toContain('exportarFalhas(\'csv\')');
    expect(fonte).toContain('exportarFalhas(\'json\')');
  });
});
