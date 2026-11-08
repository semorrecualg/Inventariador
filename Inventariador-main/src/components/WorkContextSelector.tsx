import React, { useEffect, useState } from 'react';
import {
  Building2,
  Factory,
  Landmark,
  Warehouse,
  LogOut,
  ShieldCheck,
  Briefcase,
  ClipboardCheck,
  Calculator,
  ChevronRight,
  Check
} from 'lucide-react';
import BackButton from './BackButton';
import type { User } from '../types';
import { AppModule, UserRole } from '../types';
import {
  WorkContext,
  groupContextsByTenant,
  normalizeWorkTenant,
  normalizeWorkFilial
} from '../utils/workContextUtils';
import { canAccessDatabaseManager } from '../utils/authUtils';
import { listContracts, type ContractSummary } from '../utils/tenantCatalog';

interface WorkContextSelectorProps {
  user: User;
  contexts: WorkContext[];
  onSelect: (ctx: WorkContext, module: AppModule) => void;
  onLogout: () => void;
  /**
   * Saída para o Gestor de Base quando o dono global ainda não tem contrato
   * na base (primeira instalação). Sem isso a tela era um beco sem saída:
   * "0 contextos" + botão ACESSAR desabilitado + só sair da conta.
   */
  onOpenDatabase?: () => void;
}

/**
 * Tela única pós-login (Etapa 3 do FLUXO_ACESSO_INICIAL).
 *
 * O contrato (tenantid) e a filial de trabalho já foram resolvidos na ETAPA 2/2
 * do login — aqui NÃO há mais seleção de contrato nem de filial (itens
 * eliminados por redundância). A tela mostra o contexto ativo como cartão fixo
 * e o usuário apenas escolhe o MÓDULO de trabalho (INVENTARIADOR ou
 * CONTROLE DE ATIVO). A escolha define QUAIS dados são carregados
 * (isolamento por contrato/filial).
 */
