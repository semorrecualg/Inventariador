import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Contrato do efeito de tempo real em `App.tsx`.
 *
 * Duas regressões já vistas aqui:
 *  1. o efeito dependia de `inventory.lastUpdated` → cada sincronização desligava
 *     e religava os canais, perdendo eventos no intervalo;
 *  2. `pushScreen` não é estável (depende de `databaseMode`/`selectedUnit`) →
 *     mudar de unidade reabria os canais sem o contrato mudar.
 *
 * A comparação é feita sobre os tokens das dependências e sobre o código sem
 * comentários, para o teste não falhar por formatação do ficheiro.
 */
const appSource = readFileSync(fileURLToPath(new URL('../App.tsx', import.meta.url)), 'utf8');

const effectStart = appSource.indexOf('// Real-time Cloud Sync Listener');

/** Primeira lista de dependências de efeito depois do marcador. */
const depsPattern = /\}\s*,\s*\[([^\]]*)\]\s*\)\s*;/g;
const depsMatch = (() => {
  if (effectStart === -1) return null;
  depsPattern.lastIndex = effectStart;
  return depsPattern.exec(appSource);
})();

const effectBlock = depsMatch ? appSource.slice(effectStart, depsMatch.index) : '';
// Sem comentários: validamos o que executa, não a explicação.
const effectCode = effectBlock.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

const deps = depsMatch
  ? depsMatch[1]
      .split(',')
      .map(token => token.trim())
      .filter(Boolean)
  : [];

describe('efeito realtime de App.tsx', () => {
  it('encontra o efeito e as suas dependências', () => {
    expect(effectStart).toBeGreaterThan(-1);
    expect(depsMatch).not.toBeNull();
    expect(deps.length).toBeGreaterThan(0);
  });

  it('só depende do modo de base e do contrato', () => {
    expect([...deps].sort()).toEqual(['databaseMode', 'realtimeTenantId']);
  });

  it('não depende de inventory.lastUpdated nem de pushScreen', () => {
    expect(deps).not.toContain('inventory.lastUpdated');
    expect(deps).not.toContain('pushScreen');
  });

  it('compara o horário pelo ref atual, não pelo valor capturado na render', () => {
    expect(effectCode).toContain('inventoryRef.current.lastUpdated');
    expect(effectCode).not.toContain('inventory.lastUpdated');
  });

  it('usa o pushScreen atual por ref (identidade instável não reabre o canal)', () => {
    expect(effectCode).toContain('realtimePushScreenRef.current(');
    expect(effectCode).not.toContain('pushScreen(');
  });

  it('usa o contrato estável nas duas subscrições', () => {
    expect(effectCode).toContain('}, realtimeTenantId);');
    expect(effectCode).toContain('subscribeToAssetChanges(realtimeTenantId');
    expect(effectCode).not.toContain('user?.tenantid');
  });

  it('resolve o evento por campo em vez de descartar o ativo pendente (Fase 4)', () => {
    expect(effectCode).toContain('mesclarEventoDeAtivo(');
    expect(effectCode).toContain('ativoTemPendencia(');
    expect(effectCode).not.toContain('...updatedAssets[index], ...newAsset');
  });

  it('relê por checkpoint quando o canal reconecta (Fase 4)', () => {
    expect(effectCode).toContain("estado !== 'SUBSCRIBED'");
    expect(effectCode).toContain('reconciliarPorCheckpoint');
    expect(effectCode).toContain('fetchAssetsChangedSince(realtimeTenantId, desde)');
    expect(effectCode).toContain('avancarCheckpoint(checkpointRealtime');
  });

  it('mapeia a linha crua do canal antes de a aplicar ao estado (Fase 4)', () => {
    expect(effectCode).toContain('mapCloudAssetRow((newAssetData || {})');
  });

  it('a reconciliação grava só as linhas que mudaram, não a base inteira', () => {
    const inicio = effectCode.indexOf('const reconciliarPorCheckpoint');
    const fim = effectCode.indexOf('const assetSubscription');
    const reconciliar =
      inicio !== -1 && fim > inicio ? effectCode.slice(inicio, fim) : '';

    expect(reconciliar).not.toBe('');
    expect(reconciliar).toContain('linhasQueMudaram(');
    expect(reconciliar).toContain('saveInventory(newState, undefined, false, true)');
    expect(reconciliar).toContain('persistAssetsBatch(alteradas');
    // `saveInventory(newState)` sem lista regrava todos os ativos.
    expect(reconciliar).not.toContain('saveInventory(newState)');
  });

  it('a foto sincronizada grava só a linha do ativo, não a base inteira', () => {
    const inicio = effectCode.indexOf('const handlePhotoSynced');
    const fim = effectCode.indexOf('window.addEventListener');
    const foto = inicio !== -1 && fim > inicio ? effectCode.slice(inicio, fim) : '';

    expect(foto).not.toBe('');
    expect(foto).toContain('linhasQueMudaram(prev.assets, assets');
    expect(foto).toContain('saveInventory(newState, undefined, false, true)');
    expect(foto).toContain('persistAssetsBatch(alteradas');
    // `saveInventory(newState)` sem lista regrava todos os ativos por foto.
    expect(foto).not.toContain('saveInventory(newState)');
  });

  it('o evento singular grava só a linha que mudou, não a base inteira', () => {
    const inicio = effectCode.indexOf('const assetSubscription');
    const evento = inicio !== -1 ? effectCode.slice(inicio) : '';

    expect(evento).not.toBe('');
    expect(evento).toContain('linhasQueMudaram(prev.assets, updatedAssets');
    expect(evento).toContain('saveInventory(newState, undefined, false, true)');
    expect(evento).toContain('persistAssetsBatch(alteradas');
    // `saveInventory(newState)` sem lista regrava todos os ativos a cada evento.
    expect(evento).not.toContain('saveInventory(newState)');
  });
});
