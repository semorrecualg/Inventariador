/**
 * PORTÃO ÚNICO DO ENVIO PARA A NUVEM
 * ============================================================================
 * A BASE LOCAL é hermética (decisão F1 do plano): além de ser preciso estar no
 * aparelho (`Capacitor.isNativePlatform()`), o modo de base tem de ser online.
 *
 * Vive num módulo próprio para a fila da trilha de auditoria (F2) usar a MESMA
 * regra sem importar `syncService` — `syncService` importa a fila, e a fila
 * importar `syncService` fechava um ciclo de módulos.
 */
import { Capacitor } from '@capacitor/core';
import { getDatabaseMode, isOnlineDatabaseMode } from './supabaseService';

export const canPushToCloud = (): boolean =>
  Capacitor.isNativePlatform() && isOnlineDatabaseMode(getDatabaseMode());
