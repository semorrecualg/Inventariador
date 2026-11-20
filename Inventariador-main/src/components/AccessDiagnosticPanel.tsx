// ============================================================================
// AccessDiagnosticPanel.tsx — «DIAGNÓSTICO DE ACESSO» do PAINEL COMPLETO.
//
// Responde, sem devtools e ao telefone, à pergunta que custou o incidente:
// «as filiais vêm da base local, da nuvem, da cache ou de nenhum lado — e a
// sessão sobrevive a recarregar?». O conteúdo é decidido por
// `utils/accessDiagnostics.ts`; este componente só o mostra e o copia.
// ============================================================================
import React, { useState } from 'react';
import { Check, Copy, X } from 'lucide-react';
import type { AccessDiagnostic } from '../utils/accessDiagnostics';

interface AccessDiagnosticPanelProps {
  diagnostic: AccessDiagnostic;
  onClose: () => void;
}

const AccessDiagnosticPanel: React.FC<AccessDiagnosticPanelProps> = ({ diagnostic, onClose }) => {
  const [copiado, setCopiado] = useState(false);
  const [falhouCopia, setFalhouCopia] = useState(false);

  const copiar = async () => {
    setFalhouCopia(false);

    try {
      await navigator.clipboard.writeText(diagnostic.texto);
    } catch {
      // WebView sem Clipboard API (ou sem permissão): cópia clássica.
      try {
        const area = document.createElement('textarea');
        area.value = diagnostic.texto;
        area.setAttribute('readonly', '');
        area.style.position = 'fixed';
        area.style.opacity = '0';
        document.body.appendChild(area);
        area.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(area);
        if (!ok) throw new Error('execCommand devolveu false');
      } catch {
        setFalhouCopia(true);
        return;
      }
    }

    setCopiado(true);
  };

  return (
    <div className="fixed inset-0 z-[10002] bg-white/95 backdrop-blur-md flex flex-col items-center justify-start overflow-y-auto p-6 pt-24 pb-12 animate-fadeIn no-scrollbar">
      <div className="w-full max-w-md space-y-4">
        <div className="text-center">
          <h2 className="text-xl font-bold text-ink uppercase tracking-tight">Diagnóstico de Acesso</h2>
          <p className="text-[9px] font-bold text-ink-muted uppercase tracking-[0.3em] mt-1.5">
            Contrato · Filiais · Sessão
          </p>
        </div>

        <div className="bg-white border border-border rounded-2xl shadow-sm divide-y divide-border">
          {diagnostic.linhas.map((linha) => (
            <div key={linha.rotulo} className="flex items-start justify-between gap-4 p-3">
              <span className="text-[9px] font-bold text-ink-muted uppercase tracking-widest pt-0.5">
                {linha.rotulo}
              </span>
              <span className="text-[11px] font-bold text-ink text-right break-words">{linha.valor}</span>
            </div>
          ))}
        </div>

        <div className="space-y-2">
          <button
            onClick={copiar}
            className="w-full flex items-center justify-center p-4 bg-accent text-white rounded-2xl active:scale-[0.98] transition-all font-bold text-[11px] uppercase tracking-widest shadow-sm"
          >
            {copiado ? <Check size={16} className="mr-2" /> : <Copy size={16} className="mr-2" />}
            {copiado ? 'Copiado' : 'Copiar diagnóstico'}
          </button>

          {falhouCopia && (
            <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wide text-center">
              Não foi possível copiar — seleciona o texto acima
            </p>
          )}

          <button
            onClick={onClose}
            className="w-full flex items-center justify-center p-4 bg-white border border-border rounded-2xl active:scale-[0.98] transition-all font-bold text-[11px] text-ink-muted uppercase tracking-widest shadow-sm"
          >
            <X size={16} className="mr-2" />
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};

export default AccessDiagnosticPanel;
