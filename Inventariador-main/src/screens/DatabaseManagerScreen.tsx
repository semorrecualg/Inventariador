import React, { useState, useEffect, useRef, useCallback } from 'react';
import { db, sqliteService } from '../services/sqliteService';
import { showRecoveryToast as originalShowRecoveryToast } from '../services/NavigationGuardService';
import { AppScreen, Asset } from '../types';
import { DatabaseLoaderService } from '../services/DatabaseLoaderService';
import { saveSnapshotToWorkspace, saveVirtualSnapshot, readVirtualSnapshot, clearVirtualSnapshot, setUserWorkspaceHandle, persistWorkspaceHandle, restoreWorkspaceHandle, saveBaseToWorkspace, readBaseFromWorkspace, type WorkspaceBaseSnapshot } from '../services/localDbService';
import { syncAssetsToCloud, isInternalMode, logAuditEvent } from '../services/supabaseService';
import { isAdminUser } from '../utils/authUtils';
import { previewAssetDuplicateCleanup, applyAssetDuplicateCleanup, formatDedupReport } from '../services/assetDedupService';
import { downloadRecnoReportCsv, formatRecnoReport, reportRecnoCollisions, type RecnoReport } from '../services/recnoGuardService';
import { logger } from '../utils/logger';
import { Database, Trash2, ArrowLeft, Terminal, AlertTriangle, FileSpreadsheet, UploadCloud, FolderOpen, Download } from 'lucide-react';

export async function processAndInjectSpreadsheetData(file: File, onProgress: (p: number) => void): Promise<any[]> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const data = await DatabaseLoaderService.extrairDadosDaPlanilha(file);
  if (!data || data.length === 0) {
    throw new Error("Planilha vazia ou inválida.");
  }
  await DatabaseLoaderService.injetarDadosEmLotes(data, onProgress);
  return data;
}

interface DatabaseManagerScreenProps {
  onBack?: () => void;
  /**
   * Avisa o App que a BASE LOCAL acabou de receber dados (carga de planilha ou
   * restauração de backup). O App usa isso para operar na base local — sem
   * isso a Unidade Operacional lê a nuvem e mostra "nenhum dado importado"
   * mesmo com milhares de ativos carregados neste dispositivo.
   */
  onLocalBaseLoaded?: (info: { count: number; tenantids: string[] }) => void;
}

/** Contratos presentes num conjunto de linhas (para avisar o App da base carregada). */
const restoreTenants = (rows: unknown[]): string[] => [...new Set(rows
  .map((r) => String((r as { tenantid?: unknown })?.tenantid ?? '').trim().toUpperCase())
  .filter(Boolean))];

