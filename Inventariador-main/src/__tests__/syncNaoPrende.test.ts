// ============================================================================
// syncNaoPrende.test.ts — o sync não pode deixar o ecrã preso a «sincronizar»
//
// Sintoma de campo (v3.1.0, por cima do fix do pull): depois de escolher a
// filial e abrir o Inventário, o overlay «SINCRONIZANDO BASE / Aguarde,
// baixando dados da nuvem» ficava a rodar e não concluía.
//
// Duas causas, as duas fechadas aqui:
// (1) o pull da nuvem era aguardado SEM tecto de tempo — um pedido pendurado
//     (WebView, rede que morre a meio) prendia o `await` para sempre e a
//     promessa ficava no mapa de dedup, envenenando os pulls seguintes;
// (2) o selo de reentrância (`isSyncingRef`) só era devolvido no `finally` do
//     corpo principal: os `return` antecipados deixavam-no preso em `true` e a
//     sessão inteira ficava sem sincronizações.
// ============================================================================
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { comTecto, TempoEsgotadoError } from '../utils/comTecto';

afterEach(() => {
  vi.useRealTimers();
});

describe('comTecto — tecto de tempo para promessas de rede', () => {
  it('devolve o valor quando a promessa assenta', async () => {
    await expect(comTecto(Promise.resolve('base'), 1_000, 'teste')).resolves.toBe('base');
  });

  it('propaga a rejeição original sem esperar pelo tecto', async () => {
    await expect(comTecto(Promise.reject(new Error('RLS')), 60_000, 'teste')).rejects.toThrow('RLS');
  });

  it('rejeita com TempoEsgotadoError quando a promessa nunca assenta', async () => {
    vi.useFakeTimers();
    const pendurada = comTecto(new Promise<never>(() => {}), 30_000, 'pull do contrato');
    const espera = expect(pendurada).rejects.toBeInstanceOf(TempoEsgotadoError);
    await vi.advanceTimersByTimeAsync(30_000);
    await espera;
    await expect(pendurada).rejects.toThrow('pull do contrato: tempo esgotado após 30s');
  });
});

