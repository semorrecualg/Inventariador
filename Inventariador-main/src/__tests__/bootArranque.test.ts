// @vitest-environment jsdom
// ============================================================================
// bootArranque.test.ts — provas da blindagem do arranque.
//
// Cobre o que se viu no F5 de 23/11:
//  - um 503 em `/src/App.tsx` cai como «Failed to fetch dynamically imported
//    module» e tem de ser repetido (ou recarregado uma única vez);
//  - o relançamento não pode virar ciclo (guarda em sessionStorage);
//  - o loader estático tem de sair do caminho quando o app entra em erro;
//  - o vigia do arranque tem de limpar os TRÊS sinais do splash, `authLoading`
//    incluído — era o que ficava a segurar a tela para sempre;
//  - `blocked`/`versionchange` do Dexie fecham a ligação em vez de esperar.
// ============================================================================
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  CHAVE_RECARGA_BOOT,
  JANELA_RECARGA_MS,
  carregarComRetry,
  ehErroDeModulo,
  marcarRecargaBootstrap,
  podeRecarregarBootstrap,
  recarregarBootstrapUmaVez,
  registarGuardasDexie,
  removerLoaderDeArranque,
  vigiarArranque,
  type ArmazenamentoSimples,
  type MotivoBloqueioDexie,
} from '../utils/bootArranque';

const armazenamentoFalso = (inicial: Record<string, string> = {}): ArmazenamentoSimples & {
  dados: Record<string, string>;
} => {
  const dados = { ...inicial };
  return {
    dados,
    getItem: (chave: string) => (chave in dados ? dados[chave] : null),
    setItem: (chave: string, valor: string) => {
      dados[chave] = valor;
    },
  };
};

const erroDeModulo = () =>
  new TypeError(
    'Failed to fetch dynamically imported module: https://exemplo.test/src/App.tsx',
  );

describe('ehErroDeModulo', () => {
  it('reconhece as falhas de carregamento de módulo do browser e do Vite', () => {
    expect(ehErroDeModulo(erroDeModulo())).toBe(true);
    expect(ehErroDeModulo(new Error('Importing a module script failed.'))).toBe(true);
    expect(ehErroDeModulo(new Error('Loading chunk 17 failed.'))).toBe(true);
    expect(ehErroDeModulo(new Error('504 Outdated Optimize Dep'))).toBe(true);
  });

  it('não confunde um erro de código com uma falha de rede', () => {
    expect(ehErroDeModulo(new TypeError("Cannot read properties of undefined (reading 'id')"))).toBe(false);
    expect(ehErroDeModulo(new Error('Invalid supabaseUrl'))).toBe(false);
    expect(ehErroDeModulo(null)).toBe(false);
  });
});

describe('carregarComRetry', () => {
  it('devolve o módulo à segunda tentativa depois de uma falha de rede', async () => {
    const carregar = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(erroDeModulo())
      .mockResolvedValueOnce('App');
    const dormir = vi.fn<(ms: number) => Promise<void>>(async () => {});

    await expect(carregarComRetry(carregar, { dormir })).resolves.toBe('App');
    expect(carregar).toHaveBeenCalledTimes(2);
    expect(dormir).toHaveBeenCalledWith(300);
  });

  it('esgota as tentativas e propaga o último erro', async () => {
    const carregar = vi.fn<() => Promise<string>>().mockRejectedValue(erroDeModulo());
    const dormir = vi.fn<(ms: number) => Promise<void>>(async () => {});

    await expect(carregarComRetry(carregar, { tentativas: 3, dormir })).rejects.toThrow(
      /Failed to fetch dynamically imported module/,
    );
    expect(carregar).toHaveBeenCalledTimes(3);
    // espera crescente: 300 ms e 600 ms, nunca entre a última falha e o throw
    expect(dormir.mock.calls.map(([ms]) => ms)).toEqual([300, 600]);
  });

  it('não repete um erro que não é de módulo', async () => {
    const bug = new TypeError("Cannot read properties of undefined (reading 'id')");
    const carregar = vi.fn<() => Promise<string>>().mockRejectedValue(bug);
    const dormir = vi.fn<(ms: number) => Promise<void>>(async () => {});

    await expect(carregarComRetry(carregar, { tentativas: 3, dormir })).rejects.toBe(bug);
    expect(carregar).toHaveBeenCalledTimes(1);
    expect(dormir).not.toHaveBeenCalled();
  });
});

