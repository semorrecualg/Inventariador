import React, { useState } from 'react';
import {
  Building2,
  Factory,
  Landmark,
  Warehouse,
  ChevronRight,
  LogOut,
  ShieldCheck,
  Briefcase,
  ClipboardCheck,
  Calculator,
  Check
} from 'lucide-react';
import BackButton from './BackButton';
import type { User } from '../types';
import { AppModule, UserRole } from '../types';
import {
  WorkContext,
  groupContextsByTenant,
  normalizeWorkTenant
} from '../utils/workContextUtils';

interface WorkContextSelectorProps {
  user: User;
  contexts: WorkContext[];
  onSelect: (ctx: WorkContext, module: AppModule) => void;
  onLogout: () => void;
}

/**
 * Tela única pós-login (Etapa 3 do FLUXO_ACESSO_INICIAL).
 *
 * Em UM passo visual o usuário resolve o contexto de trabalho completo:
 *   1. Contrato (tenantid) autorizado — badge/botões por contrato;
 *   2. Filial de trabalho — listbox de toque rápido (ou "TODAS AS FILIAIS");
 *   3. Módulo — INVENTARIADOR ou CONTROLE DE ATIVO.
 *
 * Reutiliza a lógica de agrupamento do TenantWorkSelector
 * (groupContextsByTenant) e o estilo dos cards de módulo do ModuleSelector.
 * A escolha define QUAIS dados são carregados (isolamento por contrato/filial).
 */
