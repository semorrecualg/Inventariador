// @vitest-environment jsdom
// ============================================================================
// syncAssetsDelivery.test.ts — contrato das duas APIs de envio.
//
// `syncAssetsToCloud` (antiga) devolve só aceites e lança em recusa parcial;
// `syncAssetsToCloudAndMarkDetailed` devolve `{ synced, failures }` e não lança.
// O desfecho do núcleo é injectado, portanto o teste fixa-o sem cliente Supabase
// — é o contrato que antes estava duplicado em dois blocos de throw.
// ============================================================================
import { describe, it, expect } from 'vitest';
import {
  SupabaseNetworkException,
  requireCompleteSync,
  syncAssetsToCloud,
  syncAssetsToCloudAndMark,
  syncAssetsToCloudAndMarkDetailed,
  type AssetSyncRun,
} from '../services/supabaseService';
import type { Asset } from '../types';

const ativo = (primarykey: string) => ({ primarykey, id: primarykey }) as Asset;

/** Núcleo de dublê: o desfecho é o argumento, não a rede. */
const desfecho = (result: { synced: string[]; failures: { key: string; reason: string }[] }): AssetSyncRun =>
  async () => result;

const parcial = {
  synced: ['AT-1'],
  failures: [
    { key: 'AT-2', reason: '[23503] contrato ausente' },
    { key: 'AT-3', reason: '[23514] check falhou' },
  ],
};

describe('API antiga de envio (syncAssetsToCloud)', () => {
  it('lança SupabaseNetworkException em recusa parcial, com contagem e amostra', async () => {
    const erro = await syncAssetsToCloud([ativo('AT-1'), ativo('AT-2')], 'CICOPAL', undefined, desfecho(parcial))
      .then(() => null)
      .catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(SupabaseNetworkException);
    expect((erro as Error).message).toBe(
      'Espelhamento parcial: 1 ativos sincronizados, 2 rejeitados ' +
      '(ex.: AT-2: [23503] contrato ausente | AT-3: [23514] check falhou)'
    );
  });

  it('devolve os ids aceites quando o lote fecha completo', async () => {
    const ids = await syncAssetsToCloud([ativo('AT-1')], 'CICOPAL', undefined, desfecho({ synced: ['AT-1'], failures: [] }));

    expect(ids).toEqual(['AT-1']);
  });

  it('syncAssetsToCloudAndMark mantém o mesmo contrato de excepção', async () => {
    await expect(
      syncAssetsToCloudAndMark([ativo('AT-1')], 'CICOPAL', undefined, desfecho(parcial))
    ).rejects.toBeInstanceOf(SupabaseNetworkException);
  });
});

describe('API detalhada de envio', () => {
  it('não lança em recusa parcial: devolve as falhas com motivo', async () => {
    // Sem aceites, para não tocar na marcação local (`markAssetsSynced`).
    const r = await syncAssetsToCloudAndMarkDetailed([ativo('AT-2')], 'CICOPAL', undefined,
      desfecho({ synced: [], failures: [{ key: 'AT-2', reason: '[23503] contrato ausente' }] }));

    expect(r).toEqual({
      synced: [],
      failures: [{ key: 'AT-2', reason: '[23503] contrato ausente' }],
    });
  });

  it('lote completo devolve o mesmo resultado, sem excepção', async () => {
    const r = await syncAssetsToCloudAndMarkDetailed([ativo('AT-1')], 'CICOPAL', undefined,
      desfecho({ synced: [], failures: [] }));

    expect(r).toEqual({ synced: [], failures: [] });
  });
});

describe('requireCompleteSync — a política partilhada', () => {
  it('passa quando não há recusas', () => {
    expect(requireCompleteSync({ synced: ['A', 'B'], failures: [] })).toEqual(['A', 'B']);
  });

  it('lança assim que há uma recusa, mesmo com aceites', () => {
    expect(() => requireCompleteSync(parcial)).toThrow(/^Espelhamento parcial: 1 ativos sincronizados, 2 rejeitados/);
  });

  it('resume no máximo três motivos na mensagem', () => {
    const failures = ['A', 'B', 'C', 'D'].map(key => ({ key, reason: 'recusado' }));
    expect(() => requireCompleteSync({ synced: [], failures })).toThrow(/ex\.: A: recusado \| B: recusado \| C: recusado\)$/);
  });
});
