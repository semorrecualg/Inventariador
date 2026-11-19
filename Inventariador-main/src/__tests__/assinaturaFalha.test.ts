// ============================================================================
// assinaturaFalha.test.ts — a mesma recusa não volta à trilha por texto volátil.
//
// `syncService.auditSyncRecordFailure` deduplica por `primarykey|detalhe` numa
// janela de 10 min. O detalhe vinha cru: um id de pedido, um UUID, a data/hora
// ou a linha da pilha mudavam a assinatura a cada tentativa e a mesma recusa era
// registada outra vez em cada ciclo de 60 s. Estes casos fixam o texto estável.
// ============================================================================
import { describe, it, expect } from 'vitest';
import {
  assinaturaDeFalha,
  normalizarDetalheFalha,
  SYNC_FAILURE_SIGNATURE_MAX
} from '../utils/syncFalha';

describe('normalizarDetalheFalha', () => {
  it('troca UUID, data/hora e id de pedido por marcadores', () => {
    const texto = normalizarDetalheFalha(
      'Erro Supabase: [42501] recusa para 3f2a9c1e-8b7d-4e2f-9a10-5c6d7e8f9a0b às 2026-11-19T18:53:08.123Z'
    );

    expect(texto).toContain('<uuid>');
    expect(texto).toContain('<data>');
    expect(texto).not.toContain('3f2a9c1e');
    expect(texto).not.toContain('2026-11-19');
  });

  it('duas mensagens do mesmo erro com ids diferentes dão a mesma assinatura', () => {
    const a = assinaturaDeFalha(
      'PK-1',
      'Erro Supabase: [42501] new row violates row-level security policy (pedido 7c9e6679-7425-40de-944b-e07fc1f90ae7)'
    );
    const b = assinaturaDeFalha(
      'PK-1',
      'Erro Supabase: [42501] new row violates row-level security policy (pedido 0d1b2c3d-4e5f-4a6b-8c9d-0e1f2a3b4c5d)'
    );

    expect(a).toBe(b);
  });

  it('ignora a linha e a coluna de origem da pilha', () => {
    const a = normalizarDetalheFalha('TypeError: rede caiu (syncService.ts:751:13)');
    const b = normalizarDetalheFalha('TypeError: rede caiu (syncService.ts:812:29)');

    expect(a).toBe(b);
    expect(a).toContain('<origem>');
  });

  it('só a primeira linha conta — a pilha muda sempre', () => {
    const a = normalizarDetalheFalha('Erro: falhou\n    at enviar (syncService.ts:751:13)');
    const b = normalizarDetalheFalha('Erro: falhou\n    at enviar (syncService.ts:812:29)');

    expect(a).toBe(b);
    expect(a).not.toContain('at enviar');
  });

  it('erros diferentes continuam com assinaturas diferentes', () => {
    const rls = assinaturaDeFalha('PK-1', 'Erro Supabase: [42501] new row violates row-level security policy');
    const fk = assinaturaDeFalha('PK-1', 'Erro Supabase: [23503] insert violates foreign key constraint');

    expect(rls).not.toBe(fk);
  });

  it('o ativo faz parte da assinatura', () => {
    const details = 'Erro Supabase: [42501] new row violates row-level security policy';

    expect(assinaturaDeFalha('PK-1', details)).not.toBe(assinaturaDeFalha('PK-2', details));
  });

  it('corta o detalhe no limite, sem o deixar crescer sem fim', () => {
    const texto = normalizarDetalheFalha('erro '.repeat(200));

    expect(texto.length).toBeLessThanOrEqual(SYNC_FAILURE_SIGNATURE_MAX);
  });

  it('é idempotente: normalizar o já normalizado não muda nada', () => {
    const umaVez = normalizarDetalheFalha(
      'Erro Supabase: [42501] recusa 7c9e6679-7425-40de-944b-e07fc1f90ae7 em 2026-11-19T18:53:08Z'
    );

    expect(normalizarDetalheFalha(umaVez)).toBe(umaVez);
  });
});
