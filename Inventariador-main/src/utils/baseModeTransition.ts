// ============================================================================
// baseModeTransition.ts — decisão única do seletor «Modo de Base».
//
// Regras (por esta ordem, para o utilizador nunca ver um aviso enganador):
//   1. mesmo modo → nada a fazer;
//   2. Base Oficial sem chaves do Supabase no build → recusa;
//   3. Base Oficial sem rede → recusa (blindagem e modo intactos);
//   4. Base Oficial blindada → desbloqueio guiado + troca no mesmo fluxo;
//   5. caso contrário → troca.
//
// A Base Local não depende de rede: voltar para ela funciona offline e aplica a
// blindagem automaticamente no executor (sem cliques extra).
// ============================================================================

import { DatabaseMode } from '../types';

export type BaseModeSwitchPlan =
  | { action: 'same' }
  | { action: 'missing-keys' }
  | { action: 'offline' }
  | { action: 'unseal-and-switch' }
  | { action: 'switch' };

export interface BaseModeSwitchInput {
  current: DatabaseMode;
  target: DatabaseMode;
  /** Build actual tem VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY. */
  hasCloudKeys: boolean;
  isOnline: boolean;
  isLocked: boolean;
}

export const planBaseModeSwitch = ({
  current,
  target,
  hasCloudKeys,
  isOnline,
  isLocked
}: BaseModeSwitchInput): BaseModeSwitchPlan => {
  if (target === current) return { action: 'same' };
  if (target === DatabaseMode.INTERNAL) return { action: 'switch' };
  if (!hasCloudKeys) return { action: 'missing-keys' };
  if (!isOnline) return { action: 'offline' };
  if (isLocked) return { action: 'unseal-and-switch' };
  return { action: 'switch' };
};