export const DatabaseManagerScreen: React.FC<DatabaseManagerScreenProps> = ({ onBack, onLocalBaseLoaded }) => {
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [isPurging, setIsPurging] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const [showModal, setShowModal] = useState<boolean>(false);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [showErrorModal, _setShowErrorModal] = useState<boolean>(false);
  const setShowErrorModal = (show: boolean) => {
    if (window.self !== window.top) return; // PROIBIDO DISPARAR MODAL DE ERRO DE BACKUP FÍSICO NO IFRAME
    _setShowErrorModal(show);
    if (typeof window.setShowErrorModal === 'function') {
      window.setShowErrorModal(show);
    }
  };

  const showRecoveryToast = useCallback((message: string, type: string = 'blue') => {
    if (window.self !== window.top) return; // PROIBIDO DISPARAR MODAL DE ERRO DE BACKUP FÍSICO NO IFRAME
    originalShowRecoveryToast(message, type);
  }, []);
  const [assetCount, setAssetCount] = useState<number>(0);
  // Contra-prova física: cada espelho é contado em separado, para o painel poder
  // explicar uma diferença em vez de a esconder num único número.
  const [mirrors, setMirrors] = useState<{ local_assets: number; ativos: number; assets: number }>({ local_assets: 0, ativos: 0, assets: 0 });
  // Espelho virtual (sandbox/iframe): é o que a Unidade Operacional lê quando o
  // banco local está vazio. Só é lido quando o banco está vazio (diagnóstico).
  const [virtualCount, setVirtualCount] = useState<number>(0);
  const [logCount, setLogCount] = useState<number>(0);
  const [consoleLogs, setConsoleLogs] = useState<string[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const backupInputRef = useRef<HTMLInputElement>(null);

  const addLog = useCallback((msg: string) => {
    const time = new Date().toLocaleTimeString('pt-BR');
    setConsoleLogs(prev => [...prev, `>> [${time}] ${msg}`].slice(-15));
  }, []);

  const handleBackupButtonClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (backupInputRef.current) {
      addLog("[SRE_BACKUP] Acionando importação de backup físico síncrono...");
      backupInputRef.current.click();
    }
  };

  const handleBackupFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    addLog(`[SRE_BACKUP] Arquivo de backup selecionado: ${file.name}`);
    setIsUploading(true);
    setProgress(10);

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = JSON.parse(text);
        if (!Array.isArray(parsed)) {
          throw new Error("Formato do arquivo de backup inválido. Esperado um array de ativos.");
        }

        setProgress(40);
        addLog(`[SRE_BACKUP] ${parsed.length} ativos lidos do backup. Gravando no banco físico do dispositivo...`);

        await db.transaction('rw', [db.ativos, db.assets, db.local_assets], async () => {
          await db.ativos.clear();
          await db.assets.clear();
          await db.local_assets.clear();
          
          await db.ativos.bulkPut(parsed);
          await db.assets.bulkPut(parsed);
          await db.local_assets.bulkPut(parsed);
        });

        sessionStorage.setItem('gbr_physical_folder_name', 'GBR_Inventario_Virtual');
        localStorage.setItem('gbr_physical_link_active', 'true');

        // Snapshot virtual espelhado de forma resiliente: localStorage primeiro,
        // IndexedDB (localforage) como fallback quando a quota de ~5MB estoura.
        // O banco físico (Dexie) já foi restaurado — a falha do espelho não pode
        // invalidar a reconexão.
        const snapshotMirrored = await saveVirtualSnapshot(parsed);
        if (!snapshotMirrored) {
          addLog("[SRE_BACKUP] Ressalva: espelho do snapshot virtual falhou (quota excedida). Banco físico restaurado com sucesso.");
        }

        setProgress(100);
        setIsUploading(false);
        addLog("[SRE_BACKUP] Restauração e sincronização do backup concluídas com sucesso.");
        showRecoveryToast("✓ BACKUP FISICO RECONECTADO COM SUCESSO.", "blue");
        loadStats();
        // O backup restaurou a BASE LOCAL: o App precisa operar nela.
        onLocalBaseLoaded?.({ count: parsed.length, tenantids: restoreTenants(parsed) });
      } catch (err: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
        setIsUploading(false);
        addLog(`[SRE_BACKUP ERROR] Falha ao reconectar backup: ${err.message || String(err)}`);
        showRecoveryToast("❌ ERRO AO RECONECTAR BACKUP FÍSICO.", "red");
      }
    };
    reader.onerror = () => {
      setIsUploading(false);
      addLog("[SRE_BACKUP ERROR] Falha na leitura do arquivo de backup.");
      showRecoveryToast("❌ ERRO NA LEITURA DO ARQUIVO.", "red");
    };
    reader.readAsText(file);
  };

  const [activePathName, setActivePathName] = useState<string>(() => {
    // A pasta vinculada é guardada em localStorage (não só em sessionStorage):
    // com sessionStorage, fechar o ecrã voltava a mostrar "NENHUM DIRETÓRIO".
    const pastaGuardada =
      (typeof localStorage !== 'undefined' ? localStorage.getItem('gbr_physical_folder_name') : null) ||
      (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('gbr_physical_folder_name') : null);
    if (pastaGuardada && pastaGuardada !== 'GBR_Inventario_Virtual') return pastaGuardada;
    const isIframe = typeof window !== 'undefined' && window.self !== window.top;
    if (isIframe) {
      return pastaGuardada ? `iFrame Sandbox / ${pastaGuardada}` : "iFrame Sandbox / sem pasta vinculada";
    }
    return pastaGuardada || "NENHUM DIRETÓRIO VINCULADO";
  });

  const [isMirroring, setIsMirroring] = useState<boolean>(false);
  const [mirrorProgress, setMirrorProgress] = useState<number>(0);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  // SRE ISOLAMENTO: tenant ativo do usuário logado — as estatísticas do Gestor
  // são escopadas a ele (nunca à contagem global, que poderia expor dados de
  // outro contrato, ex.: CICOPAL para um MASTER de CLIENTETESTE).
  const [activeTenantid, setActiveTenantid] = useState<string>('');

  useEffect(() => {
    try {
      const userStr = sessionStorage.getItem('app_current_user') || localStorage.getItem('user');
      if (userStr) {
        const parsed = JSON.parse(userStr);
        setIsAdmin(isAdminUser(parsed));
        setActiveTenantid(String(parsed?.tenantid || '').trim().toUpperCase());
      }
    } catch { /* ignore */ }
  }, []);

  const enviarBaseParaNuvem = async () => {
    try {
      setIsMirroring(true);
      setMirrorProgress(1);
      addLog(`[SRE_CLOUD] Iniciando espelhamento em massa da base local para a Nuvem (Supabase)...`);

      const ativos = await db.ativos.toArray();
      if (!ativos || ativos.length === 0) {
        addLog(`[SRE_CLOUD] Aviso: Nenhum ativo local para espelhar.`);
        return;
      }

      // SRE ISOLAMENTO: o espelhamento é escopado pelo tenant ATIVO do usuário
      // logado. O cache local pode conter dados de OUTROS contratos (ex.:
      // CICOPAL de sessão anterior) — um MASTER jamais pode enviá-los.
      // Sem tenant ativo (dono/global), espelha a base completa.
      const baseParaEspelhar = activeTenantid
        ? ativos.filter((a) => String(a.tenantid || '').trim().toUpperCase() === activeTenantid)
        : ativos;

      if (baseParaEspelhar.length === 0) {
        addLog(`[SRE_CLOUD] Nenhum ativo do contrato ${activeTenantid || 'global'} para espelhar. Nada enviado.`);
        return;
      }

      // REGRA DE CONTRATO (tenant 100% da base): os tenantids vêm EXCLUSIVAMENTE
      // da própria base carregada (zero valor fixo / zero fallback hard-coded).
      const tenantsDaBase = Array.from(
        new Set(
          baseParaEspelhar
            .map((a) => (a.tenantid || '').trim().toUpperCase())
            .filter((t) => t && t !== 'UNDEFINED' && t !== 'NULL')
        )
      );
      addLog(`[SRE_CLOUD] Contratos detectados na base: ${tenantsDaBase.length ? tenantsDaBase.join(' | ') : '(nenhum — Global)'}`);
      addLog(`[SRE_CLOUD] Enviando ${baseParaEspelhar.length} ativos do contrato ${activeTenantid || 'global'} em lotes de 500 (4 lotes em paralelo)...`);

      const syncedIds = await syncAssetsToCloud(
        baseParaEspelhar as unknown as Asset[],
        tenantsDaBase.length > 0 ? tenantsDaBase : undefined,
        (processed, total) => {
          const pct = total > 0 ? Math.round((processed / total) * 100) : 100;
          setMirrorProgress(Math.min(pct, 100));
        }
      );

      setMirrorProgress(100);
      addLog(`[SRE_CLOUD] Espelhamento concluído: ${syncedIds.length} ativos sincronizados na Nuvem (Supabase).`);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      addLog(`[SRE_CLOUD] Erro no espelhamento em massa: ${errMsg}`);
      console.error("[SRE_CLOUD] Erro no espelhamento em massa:", err);
    } finally {
      setIsMirroring(false);
      setMirrorProgress(0);
    }
  };

  const loadStats = useCallback(async () => {
    try {
      // SRE ISOLAMENTO: com tenant ativo, conta apenas os ativos DO contrato.
      let tid = activeTenantid;
      if (!tid) {
        // Fallback: lê o tenant direto da sessão (cobre a primeira execução no
        // boot, antes do estado do tenant ser resolvido).
        try {
          const userStr = sessionStorage.getItem('app_current_user') || localStorage.getItem('user');
          if (userStr) tid = String(JSON.parse(userStr)?.tenantid || '').trim().toUpperCase();
        } catch { /* ignore */ }
      }
      // Contagem contra os TRÊS espelhos (local_assets · ativos · assets), com a
      // mesma regra do resto do app (maior espelho). Antes contava só
      // `local_assets` e anunciava 0 ativos com dados vivos noutro espelho.
      const counts = await sqliteService.countAssetMirrors(tid || null);
      setMirrors({ local_assets: counts.local_assets, ativos: counts.ativos, assets: counts.assets });
      const aCount = counts.total;

      // Banco local vazio: verifica o espelho virtual (iframe sandbox) — é dele
      // que a Unidade Operacional tira o número quando não há linhas em disco.
      let vCount = 0;
      if (aCount === 0) {
        try {
          const virtualData = await readVirtualSnapshot();
          vCount = Array.isArray(virtualData) ? virtualData.length : 0;
        } catch { vCount = 0; }
      }
      setVirtualCount(vCount);
      setAssetCount(aCount);
      const lCount = await db.audit_logs.count();
      setLogCount(lCount);
      if (vCount > 0) {
        addLog(`[SRE_STATS] Banco local vazio, mas existe espelho virtual com ${vCount} ativos (origem do número mostrado na Unidade Operacional).`);
      } else {
        addLog(`[SRE_STATS] Espelhos: local_assets=${counts.local_assets} · ativos=${counts.ativos} · assets=${counts.assets}.`);
      }
    } catch (err: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      console.error("[SRE STATS ERR]", err);
    }
  }, [activeTenantid, addLog]);

  // Recalcula as estatísticas no boot E quando o tenant ativo é detectado:
  // loadStats muda de identidade junto com activeTenantid, então um único
  // efeito cobre os dois casos sem diretiva de supressão.
  useEffect(() => {
    loadStats();
  }, [loadStats]);

  // ── Limpeza de cópias repetidas (mesmo tenantid + filial + etiqueta) ──
  // O mesmo conjunto pode ser gravado várias vezes com `primarykey` diferente,
  // então o bulkPut não substitui e a Unidade Operacional soma 4× os ativos.
  const [dedupRunning, setDedupRunning] = useState<boolean>(false);
  const [dedupLines, setDedupLines] = useState<string[]>([]);

  // ── Guardião suave de duplicidade por recno (tenantid + filial + sn1_recno) ──
  const [recnoRunning, setRecnoRunning] = useState<boolean>(false);
  const [recnoLines, setRecnoLines] = useState<string[]>([]);
  const [recnoReport, setRecnoReport] = useState<RecnoReport | null>(null);

  const recnoCounts = (() => {
    if (!recnoReport) return null;
    const linha = recnoReport.collisions.filter((c) => c.kind === 'LINHA_SEGUINTE');
    const origens = recnoReport.collisions.filter((c) => c.kind === 'ORIGENS_DIFERENTES');
    const rows = (list: typeof linha) => list.reduce((total, c) => total + c.rows.length, 0);
    return { linha: linha.length, linhaRows: rows(linha), origens: origens.length, origensRows: rows(origens) };
  })();

  const handleRecnoCheck = async () => {
    if (recnoRunning) return;
    setRecnoRunning(true);
    addLog('[SRE_RECNO] Verificando duplicidade por tenantid + filial + sn1_recno (nada é bloqueado)...');
    try {
      const report = await reportRecnoCollisions('GESTOR_BASE');
      const lines = formatRecnoReport(report);
      lines.forEach(addLog);
      setRecnoLines(lines);
      setRecnoReport(report.collisions.length > 0 ? report : null);
      showRecoveryToast(
        report.collisions.length === 0
          ? 'Nenhuma duplicidade por recno na base local.'
          : `${report.collisions.length} possível(is) duplicidade(s) por recno — verifique o relatório.`,
        'blue'
      );
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      addLog(`[SRE_RECNO ERROR] ${errMsg}`);
      setRecnoReport(null);
      showRecoveryToast('Falha na verificação por recno — nada foi alterado.', 'red');
    } finally {
      setRecnoRunning(false);
    }
  };

  const handleDedupClick = async (apply: boolean) => {
    if (dedupRunning) return;
    if (apply) {
      const confirmed = window.confirm(
        'LIMPAR CÓPIAS REPETIDAS?\n\n' +
        'Só são removidas linhas com a MESMA tenantid + filial + etiqueta.\n' +
        'A cópia conferida é sempre a que fica, com autor e data de leitura.\n' +
        'Ativos sem etiqueta não são tocados.\n\n' +
        'Recomendado: primeiro DIAGNOSTICAR e conferir os números.'
      );
      if (!confirmed) return;
    }
    setDedupRunning(true);
    addLog(apply
      ? '[SRE_DEDUP] Aplicando limpeza de cópias (tenantid + filial + etiqueta)...'
      : '[SRE_DEDUP] Diagnosticando cópias (nada é alterado)...');
    try {
      const report = apply ? await applyAssetDuplicateCleanup() : await previewAssetDuplicateCleanup();
      const lines = formatDedupReport(report);
      lines.forEach(addLog);
      setDedupLines(lines);
      if (apply) {
        await loadStats();
        showRecoveryToast(`Limpeza concluída: ${report.removed} cópia(s) removida(s).`, 'blue');
      } else {
        showRecoveryToast(`Diagnóstico: ${report.removed} cópia(s) encontrada(s).`, 'blue');
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      addLog(`[SRE_DEDUP ERROR] ${errMsg}`);
      showRecoveryToast('Falha na limpeza de cópias — nada foi alterado.', 'red');
    } finally {
      setDedupRunning(false);
    }
  };

  useEffect(() => {
    addLog("[SRE BOOT] Inicializando painel de gestão de base de dados...");
  }, [addLog]);


  // Carga central de planilha (usada pelo input de arquivo E pela listagem de
  // planilhas da pasta vinculada). O parser XLSX (SheetJS) suporta .xls/.xlsx/.csv.
  const loadSpreadsheetFile = async (file: File) => {
    if (!file) return;

    addLog(`[SRE_LOADER] Arquivo selecionado: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`);
    setIsUploading(true);
    setProgress(0);
    const stableHistory = JSON.stringify([AppScreen.DATABASE_MANAGER]);
    
    const isIframe = typeof window !== 'undefined' && window.self !== window.top;
    const pathName = isIframe ? `iFrame Sandbox / ${file.name}` : `GBR_Inventario / ${file.name}`;
    setActivePathName(pathName);
    sessionStorage.setItem('gbr_physical_folder_name', 'GBR_Inventario_Virtual');
    localStorage.setItem('gbr_physical_link_active', 'true');

    try {
      addLog("[SRE_LOADER] Extraindo e fatiando planilha Excel...");
      const assetsInjected = await processAndInjectSpreadsheetData(file, (currentProgress) => {
        setProgress(currentProgress);
      });

      addLog(`[SRE_LOADER] ${assetsInjected.length} ativos injetados com sucesso.`);
      const contratosDaCarga = [...new Set(
        assetsInjected.map((a) => String((a as { tenantid?: unknown }).tenantid ?? '').trim())
          .filter(Boolean)
      )];
      // A carga gravou na BASE LOCAL deste dispositivo (Dexie/SQLite). Avisa o
      // App para ele operar nela — em "Base Oficial" a Unidade Operacional
      // leria a nuvem, vazia para o contrato, e a tela diria "sem dados".
      if (assetsInjected.length > 0) {
        onLocalBaseLoaded?.({
          count: assetsInjected.length,
          tenantids: contratosDaCarga.map((c) => c.toUpperCase())
        });
      }
      // RASTREIO DE CARGAS: registra no audit_logs da nuvem quantos ativos esta
      // carga trouxe e para qual contrato — alimenta o histórico de cargas.
      // O tenantid do evento vem do usuário logado; se ele não tiver contrato
      // (ex.: dono global), deriva dos PRÓPRIOS dados carregados (a planilha
      // carrega o tenantid de cada ativo) para nunca perder o rastro do contrato.
      try {
        const storedUser = sessionStorage.getItem('app_current_user');
        const userEmail = storedUser ? (JSON.parse(storedUser) as { email?: string })?.email || 'unknown' : 'unknown';
        const tenantDoEvento = (activeTenantid || contratosDaCarga[0] || '').toUpperCase();
        const sufixo = tenantDoEvento
          ? ` (contrato ${tenantDoEvento}${contratosDaCarga.length > 1 ? `; também presentes: ${contratosDaCarga.slice(1).join(', ')}` : ''})`
          : '';
        await logAuditEvent({
          user_email: userEmail,
          action: 'IMPORT',
          table_name: 'assets',
          details: `Carga de planilha ${file.name}: ${assetsInjected.length} ativos injetados${sufixo}.`,
          tenantid: tenantDoEvento || undefined
        });
      } catch (auditErr) {
        logger.warn('[SRE_LOADER] Falha ao registrar carga no audit_logs:', auditErr);
      }
      // A pasta vinculada passa a receber a base depois de cada carga: é o
      // endereço de trabalho que o utilizador escolheu.
      if (workspaceFolderName) await gravarBaseNaPasta();

      addLog("[SRE_LOADER] Gerando backup físico na sandbox...");
      try {
        const isFileSaved = await saveSnapshotToWorkspace(assetsInjected);
        localStorage.setItem('gbr_kardek_history', stableHistory);
        setIsUploading(false);

        if (isFileSaved) {
          addLog("[SRE_LOADER] Carga e backup concluídos com sucesso.");
          showRecoveryToast("✓ INTEGRADO E BACKUP GRAVADO COM SUCESSO.", "blue");
        } else {
          addLog("[SRE_LOADER] Carga realizada com ressalva: erro secundário ao gravar backup físico.");
          if (assetsInjected.length > 0) {
            addLog("[SRE_LOADER] Sincronização limpa garantida: ativos locais consolidados na UI. Erro de backup ignorado silenciosamente.");
          } else {
            if (isIframe) {
              addLog("[SRE_LOADER] iFrame Sandbox detectado. Omitindo e ocultando modal de erro residual.");
              setShowErrorModal(false);
            } else {
              showRecoveryToast("⚠️ CARGA OK, FALHA AO GRAVAR ARQUIVO DE BACKUP.", "red");
            }
          }
        }
      } catch (backupError: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
        localStorage.setItem('gbr_kardek_history', stableHistory);
        setIsUploading(false);
        addLog(`[SRE_LOADER] Exceção de IO secundária ao gravar backup físico: ${backupError.message || String(backupError)}`);
        if (assetsInjected.length > 0) {
          addLog("[SRE_LOADER] Sincronização limpa garantida: ativos locais consolidados na UI. Exceção de backup ignorada silenciosamente.");
        } else {
          if (isIframe) {
            addLog("[SRE_LOADER] iFrame Sandbox detectado na exceção. Omitindo e ocultando modal.");
            setShowErrorModal(false);
          } else {
            showRecoveryToast("⚠️ CARGA OK, FALHA AO GRAVAR ARQUIVO DE BACKUP.", "red");
          }
        }
      }
      loadStats();
    } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      localStorage.setItem('gbr_kardek_history', stableHistory);
      setIsUploading(false);
      const errMsg = error instanceof Error ? error.message : String(error);
      addLog(`[SRE ERROR] Falha no processamento: ${errMsg}`);
      console.error("[SRE CRÍTICO] Colapso na esteira local de arquivos:", error);
      
      if (isIframe) {
        addLog("[SRE_LOADER] iFrame Sandbox detectado no catch. Omitindo e ocultando modal de erro.");
        setShowErrorModal(false);
      } else {
        showRecoveryToast("❌ ERRO NO PROCESSAMENTO DA PLANILHA.", "red");
      }
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await loadSpreadsheetFile(file);
    // Limpa o input para permitir recarregar o mesmo arquivo depois
    e.target.value = '';
  };

  // ── Pasta vinculada: listar as planilhas .xls/.xlsx/.csv existentes ──
  // `file` (webkitdirectory) e `handle` (File System Access) são as duas origens
  // possíveis: nem todo o ambiente tem `showDirectoryPicker` (Android WebView e
  // iFrame de outro domínio não têm), e antes isso deixava o botão sem efeito.
  type WorkspaceSheet = { name: string; handle?: FileSystemFileHandle; file?: File };
  const [workspaceSheets, setWorkspaceSheets] = useState<WorkspaceSheet[]>([]);
  const [workspaceFolderName, setWorkspaceFolderName] = useState<string | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);

  const registrarPasta = (nome: string) => {
    setWorkspaceFolderName(nome);
    setActivePathName(nome);
    localStorage.setItem('gbr_physical_folder_name', nome);
    localStorage.setItem('gbr_physical_link_active', 'true');
    sessionStorage.setItem('gbr_physical_folder_name', nome);
  };

  const [baseNaPasta, setBaseNaPasta] = useState<{ savedAt: string; count: number } | null>(null);

  /** Grava a base local (ativos) dentro da pasta vinculada, no gesto actual. */
  const gravarBaseNaPasta = async (handle?: unknown): Promise<boolean> => {
    const assets = (await db.local_assets.toArray()) as unknown as Record<string, unknown>[];
    const snapshot = await saveBaseToWorkspace(assets, handle);
    if (!snapshot) {
      addLog('[SRE_BASE] Pasta vinculada sem permissão de escrita: base local não foi gravada nela.');
      return false;
    }
    setBaseNaPasta({ savedAt: snapshot.saved_at, count: snapshot.count });
    addLog(`[SRE_BASE] Base local gravada na pasta: ${snapshot.count} ativo(s).`);
    return true;
  };

  /** Carrega a base da pasta para o banco local (substitui o que lá está). */
  const restaurarBaseDaPasta = useCallback(async (remota: WorkspaceBaseSnapshot): Promise<void> => {
    const parsed = remota.assets as unknown as Record<string, unknown>[];
    await db.transaction('rw', [db.local_assets, db.ativos, db.assets], async () => {
      await db.local_assets.clear();
      await db.ativos.clear();
      await db.assets.clear();
      await db.local_assets.bulkPut(parsed as never[]);
      await db.ativos.bulkPut(parsed as never[]);
      await db.assets.bulkPut(parsed as never[]);
    });
    await saveVirtualSnapshot(parsed);
    setBaseNaPasta({ savedAt: remota.saved_at, count: remota.assets.length });
    addLog(`[SRE_BASE] Base recuperada da pasta: ${remota.assets.length} ativo(s).`);
    showRecoveryToast(`📂 Base carregada da pasta: ${remota.assets.length} ativo(s).`, 'blue');
    await loadStats();
    onLocalBaseLoaded?.({ count: remota.assets.length, tenantids: restoreTenants(parsed) });
  }, [addLog, loadStats, onLocalBaseLoaded, showRecoveryToast]);

  /**
   * Regra de convivência entre a pasta e o banco local, decidida ANTES de
   * escrever: pasta com base e banco vazio → recupera; ambos com dados →
   * pergunta; senão grava o que está local. Sem isto, vincular a pasta podia
   * apagar a base que o utilizador tem no aparelho.
   */
  const sincronizarBaseComPasta = async (handle?: unknown): Promise<void> => {
    const remota = await readBaseFromWorkspace(handle);
    const locais = await db.local_assets.count();

    if (remota && remota.assets.length > 0 && locais === 0) {
      await restaurarBaseDaPasta(remota);
      return;
    }
    if (remota && remota.assets.length > 0 && locais > 0 && remota.assets.length !== locais) {
      const usarPasta = window.confirm(
        `A pasta já tem uma base com ${remota.assets.length} ativo(s) e este aparelho tem ${locais}.\n\n` +
        'OK = carregar a base da PASTA (substitui a do aparelho).\n' +
        'Cancelar = gravar a base DESTE APARELHO na pasta.'
      );
      if (usarPasta) {
        await restaurarBaseDaPasta(remota);
        return;
      }
    }
    if (!(await gravarBaseNaPasta(handle))) {
      if (remota) setBaseNaPasta({ savedAt: remota.saved_at, count: remota.assets.length });
    }
  };

  // Pasta vinculada em sessões anteriores: o handle vive em IndexedDB. Sem esta
  // recuperação, o cartão dizia "NENHUM DIRETÓRIO VINCULADO" depois de reiniciar
  // mesmo com a pasta escolhida antes.
  useEffect(() => {
    let activo = true;
    void (async () => {
      const nome = await restoreWorkspaceHandle();
      if (!activo || !nome) return;
      setWorkspaceFolderName(nome);
      setActivePathName(nome);
      localStorage.setItem('gbr_physical_folder_name', nome);
      addLog(`[SRE_LOADER] Pasta vinculada recordada: ${nome}. Use VINCULAR PASTA para trocar.`);

      // Base da pasta no arranque: só se o aparelho estiver vazio (sem gesto não
      // se pede permissão, e substituir dados locais sem perguntar seria pior).
      const remota = await readBaseFromWorkspace();
      if (remota) setBaseNaPasta({ savedAt: remota.saved_at, count: remota.assets.length });
      if (remota && remota.assets.length > 0 && (await db.local_assets.count()) === 0) {
        await restaurarBaseDaPasta(remota);
      }
    })();
    return () => { activo = false; };
  }, [addLog, restaurarBaseDaPasta]);

  const listarPlanilhasDoHandle = async (handle: FileSystemDirectoryHandle): Promise<WorkspaceSheet[]> => {
    const sheets: WorkspaceSheet[] = [];
    const entradas = (handle as unknown as { values: () => AsyncIterable<FileSystemHandle> }).values();
    for await (const entry of entradas) {
      if (entry.kind === 'file' && /\.(xlsx?|csv)$/i.test(entry.name)) {
        sheets.push({ name: entry.name, handle: entry as unknown as FileSystemFileHandle });
      }
    }
    return sheets;
  };

  const handleLinkFolder = async () => {
    const w = window as unknown as { showDirectoryPicker?: (opts?: { mode?: string; id?: string }) => Promise<FileSystemDirectoryHandle> };

    if (typeof w.showDirectoryPicker === 'function') {
      try {
        const handle = await w.showDirectoryPicker({ mode: 'readwrite', id: 'gbr_inventario_root' });
        const sheets = await listarPlanilhasDoHandle(handle);
        setUserWorkspaceHandle(handle);
        await persistWorkspaceHandle(handle);
        setWorkspaceSheets(sheets);
        registrarPasta(handle.name);
        addLog(`[SRE_LOADER] Pasta vinculada: ${handle.name} — ${sheets.length} planilha(s) encontrada(s).`);
        await sincronizarBaseComPasta(handle);
        showRecoveryToast(`📁 Pasta vinculada: ${handle.name}`, 'blue');
        return;
      } catch (err) {
        // Cancelar o seletor é diferente de não haver seletor: só o segundo caso
        // cai para o input de diretório.
        if (err instanceof DOMException && err.name === 'AbortError') {
          addLog('[SRE_LOADER] Seleção de pasta cancelada.');
          return;
        }
        addLog(`[SRE_LOADER] Seletor de pasta recusou (${err instanceof Error ? err.message : String(err)}); usando o seletor de diretório do navegador.`);
      }
    }

    // Fallback universal: `<input webkitdirectory>` devolve os ficheiros da pasta
    // escolhida (Chrome/Edge/Android). Não dá handle para escrita, mas permite
    // navegar e carregar a planilha — que é o que o utilizador pediu aqui.
    if (folderInputRef.current) {
      folderInputRef.current.click();
      return;
    }
    showRecoveryToast('Este navegador não permite escolher pastas. Use SELECIONAR E CARREGAR PLANILHA.', 'red');
  };

  const handleFolderInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length === 0) {
      addLog('[SRE_LOADER] Seleção de pasta cancelada.');
      return;
    }
    const primeira = files[0] as File & { webkitRelativePath?: string };
    const nomePasta = String(primeira.webkitRelativePath || '').split('/')[0] || 'Pasta local';
    const sheets: WorkspaceSheet[] = files
      .filter(file => /\.(xlsx?|csv)$/i.test(file.name))
      .map(file => ({ name: file.name, file }));
    setWorkspaceSheets(sheets);
    registrarPasta(nomePasta);
    addLog(`[SRE_LOADER] Pasta vinculada: ${nomePasta} — ${sheets.length} planilha(s) encontrada(s).`);
    // Este caminho (webkitdirectory) dá leitura, não escrita: o navegador não
    // entrega handle para gravar. Diz-se isso em vez de fingir que gravou.
    addLog('[SRE_BASE] Navegador sem File System Access: a pasta serve para ler planilhas, a base continua apenas no aparelho.');
    showRecoveryToast(`📁 Pasta vinculada: ${nomePasta} (só leitura)`, 'blue');
  };

  const handleLoadWorkspaceSheet = async (sheet: WorkspaceSheet) => {
    try {
      const file = sheet.file ?? (sheet.handle ? await sheet.handle.getFile() : null);
      if (!file) throw new Error('planilha sem origem legível');
      addLog(`[SRE_LOADER] Carregando planilha da pasta: ${sheet.name}`);
      await loadSpreadsheetFile(file);
    } catch (err) {
      addLog(`[SRE ERROR] Falha ao ler planilha da pasta: ${err instanceof Error ? err.message : String(err)}`);
      showRecoveryToast('❌ ERRO AO LER PLANILHA DA PASTA.', 'red');
    }
  };

  const handleCompleteDatabasePurge = async () => {
    const stableHistory = JSON.stringify([AppScreen.DATABASE_MANAGER]);
    setIsPurging(true);
    addLog("[SRE_PURGE] Iniciando higienização estrutural de tabelas...");
    
    try {
      await db.transaction('rw', [db.local_assets, db.addresses, db.ativos, db.assets], async () => {
        await db.local_assets.clear();
        await db.addresses.clear();
        await db.ativos.clear();
        // `assets` também é espelho do inventário: sem o limpar, a higienização
        // deixava dados vivos e as contagens por espelho divergiam.
        await db.assets.clear();
      });
      // Espelho virtual (sandbox): alimentava a Unidade Operacional com milhares
      // de ativos depois de o banco local ser higienizado.
      await clearVirtualSnapshot();

      localStorage.setItem('gbr_kardek_history', stableHistory);
      setIsPurging(false);
      addLog("[SRE_PURGE] Limpeza de tabelas executada com sucesso.");
      showRecoveryToast("⚡ REGISTROS PURGADOS. ESTABILIDADE DA SESSÃO PRESERVADA.", "blue");
      loadStats();
    } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      localStorage.setItem('gbr_kardek_history', stableHistory);
      setIsPurging(false);
      const errMsg = error instanceof Error ? error.message : String(error);
      addLog(`[SRE ERROR] Falha na purga: ${errMsg}`);
      console.error("[SRE CRÍTICO] Crash de barramento evitado:", error);
      showRecoveryToast("❌ OPERAÇÃO DE LIMPEZA INTERROMPIDA PELO SISTEMA.", "blue");
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col p-6 font-sans">
      {/* 1. Header do Gestor */}
      <div className="flex items-center justify-between mb-8 pb-4 border-b border-slate-800">
        <div className="flex items-center space-x-3">
          <Database className="w-6 h-6 text-emerald-400" />
          <div>
            <h1 className="text-sm font-black tracking-wider uppercase text-slate-100">
              Gestor de Base de Dados
            </h1>
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">
              SRE & Controle de I/O Físico
            </p>
          </div>
        </div>

        <button 
          onClick={() => {
            if (onBack) {
              onBack();
            } else {
              const hasPush = typeof window !== 'undefined' && typeof (window as any).pushScreen === 'function'; // eslint-disable-line @typescript-eslint/no-explicit-any
              if (hasPush) {
                (window as any).pushScreen(AppScreen.MODULE_SELECTION); // eslint-disable-line @typescript-eslint/no-explicit-any
              } else {
                localStorage.setItem('gbr_kardek_history', JSON.stringify([AppScreen.MODULE_SELECTION]));
              }
            }
          }}
          className="flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs font-bold uppercase tracking-wider text-slate-400 transition-all cursor-pointer"
        >
          <ArrowLeft size={14} />
          <span>Voltar</span>
        </button>
      </div>

      {/* 2. Barra de Diretório de Persistência */}
      <div className="mb-6 p-4 bg-slate-900/60 border border-slate-800/80 rounded-xl">
        <div className="flex items-center space-x-2 text-[10px] font-mono text-slate-400 uppercase tracking-wider">
          <span className="text-emerald-400">📁</span>
          <span>Diretório de Persistência Física Ativa:</span>
        </div>
        <div className="mt-1.5 font-mono text-xs font-black uppercase text-slate-200 tracking-wide break-all">
          {activePathName}
        </div>
        {workspaceFolderName && (
          <div className="mt-2 text-[10px] font-mono uppercase tracking-wider text-emerald-300">
            💾 Base local na pasta: {baseNaPasta ? `${baseNaPasta.count} ativo(s) · ${new Date(baseNaPasta.savedAt).toLocaleString('pt-BR')}` : 'sem ficheiro de base (será criado na próxima carga)'}
          </div>
        )}
        <div className="mt-2 flex items-center space-x-2 text-[10px] font-mono text-indigo-300 uppercase tracking-wider">
          <span className="text-indigo-400">🏷️</span>
          <span>Contrato Ativo (tenantid):</span>
          <span className="font-black text-indigo-200">{activeTenantid || 'GLOBAL / SEM CONTRATO'}</span>
        </div>
      </div>

      {/* 3. Painel de Status */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="p-4 bg-slate-900/30 border border-slate-800/50 rounded-xl flex flex-col justify-between">
          <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">{activeTenantid ? 'Ativos do Contrato' : 'Ativos Locais'}</span>
          <span className="text-xl font-black text-emerald-400 mt-1 font-mono">{assetCount}</span>
          <span className="text-[8px] font-mono text-slate-500 uppercase tracking-wider mt-1 leading-tight">
            local_assets {mirrors.local_assets} · ativos {mirrors.ativos} · assets {mirrors.assets}
          </span>
          {virtualCount > 0 && (
            <span className="text-[8px] font-bold text-amber-400 uppercase tracking-wider mt-1 leading-tight">
              Espelho virtual (sandbox): {virtualCount} — é o número que a Unidade Operacional lê
            </span>
          )}
        </div>
        <div className="p-4 bg-slate-900/30 border border-slate-800/50 rounded-xl flex flex-col justify-between">
          <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Registros de Auditoria</span>
          <span className="text-xl font-black text-blue-400 mt-1 font-mono">{logCount}</span>
        </div>
      </div>

      {/* 4. Ações Principais */}
      <div className="space-y-4 mb-6">
        {/* Inputs Ocultos e Síncronos */}
        <input 
          type="file" 
          ref={fileInputRef} 
          id="file-loader" 
          accept=".xlsx,.xls,.csv" 
          style={{ display: 'none' }} 
          onChange={handleFileChange} 
        />
        <input 
          type="file" 
          ref={backupInputRef} 
          id="backup-loader" 
          accept=".json" 
          style={{ display: 'none' }} 
          onChange={handleBackupFileChange} 
        />
        {/* Fallback de pasta sem File System Access (Android WebView, iFrame de
            outro domínio): o navegador deixa escolher a pasta e devolve os
            ficheiros dela. */}
        <input
          type="file"
          ref={folderInputRef}
          id="folder-loader"
          // Atributos não-padrão (Chrome/Edge/Android): sem eles o input aceita
          // ficheiros soltos em vez de uma pasta.
          {...({ webkitdirectory: '', directory: '' } as Record<string, string>)}
          multiple
          style={{ display: 'none' }}
          onChange={handleFolderInputChange}
        />

        {/* Botão de Carga Síncrono */}
        <div className="p-5 bg-slate-900/40 border border-slate-800/60 rounded-2xl flex flex-col items-center text-center space-y-4">
          <div className="p-3 bg-emerald-950/40 text-emerald-400 rounded-full border border-emerald-900/30">
            <FileSpreadsheet className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-xs font-black uppercase text-slate-200 tracking-wider">Carga de Planilhabase</h3>
            <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wide mt-1">
              Selecione o arquivo higienizado (.xls/.xlsx/.csv) para importar na base de dados
            </p>
          </div>
          {/* `<label htmlFor>` abre o seletor de ficheiros pelo próprio navegador.
              O `.click()` programático num input `display:none` é bloqueado em
              vários WebViews (Android/iOS) — o botão existia e não abria nada. */}
          <label
            htmlFor={isUploading || isPurging ? undefined : 'file-loader'}
            aria-disabled={isUploading || isPurging}
            className={`w-full flex items-center justify-center space-x-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs uppercase tracking-widest rounded-xl transition-all shadow-lg active:scale-98 cursor-pointer border border-emerald-500/20 ${
              isUploading || isPurging ? 'bg-slate-800 text-slate-600 pointer-events-none' : ''
            }`}
          >
            <UploadCloud size={14} />
            <span>{isUploading ? `CARREGANDO: ${progress}%` : "SELECIONAR E CARREGAR PLANILHA"}</span>
          </label>
        </div>

        {/* Guardião suave de duplicidade por recno (Protheus sn1_recno) */}
        <div className="p-5 bg-slate-900/40 border border-slate-800/60 rounded-2xl flex flex-col space-y-3">
          <div className="flex items-center space-x-3">
            <div className="p-3 bg-cyan-950/40 text-cyan-400 rounded-full border border-cyan-900/30">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div className="flex-1">
              <h3 className="text-xs font-black uppercase text-slate-200 tracking-wider">Duplicidade por Recno</h3>
              <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wide mt-1">
                Mesmo contrato + filial + sn1_recno com etiqueta, descrição ou valor diferentes. Só avisa.
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={recnoRunning}
            onClick={handleRecnoCheck}
            className="flex items-center justify-center space-x-2 px-4 py-3 bg-cyan-700 hover:bg-cyan-600 disabled:bg-slate-800 disabled:text-slate-600 text-white font-bold text-[10px] uppercase tracking-widest rounded-xl transition-all border border-cyan-600/20"
          >
            <AlertTriangle size={14} />
            <span>{recnoRunning ? '...' : 'VERIFICAR RECNO'}</span>
          </button>
          {recnoCounts && (
            <div className="grid grid-cols-2 gap-2">
              <div className="px-2 py-2 bg-amber-950/30 border border-amber-900/30 rounded-lg">
                <p className="text-[8px] font-black uppercase tracking-wider text-amber-400">Linha seguinte</p>
                <p className="text-[10px] font-mono text-amber-100 mt-0.5">
                  {recnoCounts.linha} caso(s) · {recnoCounts.linhaRows} linha(s)
                </p>
              </div>
              <div className="px-2 py-2 bg-rose-950/30 border border-rose-900/30 rounded-lg">
                <p className="text-[8px] font-black uppercase tracking-wider text-rose-400">Origens diferentes</p>
                <p className="text-[10px] font-mono text-rose-100 mt-0.5">
                  {recnoCounts.origens} caso(s) · {recnoCounts.origensRows} linha(s)
                </p>
              </div>
            </div>
          )}
          <button
            type="button"
            disabled={!recnoReport}
            onClick={() => {
              if (!recnoReport) return;
              const fileName = downloadRecnoReportCsv(recnoReport);
              addLog(`[SRE_RECNO] CSV exportado: ${fileName}`);
              showRecoveryToast(`Relatório exportado: ${fileName}`, 'blue');
            }}
            className="flex items-center justify-center space-x-2 px-4 py-3 bg-slate-800 hover:bg-slate-700 disabled:bg-slate-900 disabled:text-slate-600 text-slate-100 font-bold text-[10px] uppercase tracking-widest rounded-xl transition-all border border-slate-700/50"
          >
            <Download size={14} />
            <span>EXPORTAR CSV</span>
          </button>
          {recnoLines.length > 0 && (
            <div className="space-y-1 max-h-40 overflow-y-auto no-scrollbar">
              {recnoLines.map((line, index) => (
                <p key={`recno-${index}`} className="text-[9px] font-mono text-slate-300 break-words">{line}</p>
              ))}
            </div>
          )}
        </div>

        {/* Limpeza de cópias repetidas: mesmo tenantid + filial + etiqueta */}
        <div className="p-5 bg-slate-900/40 border border-slate-800/60 rounded-2xl flex flex-col space-y-3">
          <div className="flex items-center space-x-3">
            <div className="p-3 bg-amber-950/40 text-amber-400 rounded-full border border-amber-900/30">
              <Trash2 className="w-6 h-6" />
            </div>
            <div className="flex-1">
              <h3 className="text-xs font-black uppercase text-slate-200 tracking-wider">Cópias Repetidas</h3>
              <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wide mt-1">
                Mesmo contrato + filial + etiqueta gravados mais de uma vez. A conferência é preservada.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={dedupRunning}
              onClick={() => handleDedupClick(false)}
              className="flex items-center justify-center space-x-2 px-4 py-3 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 disabled:text-slate-600 text-white font-bold text-[10px] uppercase tracking-widest rounded-xl transition-all border border-slate-600/30"
            >
              <Database size={14} />
              <span>{dedupRunning ? '...' : 'DIAGNOSTICAR'}</span>
            </button>
            <button
              type="button"
              disabled={dedupRunning}
              onClick={() => handleDedupClick(true)}
              className="flex items-center justify-center space-x-2 px-4 py-3 bg-amber-600 hover:bg-amber-500 disabled:bg-slate-800 disabled:text-slate-600 text-white font-bold text-[10px] uppercase tracking-widest rounded-xl transition-all border border-amber-500/20"
            >
              <Trash2 size={14} />
              <span>{dedupRunning ? '...' : 'LIMPAR CÓPIAS'}</span>
            </button>
          </div>
          {dedupLines.length > 0 && (
            <div className="space-y-1 max-h-40 overflow-y-auto no-scrollbar">
              {dedupLines.map((line, index) => (
                <p key={`dedup-${index}`} className="text-[9px] font-mono text-slate-300 break-words">{line}</p>
              ))}
            </div>
          )}
        </div>

        {/* Planilhas da Pasta Vinculada: lista os .xls/.xlsx/.csv existentes */}
        <div className="p-5 bg-slate-900/40 border border-slate-800/60 rounded-2xl flex flex-col space-y-3">
          <div className="flex items-center space-x-3">
            <div className="p-3 bg-indigo-950/40 text-indigo-400 rounded-full border border-indigo-900/30">
              <FolderOpen className="w-6 h-6" />
            </div>
            <div className="flex-1">
              <h3 className="text-xs font-black uppercase text-slate-200 tracking-wider">Planilhas da Pasta</h3>
              <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wide mt-1">
                Vincule a pasta e veja os arquivos .xls/.xlsx/.csv existentes nela
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleLinkFolder}
            className="w-full flex items-center justify-center space-x-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-600 text-white font-bold text-xs uppercase tracking-widest rounded-xl transition-all shadow-lg active:scale-98 border border-indigo-500/20"
          >
            <FolderOpen size={14} />
            <span>VINCULAR PASTA E VER PLANILHAS</span>
          </button>
          {workspaceFolderName && (
            <p className="text-[9px] font-mono text-indigo-300 uppercase tracking-wider">Pasta: {workspaceFolderName}</p>
          )}
          {workspaceSheets.length === 0 && workspaceFolderName && (
            <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wide">
              Nenhuma planilha .xls/.xlsx/.csv encontrada na pasta.
            </p>
          )}
          {workspaceSheets.length > 0 && (
            <div className="space-y-1.5 max-h-48 overflow-y-auto no-scrollbar">
              {workspaceSheets.map((sheet) => (
                <div key={sheet.name} className="flex items-center justify-between bg-slate-800/40 border border-slate-700/50 rounded-xl px-3 py-2.5">
                  <span className="text-[10px] font-bold text-slate-300 truncate flex items-center space-x-2 min-w-0">
                    <FileSpreadsheet size={14} className="text-emerald-400 shrink-0" />
                    <span className="truncate">{sheet.name}</span>
                  </span>
                  <button
                    disabled={isUploading}
                    onClick={() => handleLoadWorkspaceSheet(sheet)}
                    className="ml-3 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 text-white text-[9px] font-black uppercase tracking-widest rounded-lg transition-all shrink-0"
                  >
                    {isUploading ? '...' : 'Carregar'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Reconexão de Backup Físico Sandbox */}
        <div className="p-5 bg-slate-900/40 border border-slate-800/60 rounded-2xl flex flex-col items-center text-center space-y-4">
          <div className="p-3 bg-blue-950/40 text-blue-400 rounded-full border border-blue-900/30">
            <Database className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-xs font-black uppercase text-slate-200 tracking-wider">Reconexão Física Sandbox</h3>
            <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wide mt-1">
              Recarregue a base de dados instantaneamente a partir do arquivo JSON baixado
            </p>
          </div>
          <button 
            disabled={isUploading || isPurging}
            onClick={handleBackupButtonClick}
            className="w-full flex items-center justify-center space-x-2 px-6 py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-600 text-white font-bold text-xs uppercase tracking-widest rounded-xl transition-all shadow-lg active:scale-98 cursor-pointer border border-blue-500/20"
          >
            <UploadCloud size={14} />
            <span>RECONECTAR BACKUP FÍSICO (SANDBOX)</span>
          </button>
        </div>

        {/* Botão de Purga Segura */}
        <div className="p-5 bg-slate-900/40 border border-slate-800/60 rounded-2xl flex flex-col items-center text-center space-y-4">
          <div className="p-3 bg-red-950/40 text-red-400 rounded-full border border-red-900/30">
            <Trash2 className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-xs font-black uppercase text-slate-200 tracking-wider">Higienização Física</h3>
            <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wide mt-1">
              Limpe todas as tabelas locais do dispositivo com segurança
            </p>
          </div>
          <button 
            disabled={isUploading || isPurging}
            onClick={() => {
              if (assetCount > 0) {
                setShowModal(true);
              } else {
                showRecoveryToast("⚠️ A BASE JÁ ENCONTRA-SE TOTALMENTE HIGIENIZADA E VAZIA.", "blue");
              }
            }}
            className={`w-full flex items-center justify-center space-x-2 px-6 py-3 font-bold text-xs uppercase tracking-widest rounded-xl transition-all shadow-lg border ${
              assetCount === 0 
                ? "bg-slate-950 text-slate-600 border-slate-900 cursor-not-allowed opacity-50" 
                : "bg-red-650 hover:bg-red-700 text-white cursor-pointer border-red-500/30 active:scale-98"
            }`}
          >
            <Trash2 size={14} />
            <span>{isPurging ? "EXECUTANDO PURGA..." : assetCount === 0 ? "BASE JÁ HIGIENIZADA" : "ZERAR BASE DE DADOS"}</span>
          </button>
        </div>

        {/* Espelhamento em Massa (Supabase) — Card */}
        <div className="p-5 bg-sky-950/20 border border-sky-800/40 rounded-2xl flex flex-col md:flex-row md:items-center gap-4">
          <div className="flex items-start gap-3 flex-1">
            <div className="p-3 bg-sky-950/40 text-sky-400 rounded-full border border-sky-900/30 shrink-0">
              <UploadCloud className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-xs font-black uppercase text-sky-200 tracking-wider">Espelhamento em Massa — Supabase</h3>
              <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wide mt-1">
                Sobe a base carregada para a tabela <b>assets</b> da Nuvem em lotes de 500, preservando o <b>tenantid de cada ativo</b> exatamente como veio da planilha (tenant 100% da base — zero valor fixo).
              </p>
            </div>
          </div>
          <div className="md:w-64 shrink-0 w-full">
            <button
              type="button"
              onClick={enviarBaseParaNuvem}
              disabled={isUploading || isPurging || isMirroring || !isAdmin || assetCount === 0 || isInternalMode || !navigator.onLine}
              className="w-full flex items-center justify-center space-x-2 px-6 py-3 font-bold text-xs uppercase tracking-widest rounded-xl transition-all shadow-lg border bg-sky-950/40 hover:bg-sky-900/60 disabled:bg-slate-950 disabled:text-slate-600 disabled:cursor-not-allowed text-sky-300 border-sky-800/60 active:scale-95"
            >
              <UploadCloud size={14} />
              <span>
                {isMirroring
                  ? `SINCRONIZANDO: ${mirrorProgress}%`
                  : !isAdmin
                    ? "APENAS ADMIN"
                    : assetCount === 0
                      ? "BASE VAZIA"
                      : isInternalMode
                        ? "SUPABASE NÃO CONFIGURADO"
                        : !navigator.onLine
                          ? "SEM CONEXÃO"
                          : "ENVIAR BASE PARA A NUVEM"}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* 5. Terminal de Diagnóstico SRE */}
      <div className="bg-slate-950 border border-slate-900 rounded-xl overflow-hidden shadow-xl mt-auto">
        <div className="bg-slate-900/80 px-4 py-2 flex items-center justify-between border-b border-slate-900">
          <div className="flex items-center space-x-2">
            <Terminal size={12} className="text-slate-400" />
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
              SRE Diagnostics Monitor
            </span>
          </div>
          <div className="flex space-x-1">
            <span className="w-2 h-2 rounded-full bg-slate-800 block"></span>
            <span className="w-2 h-2 rounded-full bg-slate-800 block"></span>
            <span className="w-2 h-2 rounded-full bg-slate-800 block"></span>
          </div>
        </div>
        
        <div className="p-4 font-mono text-[9px] leading-relaxed text-emerald-400 bg-slate-950/90 h-[120px] overflow-y-auto space-y-1">
          {consoleLogs.map((log, index) => (
            <div key={index} className="whitespace-pre-wrap">{log}</div>
          ))}
        </div>
      </div>

      {/* Confirmation Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-sm w-full p-6 shadow-2xl space-y-6">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-red-950 text-red-500 rounded-xl border border-red-900/50">
                <AlertTriangle className="w-6 h-6 animate-pulse" />
              </div>
              <div className="space-y-1">
                <h3 className="text-xs font-black uppercase text-slate-100 tracking-wider">Higienização Física</h3>
                <p className="text-[8px] text-slate-500 uppercase font-bold tracking-widest">SRE & Governança de I/O</p>
              </div>
            </div>
            
            <p className="text-[10px] text-slate-300 leading-relaxed font-bold uppercase">
              Esta operação é <span className="text-red-500">IRREVERSÍVEL</span>. Ela irá apagar todos os ativos e registros de auditoria salvos no disco local do dispositivo. Deseja realmente prosseguir com o reset estrutural do banco?
            </p>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowModal(false);
                  addLog("[SRE GESTOR] Operação cancelada pelo operador.");
                }}
                className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-bold text-[9px] uppercase tracking-wider transition-all border border-slate-700 active:scale-95 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={async () => {
                  setShowModal(false);
                  await handleCompleteDatabasePurge();
                }}
                className="flex-1 py-3 bg-red-650 hover:bg-red-700 text-white rounded-xl font-bold text-[9px] uppercase tracking-wider transition-all border border-red-500 active:scale-95 cursor-pointer"
              >
                Confirmar Reset
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
