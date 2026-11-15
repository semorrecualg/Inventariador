// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { supabase, subscribeToInventoryChanges, configSubscriptionId } from '../services/supabaseService';

type ChangePayload = { new: Record<string, unknown>; old: Record<string, unknown>; eventType: string };
type ChannelFilter = { filter?: string };

type FakeChannel = {
  name: unknown;
  event?: string;
  config?: ChannelFilter;
  callback?: (payload: ChangePayload) => void;
  unsubscribe: ReturnType<typeof vi.fn>;
  on: (event: string, config: ChannelFilter, callback: (payload: ChangePayload) => void) => FakeChannel;
  subscribe: () => FakeChannel;
};

const supabaseStub = supabase as unknown as { channel: (name: string) => FakeChannel };

/**
 * A config do contrato vive em `config_<TENANT>`; `global_config` é reserva.
 * Antes o realtime filtrava só `id=eq.global_config`, por isso uma atualização
 * vinda da nuvem para o contrato nunca era detetada.
 */
describe('realtime de inventory_config — contrato primeiro, global_config como reserva', () => {
  let channels: FakeChannel[];

  const fakeChannel = (name: unknown): FakeChannel => {
    const ch = { name, unsubscribe: vi.fn() } as FakeChannel;
    ch.on = (event, config, callback) => {
      ch.event = event;
      ch.config = config;
      ch.callback = callback;
      return ch;
    };
    ch.subscribe = () => ch;
    channels.push(ch);
    return ch;
  };

  beforeEach(() => {
    channels = [];
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('app_database_mode', 'SUPABASE');
    vi.spyOn(supabaseStub, 'channel').mockImplementation((name: string) => fakeChannel(name));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('assina config_<TENANT> e global_config (reserva)', () => {
    const onUpdate = vi.fn();

    const subscription = subscribeToInventoryChanges(onUpdate, 'CICOPAL');

    expect(subscription).not.toBeNull();
    expect(channels).toHaveLength(2);
    expect(channels.map(c => c.config?.filter)).toEqual([
      'id=eq.config_CICOPAL',
      'id=eq.global_config'
    ]);
    // Nomes de canal únicos: dois filtros não podem partilhar o mesmo tópico.
    expect(new Set(channels.map(c => c.name)).size).toBe(2);
    expect(channels.every(c => c.event === 'postgres_changes')).toBe(true);
  });

  it('entrega a atualização do contrato em camelCase e sem identidade da linha', () => {
    const onUpdate = vi.fn();
    subscribeToInventoryChanges(onUpdate, 'CICOPAL');

    channels[0].callback?.({
      new: {
        id: 'config_CICOPAL',
        tenantid: 'CICOPAL',
        last_updated: '2026-11-12T03:10:00.000Z',
        status: 'IN_USE'
      },
      old: {},
      eventType: 'UPDATE'
    });

    expect(onUpdate).toHaveBeenCalledTimes(1);
    const payload = onUpdate.mock.calls[0][0];
    expect(payload.lastUpdated).toBe('2026-11-12T03:10:00.000Z');
    expect(payload.status).toBe('IN_USE');
    expect('id' in payload).toBe(false);
    expect('tenantid' in payload).toBe(false);
  });

  it('sem contrato válido, subscreve só global_config', () => {
    const subscription = subscribeToInventoryChanges(vi.fn(), 'default');

    expect(subscription).not.toBeNull();
    expect(channels).toHaveLength(1);
    expect(channels[0].config?.filter).toBe('id=eq.global_config');
  });

  it('desliga os dois canais ao desmontar', () => {
    const subscription = subscribeToInventoryChanges(vi.fn(), 'CICOPAL');

    subscription?.unsubscribe();

    expect(channels).toHaveLength(2);
    channels.forEach(ch => expect(ch.unsubscribe).toHaveBeenCalledTimes(1));
  });

  it('configSubscriptionId resolve o tenant da sessão e ignora sentinelas', () => {
    expect(configSubscriptionId('CICOPAL')).toBe('config_CICOPAL');
    expect(configSubscriptionId(' default ')).toBeNull();
    localStorage.setItem('tenantid', 'CICOPAL');
    expect(configSubscriptionId()).toBe('config_CICOPAL');
  });
});