const WorkContextSelector: React.FC<WorkContextSelectorProps> = ({
  user,
  contexts,
  onSelect,
  onLogout
}) => {
  const groups = groupContextsByTenant(contexts);
  const multiContract = groups.length > 1;

  const [selectedTenant, setSelectedTenant] = useState<string | null>(
    groups.length === 1 ? groups[0].tenantid : null
  );
  const [selectedFilial, setSelectedFilial] = useState<string | null>(null);
  const [selectedModule, setSelectedModule] = useState<AppModule | null>(null);

  const isAuditor = user.role === UserRole.AUDITOR || user.role === UserRole.AUXILIARY_AUDITOR;
  const canProceed = !!selectedTenant && selectedFilial !== null && !!selectedModule;

  const getTenantIdentity = (tenantid: string) => {
    const hash = tenantid.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
    const palettes = [
      'bg-blue-50 text-blue-700 border-blue-100',
      'bg-emerald-50 text-emerald-700 border-emerald-100',
      'bg-purple-50 text-purple-700 border-purple-100',
      'bg-amber-50 text-amber-700 border-amber-100',
      'bg-rose-50 text-rose-700 border-rose-100',
      'bg-indigo-50 text-indigo-700 border-indigo-100'
    ];
    const icons = [Building2, Factory, Landmark, Warehouse];
    return {
      style: palettes[hash % palettes.length],
      Icon: icons[hash % icons.length]
    };
  };

  const activeGroup = groups.find(g => g.tenantid === selectedTenant) || null;
  const filiais = activeGroup?.filiais?.length ? activeGroup.filiais : [''];
  const roleLabel = (user.role || '').toString();
  const userLabel = user.name || user.username || user.email || '';

  return (
    <div className="flex flex-col h-[100dvh] bg-bg-main animate-fadeIn overflow-hidden">
      {/* Header Slim Fixo */}
      <div className="pt-7 pb-4 px-4 bg-white border-b border-gray-100 flex flex-col gap-3.5 shadow-sm shrink-0 min-h-20">
        <div className="flex items-center justify-between w-full h-12">
          <div className="flex-shrink-0 flex items-center">
            <BackButton onClick={onLogout} label="Sair" subLabel="Cancelar" />
          </div>

          <div className="flex-1 flex flex-col items-center justify-center text-center px-1">
            <h2 className="text-[13px] sm:text-sm font-black text-ink uppercase tracking-[0.1em] leading-tight select-none">
              Contrato de Trabalho
            </h2>
            <p className="text-accent text-[8px] font-extrabold uppercase tracking-widest mt-0.5 leading-none select-none">
              Contrato · Filial · Módulo
            </p>
          </div>

          <div className="w-10 h-10 bg-accent rounded-xl flex items-center justify-center text-white shadow-md flex-shrink-0">
            <Briefcase size={16} />
          </div>
        </div>

        {/* Identificação do usuário */}
        <div className="flex items-center justify-between bg-bg-main rounded-xl px-3.5 py-2.5 border border-border">
          <div className="flex items-center space-x-2 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-accent/10 text-accent flex items-center justify-center flex-shrink-0">
              <ShieldCheck size={15} />
            </div>
            <div className="min-w-0 text-left">
              <p className="text-[10px] font-black uppercase tracking-wider text-ink truncate">{userLabel}</p>
              <p className="text-[8px] font-bold uppercase tracking-widest text-ink-muted truncate">
                {roleLabel} · {user.email}
              </p>
            </div>
          </div>
          <span className="text-[8px] font-black uppercase tracking-widest text-ink-muted/60 flex-shrink-0">
            {contexts.length} contextos
          </span>
        </div>
      </div>

      {/* Corpo com scroll */}
      <div className="flex-1 overflow-y-auto px-5 pt-4 pb-32 space-y-5">
        {/* Passo 1 — Contrato (tenantid) */}
        <div>
          <p className="text-[9px] font-bold uppercase tracking-widest text-ink-muted mb-2">
            1 · Contrato autorizado
          </p>
          {multiContract ? (
            <div className="space-y-2">
              {groups.map(group => {
                const { style, Icon } = getTenantIdentity(group.tenantid);
                const isActive = selectedTenant === group.tenantid;
                return (
                  <button
                    key={group.tenantid}
                    type="button"
                    onClick={() => { setSelectedTenant(group.tenantid); setSelectedFilial(null); }}
                    className={`w-full bg-white rounded-2xl px-4 py-3.5 flex items-center justify-between shadow-sm border transition-all cursor-pointer active:scale-[0.98] ${isActive ? 'border-accent ring-1 ring-accent/30' : 'border-gray-100'}`}
                  >
                    <div className="flex items-center space-x-3 min-w-0">
                      <div className={`w-9 h-9 rounded-xl border flex items-center justify-center ${style}`}>
                        <Icon size={18} strokeWidth={2.5} />
                      </div>
                      <div className="min-w-0 text-left">
                        <p className="text-[12px] font-black uppercase tracking-[0.12em] text-ink truncate">
                          {group.tenantid}
                        </p>
                        <p className="text-[7.5px] font-extrabold uppercase tracking-widest text-ink-muted">
                          {group.filiais.length} filial(is) · CONTRATO (TENANTID)
                        </p>
                      </div>
                    </div>
                    {isActive ? (
                      <div className="w-8 h-8 rounded-full bg-accent text-white flex items-center justify-center flex-shrink-0">
                        <Check size={16} />
                      </div>
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-bg-main flex items-center justify-center text-accent flex-shrink-0">
                        <ChevronRight size={16} />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="w-full bg-white rounded-2xl px-4 py-3.5 flex items-center justify-between shadow-sm border border-accent/40">
              <div className="flex items-center space-x-3 min-w-0">
                <div className={`w-9 h-9 rounded-xl border flex items-center justify-center ${getTenantIdentity(selectedTenant || '').style}`}>
                  {(() => { const { Icon } = getTenantIdentity(selectedTenant || ''); return <Icon size={18} strokeWidth={2.5} />; })()}
                </div>
                <div className="min-w-0 text-left">
                  <p className="text-[12px] font-black uppercase tracking-[0.12em] text-ink truncate">
                    {normalizeWorkTenant(selectedTenant || '')}
                  </p>
                  <p className="text-[7.5px] font-extrabold uppercase tracking-widest text-ink-muted">
                    CONTRATO (TENANTID) ATIVO
                  </p>
                </div>
              </div>
              <div className="w-8 h-8 rounded-full bg-accent text-white flex items-center justify-center flex-shrink-0">
                <Check size={16} />
              </div>
            </div>
          )}
        </div>

        {/* Passo 2 — Filial (listbox de toque rápido) */}
        <div>
          <p className="text-[9px] font-bold uppercase tracking-widest text-ink-muted mb-2">
            2 · Filial de trabalho
          </p>
          {!selectedTenant ? (
            <p className="text-[9px] font-bold text-ink-muted uppercase tracking-wider text-center py-4">
              Selecione o contrato primeiro
            </p>
          ) : (
            <div className="space-y-2">
              {filiais.map(filial => {
                const key = filial || '__TODAS__';
                const isActive = selectedFilial === filial;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSelectedFilial(filial)}
                    className={`w-full bg-white rounded-2xl px-4 py-4 flex items-center justify-between shadow-sm border transition-all cursor-pointer active:scale-[0.98] min-h-[58px] ${isActive ? 'border-accent ring-1 ring-accent/30' : 'border-gray-100'}`}
                  >
                    <div className="flex items-center space-x-3 min-w-0">
                      <div className="w-9 h-9 rounded-xl bg-accent/10 text-accent flex items-center justify-center flex-shrink-0">
                        <Building2 size={17} strokeWidth={2.5} />
                      </div>
                      <div className="min-w-0 text-left">
                        <p className="text-[13px] font-bold text-ink truncate">
                          {filial || 'TODAS AS FILIAIS'}
                        </p>
                        <p className="text-[8px] font-extrabold uppercase tracking-widest text-ink-muted">
                          {filial ? `FILIAL · ${normalizeWorkTenant(selectedTenant)}` : 'SEM FILTRO DE UNIDADE'}
                        </p>
                      </div>
                    </div>
                    {isActive && (
                      <div className="w-8 h-8 rounded-full bg-accent text-white flex items-center justify-center flex-shrink-0">
                        <Check size={16} />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Passo 3 — Módulo */}
        <div>
          <p className="text-[9px] font-bold uppercase tracking-widest text-ink-muted mb-2">
            3 · Módulo de trabalho
          </p>
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => setSelectedModule(AppModule.INVENTORY)}
              className={`w-full bg-white rounded-2xl px-4 py-4 flex items-center justify-between shadow-sm border transition-all cursor-pointer active:scale-[0.98] ${selectedModule === AppModule.INVENTORY ? 'border-accent ring-1 ring-accent/30' : 'border-gray-100'}`}
            >
              <div className="flex items-center space-x-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-accent/10 text-accent flex items-center justify-center flex-shrink-0">
                  <ClipboardCheck size={20} strokeWidth={2.5} />
                </div>
                <div className="min-w-0 text-left">
                  <p className="text-[13px] font-black uppercase tracking-wide text-ink">INVENTARIADOR</p>
                  <p className="text-[8px] font-bold uppercase tracking-widest text-ink-muted">
                    Controle físico, etiquetagem e auditoria de campo
                  </p>
                </div>
              </div>
              {selectedModule === AppModule.INVENTORY && (
                <div className="w-8 h-8 rounded-full bg-accent text-white flex items-center justify-center flex-shrink-0">
                  <Check size={16} />
                </div>
              )}
            </button>

            {!isAuditor && (
              <button
                type="button"
                onClick={() => setSelectedModule(AppModule.ASSET_CONTROL)}
                className={`w-full bg-white rounded-2xl px-4 py-4 flex items-center justify-between shadow-sm border transition-all cursor-pointer active:scale-[0.98] ${selectedModule === AppModule.ASSET_CONTROL ? 'border-accent ring-1 ring-accent/30' : 'border-gray-100'}`}
              >
                <div className="flex items-center space-x-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-500 flex items-center justify-center flex-shrink-0">
                    <Calculator size={20} strokeWidth={2.5} />
                  </div>
                  <div className="min-w-0 text-left">
                    <p className="text-[13px] font-black uppercase tracking-wide text-ink">CONTROLE DE ATIVO</p>
                    <p className="text-[8px] font-bold uppercase tracking-widest text-ink-muted">
                      Gestão contábil, depreciação e relatórios fiscais
                    </p>
                  </div>
                </div>
                {selectedModule === AppModule.ASSET_CONTROL && (
                  <div className="w-8 h-8 rounded-full bg-accent text-white flex items-center justify-center flex-shrink-0">
                    <Check size={16} />
                  </div>
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Barra inferior: ACESSAR + sair */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/95 backdrop-blur-xl border-t border-border z-50 shadow-lg space-y-2">
        <button
          type="button"
          disabled={!canProceed}
          onClick={() => canProceed && onSelect(
            { tenantid: selectedTenant as string, filial: selectedFilial as string },
            selectedModule as AppModule
          )}
          className="w-full py-3.5 rounded-xl bg-accent text-white font-extrabold uppercase text-[10px] tracking-[0.15em] active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <ShieldCheck size={15} />
          Acessar o Módulo
        </button>
        <button
          type="button"
          onClick={onLogout}
          className="w-full py-3 rounded-xl border border-red-100 bg-red-50 text-red-600 font-extrabold uppercase text-[9px] tracking-[0.15em] active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer"
        >
          <LogOut size={14} />
          Sair da conta
        </button>
      </div>
    </div>
  );
};

export default WorkContextSelector;
