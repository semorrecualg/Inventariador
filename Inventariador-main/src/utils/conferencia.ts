import { normalizeFlag } from './normalize';

/**
 * «CONFERIDO» É UMA SÓ IDEIA
 * ============================================================================
 * A conferência chega por duas vias e ambas valem: a flag local `_conferido`
 * (booleano, 1/0 do Dexie/SQLite, ou as escritas legadas que `normalizeFlag`
 * já unifica) e a coluna de auditoria da base
 * (`AUDITOR_STATUS_CONFERENCIA === 'SIM'`), que é o que uma planilha já
 * conferida traz.
 *
 * O selo de sincronização, o cartão do ativo, a matriz de tags, o painel e o
 * inventário liam esta regra cada um à sua maneira — o selo só olhava para
 * `_conferido`, o cartão também aceitava a coluna, e o inventário comparava
 * com `_conferido === 1`. A regra passa a viver aqui, uma vez.
 */
type CamposDeConferencia = {
  _conferido?: boolean | number | null;
  AUDITOR_STATUS_CONFERENCIA?: unknown;
};

export const isConferido = (asset: CamposDeConferencia): boolean =>
  normalizeFlag(asset._conferido) ||
  String(asset.AUDITOR_STATUS_CONFERENCIA || '').toUpperCase() === 'SIM';
