// ============================================================================
// erroNuvem.test.ts — o erro da nuvem deixa de ser «Erro de esquema.».
//
// O PostgREST devolve `{ code, message, details, hint }` (não é um `Error`) e,
// numa resposta vazia, nenhum desses campos. O formatador tem de mostrar o que
// veio — código, mensagem, detalhe, dica, HTTP — e, quando não veio nada, dizer
// exactamente isso. Nunca inventar uma causa nem devolver string vazia.
// ============================================================================
import { describe, it, expect } from 'vitest';
import { descreverErroNuvem } from '../utils/erroNuvem';

describe('descreverErroNuvem', () => {
  it('mostra código, mensagem, detalhe e dica do PostgREST', () => {
    expect(
      descreverErroNuvem({
        code: '42501',
        message: 'permission denied for table dics',
        details: 'role authenticated lacks INSERT',
        hint: 'ver GRANTs da tabela'
      })
    ).toBe(
      '[42501] permission denied for table dics · detalhe: role authenticated lacks INSERT · dica: ver GRANTs da tabela'
    );
  });

  it('código sem mensagem não desaparece nem vira «Erro de esquema.»', () => {
    expect(descreverErroNuvem({ code: 'PGRST205', message: '  ' })).toBe(
      '[PGRST205] (sem mensagem do servidor)'
    );
  });

  it('estado HTTP sem mensagem aparece como HTTP N', () => {
    expect(descreverErroNuvem({ status: 401 })).toBe('(sem mensagem do servidor) · HTTP 401');
  });

  it('resposta vazia é dita por extenso, não interpretada', () => {
    expect(descreverErroNuvem({})).toBe('resposta sem código nem mensagem do servidor');
  });

  it('objeto com campos desconhecidos mostra o corpo em vez de o esconder', () => {
    expect(descreverErroNuvem({ foo: 'bar' })).toBe('erro sem código nem mensagem: {"foo":"bar"}');
  });

  it('erro de rede conserva o nome e a mensagem', () => {
    expect(descreverErroNuvem(new TypeError('Failed to fetch'))).toBe('TypeError: Failed to fetch');
  });

  it('erro sem mensagem não devolve string vazia', () => {
    expect(descreverErroNuvem(new Error(''))).toBe('(sem mensagem do servidor)');
  });

  it('texto vazio ou em branco é identificado como tal', () => {
    expect(descreverErroNuvem('   ')).toBe('erro sem texto');
  });

  it('sem erro nenhum não se inventa um', () => {
    expect(descreverErroNuvem(null)).toBe('resposta vazia da nuvem (sem erro nem dados)');
    expect(descreverErroNuvem(undefined)).toBe('resposta vazia da nuvem (sem erro nem dados)');
  });
});
