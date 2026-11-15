// @vitest-environment node
// ============================================================================
// syncError.test.ts — o erro mostrado ao operador é o erro real.
// ============================================================================
import { describe, it, expect } from 'vitest';
import { mensagemDeErroDeSync } from '../utils/syncError';

describe('mensagemDeErroDeSync', () => {
  it('usa a mensagem do Error', () => {
    expect(mensagemDeErroDeSync(new Error('Tempo esgotado a ler a página 3 de ativos (45s).')))
      .toBe('Falha ao sincronizar com a nuvem: Tempo esgotado a ler a página 3 de ativos (45s).');
  });

  it('usa a mensagem de um erro do PostgREST (objeto simples)', () => {
    expect(mensagemDeErroDeSync({ code: '42501', message: 'permission denied for table assets' }))
      .toBe('Falha ao sincronizar com a nuvem: permission denied for table assets');
  });

  it('aceita string', () => {
    expect(mensagemDeErroDeSync('  load failed  ')).toBe('Falha ao sincronizar com a nuvem: load failed');
  });

  it('sem detalhe, não inventa contingência', () => {
    const texto = mensagemDeErroDeSync(undefined);
    expect(texto).toBe('Falha ao sincronizar com a nuvem. Tente novamente.');
    expect(texto.toLowerCase()).not.toContain('contingência');
    expect(texto.toLowerCase()).not.toContain('webview');
  });

  it('ignora mensagens em branco', () => {
    expect(mensagemDeErroDeSync(new Error('   '))).toBe('Falha ao sincronizar com a nuvem. Tente novamente.');
  });
});
