// @vitest-environment jsdom
// ============================================================================
// accessDiagnosticPanel.test.tsx — o ecrã do DIAGNÓSTICO DE ACESSO nos dois
// modos: SUPABASE (lista da nuvem, sessão não persistida) e INTERNAL (base
// local, sem promessa de nuvem). O botão copiar entrega o texto completo.
// ============================================================================
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import AccessDiagnosticPanel from '../components/AccessDiagnosticPanel';
import { buildAccessDiagnostic, type AccessDiagnosticInput } from '../utils/accessDiagnostics';

const BASE: AccessDiagnosticInput = {
  contrato: 'cicopal',
  modo: 'SUPABASE',
  contextos: 5,
  filiaisNaBase: false,
  filiaisDaNuvem: 5,
  filiaisDaCache: 0,
  unidadesComAncora: 5,
  unidadesComCampanha: 1,
  ativosLocais: 0,
  nomesConsultadosEm: new Date(2026, 10, 20, 13, 42, 0).getTime(),
  ultimoErroDeRede: null,
  sessaoPersistida: false,
  agora: new Date(2026, 10, 20, 13, 44, 0).getTime()
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('AccessDiagnosticPanel', () => {
  it('modo SUPABASE mostra a lista da nuvem, a sessão não persistida e copia o texto', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true
    });

    const diagnostic = buildAccessDiagnostic(BASE);
    render(<AccessDiagnosticPanel diagnostic={diagnostic} onClose={() => {}} />);

    expect(screen.getByText('Diagnóstico de Acesso')).toBeTruthy();
    expect(screen.getByText('CICOPAL')).toBeTruthy();
    expect(screen.getByText('lista da nuvem (5)')).toBeTruthy();
    expect(screen.getByText('não persistida (recarregar volta ao login)')).toBeTruthy();
    expect(screen.getByText('13:42 (há 2 min)')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /copiar diagnóstico/i }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(diagnostic.texto));
    expect(await screen.findByText('Copiado')).toBeTruthy();
  });

  it('modo INTERNAL mostra a base local e fecha pelo botão', () => {
    const onClose = vi.fn();
    const diagnostic = buildAccessDiagnostic({
      ...BASE,
      modo: 'INTERNAL',
      filiaisNaBase: true,
      ativosLocais: 12636,
      sessaoPersistida: true
    });
    render(<AccessDiagnosticPanel diagnostic={diagnostic} onClose={onClose} />);

    expect(screen.getByText('INTERNAL')).toBeTruthy();
    expect(screen.getByText('base local (5)')).toBeTruthy();
    expect(screen.getByText('12636')).toBeTruthy();
    expect(screen.getByText('persistida')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /fechar/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