describe('contrato — o ecrã de sincronização nunca fica preso', () => {
  const raiz = process.cwd();
  const app = readFileSync(join(raiz, 'src', 'App.tsx'), 'utf8');
  const supabase = readFileSync(join(raiz, 'src', 'services', 'supabaseService.ts'), 'utf8');

  /** Corpo de `syncFromCloud`, de `useCallback` até às dependências. */
  const corpoDoSync = (): string => {
    const inicio = app.indexOf('const syncFromCloud = useCallback(');
    const fim = app.indexOf('}, [databaseMode, screen, isSyncing, pushLocalChanges, user]);');
    expect(inicio).toBeGreaterThan(-1);
    expect(fim).toBeGreaterThan(inicio);
    return app.slice(inicio, fim);
  };

  it('o pull do contrato tem tecto de tempo e o impl continua a só ler', () => {
    expect(supabase).toContain('const PULL_TOTAL_TIMEOUT_MS = 120_000;');
    expect(supabase).toContain("'pull do contrato'");
    const inicio = supabase.indexOf('const promise = comTecto(');
    const fim = supabase.indexOf('pendingPulls.set(pullKey, promise);', inicio);
    expect(inicio).toBeGreaterThan(-1);
    expect(fim).toBeGreaterThan(inicio);
    const corpo = supabase.slice(inicio, fim);
    expect(corpo).toContain('fetchFullInventoryImpl(resolvedTenantid, unitid, onProgress, onComplete, options)');
    expect(corpo).toContain('PULL_TOTAL_TIMEOUT_MS');
  });

  it('todas as saídas antecipadas devolvem o selo de reentrância', () => {
    const corpo = corpoDoSync();
    // 6 saídas antecipadas passam por `abortarSync` (blindagem, modo interno,
    // offline, login, sem sessão, escopo sem filial).
    expect(corpo.match(/abortarSync\('/g)).toHaveLength(6);
    // O backup do Mobile Single tem `finally` próprio e devolve o selo à mão.
    expect(corpo).toContain('isSyncingRef.current = false;');
    const devolucoes = corpo.match(/isSyncingRef\.current = false;/g) ?? [];
    expect(devolucoes.length).toBeGreaterThanOrEqual(3);
  });

  it('o envio e a fila de fotos também têm tecto antes do pull', () => {
    const corpo = corpoDoSync();
    expect(corpo).toContain('comTecto(pushLocalChanges(true), 60_000,');
    expect(corpo).toContain('comTecto(processSyncQueue(), 60_000,');
    expect(corpo).toContain('comTecto(getPendingSyncItems(), 15_000,');
  });

  it('o tempo esgotado avisa o operador antes da contingência de rede', () => {
    const tecto = app.indexOf('error instanceof TempoEsgotadoError');
    const contingencia = app.indexOf('const isSuspendedNetwork = pareceFalhaDeCanal(error);');
    expect(tecto).toBeGreaterThan(-1);
    expect(contingencia).toBeGreaterThan(tecto);
    expect(app).toContain("title: 'Sincronização sem resposta'");
  });

  it('existe um vigia que liberta o ecrã ao fim de 3 minutos', () => {
    expect(app).toContain('const VIGIA_MS = 3 * 60_000;');
    expect(app).toContain('>>> [Sync] Vigia:');
    expect(app).toContain("title: 'Sincronização interrompida'");
  });

  // Campo (v3.1.0, terceira ocorrência): o ecrã continuava em «BAIXANDO DADOS
  // DA NUVEM» com o tecto total já colocado. Faltavam as duas únicas formas de
  // o pull em si ser infinito — o pedido de página pendurado (sem abort) e a
  // paginação que recebe a MESMA página para sempre.
  it('cada página do pull tem tecto próprio e abort real do pedido', () => {
    expect(supabase).toContain('const PULL_PAGE_TIMEOUT_MS = 25_000;');
    expect(supabase).toContain('setTimeout(() => controladorPagina.abort(), PULL_PAGE_TIMEOUT_MS)');
    expect(supabase).toContain('await q.abortSignal(controladorPagina.signal)');
    expect(supabase).toContain('new TempoEsgotadoError(`pull do contrato (página ${paginas + 1})`');
  });

  it('a paginação pára quando a mesma página se repete ou no tecto de páginas', () => {
    expect(supabase).toContain('const PULL_MAX_PAGES = 200;');
    expect(supabase).toContain('primeiroId === primeiroIdAnterior');
    expect(supabase).toContain('Página repetida no pull');
    expect(supabase).toContain('paginas >= PULL_MAX_PAGES');
    // Os contadores são do corpo do impl, declarados ao lado de `from`.
    const impl = supabase.slice(supabase.indexOf('const fetchFullInventoryImpl = async ('));
    expect(impl).toContain('let paginas = 0;');
    expect(impl).toContain('let primeiroIdAnterior: string | null = null;');
  });

  it('o ecrã diz o passo, o tempo e os ativos, e dá uma saída ao operador', () => {
    expect(app).toContain('const [syncEtapa, setSyncEtapa] = useState<string>(');
    expect(app).toContain('const [syncIniciadoEm, setSyncIniciadoEm] = useState<number | null>(null);');
    expect(app).toContain('baixados => setSyncAtivosBaixados(baixados)');
    expect(app).toContain("'A gravar a base no aparelho…'");
    // Botão real no overlay (aparece depois de 12s) e o handler que o serve.
    expect(app).toContain('Continuar com a base do aparelho');
    expect(app).toContain('syncDecorridoS >= 12');
    expect(app).toContain('onClick={handleContinuarSemNuvem}');
    const handler = app.slice(app.indexOf('const handleContinuarSemNuvem = useCallback('));
    expect(handler.slice(0, 900)).toContain('isSyncingRef.current = false;');
    expect(handler.slice(0, 900)).toContain('setIsSyncing(false);');
    expect(handler.slice(0, 900)).toContain("title: 'A continuar com a base do aparelho'");
  });
});
