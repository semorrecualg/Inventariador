// ============================================================================
// baseModeRestart.test.ts — fecho determinístico da troca de base.
// ============================================================================
// O que se prova aqui é a ordem que o reload deixou de garantir: a auditoria
// fica durável antes do reinício e o diálogo fecha antes de recarregar.
import { describe, it, expect } from 'vitest';

import { fecharComAuditoriaGravada } from '../utils/baseModeRestart';

/** Promessa com resolução manual (a escrita da auditoria a decorrer). */
const diferido = () => {
  let resolver!: () => void;
  const promessa = new Promise<void>((res) => {
    resolver = () => res();
  });
  return { promessa, resolver };
};

describe('fecho determinístico após a troca de base', () => {
  it('só reinicia depois de a auditoria gravar e de o modal fechar', async () => {
    const auditoria = diferido();
    const ordem: string[] = [];

    const fecho = fecharComAuditoriaGravada({
      pendentes: [auditoria.promessa],
      fechar: () => ordem.push('fechar'),
      reiniciar: () => ordem.push('reiniciar')
    });

    // Enquanto a auditoria não termina, nada de fechar nem de reiniciar.
    await Promise.resolve();
    expect(ordem).toEqual([]);

    ordem.push('auditoria gravada');
    auditoria.resolver();
    await fecho;

    expect(ordem).toEqual(['auditoria gravada', 'fechar', 'reiniciar']);
  });

  it('regista a falha da auditoria e reinicia à mesma', async () => {
    const ordem: string[] = [];
    const falhas: string[] = [];
    const auditoriaFalhada = Promise.reject(new Error('dexie indisponível'));
    auditoriaFalhada.catch(() => {});

    await fecharComAuditoriaGravada({
      pendentes: [undefined, auditoriaFalhada],
      fechar: () => ordem.push('fechar'),
      reiniciar: () => ordem.push('reiniciar'),
      aoFalhar: (origem) => falhas.push(origem)
    });

    expect(falhas).toEqual(['pendencia']);
    expect(ordem).toEqual(['fechar', 'reiniciar']);
  });

  it('não prende o utilizador quando a auditoria nunca termina', async () => {
    const ordem: string[] = [];

    await fecharComAuditoriaGravada({
      pendentes: [new Promise<void>(() => {})],
      prazoMs: 20,
      fechar: () => ordem.push('fechar'),
      reiniciar: () => ordem.push('reiniciar')
    });

    expect(ordem).toEqual(['fechar', 'reiniciar']);
  });

  it('reinicia mesmo quando o fecho do modal rebenta', async () => {
    const ordem: string[] = [];
    const falhas: string[] = [];

    await fecharComAuditoriaGravada({
      fechar: () => {
        throw new Error('nó já desmontado');
      },
      reiniciar: () => ordem.push('reiniciar'),
      aoFalhar: (origem) => falhas.push(origem)
    });

    expect(falhas).toEqual(['fecho']);
    expect(ordem).toEqual(['reiniciar']);
  });
});
