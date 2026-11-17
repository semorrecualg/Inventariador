import React from 'react';
import { APP_VERSION_LABEL } from '../utils/appVersion';

/**
 * SELO DE VERSÃO GLOBAL — montado uma vez no router, aparece em todas as telas
 * com o mesmo formato e a mesma posição, lido de `package.json`.
 *
 * Fica no canto inferior direito, não intercepta toques (`pointer-events-none`)
 * e usa um z-index abaixo dos modais (que vão até z-[20000]), para não tapar
 * diálogos nem botões de ação.
 */
const AppVersionStamp: React.FC<{ className?: string }> = ({ className }) => (
  <div
    data-testid="app-version-stamp"
    title={`Versão do app ${APP_VERSION_LABEL} — lida de package.json`}
    className={`pointer-events-none fixed bottom-1.5 right-2 z-[9000] select-none rounded-full border border-slate-200/70 bg-white/75 px-2 py-0.5 shadow-sm backdrop-blur-sm ${className ?? ''}`}
  >
    <span className="text-[8px] font-black uppercase tracking-[0.2em] text-slate-500">
      {APP_VERSION_LABEL}
    </span>
  </div>
);

export default AppVersionStamp;
