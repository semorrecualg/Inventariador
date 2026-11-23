// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { AppScreen } from '../types';
import { pathToScreen, screenToPath, telaDoHash } from '../router/routes';
import {
  escreverHash,
  historicoDeAncoragem,
  proximaPilha,
} from '../utils/navegacaoHash';

beforeEach(() => {
  window.location.hash = '';
});

describe('telaDoHash — a URL diz em que tela o app está', () => {
  it('reconhece todas as rotas (inverso exato de screenToPath)', () => {
    const falhas = Object.values(AppScreen)
      .map((tela) => ({ tela, lida: telaDoHash(`#${screenToPath[tela]}`) }))
      .filter(({ tela, lida }) => lida !== tela);
    expect(falhas).toEqual([]);
    expect(Object.keys(pathToScreen)).toHaveLength(Object.values(AppScreen).length);
  });

  it('ignora hash vazio, raiz e rota desconhecida', () => {
    expect(telaDoHash('')).toBeNull();
    expect(telaDoHash('#')).toBeNull();
    expect(telaDoHash('#/')).toBeNull();
    expect(telaDoHash('#/nao-existe')).toBeNull();
  });

  it('resolve a rota com prefixo do detalhe do ativo', () => {
    expect(telaDoHash('#/asset/ABC123')).toBe(AppScreen.ASSET_DETAIL);
    expect(telaDoHash('#/asset/')).toBe(AppScreen.ASSET_DETAIL);
  });

  it('aceita barra final e query string', () => {
    expect(telaDoHash('#/audit-logs/')).toBe(AppScreen.AUDIT_LOGS);
    expect(telaDoHash('#/audit-logs?aba=ativos')).toBe(AppScreen.AUDIT_LOGS);
    expect(telaDoHash('/audit-logs')).toBe(AppScreen.AUDIT_LOGS);
  });
});

describe('historicoDeAncoragem — F5 cai na tela pedida pela URL', () => {
  it('sem hash válido ancora no contrato de trabalho', () => {
    expect(historicoDeAncoragem(AppScreen.WORK_CONTEXT_SELECTION, '')).toEqual([
      AppScreen.WORK_CONTEXT_SELECTION,
    ]);
    expect(historicoDeAncoragem(AppScreen.WORK_CONTEXT_SELECTION, '#/nao-existe')).toEqual([
      AppScreen.WORK_CONTEXT_SELECTION,
    ]);
  });

  it('com tela profunda põe o contrato por baixo (o «voltar» tem destino)', () => {
    expect(historicoDeAncoragem(AppScreen.WORK_CONTEXT_SELECTION, '#/audit-logs')).toEqual([
      AppScreen.WORK_CONTEXT_SELECTION,
      AppScreen.AUDIT_LOGS,
    ]);
  });

  it('na própria âncora não duplica a tela', () => {
    expect(historicoDeAncoragem(AppScreen.WORK_CONTEXT_SELECTION, '#/contexto')).toEqual([
      AppScreen.WORK_CONTEXT_SELECTION,
    ]);
  });

  it('uma tela de entrada manda sozinha', () => {
    expect(historicoDeAncoragem(AppScreen.WORK_CONTEXT_SELECTION, '#/login')).toEqual([
      AppScreen.LOGIN,
    ]);
  });
});

describe('proximaPilha — voltar/avançar do browser', () => {
  const pilha = [AppScreen.WORK_CONTEXT_SELECTION, AppScreen.MAIN_MENU, AppScreen.AUDIT_LOGS];

  it('voltar atrás corta a pilha até à tela visitada', () => {
    expect(proximaPilha(pilha, AppScreen.MAIN_MENU)).toEqual([
      AppScreen.WORK_CONTEXT_SELECTION,
      AppScreen.MAIN_MENU,
    ]);
  });

  it('ir em frente empurra a tela nova', () => {
    expect(proximaPilha(pilha, AppScreen.INVENTORY)).toEqual([
      ...pilha,
      AppScreen.INVENTORY,
    ]);
  });

  it('o login reinicia a pilha e o hub é alcançável pelo «voltar»', () => {
    expect(proximaPilha(pilha, AppScreen.LOGIN)).toEqual([AppScreen.LOGIN]);
    expect(proximaPilha([AppScreen.WORK_CONTEXT_SELECTION, AppScreen.MAIN_MENU], AppScreen.MAIN_MENU)).toEqual([
      AppScreen.WORK_CONTEXT_SELECTION,
      AppScreen.MAIN_MENU,
    ]);
  });
});

describe('escreverHash — estado → URL sem entradas duplicadas', () => {
  it('escreve uma vez e não reescreve o mesmo caminho', () => {
    escreverHash('/audit-logs');
    expect(window.location.hash).toBe('#/audit-logs');

    // Segunda escrita idêntica é ignorada (sem novo hashchange nem entrada).
    escreverHash('/audit-logs');
    expect(window.location.hash).toBe('#/audit-logs');

    escreverHash('/contexto');
    expect(window.location.hash).toBe('#/contexto');
  });
});
