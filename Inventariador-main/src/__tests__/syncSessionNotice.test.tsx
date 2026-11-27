// @vitest-environment jsdom
// O aviso da barra de sincronização dizia só «Erro»: para repor o token o
// operador tinha de encontrar o Gestor de Base. O botão do aviso faz a
// reentrada a partir da própria barra.
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react';
import { SyncSessionNotice } from '../components/SyncSessionNotice';
import { MENSAGEM_SESSAO_AUSENTE } from '../utils/sessaoNuvem';

describe('SyncSessionNotice — reentrar a partir da barra', () => {
  it('com sessão ausente, o aviso traz o botão que reautentica', () => {
    const reautenticar = vi.fn();
    render(<SyncSessionNotice syncError={MENSAGEM_SESSAO_AUSENTE} onReautenticar={reautenticar} />);

    const botao = screen.getByRole('button', { name: /sem sessão/i });
    expect(botao.getAttribute('title')).toBe(MENSAGEM_SESSAO_AUSENTE);
    fireEvent.click(botao);

    expect(reautenticar).toHaveBeenCalledTimes(1);
  });

  it('também reconhece o carimbo 42501 de sessão (sem ANON) como reentrada', () => {
    const reautenticar = vi.fn();
    render(
      <SyncSessionNotice
        syncError="Erro Supabase: [42501] pedido chegou como anon (sem sessão) — entre de novo"
        onReautenticar={reautenticar}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /sem sessão/i }));
    expect(reautenticar).toHaveBeenCalledTimes(1);
  });

  it('outros bloqueios não oferecem reentrada (o problema não é a sessão)', () => {
    const { container } = render(
      <SyncSessionNotice syncError="Envio à nuvem bloqueado: a base local tem cópias repetidas." />
    );

    expect(container.textContent).toBe('');
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('sem aviso não renderiza nada', () => {
    const { container } = render(<SyncSessionNotice syncError={null} />);
    expect(container.textContent).toBe('');
  });
});
