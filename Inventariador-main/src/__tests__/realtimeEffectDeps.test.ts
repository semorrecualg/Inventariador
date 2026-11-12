import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Contrato do efeito de tempo real em App.tsx.
 *
 * O efeito já dependeu de `inventory.lastUpdated`: cada sincronização mudava o
 * valor, o React limpava o efeito e o canal era desligado/religado de imediato
 * (perdendo eventos nesse intervalo). Agora a comparação usa `inventoryRef`
 * (sempre atual) e o efeito só volta a correr quando muda o contrato.
 */
const appSource = readFileSync(fileURLToPath(new URL('../App.tsx', import.meta.url)), 'utf8');

const effectStart = appSource.indexOf('// Real-time Cloud Sync Listener');
const depsStart = appSource.indexOf('}, [', effectStart);
const depsLine = appSource.slice(depsStart, appSource.indexOf('\n', depsStart) + 1);
const effectBlock = appSource.slice(effectStart, depsStart);
// O código sem comentários: a verificação é sobre o que executa, não sobre o
// comentário que explica a correção.
const effectCode = effectBlock.replace(/\/\/[^\n]*/g, '');

describe('efeito realtime de App.tsx', () => {
  it('encontra o efeito e a sua lista de dependências', () => {
    expect(effectStart).toBeGreaterThan(-1);
    expect(depsStart).toBeGreaterThan(effectStart);
    expect(depsLine).toContain(']);');
  });

  it('não depende de inventory.lastUpdated (canal não reabre a cada sincronização)', () => {
    expect(depsLine).not.toContain('inventory.lastUpdated');
    expect(depsLine).toBe('}, [databaseMode, realtimeTenantId, pushScreen]);\n');
  });

  it('compara o horário pelo ref atual, não pelo valor capturado na render', () => {
    expect(effectCode).toContain('inventoryRef.current.lastUpdated');
    expect(effectCode).not.toContain('inventory.lastUpdated');
  });

  it('usa o contrato estável nas duas subscrições', () => {
    expect(effectBlock).toContain('}, realtimeTenantId);');
    expect(effectBlock).toContain('subscribeToAssetChanges(realtimeTenantId');
    expect(effectBlock).not.toContain('user?.tenantid');
  });
});
