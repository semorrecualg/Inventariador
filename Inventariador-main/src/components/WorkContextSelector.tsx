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
  MapPin,
  Megaphone,
  Cloud,
  Database,
  Navigation as NavigationIcon,
  RefreshCw
} from 'lucide-react';
import * as turf from '@turf/turf';
import BackButton from './BackButton';
import type { NavigationParams, UnitConfig, User } from '../types';
import { AppModule, AppScreen, DatabaseMode } from '../types';
import { isAdminUser } from '../services/rbacService';
import { canonicalRole, isFieldAuditorRole } from '../utils/roles';
import { localDb, readVirtualSnapshot } from '../services/localDbService';
import { db, type DexieAsset } from '../services/sqliteService';
import { resolveTenantId } from '../utils/tenantUtils';
import { normalizeKey } from '../utils/schema';
import { createUnitCounter } from '../utils/unitAssetStats';
import { isConferido } from '../utils/conferencia';
import { logger } from '../utils/logger';
import {
  WorkContext,
  type FilialOption,
  type WorkContextPreselection,
  buildFilialOptions,
  canConfirmWorkContext,
  canConfirmWorkContextSemFiliais,
  groupContextsByTenant,
  normalizeWorkTenant,
  normalizeWorkFilial
} from '../utils/workContextUtils';
import { canAccessDatabaseManager, isAdminEmail } from '../utils/authUtils';
import {
  describeUnitReleaseMissing,
  readUnitRelease,
  unitReleaseKey,
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
   * base de dados, cargas, licenças). A liberação da unidade (âncora GPS +
   * campanha) é aberta pelos dois botões de cada cartão desta tela — o painel
   * não a duplica e o formulário intermediário não é mais necessário.
   */
  onOpenAdmin?: (screen: AppScreen, params?: NavigationParams) => void;
  /**
   * Fase 1 (acesso padronizado): a ÚLTIMA ESCOLHA do usuário chega aqui apenas
   * como PRÉ-SELEÇÃO (contrato/filial/módulo já apontados) — o seletor deixou de
   * ser saltado no pós-login. O utilizador confirma em "Acessar o Módulo".
   */
  initialSelection?: WorkContextPreselection | null;
  /**
   * Unidades que o APP já conhece por contrato (`TENANTID` → filiais) — o
   * catálogo vivo de ativos, base interna, âncoras, campanhas e lista da nuvem.
   *
   * O catálogo da base local (`listContracts`) não enxerga a configuração
   * operacional gravada SEM contrato e pode vir vazio num aparelho com as
   * filiais configuradas; era aí que a tela dizia «Nenhuma filial na base deste
   * contrato» e, ao mesmo tempo, o aviso de liberação apontava uma filial
   * existente. Esta é a MESMA fonte do mapa de liberação, para que a lista e o
   * estado de cada unidade nunca divirjam.
   */
  availableFiliais?: Record<string, string[]>;
  /**
   * SINCRONIZAÇÃO (fundida da antiga Unidade Operacional): puxa da nuvem o
   * contrato/filial escolhidos. Sem callback ou em modo BASE LOCAL, o botão
   * de sincronizar não aparece.
   */
  onSync?: (tenantid?: string, filial?: string) => void;
  isSyncing?: boolean;
  /** CARGA DE BASE: abre o Gestor de Base quando a unidade ainda não existe. */
  onLoadDatabase?: () => void;
  /** Carga em lote a decorrer — o seletor não lê a base a meio da escrita. */
  isImportingBatch?: boolean;
  databaseMode?: DatabaseMode;
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
  initialSelection,
  availableFiliais,
  onSync,
  isSyncing = false,
  onLoadDatabase,
  isImportingBatch = false,
  databaseMode
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

  // Fase 1: a escolha anterior NÃO salta mais o contrato — entra como
  // pré-seleção (já validada contra a autorização atual em
  // `resolveWorkContextPreselection`).
  const preselectedTenant = initialSelection ? normalizeWorkTenant(initialSelection.tenantid) : '';
  const [selectedModule, setSelectedModule] = useState<AppModule | null>(initialSelection?.module ?? null);
  // null = ainda não escolheu explicitamente (a tela pré-seleciona a filial do
  // perfil ou a primeira disponível). '' é uma escolha REAL: contrato inteiro.
  const [selectedFilial, setSelectedFilial] = useState<string | null>(initialSelection?.filial || null);

  // DONO GLOBAL (admin sem contrato no perfil): o contrato vem da BASE — o
  // tenantid é a primeira coluna dos ativos. Liberado somente pelo gate
  // administrativo; um usuário comum nunca vê os contratos de outros clientes.
  const isGlobalAdmin = !activeGroup && canAccessDatabaseManager(user);
  const [baseContracts, setBaseContracts] = useState<ContractSummary[]>([]);
  const [manualTenant, setManualTenant] = useState(preselectedTenant);

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

  // Contrato escolhido pelo utilizador (pré-seleção da última escolha ou toque
  // num cartão) sobrepõe-se ao contrato do perfil.
  const selectedTenant = manualTenant || selectedTenantBaseline;

  // ── CONTAGEM DE ATIVOS POR FILIAL (fundida da Unidade Operacional) ──────
  // UMA passagem pela base local do contrato escolhido, com o mesmo contador
  // da tela retirada: identidade = chave normalizada da filial, conferência
  // pela regra única (`isConferido`). O evento de escrita da base força a
  // releitura (carga nova, limpeza de cópias, restauro de backup).
  const [unitStats, setUnitStats] = useState<Record<string, { total: number; checked: number }>>({});
  const [statsRevision, setStatsRevision] = useState(0);
  useEffect(() => {
    const reload = () => setStatsRevision((value) => value + 1);
    window.addEventListener('gbr_local_assets_changed', reload);
    return () => window.removeEventListener('gbr_local_assets_changed', reload);
  }, []);

  const tenantForStats = normalizeWorkTenant(selectedTenant);
  useEffect(() => {
    if (!tenantForStats) {
      setUnitStats({});
      return;
    }
    let alive = true;
    const loadStats = async () => {
      try {
        const counter = createUnitCounter();
        let matched = 0;
        const keepRow = (item: unknown) => {
          const asset = item as DexieAsset;
          const rowTenant = String(resolveTenantId(asset) || '').trim().toUpperCase();
          if (rowTenant !== tenantForStats) return;
          matched += 1;
          if (asset._is_deleted !== 0) return;
          const rawFilial = (asset as { filial_raw?: string }).filial_raw || asset.filial;
          counter.count(rawFilial, asset);
        };

        await db.local_assets.each(keepRow);

        // Snapshot virtual (preview/iframe sem base carregada): só quando a
        // base local não entregou nenhuma linha do contrato.
        const isIframe = typeof window !== 'undefined' && window.self !== window.top;
        if (matched === 0 && isIframe) {
          const virtualData = await readVirtualSnapshot();
          (virtualData || []).forEach((row: unknown) => {
            const r = row as Record<string, unknown>;
            keepRow({
              id: String(r.primarykey || r.id || ''),
              primarykey: String(r.primarykey || r.id || ''),
              tenantid: String(resolveTenantId(r) || 'GBR_DEFAULT'),
              filial: String(r.filial || r._unitid || 'FILIAL_DEFAULT'),
              status: String(r.status || 'Pendente'),
              _conferido: isConferido(r) ? 1 : 0,
              AUDITOR_STATUS_CONFERENCIA: r.AUDITOR_STATUS_CONFERENCIA,
              _is_deleted: Number(r._is_deleted ?? 0)
            });
          });
        }

        if (!alive) return;
        const stats: Record<string, { total: number; checked: number }> = {};
        for (const entry of counter.entries()) {
          const key = normalizeKey(entry.label);
          if (!key) continue;
          stats[key] = { total: entry.total, checked: entry.checked };
        }
        setUnitStats(stats);
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        logger.warn('[Contrato] Contagem por filial indisponível:', errMsg);
        if (alive) setUnitStats({});
      }
    };
    loadStats();
    return () => {
      alive = false;
    };
  }, [tenantForStats, statsRevision]);

  const totalAssets = useMemo(
    () => Object.values(unitStats).reduce((acc, stat) => acc + stat.total, 0),
    [unitStats]
  );

  // ── GEOCERCA (fundida da Unidade Operacional) ──────────────────────────
  // Âncora gravada em `unit_configs` × posição real do terminal (turf), com a
  // mesma tolerância de raio. A distância só aparece para unidades com âncora:
  // sem ela, o que falta já é dito pelo estado de liberação.
  const [activeUnitConfigs, setActiveUnitConfigs] = useState<UnitConfig[]>([]);
  const [deviceCoords, setDeviceCoords] = useState<{ lat: number; lng: number } | null>(null);
  useEffect(() => {
    let active = true;
    localDb.unitConfigs
      .toArray()
      .then((configs) => {
        if (active) setActiveUnitConfigs(configs || []);
      })
      .catch((err: unknown) => {
        const errMsg = err instanceof Error ? err.message : String(err);
        logger.warn('[Contrato] Configurações de GPS indisponíveis:', errMsg);
      });
    return () => {
      active = false;
    };
  }, [statsRevision]);

  useEffect(() => {
    // Isolamento de sandbox: em iframe não há GPS de hardware real.
    if (typeof window !== 'undefined' && window.self !== window.top) return;
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;
    let watchId: number | undefined;
    try {
      navigator.geolocation.getCurrentPosition(
        (pos) => setDeviceCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => {
          /* sem posição: a unidade com âncora mostra o ponto zero de calibração */
        },
        { enableHighAccuracy: true, timeout: 5000 }
      );
      watchId = navigator.geolocation.watchPosition(
        (pos) => setDeviceCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => {
          /* segue o último ponto conhecido */
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
      );
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.warn('[Contrato] GPS indisponível:', errMsg);
    }
    return () => {
      if (watchId) {
        try {
          navigator.geolocation.clearWatch(watchId);
        } catch {
          /* sem watch ativo */
        }
      }
    };
  }, []);

  const geofenceStatus = (
    filialName: string
  ): { hasGps: boolean; message: string; isInside: boolean } | null => {
    const key = String(filialName || '').toUpperCase().trim();
    if (!key) return null;
    const config =
      activeUnitConfigs.find((c) => {
        const unitId = String(c._unitid || c.unit_id || c.filial || '').toUpperCase().trim();
        return unitId === key || unitId.replace(/_/g, ' ') === key.replace(/_/g, ' ');
      }) || null;
    // Sem âncora gravada não há perímetro a medir.
    if (!config || !config.lat || !config.lng) return null;

    const allowedRadius = Number(config.radius_meters || 500);
    const isBypass =
      isAdminEmail(user.email || '') || ['ADMIN', 'MASTER'].includes(canonicalRole(user.role));
    if (isBypass) return { hasGps: true, message: 'PERÍMETRO LIBERADO (ADMIN)', isInside: true };
    if (!deviceCoords) {
      return { hasGps: true, message: 'DENTRO DO PERÍMETRO (Ponto Zero de Calibração)', isInside: true };
    }
    try {
      const distanceM =
        turf.distance(
          turf.point([deviceCoords.lng, deviceCoords.lat]),
          turf.point([Number(config.lng), Number(config.lat)]),
          { units: 'kilometers' }
        ) * 1000;
      const rounded = Math.round(distanceM);
      const distanceLabel = rounded >= 1000 ? `${(rounded / 1000).toFixed(1)}km` : `${rounded}m`;
      return rounded <= allowedRadius
        ? { hasGps: true, message: `DENTRO DO PERÍMETRO (${distanceLabel})`, isInside: true }
        : {
            hasGps: true,
            message: `FORA DO PERÍMETRO SRE (${distanceLabel}/max ${allowedRadius}m)`,
            isInside: false
          };
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.error('[Contrato] Geocerca: coordenada inválida:', errMsg);
      return { hasGps: true, message: 'ERRO DE COORDENADA', isInside: false };
    }
  };

  const isAuditor = isFieldAuditorRole(user.role);
  // AUDITOR DE CAMPO: quem não administra a unidade. O admin/master configura a
  // unidade (âncora + campanha) e libera o inventário — para ele esta tela não
  // muda nada.
  const isAuditorOnly = isAuditor && !canAccessDatabaseManager(user);
  // ADMIN/MASTER: dono das liberações. Nesta tela ele vê o estado da unidade
  // (âncora + campanha) e o cadastro de acessos, sem sair do contrato.
  const isAdmin = isAdminUser(user);

  const baseFiliais = useMemo(() => {
    const tenant = normalizeWorkTenant(selectedTenant);
    return baseContracts.find((c) => normalizeWorkTenant(c.tenantid) === tenant)?.filiais ?? [];
  }, [baseContracts, selectedTenant]);

  // Filiais que o APP já conhece neste contrato (catálogo vivo). Somam-se às da
  // base local: uma filial configurada sem contrato na configuração operacional
  // não aparece no catálogo, mas é uma unidade real — e é ela que o aviso de
  // liberação aponta.
  const knownFiliais = useMemo(() => {
    const tenant = normalizeWorkTenant(selectedTenant);
    const list = (availableFiliais && availableFiliais[tenant]) || [];
    const out: string[] = [];
    for (const raw of list) {
      const f = normalizeWorkFilial(raw);
      if (!f || f === tenant || out.includes(f)) continue;
      out.push(f);
    }
    return out;
  }, [availableFiliais, selectedTenant]);

  // A lista do perfil manda para quem é de campo; o DONO do contrato (admin/
  // master) administra a unidade inteira, então ele também enxerga as filiais
  // REAIS da base local — são elas que recebem âncora e campanha na Unidade
  // Operacional. Sem isso, um admin cujo perfil declara uma filial só (ou
  // nenhuma) ficava preso às unidades do perfil e não conseguia abrir as demais
  // filiais do próprio contrato. A autorização continua valendo: as filiais da
  // base entram DEPOIS das do perfil e apenas para ADMIN/MASTER.
  const filialOptions = useMemo(() => {
    const authorized = buildFilialOptions({ tenantid: selectedTenant, contexts, baseFiliais });
    if (!isAdmin) return authorized;

    const tenant = normalizeWorkTenant(selectedTenant);
    const seen = new Set(authorized.map((o) => normalizeWorkFilial(o.filial)));
    const fromBase: FilialOption[] = [];
    for (const raw of [...baseFiliais, ...knownFiliais]) {
      const f = normalizeWorkFilial(raw);
      if (!f || f === tenant || seen.has(f)) continue;
      seen.add(f);
      fromBase.push({ filial: f, label: f });
    }
    return fromBase.length ? [...authorized, ...fromBase] : authorized;
  }, [selectedTenant, contexts, baseFiliais, knownFiliais, isAdmin]);

  // Estado de liberação da filial escolhida: âncora GPS + campanha configuradas
  // pelo administrador. Unidade sem as duas NÃO entra no inventário de campo.
  // O auditor vê como trava; o admin vê como pendência a configurar (sem trava,
  // ele é quem entra na Unidade Operacional para resolver).
  const showRelease = isAuditorOnly || isAdmin;
  const releaseOf = (filial: string) =>
    showRelease && filial ? readUnitRelease(unitRelease, selectedTenant, filial) : null;
  // Chave EXATA do contrato: a leitura acima é tolerante e atravessa contratos
  // para o dono global — não serve para decidir se a unidade é desta lista.
  const exactReleaseOf = (filial: string) =>
    filial && unitRelease ? unitRelease[unitReleaseKey(selectedTenant, filial)] : undefined;

  // Pré-seleção: a filial resolvida no login (quando autorizada) ou a primeira
  // opção. O usuário pode trocar livremente entre as autorizadas.
  const defaultFilial = filialOptions.some((o) => o.filial === activeFilial)
    ? activeFilial
    : (filialOptions[0]?.filial ?? '');
  // A escolha anterior só vale para uma unidade REAL deste contrato: uma opção
  // da lista ou uma unidade com configuração gravada. Uma escolha antiga de
  // outra base deixava o rodapé a falar de uma filial que a lista não mostrava
  // («falta campanha» sem filial para tocar) e o acesso travado, sem saída.
  const preselectionKnown =
    selectedFilial !== null &&
    (filialOptions.some((o) => o.filial === selectedFilial) || !!exactReleaseOf(selectedFilial));
  const chosenFilial = preselectionKnown ? (selectedFilial as string) : defaultFilial;

  // Unidade pré-selecionada e configurada, mas fora do catálogo local: entra na
  // lista — é ela que o aviso de liberação está a apontar.
  const filialOptionsView: FilialOption[] =
    chosenFilial && !filialOptions.some((o) => o.filial === chosenFilial)
      ? [...filialOptions, { filial: chosenFilial, label: chosenFilial }]
      : filialOptions;

  const chosenRelease = releaseOf(chosenFilial);
  const chosenPending = chosenRelease && !chosenRelease.released
    ? describeUnitReleaseMissing(chosenRelease)
    : '';

  // Trava de entrada: unidade sem âncora GPS E campanha não abre o módulo de
  // INVENTÁRIO — vale para TODOS os perfis, inclusive o admin (bug real: o
  // admin escolhia a unidade "AGUARDANDO LIBERAÇÃO", escolhia INVENTARIADOR e
  // caía na Auditoria Inteligente). O admin não perde o caminho de configuração:
  // o cartão e os dois botões dele abrem diretamente a âncora e a campanha.
  const blockedByRelease = selectedModule === AppModule.INVENTORY && !!chosenPending;
  // Fase 1: INVENTARIADOR exige FILIAL escolhida (ver `canConfirmWorkContext`).
  const missingFilialForInventory =
    selectedModule === AppModule.INVENTORY && !String(chosenFilial || '').trim();
  // Sem filial NENHUMA na lista não há escolha a fazer: bloquear aqui fechava a
  // porta (o aviso prometia a Unidade Operacional na tela seguinte). Quem
  // administra segue para lá; o auditor continua bloqueado.
  const podeAdministrar = canAccessDatabaseManager(user);
  const semFiliaisNaLista = filialOptionsView.length === 0;
  const canProceed =
    !!selectedTenant &&
    !!selectedModule &&
    !blockedByRelease &&
    (canConfirmWorkContext(selectedModule, chosenFilial) ||
      canConfirmWorkContextSemFiliais(selectedModule, {
        temFiliaisNaLista: !semFiliaisNaLista,
        podeAdministrar
      }));

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

          <div className="flex items-center space-x-2 flex-shrink-0">
            {onSync && databaseMode !== DatabaseMode.INTERNAL && (
              <button
                type="button"
                onClick={() => onSync(selectedTenant, chosenFilial || undefined)}
                disabled={isSyncing}
                title="Sincronizar com a Nuvem"
                aria-label="Sincronizar com a Nuvem"
                data-testid="contexto-sync"
                className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all shadow-sm cursor-pointer ${
                  isSyncing
                    ? 'bg-blue-50 text-blue-500'
                    : 'bg-white text-accent border border-accent/10 active:scale-95 hover:bg-accent-soft'
                }`}
              >
                {isSyncing ? <RefreshCw size={16} className="animate-spin" /> : <Cloud size={16} />}
              </button>
            )}
            <div className="w-10 h-10 bg-accent rounded-xl flex items-center justify-center text-white shadow-md flex-shrink-0">
              <Briefcase size={16} />
            </div>
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
            {isImportingBatch && (
              <div
                className="bg-blue-50 border border-blue-100 rounded-2xl p-4 text-center"
                data-testid="contexto-importing"
              >
                <p className="text-[9px] font-extrabold text-blue-700 uppercase tracking-widest leading-relaxed">
                  Modo importação ativo · persistindo a base no dispositivo
                </p>
              </div>
            )}
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
                {(filialOptionsView.length > 1 || totalAssets > 0) && (
                  <span
                    className="text-[8px] font-black uppercase tracking-widest text-ink-muted/50"
                    data-testid="filial-summary"
                  >
                    {filialOptionsView.length} opções
                    {totalAssets > 0 ? ` · ${totalAssets.toLocaleString('pt-BR')} ativos` : ''}
                  </span>
                )}
              </div>
              {filialOptionsView.length === 0 ? (
                <div className="space-y-2" data-testid="contexto-empty-units">
                  <div className="bg-amber-50 border border-amber-100 rounded-2xl p-3.5">
                    <p className="text-[9px] font-extrabold text-amber-700 uppercase tracking-widest leading-relaxed text-center">
                      Nenhuma filial na base deste contrato. Carregue a base para escolher a unidade.
                    </p>
                  </div>
                  {podeAdministrar && onLoadDatabase && (
                    <button
                      type="button"
                      onClick={onLoadDatabase}
                      data-testid="contexto-load-database"
                      className="w-full py-3.5 rounded-xl bg-accent text-white font-extrabold uppercase text-[9px] tracking-[0.15em] shadow-md active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <Database size={15} />
                      Iniciar Carga de Dados (Expert)
                    </button>
                  )}
                  {onSync && databaseMode !== DatabaseMode.INTERNAL && (
                    <button
                      type="button"
                      onClick={() => onSync(selectedTenant, chosenFilial || undefined)}
                      disabled={isSyncing}
                      data-testid="contexto-sync-empty"
                      className="w-full py-3.5 bg-white border border-accent/20 text-accent rounded-xl font-extrabold uppercase text-[9px] tracking-[0.15em] active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm"
                    >
                      <RefreshCw size={15} className={isSyncing ? 'animate-spin' : ''} />
                      Tentar Sincronizar da Nuvem
                    </button>
                  )}
                  {!podeAdministrar && (
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest max-w-[220px] leading-relaxed mx-auto text-center">
                      Solicite ao administrador a carga da base de dados para iniciar o inventário.
                    </p>
                  )}
                </div>
              ) : (
                <div className="space-y-2" data-testid="filial-options">
                  {filialOptionsView.map((opt) => {
                    const isChosen = chosenFilial === opt.filial;
                    const release = releaseOf(opt.filial);
                    const pending = release && !release.released
                      ? describeUnitReleaseMissing(release)
                      : '';
                    const released = !!release?.released;
                    // Estado de cada uma das DUAS configurações que liberam a
                    // unidade — é o que colore os botões do cartão (vermelho =
                    // pendente, verde = OK).
                    const anchorReady = release?.hasAnchor === true;
                    // ATIVA libera o inventário; CRIADA (ainda não ativada) já
                    // existe na filial — o botão fica verde e abre essa campanha,
                    // em vez de pedir "criar" e gerar duplicado.
                    const campaignActive = release?.hasCampaign === true;
                    const campaignReady = release?.hasCampaignRecord === true;
                    // Sem leitura da unidade, o botão continua acionável e nasce
                    // vermelho: configurar é sempre seguro.
                    // O botão da CAMPANHA leva a intenção junto: com campanha
                    // gravada a tela abre na campanha da filial; sem campanha, já
                    // no cadastro (botão vermelho).
                    const campaignParams: NavigationParams = {
                      unitName: opt.filial,
                      campaignAction: campaignReady ? 'OPEN' : 'CREATE'
                    };
                    const openRelease = (screen: AppScreen, params?: NavigationParams) =>
                      (event: React.SyntheticEvent) => {
                        event.stopPropagation();
                        setSelectedFilial(opt.filial);
                        onOpenAdmin?.(screen, params || { unitName: opt.filial });
                      };
                    const releaseKeyDown = (screen: AppScreen, params?: NavigationParams) =>
                      (event: React.KeyboardEvent) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          openRelease(screen, params)(event);
                        }
                      };
                    return (
                      <button
                        key={opt.filial}
                        type="button"
                        onClick={() => {
                          // ESCOLHA, não navegação — com uma exceção: ADMIN/
                          // MASTER numa unidade AGUARDANDO LIBERAÇÃO. Aí o toque
                          // leva direto ao que falta (a âncora primeiro; com a
                          // âncora já fixada, a campanha), sem passar pelo
                          // formulário da UNIDADE OPERACIONAL. Unidade liberada
                          // (ou auditor) segue só marcando a filial, para não
                          // quebrar a trilha filial → módulo → ACESSAR.
                          setSelectedFilial(opt.filial);
                          if (isAdmin && pending) {
                            onOpenAdmin?.(
                              anchorReady ? AppScreen.CAMPAIGN_MANAGEMENT : AppScreen.UNIT_CONFIGURATOR,
                              anchorReady ? campaignParams : { unitName: opt.filial }
                            );
                          }
                        }}
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
                            {/* Contagem da base local + perímetro da âncora (as
                                duas leituras que viviam na Unidade Operacional). */}
                            {(() => {
                              const stat = unitStats[normalizeKey(opt.filial)];
                              const geo = geofenceStatus(opt.filial);
                              if (!stat && !geo?.hasGps) return null;
                              return (
                                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                                  {stat && (
                                    <span
                                      className="text-[8px] font-black uppercase tracking-wider text-ink-muted"
                                      data-testid={`filial-asset-count-${opt.filial}`}
                                    >
                                      {stat.total.toLocaleString('pt-BR')} ATIVOS
                                      {stat.checked > 0
                                        ? ` · ${stat.checked.toLocaleString('pt-BR')} CONF.`
                                        : ''}
                                    </span>
                                  )}
                                  {geo?.hasGps && (
                                    <span
                                      className={`inline-flex items-center gap-1 text-[8px] font-black uppercase tracking-wider ${
                                        geo.isInside ? 'text-emerald-600' : 'text-amber-600'
                                      }`}
                                      data-testid={`filial-geofence-${opt.filial}`}
                                    >
                                      <NavigationIcon size={9} />
                                      {geo.message}
                                    </span>
                                  )}
                                </div>
                              );
                            })()}
                          </div>
                        </div>
                        {isAdmin ? (
                          /* LIBERAÇÃO NO PRÓPRIO CARTÃO (admin/master): um botão
                             para a ÂNCORA GPS e outro para a CAMPANHA, cada um
                             com o estado real da unidade — vermelho = pendente,
                             verde = OK. Abrem a configuração diretamente na
                             filial, sem o formulário intermediário da UNIDADE
                             OPERACIONAL. `stopPropagation` impede que o clique
                             dispare também o toque do cartão. */
                          <div className="flex items-center space-x-1.5 flex-shrink-0">
                            <div
                              role="button"
                              tabIndex={0}
                              title={anchorReady
                                ? `Âncora GPS OK · editar ${opt.label}`
                                : `Âncora GPS pendente · configurar ${opt.label}`}
                              aria-label={anchorReady
                                ? `Âncora GPS de ${opt.label} configurada`
                                : `Definir âncora GPS de ${opt.label}`}
                              data-testid={`unit-anchor-action-${opt.filial}`}
                              data-state={anchorReady ? 'ok' : 'pending'}
                              onClick={openRelease(AppScreen.UNIT_CONFIGURATOR)}
                              onKeyDown={releaseKeyDown(AppScreen.UNIT_CONFIGURATOR)}
                              className={`w-8 h-8 rounded-lg border flex items-center justify-center flex-shrink-0 cursor-pointer active:scale-95 transition-all ${
                                anchorReady
                                  ? 'bg-emerald-50 text-emerald-600 border-emerald-200 hover:bg-emerald-100'
                                  : 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100'
                              }`}
                            >
                              <MapPin size={14} />
                            </div>
                            <div
                              role="button"
                              tabIndex={0}
                              title={campaignActive
                                ? `Campanha OK · ativa · gerenciar ${opt.label}`
                                : campaignReady
                                  ? `Campanha criada · ativar/gerenciar ${opt.label}`
                                  : `Campanha pendente · criar ${opt.label}`}
                              aria-label={campaignActive
                                ? `Campanha de ${opt.label} ativa`
                                : campaignReady
                                  ? `Campanha de ${opt.label} criada`
                                  : `Criar campanha de ${opt.label}`}
                              data-testid={`unit-campaign-action-${opt.filial}`}
                              data-state={campaignReady ? 'ok' : 'pending'}
                              onClick={openRelease(AppScreen.CAMPAIGN_MANAGEMENT, campaignParams)}
                              onKeyDown={releaseKeyDown(AppScreen.CAMPAIGN_MANAGEMENT, campaignParams)}
                              className={`w-8 h-8 rounded-lg border flex items-center justify-center flex-shrink-0 cursor-pointer active:scale-95 transition-all ${
                                campaignReady
                                  ? 'bg-emerald-50 text-emerald-600 border-emerald-200 hover:bg-emerald-100'
                                  : 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100'
                              }`}
                            >
                              <Megaphone size={14} />
                            </div>
                          </div>
                        ) : pending ? (
                          <div
                            className="w-8 h-8 rounded-full bg-amber-50 border border-amber-100 text-amber-500 flex items-center justify-center flex-shrink-0"
                            title="O administrador define âncora e campanha nesta unidade"
                          >
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
                      ? 'Toque na filial ou nos botões para resolver o que falta.'
                      : 'O administrador define âncora e campanha no cartão desta filial.'}
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

            {/* LIBERAÇÕES · ADMIN/MASTER — uma única entrada. As ferramentas
                (acessos, filiais, campanhas, campos, QR, base, cargas, licenças,
                integridade, fotos e Protheus) vivem no PAINEL COMPLETO do hub;
                manter a lista aqui duplicava cada botão sem acrescentar nenhuma
                regra. A exceção é a liberação da unidade (âncora + campanha),
                configurada pelos botões de cada cartão, logo acima. */}
            {isAdmin && (
              <div>
                <p className="text-[9px] font-bold uppercase tracking-widest text-ink-muted mb-2">
                  Liberações · admin / master
                </p>
                <button
                  type="button"
                  onClick={() => onOpenAdmin?.(AppScreen.MAIN_MENU, { openPanel: 'ADMIN' })}
                  className="w-full bg-white rounded-2xl px-4 py-4 flex items-center justify-between shadow-sm border border-slate-200 transition-all cursor-pointer active:scale-[0.98]"
                  data-testid="admin-full-panel"
                >
                  <div className="flex items-center space-x-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-accent/10 text-accent flex items-center justify-center flex-shrink-0">
                      <ShieldCheck size={20} strokeWidth={2.5} />
                    </div>
                    <div className="min-w-0 text-left">
                      <p className="text-[13px] font-black uppercase tracking-wide text-ink">
                        Painel completo
                      </p>
                      <p className="text-[8px] font-bold uppercase tracking-widest text-ink-muted">
                        Integridade, fotos, Protheus e demais liberações
                      </p>
                    </div>
                  </div>
                  <ChevronRight size={18} className="text-ink-muted/40 flex-shrink-0" />
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
        {missingFilialForInventory && (
          <p className="text-[9px] font-extrabold uppercase tracking-wider text-amber-600 text-center leading-relaxed">
            {filialOptionsView.length === 0
              ? (podeAdministrar
                  ? 'Sem filial na base deste contrato: carregue a base (ou cadastre a unidade) para escolher a filial.'
                  : 'Este contrato ainda não tem filial na base. Peça ao administrador para cadastrar a unidade (ou use CONTROLE DE ATIVO, que não exige endereço de campo).')
              : 'Escolha a filial para entrar no INVENTARIADOR.'}
          </p>
        )}
        {blockedByRelease && (
          <p className="text-[9px] font-extrabold uppercase tracking-wider text-amber-600 text-center leading-relaxed">
            {isAdmin
              ? `Unidade aguardando liberação (falta ${chosenPending}). Toque na filial para abrir a configuração.`
              : `Unidade aguardando liberação (falta ${chosenPending}). Peça ao administrador para liberar.`}
          </p>
        )}
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
