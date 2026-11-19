// @vitest-environment jsdom
// A pílula «Status Auditoria» da ficha de impressão pintava-se pela flag local
// apenas. Um ativo conferido pela coluna da base continuava a sair a vermelho
// no papel, mesmo contando como conferido no resto do app.
import { describe, it, expect } from 'vitest';
import React from 'react';
import { render } from '@testing-library/react';
import AssetPrintView from '../components/AssetPrintView';
import type { Asset } from '../types';

const ativo = (over: Record<string, unknown> = {}): Asset =>
  ({
    id: 'A1',
    etiqueta: '008491',
    descricaodoativo: 'CADEIRA GIRATÓRIA',
    endereco: '151200 CONTABILIDADE',
    ...over
  }) as unknown as Asset;

const pilulas = (asset: Asset) => {
  const { container } = render(
    <AssetPrintView assets={[asset]} unitName="CICOPAL GO" onBack={() => {}} />
  );
  return {
    conferida: container.querySelector('.bg-emerald-100'),
    pendente: container.querySelector('.bg-rose-100')
  };
};

describe('AssetPrintView — selo de auditoria', () => {
  it('pinta de conferido o ativo que só a coluna de auditoria confirma', () => {
    const { conferida, pendente } = pilulas(ativo({ AUDITOR_STATUS_CONFERENCIA: 'SIM' }));

    expect(conferida).not.toBeNull();
    expect(pendente).toBeNull();
  });

  it('mantém pendente o ativo sem flag nem coluna', () => {
    const { conferida, pendente } = pilulas(ativo());

    expect(conferida).toBeNull();
    expect(pendente).not.toBeNull();
  });
});
