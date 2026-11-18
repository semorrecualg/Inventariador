import type { Asset } from '../types';

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
 */
export const isConferido = (asset: Partial<Asset>): boolean =>
  asset._conferido === true ||
  Number(asset._conferido) === 1 ||
  String(asset.AUDITOR_STATUS_CONFERENCIA || '').toUpperCase() === 'SIM';
