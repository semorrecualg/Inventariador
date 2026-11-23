import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  devePedirConfirmacaoAoFechar,
  mensagemDeSaida,
  totalDeEscritasPendentes,
} from '../utils/guardaSaida';

const semPendencias = { ativos: 0, fotos: 0, auditoria: 0 };

describe('totalDeEscritasPendentes', () => {
  it('soma as três filas', () => {
    expect(totalDeEscritasPendentes({ ativos: 2, fotos: 3, auditoria: 5 })).toBe(10);
  });

  it('não conta valores inválidos, negativos nem decimais a mais', () => {
    expect(
      totalDeEscritasPendentes({
        ativos: Number.NaN,
        fotos: -4,
        auditoria: 2.9,
      })
    ).toBe(2);
    expect(totalDeEscritasPendentes({})).toBe(0);
  });
});

describe('devePedirConfirmacaoAoFechar', () => {
  it('não pede confirmação com a base sincronizada — o caso do F5', () => {
    // 12.636 ativos carregados e zero pendências: era aqui que o diálogo
    // aparecia sem nada por enviar.
    expect(devePedirConfirmacaoAoFechar(semPendencias)).toBe(false);
  });

  it('pede confirmação com cada fila, isoladamente', () => {
    expect(devePedirConfirmacaoAoFechar({ ...semPendencias, ativos: 1 })).toBe(true);
    expect(devePedirConfirmacaoAoFechar({ ...semPendencias, fotos: 1 })).toBe(true);
    expect(devePedirConfirmacaoAoFechar({ ...semPendencias, auditoria: 1 })).toBe(true);
  });
});

describe('mensagemDeSaida', () => {
  it('diz quantas alterações faltam, no singular e no plural', () => {
    expect(mensagemDeSaida(1)).toContain('1 alteração por enviar');
    expect(mensagemDeSaida(7)).toContain('7 alterações por enviar');
    expect(mensagemDeSaida(7)).toContain('mantém tudo no aparelho');
  });

  it('não inventa mensagem sem pendências', () => {
    expect(mensagemDeSaida(0)).toBe('');
    expect(mensagemDeSaida(Number.NaN)).toBe('');
    expect(mensagemDeSaida(-2)).toBe('');
  });
});

describe('contrato com o App.tsx', () => {
  it('a guarda decide pelas filas, não por haver ativos carregados', () => {
    const app = readFileSync(resolve(process.cwd(), 'src/App.tsx'), 'utf-8');
    const inicio = app.indexOf('const handleBeforeUnload');
    expect(inicio).toBeGreaterThan(-1);
    const guarda = app.slice(inicio, inicio + 1600);

    expect(guarda).toContain('devePedirConfirmacaoAoFechar(');
    expect(guarda).toContain('mensagemDeSaida(');
    // A condição antiga: qualquer base carregada pedia confirmação.
    expect(guarda).not.toContain('inventory.assets.length > 0');
  });
});
