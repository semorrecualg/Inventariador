// ============================================================================
// basesBaseLocal.test.ts — em BASE LOCAL o Gestor não consulta a nuvem.
//
// O placar do SRE chamava `countCloudAssets` sempre que o build tinha
// credenciais (`isInternalMode` falso) e, num aparelho em BASE LOCAL, pintava
// «SUPABASE — · ERRO NA LEITURA» com o corpo vazio do servidor — ao lado do
// contador da trilha a dizer «nuvem não consultada (BASE LOCAL)». A BASE LOCAL
// é hermética: nem se lê.
// ============================================================================
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { CLOUD_STATE_LABEL, formatBasesLine } from '../utils/sreProtocol';

const ler = (rel: string) => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');

describe('placar das bases em BASE LOCAL', () => {
  it('diz «BASE LOCAL» em vez de «ERRO» quando a nuvem não é consultada', () => {
    expect(formatBasesLine(12636, { state: 'local', count: null })).toBe(
      'LOCAL 12636 · SUPABASE — · BASE LOCAL'
    );
    expect(CLOUD_STATE_LABEL.local).toContain('BASE LOCAL');
  });

  it('o Gestor decide pelo modo antes de chamar a nuvem', () => {
    const ecra = ler('screens/DatabaseManagerScreen.tsx');
    const portao = ecra.indexOf('if (!isOnlineDatabaseMode(getDatabaseMode()))');
    const chamada = ecra.indexOf('await countCloudAssets(');

    expect(portao).toBeGreaterThan(0);
    expect(chamada).toBeGreaterThan(portao);
  });
});
