import { normalizeFlag } from './normalize';

/**
 * «CONFERIDO» É UMA SÓ IDEIA
 * ============================================================================
 * A conferência chega por duas vias e ambas valem: a flag local `_conferido`
 * (booleano, ou 1/0 vindo do Dexie/SQLite) e a coluna de auditoria da base
 * (`AUDITOR_STATUS_CONFERENCIA === 'SIM'`), que é o que uma planilha já
 * conferida traz.
 *
 * O selo de sincronização e o cartão do ativo liam esta regra cada um à sua
 * maneira: o selo só olhava para `_conferido`, o cartão também aceitava a
 * coluna. Um ativo conferido apenas pela coluna aparecia como «base por
 * espelhar» no selo, embora o cartão o mostrasse já processado. A regra passa a
 * viver aqui, uma vez, para os dois lerem o mesmo.
 *
 * O envio para a nuvem lê a mesma regra: antes só aceitava
 * `Number(_conferido) === 1`, pelo que um ativo conferido no aparelho como
 * booleano — ou conferido pela coluna da base — subia como PENDENTE e a nuvem
 * nunca ficava a saber da conferência.
 */

/**
 * `_conferido` chega em três formatos conforme quem gravou: booleano (App),
 * `0|1` (carregador/SQLite) e texto `'1'`/`'true'` (JSON reimportado). A coluna
 * da base chega como texto. `normalizeFlag` já unifica as escritas mistas do
 * repositório, por isso a regra não repete essa conversão.
 */
export const isConferido = (asset: {
  _conferido?: unknown;
  AUDITOR_STATUS_CONFERENCIA?: unknown;
}): boolean =>
  normalizeFlag(asset._conferido) ||
  String(asset.AUDITOR_STATUS_CONFERENCIA || '').toUpperCase() === 'SIM';
