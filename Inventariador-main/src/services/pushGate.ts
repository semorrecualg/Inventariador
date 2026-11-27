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
import { isSystemLocked } from '../utils/systemLock';

/**
 * A blindagem física (`is_system_locked`) entra aqui, no portão por onde passam
 * TODOS os envios (fila de ativos, fotos, campanhas, trilha de auditoria e
 * `syncAssetsToCloud`). Antes ela só valia enquanto o arranque forçava o modo a
 * INTERNAL: um app já aberto e blindado pelo Administrador continuava a enviar
 * no ciclo de 60 s, porque o modo em memória ainda era de nuvem.
 */
export const canPushToCloud = (): boolean =>
  !isSystemLocked() && Capacitor.isNativePlatform() && isOnlineDatabaseMode(getDatabaseMode());
