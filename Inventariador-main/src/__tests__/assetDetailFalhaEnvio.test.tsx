// @vitest-environment jsdom
// ============================================================================
// assetDetailFalhaEnvio.test.tsx — a ficha do ativo mostra a recusa da nuvem.
//
// O cartão (`AssetListItem`) e o botão global (`SyncBadge`) já mostravam a falha;
// na ficha o operador via só «PENDENTE NUVEM», sem motivo nem idade, e sem forma
// de tentar outra vez sem sair do ativo. Aqui fixa-se o selo e o reenvio.
// ============================================================================
import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react';

vi.stubEnv('VITE_SUPABASE_URL', 'https://fake.supabase.co');
vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'fake-anon-key');

vi.mock('qrcode.react', () => ({ QRCodeSVG: () => null }));

vi.mock('../services/syncService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/syncService')>();
  return {
    ...actual,
    processDataSyncQueue: vi.fn().mockResolvedValue({ success: true, processedCount: 0 })
  };
});

import AssetDetail from '../components/AssetDetail';
import { db } from '../services/sqliteService';
import { processDataSyncQueue } from '../services/syncService';
import { DatabaseMode } from '../types';
import type { Asset } from '../types';

const ativo = (over: Record<string, unknown> = {}): Asset =>
  ({
    id: '01010100000005000001',
    tenantid: 'CICOPAL',
    filial: '010101 CICOPAL GO',
    primarykey: '01010100000005000001',
    etiqueta: '000420',
    status: 'CONFERIDO',
    qt: 1,
    descricaodoativo: 'CHAVE FECHADORA DE POCOS',
    endereco: '010101 CICOPAL GO',
    _conferido: 1,
    _is_synced: 0,
    _is_deleted: 0,
    ...over
  }) as unknown as Asset;

const ficha = (asset: Asset) =>
  render(
    <AssetDetail
      assets={[asset]}
      initialAssetId={String(asset.id)}
      onBack={() => {}}
      onUpdate={() => {}}
      onBulkUpdate={() => {}}
      editableFields={[]}
      uniqueEnderecos={[]}
      uniqueCentrosDeCusto={[]}
      qrCodeFields={[]}
      databaseMode={DatabaseMode.SUPABASE}
    />
  );

beforeEach(async () => {
  vi.mocked(processDataSyncQueue).mockClear();
  await db.ativos.clear();
  // A ficha guarda rascunho por ativo: sem limpar, um caso herdava o estado do anterior.
  sessionStorage.clear();
});

describe('AssetDetail — selo de falha de envio', () => {
  it('mostra o motivo, a idade e o botão de reenvio', () => {
    const ha2h = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
    const { container } = ficha(ativo({ _syncFailAt: ha2h, _syncFailReason: 'RLS negou o upsert' }));
    const texto = container.textContent ?? '';

    expect(texto).toContain('Falha de envio');
    expect(texto).toContain('RLS negou o upsert');
    expect(texto).toContain('há 2 h');
    expect(texto).toContain('Tentar agora');
  });

  it('não mostra falha num registo que já está igual à nuvem', () => {
    const ha2h = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
    const { container } = ficha(
      ativo({ _is_synced: 1, _syncFailAt: ha2h, _syncFailReason: 'RLS negou o upsert' })
    );

    expect(container.textContent ?? '').not.toContain('Falha de envio');
    expect(container.textContent ?? '').not.toContain('Tentar agora');
  });

  it('«Tentar agora» usa o mesmo caminho de envio e cala o selo quando o ativo sobe', async () => {
    const ha2h = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
    const { getByText, container } = ficha(
      ativo({ _syncFailAt: ha2h, _syncFailReason: 'RLS negou o upsert' })
    );

    // O envio aceite limpa o carimbo na tabela viva; a ficha relê-a no fim.
    await db.ativos.put(ativo({ _is_synced: 1 }) as never);

    fireEvent.click(getByText('Tentar agora'));

    await waitFor(() => expect(processDataSyncQueue).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(container.textContent ?? '').not.toContain('Falha de envio'));
  });
});
