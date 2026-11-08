import React, { useEffect, useMemo, useState } from 'react';
import {
  Building2,
  Factory,
  Landmark,
  LogOut,
  ShieldCheck,
  Briefcase,
  ClipboardCheck,
  Calculator,
  ChevronRight,
  Check,
  Lock,
  UserPlus,
  Users,
  Calendar,
  SlidersHorizontal,
  QrCode,
  Database,
  History,
  KeyRound,
  Settings
} from 'lucide-react';
import BackButton from './BackButton';
import type { NavigationParams, User } from '../types';
import { AppModule, AppScreen, UserRole } from '../types';
import { isAdminUser } from '../services/rbacService';
import {
  WorkContext,
  buildFilialOptions,
  groupContextsByTenant,
  normalizeWorkTenant,
  normalizeWorkFilial
} from '../utils/workContextUtils';
import { canAccessDatabaseManager } from '../utils/authUtils';
import {
  describeUnitReleaseMissing,
  readUnitRelease,
  type UnitReleaseMap
} from '../utils/unitRelease';
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
  /**
   * Liberação das unidades (`TENANTID::FILIAL` → âncora/campanha). O admin
   * configura as duas na Unidade Operacional; o auditor só entra nas liberadas.
   */
  unitRelease?: UnitReleaseMap;
  /**
   * Navegação administrativa a partir do próprio CONTRATO DE TRABALHO: as
   * liberações exclusivas de ADMIN/MASTER (filiais, campanhas, campos, QR,
   * base de dados, cargas, licenças, unidade operacional).
   */
  onOpenAdmin?: (screen: AppScreen, params?: NavigationParams) => void;
  /** Abre o formulário de cadastro de NOVOS USUÁRIOS (somente admin/master). */
  onOpenNewUser?: () => void;
}

/**
 * Tela única pós-login (Etapa 3 do FLUXO_ACESSO_INICIAL).
 *
 * FLUXO ÚNICO: é aqui — e somente aqui — que o usuário escolhe o contrato, a
 * FILIAL (UNIDADE OPERACIONAL) e o módulo de trabalho. O login apenas
 * autentica; a etapa de filial que existia na tela de login foi eliminada.
 *
 * A lista de filiais é ABERTA entre as filiais AUTORIZADAS do perfil: um
 * auditor liberado pelo administrador para várias filiais alterna entre elas
 * aqui, sem voltar ao login. A escolha define QUAIS dados são carregados
 * (isolamento por contrato/filial).
 */
