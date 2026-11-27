import React from 'react';
import { LogIn } from 'lucide-react';
import { pareceFaltaDeSessao } from '../utils/sessaoNuvem';

interface SyncSessionNoticeProps {
  /** Aviso que a barra de sincronização recebeu (`syncError`). */
  syncError?: string | null;
  /** Fecha a sessão e devolve o operador ao formulário de entrada. */
  onReautenticar?: () => void;
}

/**
 * AVISO ACIONÁVEL DA SESSÃO DA NUVEM
 * ============================================================================
 * O portão do envio recusa o ciclo quando o pedido chegaria como `anon` e o
 * aviso sobe para a barra. Só que «Sem sessão» sem botão obriga o operador a
 * procurar o Gestor de Base para sair e entrar outra vez. Aqui o aviso traz a
 * ação: o botão limpa a sessão local e abre o formulário de entrada, que é o
 * que repõe o token (o login local abre a sessão da nuvem).
 *
 * Só aparece para avisos de sessão: os outros bloqueios (cópias na base, selo
 * de geração) têm a sua própria instrução e não se resolvem a entrar de novo.
 */
export const SyncSessionNotice: React.FC<SyncSessionNoticeProps> = ({
  syncError,
  onReautenticar
}) => {
  if (!syncError || !pareceFaltaDeSessao(syncError)) return null;

  return (
    <button
      type="button"
      id="sync-reautenticar-btn"
      onClick={() => onReautenticar?.()}
      title={syncError}
      className="flex items-center space-x-1.5 px-3 py-1.5 rounded-full border bg-red-50 border-red-200 text-red-600 active:scale-95 transition-all hover:bg-red-100"
    >
      <LogIn size={12} />
      <span className="text-[9px] font-bold uppercase tracking-tight">Sem sessão · Entrar</span>
    </button>
  );
};

export default SyncSessionNotice;
