import React from "react";
import { useBufferController } from "../hooks/useBufferController";
import { Database, RefreshCw, Save } from "lucide-react";

/**
 * Componente de Controle Estritamente Tipado para o Buffer Atômico ("Regra dos 5")
 */
export const BufferIndicator: React.FC = () => {
  const { pendingCount, isFlushing, flush } = useBufferController();

  if (pendingCount === 0) {
    return (
      <div 
        id="buffer-indicator-container"
        className="bg-slate-50 border border-slate-100/50 p-4 rounded-2xl flex items-center justify-between transition-all"
      >
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400">
            <Database size={16} />
          </div>
          <div>
            <h4 className="text-[10px] font-black text-slate-450 uppercase tracking-widest">Base de Dados .DB</h4>
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Sincronizado & Estável</p>
          </div>
        </div>
        <span className="text-[9px] font-black font-mono text-slate-400 bg-slate-100 px-2.5 py-1 rounded-full uppercase tracking-wider">
          OK
        </span>
      </div>
    );
  }

  return (
    <div 
      id="buffer-indicator-container"
      className="bg-amber-50 border border-amber-200/50 p-4 rounded-2xl flex items-center justify-between shadow-sm animate-pulse-soft transition-all"
    >
      <div className="flex items-center space-x-3">
        <div className="w-8 h-8 rounded-xl bg-amber-100 flex items-center justify-center text-amber-600">
          <Database size={16} />
        </div>
        <div>
          <h4 className="text-[10px] font-black text-amber-800 uppercase tracking-widest">Buffer Atômico Ativo</h4>
          <p className="text-[9px] font-bold text-amber-650 uppercase tracking-widest mt-0.5">
            {pendingCount} {pendingCount === 1 ? "alteração retida" : "alterações retidas"}
          </p>
        </div>
      </div>
      
      <button
        id="btn-buffer-flush"
        onClick={flush}
        disabled={isFlushing}
        className="flex items-center space-x-1.5 px-3 py-2 bg-amber-500 hover:bg-amber-600 disabled:bg-slate-350 text-white rounded-xl text-[9px] font-black uppercase tracking-widest transition-all hover:scale-102 active:scale-98 shadow-md shadow-amber-500/15"
      >
        {isFlushing ? (
          <RefreshCw size={11} className="animate-spin" />
        ) : (
          <Save size={11} />
        )}
        <span>{isFlushing ? "REGISTRANDO..." : "COMMIT"}</span>
      </button>
    </div>
  );
};