const WorkContextSelector: React.FC<WorkContextSelectorProps> = ({
  user,
  contexts,
  onSelect,
  onLogout,
  onOpenDatabase,
  unitRelease,
  onOpenAdmin,
  onOpenNewUser
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
  // null = ainda não escolheu explicitamente (a tela pré-seleciona a filial do
  // perfil ou a primeira disponível). '' é uma escolha REAL: contrato inteiro.
  const [selectedFilial, setSelectedFilial] = useState<string | null>(null);

  // DONO GLOBAL (admin sem contrato no perfil): o contrato vem da BASE — o
  // tenantid é a primeira coluna dos ativos. Liberado somente pelo gate
  // administrativo; um usuário comum nunca vê os contratos de outros clientes.
  const isGlobalAdmin = !activeGroup && canAccessDatabaseManager(user);
  const [baseContracts, setBaseContracts] = useState<ContractSummary[]>([]);
  const [manualTenant, setManualTenant] = useState('');

  // Catálogo de contratos/filiais da base local: alimenta as opções de filial
  // de TODOS os perfis (leitura local, sem rede).
  useEffect(() => {
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
  }, []);

  const selectedTenant = selectedTenantBaseline || manualTenant;

  const isAuditor = user.role === UserRole.AUDITOR || user.role === UserRole.AUXILIARY_AUDITOR;
  // AUDITOR DE CAMPO: quem não administra a unidade. O admin/master configura a
  // unidade (âncora + campanha) e libera o inventário — para ele esta tela não
  // muda nada.
  const isAuditorOnly = isAuditor && !canAccessDatabaseManager(user);
  // ADMIN/MASTER: dono das liberações. Nesta tela ele vê o estado da unidade
  // (âncora + campanha) e o cadastro de acessos, sem sair do contrato.
  const isAdmin = isAdminUser(user);
  const canManageBase = canAccessDatabaseManager(user);

  const baseFiliais = useMemo(() => {
    const tenant = normalizeWorkTenant(selectedTenant);
    return baseContracts.find((c) => normalizeWorkTenant(c.tenantid) === tenant)?.filiais ?? [];
  }, [baseContracts, selectedTenant]);

  const filialOptions = useMemo(
    () => buildFilialOptions({ tenantid: selectedTenant, contexts, baseFiliais }),
    [selectedTenant, contexts, baseFiliais]
  );

  // Pré-seleção: a filial resolvida no login (quando autorizada) ou a primeira
  // opção. O usuário pode trocar livremente entre as autorizadas.
  const defaultFilial = filialOptions.some((o) => o.filial === activeFilial)
    ? activeFilial
    : (filialOptions[0]?.filial ?? '');
  const chosenFilial = selectedFilial !== null ? selectedFilial : defaultFilial;

  // Estado de liberação da filial escolhida: âncora GPS + campanha configuradas
  // pelo administrador. Unidade sem as duas NÃO entra no inventário de campo.
  // O auditor vê como trava; o admin vê como pendência a configurar (sem trava,
  // ele é quem entra na Unidade Operacional para resolver).
  const showRelease = isAuditorOnly || isAdmin;
  const releaseOf = (filial: string) =>
    showRelease && filial ? readUnitRelease(unitRelease, selectedTenant, filial) : null;
  const chosenRelease = releaseOf(chosenFilial);
  const chosenPending = chosenRelease && !chosenRelease.released
    ? describeUnitReleaseMissing(chosenRelease)
    : '';

  // Trava de entrada: só o auditor de campo é impedido; o admin precisa passar
  // para configurar a unidade.
  const canProceed = !!selectedTenant && !!selectedModule && !(isAuditorOnly && chosenPending);

  // Chip de estado da configuração da unidade (âncora / campanha).
  const releaseChip = (ok: boolean) =>
    `flex items-center gap-1 px-2 py-1 rounded-lg border text-[7.5px] font-black uppercase tracking-widest ${
      ok ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-amber-50 border-amber-100 text-amber-600'
    }`;

  // Liberações exclusivas de ADMIN/MASTER (matriz RBAC — TRILHA A). O cadastro
  // de usuários e a carga/base só aparecem para quem realmente tem o gate.
  const adminLinks: Array<{ label: string; hint: string; screen: AppScreen; icon: React.ReactNode }> = [
    { label: 'Usuários', hint: 'Acessos', screen: AppScreen.USER_MANAGEMENT, icon: <Users size={13} /> },
    { label: 'Filiais', hint: 'Unidades', screen: AppScreen.UNIT_CONFIGURATOR, icon: <Building2 size={13} /> },
    { label: 'Eventos', hint: 'Campanhas', screen: AppScreen.CAMPAIGN_MANAGEMENT, icon: <Calendar size={13} /> },
    { label: 'Campos', hint: 'Edição', screen: AppScreen.FIELD_CONFIGURATOR, icon: <SlidersHorizontal size={13} /> },
    { label: 'QR Code', hint: 'Mapeamento', screen: AppScreen.QR_CODE_CONFIGURATOR, icon: <QrCode size={13} /> }
  ];
  if (canManageBase) {
    adminLinks.push(
      { label: 'Base', hint: 'Carga/Limpeza', screen: AppScreen.DATABASE_MANAGER, icon: <Database size={13} /> },
      { label: 'Cargas', hint: 'Histórico', screen: AppScreen.LOAD_HISTORY, icon: <History size={13} /> },
      { label: 'Licenças', hint: 'Novo cliente', screen: AppScreen.LICENSE_PROVISIONING, icon: <KeyRound size={13} /> }
    );
  }

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
    const icons = [Building2, Factory, Landmark];
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
                        onClick={() => {
                          setManualTenant(contract.tenantid);
                          setSelectedFilial(null);
                        }}
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
                      onClick={() => {
                          setManualTenant(contract.tenantid);
                          setSelectedFilial(null);
                        }}
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
            {/* Contexto de trabalho — contrato escolhido (o login já resolveu
                o tenantid; a filial é escolhida logo abaixo, aqui e só aqui) */}
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
                      CONTRATO (TENANTID)
                    </p>
                  </div>
                </div>
                <div className="w-8 h-8 rounded-full bg-accent text-white flex items-center justify-center flex-shrink-0">
                  <Check size={16} />
                </div>
              </div>
            </div>

            {/* FILIAL / UNIDADE OPERACIONAL — escolha aberta entre as filiais
                autorizadas (auditor pode ter várias liberadas pelo admin). */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-[9px] font-bold uppercase tracking-widest text-ink-muted">
                  Filial · Unidade Operacional
                </p>
                {filialOptions.length > 1 && (
                  <span className="text-[8px] font-black uppercase tracking-widest text-ink-muted/50">
                    {filialOptions.length} opções
                  </span>
                )}
              </div>
              {filialOptions.length === 0 ? (
                <div className="bg-amber-50 border border-amber-100 rounded-2xl p-3.5">
                  <p className="text-[9px] font-extrabold text-amber-700 uppercase tracking-widest leading-relaxed text-center">
                    Nenhuma filial na base deste contrato — a unidade será escolhida na próxima tela.
                  </p>
                </div>
              ) : (
                <div className="space-y-2" data-testid="filial-options">
                  {filialOptions.map((opt) => {
                    const isChosen = chosenFilial === opt.filial;
                    const release = releaseOf(opt.filial);
                    const pending = release && !release.released
                      ? describeUnitReleaseMissing(release)
                      : '';
                    const released = !!release?.released;
                    return (
                      <button
                        key={opt.filial}
                        type="button"
                        onClick={() => setSelectedFilial(opt.filial)}
                        aria-pressed={isChosen}
                        className={`w-full bg-white rounded-2xl px-4 py-3.5 flex items-center justify-between shadow-sm border transition-all cursor-pointer active:scale-[0.98] ${
                          isChosen ? 'border-accent ring-1 ring-accent/30' : 'border-gray-100'
                        }`}
                      >
                        <div className="flex items-center space-x-3 min-w-0">
                          <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 bg-accent/10 text-accent">
                            <Building2 size={17} strokeWidth={2.5} />
                          </div>
                          <div className="min-w-0 text-left">
                            <p className="text-[12px] font-black uppercase tracking-wide text-ink truncate">
                              {opt.label}
                            </p>
                            <p className={`text-[7.5px] font-extrabold uppercase tracking-widest truncate ${
                              pending ? 'text-amber-600' : released ? 'text-emerald-600' : 'text-ink-muted'
                            }`}>
                              {pending
                                ? `AGUARDANDO LIBERAÇÃO · FALTA ${pending}`
                                : released
                                  ? 'LIBERADA PARA INVENTÁRIO'
                                  : `FILIAL · ${normalizeWorkTenant(selectedTenant)}`}
                            </p>
                          </div>
                        </div>
                        {pending ? (
                          <div className="w-8 h-8 rounded-full bg-amber-50 border border-amber-100 text-amber-500 flex items-center justify-center flex-shrink-0">
                            <Lock size={14} />
                          </div>
                        ) : isChosen ? (
                          <div className="w-8 h-8 rounded-full bg-accent text-white flex items-center justify-center flex-shrink-0">
                            <Check size={16} />
                          </div>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              )}
              {chosenPending && (
                <div
                  className="mt-2 bg-amber-50 border border-amber-100 rounded-2xl px-3.5 py-3"
                  data-testid="unit-release-warning"
                >
                  <p className="text-[9px] font-extrabold text-amber-700 uppercase tracking-widest leading-relaxed text-center">
                    Unidade aguardando liberação · falta {chosenPending}
                  </p>
                  <p className="text-[8px] font-bold text-amber-600 uppercase tracking-wider leading-relaxed text-center mt-1">
                    {isAdmin
                      ? 'Configure âncora e campanha na Unidade Operacional para liberar.'
                      : 'O administrador define âncora e campanha na Unidade Operacional.'}
                  </p>
                </div>
              )}
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

            {/* LIBERAÇÕES · ADMIN/MASTER (TRILHA A) — o que somente estes
                perfis podem fazer fica visível no próprio CONTRATO DE TRABALHO:
                estado da unidade (âncora + campanha), cadastro de NOVOS
                USUÁRIOS e os configuradores da base. Nada é duplicado: cada
                botão abre a tela administrativa já existente. */}
            {isAdmin && (
              <div
                className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm space-y-3"
                data-testid="admin-liberacoes"
              >
                <div className="flex items-center space-x-2.5">
                  <div className="w-8 h-8 rounded-lg bg-accent-soft text-accent flex items-center justify-center border border-accent/10 flex-shrink-0">
                    <ShieldCheck size={15} />
                  </div>
                  <div className="min-w-0 text-left">
                    <p className="text-[10px] font-black uppercase tracking-wider text-ink truncate">
                      Liberações · admin / master
                    </p>
                    <p className="text-[7.5px] font-bold uppercase tracking-widest text-ink-muted truncate">
                      Exclusivo destes perfis
                    </p>
                  </div>
                </div>

                {/* Estado da unidade escolhida: as DUAS configurações que
                    liberam o inventário do auditor. */}
                <div className="rounded-xl bg-bg-main border border-border px-3 py-2.5 space-y-1.5">
                  <p className="text-[8px] font-black uppercase tracking-widest text-ink-muted truncate">
                    {chosenFilial ? `Unidade · ${chosenFilial}` : 'Unidade · sem filial na base'}
                  </p>
                  {chosenFilial && (
                    <>
                      <div className="flex items-center flex-wrap gap-1.5">
                        <span className={releaseChip(!!chosenRelease?.hasAnchor)} data-testid="release-anchor">
                          {chosenRelease?.hasAnchor ? <Check size={11} /> : <Lock size={11} />}
                          Âncora GPS
                        </span>
                        <span className={releaseChip(!!chosenRelease?.hasCampaign)} data-testid="release-campaign">
                          {chosenRelease?.hasCampaign ? <Check size={11} /> : <Lock size={11} />}
                          Campanha
                        </span>
                      </div>
                      <p className={`text-[8px] font-extrabold uppercase tracking-widest leading-relaxed ${
                        chosenRelease?.released ? 'text-emerald-600' : 'text-amber-600'
                      }`}>
                        {chosenRelease
                          ? chosenRelease.released
                            ? 'Unidade liberada para o inventário do auditor'
                            : `Falta ${chosenPending} para liberar o inventário`
                          : 'Sem leitura de configuração na base local'}
                      </p>
                    </>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => onOpenAdmin?.(AppScreen.UNIT_SELECTION)}
                  className="w-full py-3 rounded-xl bg-accent text-white font-extrabold uppercase text-[9px] tracking-[0.12em] active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer"
                  data-testid="admin-open-unit-operational"
                >
                  <Landmark size={14} />
                  Configurar âncora e campanha
                </button>

                <button
                  type="button"
                  onClick={() => onOpenNewUser?.()}
                  className="w-full py-3 rounded-xl border border-accent/30 bg-accent-soft text-accent font-extrabold uppercase text-[9px] tracking-[0.12em] active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer"
                  data-testid="admin-new-user"
                >
                  <UserPlus size={14} />
                  Novo usuário · cadastrar acesso
                </button>

                <div className="grid grid-cols-2 gap-2">
                  {adminLinks.map((link) => (
                    <button
                      key={link.screen}
                      type="button"
                      onClick={() => onOpenAdmin?.(link.screen)}
                      className="flex items-center gap-2 px-2.5 py-2.5 bg-white border border-border rounded-xl active:scale-[0.98] transition-all text-left shadow-sm min-w-0"
                    >
                      <span className="w-7 h-7 rounded-lg bg-accent-soft text-accent flex items-center justify-center border border-accent/10 flex-shrink-0">
                        {link.icon}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[9px] font-black uppercase tracking-wide text-ink truncate">
                          {link.label}
                        </span>
                        <span className="block text-[7px] font-bold uppercase tracking-widest text-ink-muted truncate">
                          {link.hint}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>

                {/* Resto das liberações administrativas (integridade SHA,
                    fotos obrigatórias, toggles Protheus, auditoria) vive no
                    painel ADMIN do hub — aqui só o atalho, para não duplicar
                    estado nem regra. */}
                <button
                  type="button"
                  onClick={() => onOpenAdmin?.(AppScreen.MAIN_MENU, { openPanel: 'ADMIN' })}
                  className="w-full py-2.5 rounded-xl border border-border bg-white text-ink-muted font-extrabold uppercase text-[8px] tracking-[0.12em] active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer"
                  data-testid="admin-full-panel"
                >
                  <Settings size={12} />
                  Painel completo · integridade, fotos, Protheus
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Barra inferior: ACESSAR + sair */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/95 backdrop-blur-xl border-t border-border z-50 shadow-lg space-y-2">
        <button
          type="button"
          disabled={!canProceed}
          onClick={() => canProceed && onSelect(
            { tenantid: selectedTenant, filial: chosenFilial },
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