describe('recarga automática do arranque', () => {
  it('recarrega uma vez e trava a segunda dentro da janela', () => {
    const armazenamento = armazenamentoFalso();
    const recarregar = vi.fn();

    expect(
      recarregarBootstrapUmaVez({ armazenamento, agora: 1_000, recarregar }),
    ).toBe(true);
    expect(
      recarregarBootstrapUmaVez({ armazenamento, agora: 5_000, recarregar }),
    ).toBe(false);

    expect(recarregar).toHaveBeenCalledTimes(1);
    expect(armazenamento.dados[CHAVE_RECARGA_BOOT]).toBe('1000');
  });

  it('volta a permitir depois da janela de guarda', () => {
    const armazenamento = armazenamentoFalso();
    marcarRecargaBootstrap(armazenamento, 1_000);

    expect(podeRecarregarBootstrap(armazenamento, 1_000 + JANELA_RECARGA_MS)).toBe(false);
    expect(podeRecarregarBootstrap(armazenamento, 1_000 + JANELA_RECARGA_MS + 1)).toBe(true);
  });

  it('sem armazenamento disponível não bloqueia o arranque', () => {
    expect(podeRecarregarBootstrap(null, 10)).toBe(true);
    expect(recarregarBootstrapUmaVez({ armazenamento: null, recarregar: () => {} })).toBe(true);
  });
});

describe('removerLoaderDeArranque', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('tira o loader estático do caminho do cartão de erro', () => {
    const loader = document.createElement('div');
    loader.id = 'gbr-initial-loader';
    document.body.appendChild(loader);

    expect(removerLoaderDeArranque(document)).toBe(true);
    expect(document.getElementById('gbr-initial-loader')).toBeNull();
  });

  it('devolve false quando já não há loader (chamada repetida)', () => {
    expect(removerLoaderDeArranque(document)).toBe(false);
  });
});

describe('vigiarArranque', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('liberta a tela quando o init passa do limite — inclusive o authLoading', () => {
    const sinais = { isInitializing: true, authLoading: true, sqliteLoading: true };
    const liberar = vi.fn(() => {
      sinais.isInitializing = false;
      sinais.authLoading = false;
      sinais.sqliteLoading = false;
    });

    vigiarArranque({
      atrasoMs: 6000,
      estaBloqueado: () => sinais.isInitializing,
      liberar,
    });

    vi.advanceTimersByTime(5999);
    expect(liberar).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(liberar).toHaveBeenCalledTimes(1);
    expect(sinais).toEqual({ isInitializing: false, authLoading: false, sqliteLoading: false });
  });

  it('não liberta quando o init já terminou', () => {
    const liberar = vi.fn();
    vigiarArranque({ atrasoMs: 6000, estaBloqueado: () => false, liberar });

    vi.advanceTimersByTime(6000);
    expect(liberar).not.toHaveBeenCalled();
  });

  it('cancelar impede a libertação depois de o ecrã já estar pronto', () => {
    const liberar = vi.fn();
    const cancelar = vigiarArranque({
      atrasoMs: 6000,
      estaBloqueado: () => true,
      liberar,
    });

    cancelar();
    vi.advanceTimersByTime(6000);
    expect(liberar).not.toHaveBeenCalled();
  });
});

describe('registarGuardasDexie', () => {
  const baseFalsa = () => {
    const handlers: Record<string, () => void> = {};
    return {
      handlers,
      on: (evento: string, cb: () => void) => {
        handlers[evento] = cb;
      },
    };
  };

  it('fecha a ligação quando outra aba segura a base (blocked)', () => {
    const base = baseFalsa();
    const fechar = vi.fn();
    const avisar = vi.fn<(_: MotivoBloqueioDexie, __: string) => void>();

    registarGuardasDexie(base, { fechar, avisar });
    base.handlers.blocked();

    expect(fechar).toHaveBeenCalledTimes(1);
    expect(avisar).toHaveBeenCalledWith('blocked', expect.stringMatching(/outra aba/i));
  });

  it('fecha a ligação quando a versão da base muda noutra aba (versionchange)', () => {
    const base = baseFalsa();
    const fechar = vi.fn();
    const avisar = vi.fn<(_: MotivoBloqueioDexie, __: string) => void>();

    registarGuardasDexie(base, { fechar, avisar });
    base.handlers.versionchange();

    expect(fechar).toHaveBeenCalledTimes(1);
    expect(avisar).toHaveBeenCalledWith('versionchange', expect.stringMatching(/mudou de versão/i));
  });

  it('não deixa uma falha no fecho impedir o aviso', () => {
    const base = baseFalsa();
    const avisar = vi.fn<(_: MotivoBloqueioDexie, __: string) => void>();

    registarGuardasDexie(base, {
      fechar: () => {
        throw new Error('base já fechada');
      },
      avisar,
    });

    expect(() => base.handlers.blocked()).not.toThrow();
    expect(avisar).toHaveBeenCalledTimes(1);
  });
});
