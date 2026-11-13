import { describe, it, expect, beforeEach } from 'vitest';
import type { Asset } from '../types/inventory';
import {
  SYNC_SESSION_RETENTION_MS,
  assetSyncKey,
  buildReceipt,
  checksumOf,
  closeSyncSession,
  filterNotAccepted,
  formatReceipt,
  openSyncSession,
  pruneSessions,
  pushAssetsWithReceipt,
  registerAccepted,
  registerPull,
  beginSyncCycle,
  endSyncCycle,
  getActiveCycle,
  pullIntoSession,
  type SyncSession,
  type SyncSessionStore,
} from '../services/syncSessionService';

/** Store em memória: o serviço aceita injeção justamente para testar sem IndexedDB. */
const makeStore = (): SyncSessionStore & { data: Map<string, unknown> } => {
  const data = new Map<string, unknown>();
  return {
    data,
    async getItem<T>(key: string) {
      return (data.has(key) ? (data.get(key) as T) : null);
    },
    async setItem<T>(key: string, value: T) {
      data.set(key, value);
      return value;
    },
    async removeItem(key: string) {
      data.delete(key);
    },
  };
};

const asset = (primarykey: string, tenantid = 'CICOPAL'): Asset => ({
  tenantid,
  filial: '010101 CICOPAL GO',
  status: 'ATIVO',
  etiqueta: primarykey,
  qt: 1,
  descricaodoativo: 'CADEIRA',
  serial: '',
  dataaqusic: '',
  cnpj: '',
  nomefornecedor: '',
  notafiscal: '',
  endereco: 'BLOCO A',
  registro: '',
  subreg: '',
  databaixa: '',
  contacontabil: '',
  primarykey,
  centrodecusto: '',
  vlraquisic: 0,
  sn1_recno: null,
  sn3_recno: null,
  id: primarykey,
});

const T0 = Date.parse('2026-11-13T08:00:00.000Z');

const awaitPromiseSession = () => {
  const active = getActiveCycle();
  if (!active) throw new Error('nenhum ciclo ativo');
  return active;
};

const listSessionsFresh = async (store: SyncSessionStore) => {
  const list = await store.getItem<SyncSession[]>('gbr_sync_sessions');
  return Array.isArray(list) ? list : [];
};

describe('syncSession — identidade e checksum', () => {
  it('monta a chave estável do ativo com contrato + chave primária', () => {
    expect(assetSyncKey(asset('010101FISIC20130013'))).toBe('CICOPAL|010101FISIC20130013');
  });

  it('checksum é determinístico e independe da ordem', () => {
    expect(checksumOf(['A|1', 'A|2'])).toBe(checksumOf(['A|2', 'A|1']));
    expect(checksumOf(['A|1', 'A|2'])).not.toBe(checksumOf(['A|1']));
    expect(checksumOf([])).toHaveLength(8);
  });

  it('não confunde chaves concatenadas diferentes', () => {
    expect(checksumOf(['AB', 'C'])).not.toBe(checksumOf(['A', 'BC']));
  });
});

describe('syncSession — abertura e retomada', () => {
  let store: ReturnType<typeof makeStore>;
  beforeEach(() => {
    store = makeStore();
  });

  it('abre sessão nova e grava auditor, contrato e aparelho', async () => {
    const session = await openSyncSession({
      tenantid: 'cicopal',
      filial: '010101 CICOPAL GO',
      auditor: 'auditor@empresa.com',
      store,
      now: T0,
    });
    expect(session.status).toBe('OPEN');
    expect(session.tenantid).toBe('CICOPAL');
    expect(session.auditor).toBe('auditor@empresa.com');
    expect(session.deviceId).toBeTruthy();
    expect(session.attempts).toBe(1);
  });

  it('retoma a sessão aberta da mesma pessoa dentro da janela de 16 h', async () => {
    const first = await openSyncSession({ tenantid: 'CICOPAL', auditor: 'a@b.com', store, now: T0 });
    const second = await openSyncSession({
      tenantid: 'CICOPAL',
      auditor: 'a@b.com',
      store,
      now: T0 + 15 * 60 * 60 * 1000,
    });
    expect(second.id).toBe(first.id);
    expect(second.attempts).toBe(2);
  });

  it('não retoma depois da janela: abre sessão nova', async () => {
    const first = await openSyncSession({ tenantid: 'CICOPAL', auditor: 'a@b.com', store, now: T0 });
    const second = await openSyncSession({
      tenantid: 'CICOPAL',
      auditor: 'a@b.com',
      store,
      now: T0 + 17 * 60 * 60 * 1000,
    });
    expect(second.id).not.toBe(first.id);
  });

  it('a posse acompanha a pessoa, não o aparelho', async () => {
    const a = await openSyncSession({ tenantid: 'CICOPAL', auditor: 'ana@b.com', store, now: T0 });
    const b = await openSyncSession({ tenantid: 'CICOPAL', auditor: 'bruno@b.com', store, now: T0 });
    expect(b.id).not.toBe(a.id);
    expect(b.deviceId).toBe(a.deviceId); // mesmo celular, sessões distintas
  });
});