const WorkContextSelector: React.FC<WorkContextSelectorProps> = ({
  user,
  contexts,
  onSelect,
  onLogout,
  onOpenDatabase
}) => {
  const groups = groupContextsByTenant(contexts);

  // Contexto ativo: o contrato do login (user.tenantid) se estiver autorizado;
  // senão, o primeiro contexto disponível. A filial é a escolhida no login
  // (user.filial / user.units[0]) ou a primeira do contrato.
  const activeGroup =
    groups.find(g => g.tenantid === normalizeWorkTenant(user.tenantid || '')) ||
    groups[0] ||
    null;
  const activeFilial =
    normalizeWorkFilial(user.filial || (Array.isArray(user.units) && user.units[0]) || '') ||
    (activeGroup?.filiais?.[0] || '');

  const selectedTenantBaseline = activeGroup?.tenantid || '';

  const [selectedModule, setSelectedModule] = useState<AppModule | null>(null);

  // DONO GLOBAL (admin sem contrato no perfil): o contrato vem da BASE — o
  // tenantid é a primeira coluna dos ativos. Liberado somente pelo gate
  // administrativo; um usuário comum nunca vê os contratos de outros clientes.
  const isGlobalAdmin = !activeGroup && canAccessDatabaseManager(user);
  const [baseContracts, setBaseContracts] = useState<ContractSummary[]>([]);
  const [manualTenant, setManualTenant] = useState('');

  useEffect(() => {
    if (!isGlobalAdmin) return;
    let alive = true;
    listContracts()
      .then((list) => {
        if (alive) setBaseContracts(list);
      })
      .catch(() => {
        /* sem catálogo: a tela mantém o aviso de contrato ausente */
      });
    return () => {
      alive = false;
    };
  }, [isGlobalAdmin]);

  const selectedTenant = selectedTenantBaseline || manualTenant;
  const selectedFilial = activeGroup ? activeFilial : '';

  const isAuditor = user.role === UserRole.AUDITOR || user.role === UserRole.AUXILIARY_AUDITOR;
  const canProceed = !!selectedTenant && !!selectedModule;

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
              Escolha o Módulo de Trabalho
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
            {isGlobalAdmin ? `${baseContracts.length} contratos na base` : `${contexts.length} contextos`}
          </span>
        </div>
      </div>

      {/* Corpo com scroll */}
      <div className="flex-1 overflow-y-auto px-5 pt-4 pb-32 space-y-5">
        {!selectedTenant ? (
          isGlobalAdmin ? (
            <div className="space-y-3">
              <div className="flex flex-col items-center justify-center pt-6 pb-2 text-center">
                <div className="w-14 h-14 bg-accent-soft border border-border rounded-2xl flex items-center justify-center text-accent mb-4">
                  <Building2 size={26} />
                </div>
                <p className="font-extrabold uppercase tracking-[0.1em] text-[10px] text-ink mb-2">
                  Escolha o contrato da base
                </p>
                <p className="text-[9px] font-bold text-ink-muted uppercase tracking-wider max-w-[260px] leading-relaxed">
                  Login de administrador global: o perfil não declara contrato. Selecione o tenantid
                  que será inventariado.
                </p>
              </div>

              {baseContracts.length === 0 ? (
                <div className="space-y-3">
                  <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4">
                    <p className="text-[9px] font-extrabold text-amber-700 uppercase tracking-widest leading-relaxed text-center">
                      Nenhum contrato encontrado na base local. Carregue a base no Gestor de Base.
                    </p>
                  </div>
                  {onOpenDatabase && (
                    <button
                      type="button"
                      onClick={onOpenDatabase}
                      className="w-full py-3.5 rounded-xl bg-accent text-white font-extrabold uppercase text-[10px] tracking-[0.15em] active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <Building2 size={15} />
                      Abrir Gestor de Base
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  {baseContracts.map((contract) => {
                    const identity = getTenantIdentity(contract.tenantid);
                    return (
                      <button
                        key={contract.tenantid}
                        type="button"
                        onClick={() => setManualTenant(contract.tenantid)}
                        className="w-full bg-white rounded-2xl px-4 py-3.5 flex items-center justify-between shadow-sm border border-gray-100 active:scale-[0.98] transition-all cursor-pointer"
                      >
                        <div className="flex items-center space-x-3 min-w-0">
                          <div className={`w-9 h-9 rounded-xl border flex items-center justify-center ${identity.style}`}>
                            <identity.Icon size={18} strokeWidth={2.5} />
                          </div>
                          <div className="min-w-0 text-left">
                            <p className="text-[12px] font-black uppercase tracking-[0.12em] text-ink truncate">
                              {contract.tenantid}
                            </p>
                            <p className="text-[7.5px] font-extrabold uppercase tracking-widest text-ink-muted truncate">
                              {contract.filiais.length > 0
                                ? `${contract.filiais.length} filial(is) na base`
                                : 'sem filial na base'}
                            </p>
                          </div>
                        </div>
                        <ChevronRight size={16} className="text-ink-muted/40 flex-shrink-0" />
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-14 text-center">
              <div className="w-14 h-14 bg-amber-50 border border-amber-100 rounded-2xl flex items-center justify-center text-amber-500 mb-4">
                <Briefcase size={26} />
              </div>
              <p className="font-extrabold uppercase tracking-[0.1em] text-[10px] text-amber-600 mb-2">
                Nenhum contrato disponível
              </p>
              <p className="text-[9px] font-bold text-ink-muted uppercase tracking-wider max-w-[240px] leading-relaxed">
                Contate o administrador do sistema para vincular seu contrato.
              </p>
            </div>
          )
        ) : (
          <>
            {isGlobalAdmin && baseContracts.length > 0 && (
              <div>
                <p className="text-[9px] font-bold uppercase tracking-widest text-ink-muted mb-2">
                  Contratos na base
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {baseContracts.map((contract) => (
                    <button
                      key={contract.tenantid}
                      type="button"
                      onClick={() => setManualTenant(contract.tenantid)}
                      className={`px-2.5 py-1.5 rounded-lg text-[8px] font-black uppercase tracking-widest border transition-all active:scale-95 cursor-pointer ${
                        selectedTenant === contract.tenantid
                          ? 'bg-accent text-white border-accent'
                          : 'bg-white text-ink-muted border-border'
                      }`}
                    >
                      {contract.tenantid}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {/* Contexto de trabalho — resolvido no login (ETAPA 2/2), somente leitura */}
            <div>
              <p className="text-[9px] font-bold uppercase tracking-widest text-ink-muted mb-2">
                Contexto de trabalho
              </p>
              <div className="w-full bg-white rounded-2xl px-4 py-3.5 flex items-center justify-between shadow-sm border border-accent/40">
                <div className="flex items-center space-x-3 min-w-0">
                  <div className={`w-9 h-9 rounded-xl border flex items-center justify-center ${getTenantIdentity(selectedTenant).style}`}>
                    <Building2 size={18} strokeWidth={2.5} />
                  </div>
                  <div className="min-w-0 text-left">
                    <p className="text-[12px] font-black uppercase tracking-[0.12em] text-ink truncate">
                      {normalizeWorkTenant(selectedTenant)}
                    </p>
                    <p className="text-[7.5px] font-extrabold uppercase tracking-widest text-ink-muted truncate">
                      {activeFilial ? `FILIAL · ${activeFilial}` : 'TODAS AS FILIAIS'} · CONTRATO (TENANTID)
                    </p>
                  </div>
                </div>
                <div className="w-8 h-8 rounded-full bg-accent text-white flex items-center justify-center flex-shrink-0">
                  <Check size={16} />
                </div>
              </div>
            </div>

            {/* Módulo de trabalho */}
            <div>
              <p className="text-[9px] font-bold uppercase tracking-widest text-ink-muted mb-2">
                Módulo de trabalho
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
          </>
        )}
      </div>

      {/* Barra inferior: ACESSAR + sair */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/95 backdrop-blur-xl border-t border-border z-50 shadow-lg space-y-2">
        <button
          type="button"
          disabled={!canProceed}
          onClick={() => canProceed && onSelect(
            { tenantid: selectedTenant, filial: selectedFilial },
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
