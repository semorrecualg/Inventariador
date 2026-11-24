import React, { useEffect, useState } from 'react';

/**
 * SELO GLOBAL DE BASE E SINCRONIZAÇÃO.
 *
 * Montado uma vez no App, fica visível em todas as telas do shell (fora o
 * arranque e o login) e responde à pergunta que a barra amarela só respondia
 * dentro do Gestor: **em que base este aparelho está a operar agora?**
 *
 * - `BASE LOCAL` → ponto vermelho (nada sai do aparelho).
 * - `SUPABASE`  → ponto verde (Base Oficial).
 *
 * A segunda luz é a da sincronização, discreta e sem toques
 * (`pointer-events-none`), para nunca tapar botões:
 * verde = tudo enviado · âmbar a piscar = sincronizando ou fila pendente ·
 * vermelho = sem rede ou envio parado · cinza = nuvem desligada (Base Local).
 */

export type SyncLight = 'sincronizado' | 'sincronizando' | 'pendente' | 'sem-rede' | 'parado' | 'local';

export interface SyncLightInput {
  isOnlineMode: boolean;
  isOnline: boolean;
  isSyncing: boolean;
  pending: number;
  isSyncLocked?: boolean;
  syncError?: string | null;
}

/**
 * Regra única da segunda luz (pura, testável). A ordem importa: em Base Local a
 * nuvem está desligada por desenho — não é falha nem fila pendente.
 */
export const resolveSyncLight = ({
  isOnlineMode,
  isOnline,
  isSyncing,
  pending,
  isSyncLocked = false,
  syncError = null
}: SyncLightInput): SyncLight => {
  if (!isOnlineMode) return 'local';
  if (!isOnline) return 'sem-rede';
  if (isSyncing) return 'sincronizando';
  if (isSyncLocked || syncError) return 'parado';
  if (pending > 0) return 'pendente';
  return 'sincronizado';
};

const SYNC_APPEARANCE: Record<SyncLight, { label: (pending: number) => string; dot: string; text: string; border: string; pulse: boolean }> = {
  sincronizado: {
    label: () => 'Sincronizado',
    dot: 'bg-emerald-500',
    text: 'text-emerald-600',
    border: 'border-emerald-300',
    pulse: false
  },
  sincronizando: {
    label: () => 'Sincronizando…',
    dot: 'bg-amber-400',
    text: 'text-amber-600',
    border: 'border-amber-300',
    pulse: true
  },
  pendente: {
    label: (pending) => `${pending} pendente${pending > 1 ? 's' : ''}`,
    dot: 'bg-amber-400',
    text: 'text-amber-600',
    border: 'border-amber-300',
    pulse: true
  },
  'sem-rede': {
    label: () => 'Sem rede',
    dot: 'bg-red-500',
    text: 'text-red-600',
    border: 'border-red-300',
    pulse: false
  },
  parado: {
    label: () => 'Envio parado',
    dot: 'bg-red-500',
    text: 'text-red-600',
    border: 'border-red-300',
    pulse: false
  },
  local: {
    label: () => 'Nuvem desligada',
    dot: 'bg-slate-400',
    text: 'text-slate-500',
    border: 'border-slate-300',
    pulse: false
  }
};

export interface BaseModeBeaconProps {
  /** `isOnlineDatabaseMode(databaseMode)` — a mesma regra usada pelo resto do app. */
  isOnlineMode: boolean;
  isSyncing?: boolean;
  /** Ativos e eventos da trilha ainda por subir. */
  pendingData?: number;
  /** Fotos da campanha ainda por subir. */
  pendingPhotos?: number;
  isSyncLocked?: boolean;
  syncError?: string | null;
}

export const BaseModeBeacon: React.FC<BaseModeBeaconProps> = ({
  isOnlineMode,
  isSyncing = false,
  pendingData = 0,
  pendingPhotos = 0,
  isSyncLocked = false,
  syncError = null
}) => {
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine
  );

  useEffect(() => {
    const aoFicarOnline = () => setIsOnline(true);
    const aoFicarOffline = () => setIsOnline(false);
    window.addEventListener('online', aoFicarOnline);
    window.addEventListener('offline', aoFicarOffline);
    return () => {
      window.removeEventListener('online', aoFicarOnline);
      window.removeEventListener('offline', aoFicarOffline);
    };
  }, []);

  const pending = Math.max(0, pendingData) + Math.max(0, pendingPhotos);
  const light = resolveSyncLight({ isOnlineMode, isOnline, isSyncing, pending, isSyncLocked, syncError });
  const sync = SYNC_APPEARANCE[light];

  return (
    <div
      data-gbr-mode-beacon=""
      data-testid="base-mode-beacon"
      aria-live="polite"
      className="pointer-events-none fixed left-2 z-[9000] flex max-w-[10.5rem] select-none flex-col items-start gap-1"
    >
      <div
        title={
          isOnlineMode
            ? 'Base ativa neste aparelho: Base Oficial (Supabase) — os dados sincronizam pela internet.'
            : 'Base ativa neste aparelho: Base Local — nada sai deste aparelho.'
        }
        className={`flex items-center gap-1.5 rounded-full border bg-white/85 px-2 py-0.5 shadow-sm backdrop-blur-sm ${
          isOnlineMode ? 'border-emerald-300' : 'border-red-300'
        }`}
      >
        <span
          data-testid="beacon-mode-dot"
          className={`h-1.5 w-1.5 shrink-0 rounded-full ${isOnlineMode ? 'bg-emerald-500' : 'bg-red-500'}`}
        />
        <span
          className={`text-[8px] font-black uppercase leading-none tracking-[0.15em] ${
            isOnlineMode ? 'text-emerald-600' : 'text-red-600'
          }`}
        >
          {isOnlineMode ? 'Supabase' : 'Base Local'}
        </span>
      </div>

      <div
        title={
          light === 'local'
            ? 'Base Local: a nuvem está desligada por desenho — nenhum dado sai do aparelho.'
            : light === 'sincronizado'
              ? 'Tudo sincronizado com a Base Oficial.'
              : light === 'sincronizando'
                ? 'A enviar dados para a Base Oficial…'
                : light === 'pendente'
                  ? `${pending} item(ns) à espera de envio para a Base Oficial.`
                  : light === 'sem-rede'
                    ? 'Sem internet: nada está a sincronizar.'
                    : 'Envio parado — verifique a fila no Gestor de Base de Dados.'
        }
        className={`flex items-center gap-1.5 rounded-full border bg-white/85 px-2 py-0.5 shadow-sm backdrop-blur-sm ${sync.border}`}
      >
        <span
          data-testid="beacon-sync-dot"
          className={`h-1.5 w-1.5 shrink-0 rounded-full ${sync.dot} ${sync.pulse ? 'animate-pulse' : ''}`}
        />
        <span
          data-testid="beacon-sync-label"
          className={`text-[8px] font-black uppercase leading-none tracking-[0.15em] ${sync.text}`}
        >
          {sync.label(pending)}
        </span>
      </div>
    </div>
  );
};

export default BaseModeBeacon;