describe('syncSession — idempotência e retomada do envio', () => {
  let store: ReturnType<typeof makeStore>;
  beforeEach(() => {
    store = makeStore();
  });

  it('filtra o que a sessão já aceitou', async () => {
    const session = await openSyncSession({ tenantid: 'CICOPAL', auditor: 'a@b.com', store, now: T0 });
    session.acceptedKeys = ['CICOPAL|A'];
    const pending = filterNotAccepted(session, [asset('A'), asset('B')]);
    expect(pending.map(a => a.primarykey)).toEqual(['B']);
  });

  it('retoma a sessão aberta e não reenvia o que já foi aceito', async () => {
    // Cenário real: o app gravou "A" como aceito e foi fechado antes de fechar
    // a sessão. A próxima rodada deve retomar e enviar só o que falta.
    const opened = await openSyncSession({
      tenantid: 'CICOPAL',
      filial: '010101 CICOPAL GO',
      auditor: 'a@b.com',
      store,
      now: T0,
    });
    await registerAccepted(opened, ['CICOPAL|A'], store);

    const sent: string[][] = [];
    const result = await pushAssetsWithReceipt([asset('A'), asset('B')], 'CICOPAL', {
      auditor: 'a@b.com',
      store,
      now: T0 + 60_000,
      sync: async batch => {
        sent.push(batch.map(a => a.primarykey));
        return batch.map(a => String(a.id));
      },
    });

    expect(sent).toEqual([['B']]);
    expect(result.synced).toEqual(['B']);
    expect(result.session.id).toBe(opened.id);
    expect(result.session.status).toBe('COMPLETED');
    expect(result.session.receipt?.accepted).toBe(2);
    expect(result.session.receipt?.missing).toBe(0);
  });

  it('marca PARTIAL quando parte do lote não é aceita', async () => {
    const { session } = await pushAssetsWithReceipt([asset('A'), asset('B')], 'CICOPAL', {
      auditor: 'a@b.com',
      store,
      now: T0,
      sync: async () => ['A'], // B não voltou como aceito
    });
    expect(session.status).toBe('PARTIAL');
    expect(session.receipt).toMatchObject({ accepted: 1, rejected: 1, missing: 1 });
  });

  it('recibo soma o pull quando registrado', async () => {
    const session = await openSyncSession({ tenantid: 'CICOPAL', auditor: 'a@b.com', store, now: T0 });
    await registerPull(session, { since: '2026-11-13T07:00:00.000Z', received: 37, applied: 37 }, store);
    await closeSyncSession(session, 'COMPLETED', store);
    expect(session.receipt).toMatchObject({ received: 37, applied: 37 });
    expect(formatReceipt(session)).toContain('recebi 37');
  });
});

describe('syncSession — recibo e retenção', () => {
  it('calcula faltantes e duração', () => {
    const session: SyncSession = {
      id: 's1',
      tenantid: 'CICOPAL',
      filial: 'GERAL',
      auditor: 'a@b.com',
      deviceId: 'd1',
      startedAt: new Date(T0).toISOString(),
      updatedAt: new Date(T0).toISOString(),
      status: 'OPEN',
      attempts: 1,
      acceptedKeys: ['CICOPAL|A'],
      rejectedKeys: ['CICOPAL|B'],
    };
    expect(buildReceipt(session, T0 + 5000)).toMatchObject({
      sent: 2,
      accepted: 1,
      rejected: 1,
      missing: 1,
      durationMs: 5000,
    });
  });

  it('formata o recibo em uma linha para o monitor SRE', () => {
    const session: SyncSession = {
      id: 's1',
      tenantid: 'CICOPAL',
      filial: '010101 CICOPAL GO',
      auditor: 'a@b.com',
      deviceId: 'd1',
      startedAt: new Date(T0).toISOString(),
      updatedAt: new Date(T0).toISOString(),
      status: 'PARTIAL',
      attempts: 1,
      acceptedKeys: ['CICOPAL|A'],
      rejectedKeys: ['CICOPAL|B'],
      receipt: {
        sent: 2,
        accepted: 1,
        rejected: 1,
        received: 0,
        applied: 0,
        missing: 1,
        checksum: 'abc12345',
        pullChecksum: '00000000',
        durationMs: 10,
      },
    };
    const line = formatReceipt(session);
    expect(line).toContain('enviei 2');
    expect(line).toContain('FALTAM 1');
    expect(line).toContain('abc12345');
  });

  it('descarta sessão fechada com mais de 90 dias e mantém a aberta', () => {
    const old: SyncSession = {
      id: 'old',
      tenantid: 'CICOPAL',
      filial: 'GERAL',
      auditor: 'a@b.com',
      deviceId: 'd1',
      startedAt: new Date(T0).toISOString(),
      updatedAt: new Date(T0).toISOString(),
      finishedAt: new Date(T0).toISOString(),
      status: 'COMPLETED',
      attempts: 1,
      acceptedKeys: [],
      rejectedKeys: [],
    };
    const open: SyncSession = { ...old, id: 'open', status: 'OPEN', finishedAt: undefined };
    const kept = pruneSessions([old, open], T0 + SYNC_SESSION_RETENTION_MS + 1000);
    expect(kept.map(s => s.id)).toEqual(['open']);
  });
});


describe('syncSession — ciclo real (push + pull no mesmo recibo)', () => {
  let store: ReturnType<typeof makeStore>;
  const CICLO = {
    tenantid: 'CICOPAL',
    filial: '010101 CICOPAL GO',
    auditor: 'auditor@empresa.com',
  };

  beforeEach(() => {
    store = makeStore();
  });

  it('o pull alimenta o recibo com os recebidos e o push não fecha a sessão', async () => {
    const session = await beginSyncCycle({ ...CICLO, store, now: T0 });

    const push = await pushAssetsWithReceipt([asset('A'), asset('B')], 'CICOPAL', {
      auditor: CICLO.auditor,
      store,
      now: T0,
      sync: async batch => batch.map(a => String(a.id)),
    });

    // Dentro do ciclo, push e pull compartilham a sessão e ela segue aberta.
    expect(push.session.id).toBe(session.id);
    expect(push.session.status).toBe('OPEN');

    await pullIntoSession(
      session,
      { since: '2026-11-13T07:00:00.000Z', assets: [asset('C'), asset('D')] },
      store
    );
    const closed = await endSyncCycle(store);

    expect(closed?.receipt).toMatchObject({
      sent: 2,
      accepted: 2,
      received: 2,
      applied: 2,
      missing: 0,
    });
    // Se pullIntoSession deixar de registrar as chaves reais, isto quebra.
    expect(closed?.receipt?.pullChecksum).toBe(checksumOf(['CICOPAL|C', 'CICOPAL|D']));
    expect(closed?.status).toBe('COMPLETED');
    expect(closed?.finishedAt).toBeTruthy();
    expect(getActiveCycle()).toBeNull();
    expect(formatReceipt(closed as SyncSession)).toContain('recebi 2');
  });

  it('pull e upload não se sobrescrevem na mesma sessão', async () => {
    const session = await beginSyncCycle({ ...CICLO, store, now: T0 });
    await pullIntoSession(session, { assets: [asset('X')] }, store);

    // Depois do pull, um push grava aceitos sem apagar o pull.
    await pushAssetsWithReceipt([asset('A')], 'CICOPAL', {
      auditor: CICLO.auditor,
      store,
      now: T0,
      sync: async batch => batch.map(a => String(a.id)),
    });

    const [persisted] = await listSessionsFresh(store);
    expect(persisted.pull?.receivedKeys).toEqual(['CICOPAL|X']);
    expect(persisted.acceptedKeys).toEqual(['CICOPAL|A']);
  });

  it('não fecha com faltantes e retoma sem reenviar o que já foi aceito', async () => {
    await beginSyncCycle({ ...CICLO, store, now: T0 });
    await pushAssetsWithReceipt([asset('A'), asset('B')], 'CICOPAL', {
      auditor: CICLO.auditor,
      store,
      now: T0,
      sync: async () => ['A'], // B não voltou como aceito
    });
    await pullIntoSession(awaitPromiseSession(), { assets: [] }, store).catch(() => undefined);
    const parcial = await endSyncCycle(store);

    expect(parcial?.receipt).toMatchObject({ accepted: 1, rejected: 1, missing: 1 });
    expect(parcial?.status).toBe('PARTIAL');
    expect(parcial?.finishedAt).toBeUndefined();

    // Próxima rodada retoma a MESMA sessão e envia só o que falta.
    const retomada = await beginSyncCycle({ ...CICLO, store, now: T0 + 60_000 });
    expect(retomada.id).toBe(parcial?.id);

    const sent: string[][] = [];
    await pushAssetsWithReceipt([asset('A'), asset('B')], 'CICOPAL', {
      auditor: CICLO.auditor,
      store,
      now: T0 + 60_000,
      sync: async batch => {
        sent.push(batch.map(a => a.primarykey));
        return batch.map(a => String(a.id));
      },
    });
    await pullIntoSession(retomada, { assets: [asset('C')] }, store);
    const final = await endSyncCycle(store);

    expect(sent).toEqual([['B']]);
    expect(final?.status).toBe('COMPLETED');
    expect(final?.receipt).toMatchObject({ accepted: 2, received: 1, missing: 0 });
  });

  it('falha de rede no meio da rodada mantém a sessão aberta para retomar', async () => {
    const session = await beginSyncCycle({ ...CICLO, store, now: T0 });
    await expect(
      pushAssetsWithReceipt([asset('A')], 'CICOPAL', {
        auditor: CICLO.auditor,
        store,
        now: T0,
        sync: async () => {
          throw new Error('rede caiu');
        },
      })
    ).rejects.toThrow('rede caiu');

    const encerrada = await endSyncCycle(store);
    expect(encerrada?.status).toBe('OPEN');
    expect(encerrada?.finishedAt).toBeUndefined();
    expect(encerrada?.id).toBe(session.id);

    const retomada = await beginSyncCycle({ ...CICLO, store, now: T0 + 120_000 });
    expect(retomada.id).toBe(session.id);
    expect(retomada.failed).toBe(true);
  });
});
