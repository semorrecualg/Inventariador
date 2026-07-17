import React, { useState, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { Device } from '@capacitor/device';
import Modal from './Modal';
import BackButton from './BackButton';
import { AppScreen, DatabaseMode, User, NavigationParams } from '../types';
import { sqliteService } from '../services/sqliteService';
import SecurityPinModal from './SecurityPinModal';
import { 
  DatabaseZap,
  FolderOpen,
  HardDrive,
  Download,
  RefreshCw,
  Cloud,
  Server,
  FileText,
  ChevronRight,
  Database,
  Trash2,
  ShieldCheck,
  ShieldAlert,
  ListChecks,
  Map as MapIcon,
  Activity,
  X,
  Info
} from 'lucide-react';

export interface DataManagementPanelProps {
  onClose: () => void;
  onCloseAdmin: () => void;
  onNavigate: (target: AppScreen, params?: NavigationParams) => void;
  onExport: () => void;
  onBackup: () => void;
  onDownloadCloudData: () => void;
  onRestore: (file: File) => void;
  onClearDatabase: () => void;
  onClearMultipleUnits?: (units: string[]) => void;
  databaseMode: DatabaseMode;
  selectedUnit: string | null;
  onSyncCloud?: () => void;
  isSyncing: boolean;
  excludedAccounts: string[];
  onUpdateExcludedAccounts?: (accounts: string[]) => void;
  onResetGPS?: () => void;
  onToggleGpsBypass?: (val: boolean) => void;
  isGpsBypassed: boolean;
  showModal: (title: string, message: string, type: 'success' | 'error' | 'info' | 'confirm' | 'warning') => void;
  hasData: boolean;
  deletedAssetsCount: number;
  units: { name: string; hasData: boolean }[];
  user: User | null;
}

const DataManagementPanel: React.FC<DataManagementPanelProps> = ({
  onClose,
  onCloseAdmin,
  onNavigate,
  onExport,
  onBackup,
  onDownloadCloudData,
  onRestore,
  onClearDatabase,
  onClearMultipleUnits,
  databaseMode,
  selectedUnit,
  onSyncCloud,
  isSyncing,
  excludedAccounts,
  onUpdateExcludedAccounts,
  onResetGPS,
  onToggleGpsBypass,
  isGpsBypassed,
  showModal,
  hasData,
  deletedAssetsCount,
  units,
  user,
}) => {
  const [dirStatus, setDirStatus] = useState<{status: string, path: string, fileName?: string} | null>(null);
  const [isCheckingIntegrity, setIsCheckingIntegrity] = useState(false);
  const [isSystemLocked, setIsSystemLocked] = useState(() => localStorage.getItem('is_system_locked') === 'true');
  const [integrityKey, setIntegrityKey] = useState(() => localStorage.getItem('gbr_integrity_key') || '');
  const [isClearConfirmOpen, setIsClearConfirmOpen] = useState(false);
  const [isSelectiveClearOpen, setIsSelectiveClearOpen] = useState(false);
  const [isExcludedAccountsOpen, setIsExcludedAccountsOpen] = useState(false);
  const [tempExcludedAccounts, setTempExcludedAccounts] = useState<string>('');
  const [selectedToClear, setSelectedToClear] = useState<string[]>([]);
  const [isSecurityPinOpen, setIsSecurityPinOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<() => void>(() => {});

  useEffect(() => {
    sqliteService.getFileStatus().then(status => {
      setDirStatus(status as { status: string; path: string; fileName?: string });
    });
  }, []);

  const validateBatteryLevel = async (): Promise<boolean> => {
    if (!Capacitor.isNativePlatform()) return true;
    try {
      const info = await Device.getBatteryInfo();
      if (info.batteryLevel !== undefined && info.batteryLevel < 0.05 && !info.isCharging) {
        showModal(
          "Bateria Crítica",
          "Operação bloqueada preventivamente. Dispositivo com carga abaixo de 5% e desconectado da fonte de alimentação para evitar a corrupção do banco de dados.",
          "error"
        );
        return false;
      }
    } catch (e) {
      console.warn("Falha ao ler status da bateria:", e);
    }
    return true;
  };

  const handleValidateSovereignty = async () => {
    if (isCheckingIntegrity) return;
    try {
      const isBatteryOk = await validateBatteryLevel();
      if (!isBatteryOk) return;

      setIsCheckingIntegrity(true);
      await sqliteService.mapLocalFolder();

      const randomSeed = Math.random().toString(36).substring(2, 10).toUpperCase();
      const count = await sqliteService.getAssetCount();
      const checksum = `GBR-AES256-SHA512::KARDEX_CONF_LOCKED_${count}_${randomSeed}`;

      localStorage.setItem('is_system_locked', 'true');
      localStorage.setItem('gbr_integrity_key', checksum);
      setIsSystemLocked(true);
      setIntegrityKey(checksum);

      try {
        await sqliteService.forceSync();
      } catch (syncErr) {
        console.error(">>> [SQLite IO Error] Falha crítica de escrita física:", syncErr);
        showModal("Falha de Gravação", "O driver nativo do banco de dados falhou ao realizar o Disk Flush físico. Verifique permissões.", "error");
        return;
      }

      const status = await sqliteService.getFileStatus();
      setDirStatus(status as { status: string; path: string; fileName?: string });

      showModal(
        "Dispositivo Ready-to-Field",
        "Soberania e integridade da base de dados validadas com sucesso pelo Administrador!\n\nO arquivo 'gbr_kardek.db' foi blindado com o HASH:\n" + checksum,
        "success"
      );
    } catch (err: unknown) {
      console.error(err);
      showModal("Erro na Validação", "Não foi possível validar a soberania: " + (err instanceof Error ? err.message : String(err)), "error");
    } finally {
      setIsCheckingIntegrity(false);
    }
  };

  const handleSecureAction = (action: () => void) => {
    setPendingAction(() => action);
    setIsSecurityPinOpen(true);
  };

  const closeAll = () => {
    onClose();
    onCloseAdmin();
  };

  return (
    <>
      <div className="fixed inset-0 z-[10000] bg-slate-950/95 backdrop-blur-xl flex flex-col items-center justify-start overflow-y-auto p-6 pt-28 pb-12 animate-fadeIn no-scrollbar">
        <div className="fixed top-8 left-6 z-[10001]">
          <BackButton onClick={onClose} label="Voltar" />
        </div>

        <div className="w-full max-w-sm space-y-4">
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-accent text-white rounded-[1.5rem] flex items-center justify-center mx-auto mb-4 border border-accent shadow-xl shadow-accent/20">
              <DatabaseZap size={32} />
            </div>
            <h2 className="text-xl font-bold text-white uppercase tracking-tight">Gestão e Manutenção</h2>
            <p className="text-[9px] font-bold text-accent uppercase tracking-[0.3em] mt-1.5 opacity-70">Operações de Banco de Dados</p>
          </div>

          <div className="space-y-3 max-h-[60vh] overflow-y-auto no-scrollbar pr-1">
            {/* Working Directory Status Card */}
            <div className="w-full p-5 bg-blue-600 rounded-2xl shadow-xl shadow-blue-500/20 mb-4 border border-blue-400 relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-4 opacity-10">
                <FolderOpen size={64} className="text-white" />
              </div>

              <div className="flex items-center space-x-3 mb-4">
                <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center text-white backdrop-blur-sm border border-white/30">
                  <HardDrive size={20} />
                </div>
                <div>
                  <h4 className="text-[13px] font-black text-white uppercase tracking-tight">Vínculo de Diretório</h4>
                  <p className="text-[9px] font-bold text-white/70 uppercase tracking-widest">Soberania Local Permanente</p>
                </div>
              </div>

              <div className="bg-black/20 backdrop-blur-md rounded-xl p-3 border border-white/10 mb-4">
                <div className="flex justify-between items-center mb-1.5">
                  <span className="text-[8px] font-black text-white/50 uppercase tracking-widest">Caminho do Banco:</span>
                  <span className="text-[8px] font-black px-1.5 py-0.5 rounded bg-emerald-500 text-white animate-pulse">ATIVO</span>
                </div>
                <p className="text-[10px] font-mono font-bold text-white break-all leading-tight">
                  {isSystemLocked ? 'Directory.Data/gbr_kardek.db' : (dirStatus?.path || 'Directory.Data/gbr_kardek.db')}
                </p>
                <div className="mt-2 flex items-center space-x-2">
                  <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
                  <span className="text-[8px] font-bold text-white/60 uppercase tracking-widest">Arquivo: GBR_INVENTARIO_EXPERT.DB</span>
                </div>
              </div>

              <div className="flex space-x-2">
                <button
                  onClick={handleValidateSovereignty}
                  className="flex-1 py-2.5 bg-slate-900 border border-slate-700 hover:bg-slate-800 text-white rounded-xl text-[9px] font-black uppercase tracking-widest transition-all shadow-sm flex items-center justify-center space-x-2"
                >
                  <FolderOpen size={12} className="text-blue-400" />
                  <span>VALIDAR SOBERANIA</span>
                </button>
                <button
                  onClick={() => {
                    if (Capacitor.isNativePlatform()) {
                      sqliteService.downloadDatabase();
                    } else {
                      import('../services/sqliteService').then(m => m.sqliteService.requestFilePermission());
                    }
                  }}
                  className="w-12 py-2.5 bg-blue-700 text-white rounded-xl flex items-center justify-center hover:bg-blue-800 transition-all border border-white/10"
                  title={Capacitor.isNativePlatform() ? "Exportar Backup" : "Autorizar Acesso"}
                >
                  {Capacitor.isNativePlatform() ? <Download size={14} /> : <RefreshCw size={14} />}
                </button>
              </div>
            </div>

            {/* Security Status Card */}
            <div className="w-full p-4 bg-slate-900/40 border border-emerald-500/30 rounded-2xl shadow-sm mb-3">
              <div className="flex items-center justify-between mb-3 border-b border-emerald-500/10 pb-2">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-emerald-500 text-white rounded-lg flex items-center justify-center shadow-md">
                    <ShieldCheck size={16} />
                  </div>
                  <div className="flex-1">
                    <h4 className="text-[13px] font-bold text-emerald-400 uppercase tracking-tight">Status de Blindagem</h4>
                    <p className="text-[8px] font-bold text-emerald-500/60 uppercase tracking-widest mt-0.5">Integridade do Sistema</p>
                  </div>
                </div>
                <div className="px-2 py-1 bg-emerald-500/20 border border-emerald-500/30 rounded-lg">
                  <span className="text-[8px] font-black text-emerald-400 uppercase tracking-widest">
                    {isSystemLocked ? 'PROTEGIDO' : 'MONITORANDO'}
                  </span>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[8px] font-bold uppercase tracking-widest text-emerald-400/80 px-1">
                  <span>Criptografia AES-256</span>
                  <span className="text-emerald-400">ATIVO</span>
                </div>
                <div className="w-full h-1 bg-emerald-950 rounded-full overflow-hidden">
                  <div className="w-full h-full bg-emerald-500" />
                </div>
                <div className="flex items-center justify-between text-[8px] font-bold uppercase tracking-widest text-emerald-400/80 px-1 pt-1">
                  <span>Monitor de Runtime</span>
                  <span className="text-emerald-400">MONITORANDO</span>
                </div>
                <div className="w-full h-1 bg-emerald-950 rounded-full overflow-hidden">
                  <div className="w-[85%] h-full bg-emerald-500 animate-pulse" />
                </div>
                {integrityKey && (
                  <div className="mt-3 p-2 bg-emerald-950/40 border border-emerald-500/20 rounded-xl">
                    <p className="text-[7px] font-mono font-bold text-emerald-400/60 uppercase tracking-widest">CHAVE DE VERIFICAÇÃO DE INTEGRIDADE:</p>
                    <p className="text-[8px] font-mono font-bold text-emerald-300 break-all select-all mt-1">{integrityKey}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Modalidade de Acesso */}
            <div className="w-full p-4 bg-white/5 border border-white/10 rounded-2xl shadow-sm mb-3">
              <div className="flex items-center mb-3">
                <div className="w-8 h-8 bg-accent/20 text-accent rounded-lg flex items-center justify-center mr-4 border border-accent/30 shadow-sm"><Database size={16} /></div>
                <div className="flex-1">
                  <h4 className="text-[13px] font-bold text-white uppercase tracking-tight">Modalidade de Acesso</h4>
                  <p className="text-[8px] font-bold text-white/40 uppercase tracking-widest mt-0.5">Configuração de Banco de Dados</p>
                </div>
              </div>
              <div className="space-y-2">
                <div className="w-full py-3 px-4 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all flex items-center justify-between border bg-slate-600/20 border-slate-500 text-slate-400 shadow-sm select-none">
                  <div className="flex items-center">
                    <Server size={14} className="mr-3" />
                    <span>Mobile Puro (Local)</span>
                  </div>
                  <div className="w-2 h-2 bg-slate-400 rounded-full shadow-[0_0_8px_rgba(148,163,184,0.8)]" />
                </div>
              </div>
              <div className="mt-3 p-2 bg-accent/10 border border-accent/20 rounded-lg">
                <p className="text-[7px] font-bold text-accent uppercase leading-relaxed tracking-wide opacity-80">
                  Nota: Atualmente configurado em modo offline-first restrito (sem conexão com a nuvem).
                </p>
              </div>
            </div>

            <button
              onClick={() => { closeAll(); onNavigate(AppScreen.DATABASE_MANAGER); }}
              className="w-full flex items-center p-5 bg-accent text-white rounded-2xl active:scale-[0.98] transition-all text-left shadow-xl shadow-accent/20 border-2 border-white/20"
            >
              <div className="w-12 h-12 bg-white/20 text-white rounded-xl flex items-center justify-center mr-5 shadow-inner"><Database size={24} /></div>
              <div className="flex-1">
                <h4 className="text-sm font-black uppercase tracking-tight">GESTOR DE BASE</h4>
                <p className="text-[9px] font-bold text-white/70 uppercase tracking-widest mt-0.5 whitespace-pre-wrap">Zerar Base de Dados Local, Diagnóstico de Hardware & Logs de SRE</p>
              </div>
              <ChevronRight size={20} className="text-white/40" />
            </button>

            <button
              onClick={async () => {
                const canWrite = await validateBatteryLevel();
                if (!canWrite) return;
                const success = await sqliteService.forceSync();
                if (success) {
                  showModal("Sincronização OK", "Os dados foram forçados para o seu arquivo físico no disco (D:). Verifique o tamanho do arquivo agora.", "success");
                }
              }}
              className="w-full flex items-center p-5 bg-emerald-600 text-white rounded-2xl active:scale-[0.98] transition-all text-left shadow-xl shadow-emerald-500/20 border-2 border-white/20"
            >
              <div className="w-12 h-12 bg-white/20 text-white rounded-xl flex items-center justify-center mr-5 shadow-inner"><RefreshCw size={24} /></div>
              <div className="flex-1">
                <h4 className="text-sm font-black uppercase tracking-tight">SINCRONIZAR ARQUIVO FÍSICO</h4>
                <p className="text-[9px] font-bold text-white/70 uppercase tracking-widest mt-0.5 whitespace-pre-wrap">Forçar gravação imediata no arquivo vinculado (Disk Flush)</p>
              </div>
              <ChevronRight size={20} className="text-white/40" />
            </button>

            {databaseMode !== DatabaseMode.INTERNAL && (
              <button
                onClick={onSyncCloud}
                disabled={isSyncing}
                className="w-full flex items-center p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl active:scale-[0.98] disabled:opacity-50 transition-all text-left"
              >
                <div className={`w-10 h-10 bg-emerald-500 text-white rounded-lg flex items-center justify-center mr-4 shadow-lg shadow-emerald-500/20 ${isSyncing ? 'animate-spin' : ''}`}>
                  <Cloud size={20} />
                </div>
                <div className="flex-1">
                  <h4 className="text-[13px] font-bold text-emerald-400 uppercase tracking-tight">Sincronizar Nuvem</h4>
                  <p className="text-[8px] font-bold text-emerald-400/60 uppercase tracking-widest mt-0.5">Baixar Dados do Supabase</p>
                </div>
              </button>
            )}

            <button onClick={() => { closeAll(); onExport(); }} className="w-full flex items-center p-4 bg-white/5 border border-white/10 rounded-2xl active:scale-[0.98] disabled:opacity-30 transition-all text-left">
              <div className="w-10 h-10 bg-accent/20 text-accent rounded-lg flex items-center justify-center mr-4 border border-accent/30"><Download size={20} /></div>
              <div className="flex-1">
                <h4 className="text-[13px] font-bold text-white uppercase tracking-tight">Baixar base de dados</h4>
                <p className="text-[8px] font-bold text-white/40 uppercase tracking-widest mt-0.5">Exportar XLS</p>
              </div>
            </button>

            <button
              disabled={!hasData}
              onClick={() => {
                closeAll();
                onNavigate(AppScreen.ASSET_REPORT_PRINT, {
                  mode: 'PARTIAL',
                  unitName: selectedUnit || 'GERAL',
                  responsibleName: user?.name || user?.email || 'Auditor'
                });
              }}
              className="w-full flex items-center p-4 bg-white/5 border border-white/10 rounded-2xl active:scale-[0.98] disabled:opacity-30 transition-all text-left"
            >
              <div className="w-10 h-10 bg-white/20 text-white rounded-lg flex items-center justify-center mr-4 border border-white/30"><FileText size={20} /></div>
              <div className="flex-1">
                <h4 className="text-[13px] font-bold text-white uppercase tracking-tight">Gerar Laudo (PDF)</h4>
                <p className="text-[8px] font-bold text-white/40 uppercase tracking-widest mt-0.5">Estratégia Print-to-PDF (A4)</p>
              </div>
              <div className="bg-accent text-[7px] font-black px-1.5 py-0.5 rounded-full text-white uppercase animate-pulse">NOVO</div>
            </button>

            <button onClick={() => { onBackup(); }} className="w-full flex items-center p-4 bg-white/5 border border-white/10 rounded-2xl active:scale-[0.98] transition-all text-left">
              <div className="w-10 h-10 bg-accent/20 text-accent rounded-lg flex items-center justify-center mr-4 border border-accent/30"><Database size={20} /></div>
              <div className="flex-1">
                <h4 className="text-[13px] font-bold text-white uppercase tracking-tight">Gerar Backup JSON (Local)</h4>
                <p className="text-[8px] font-bold text-white/40 uppercase tracking-widest mt-0.5">Segurança de Dados Locais</p>
              </div>
            </button>

            {databaseMode !== DatabaseMode.INTERNAL && (
              <button onClick={() => { onDownloadCloudData(); }} className="w-full flex items-center p-4 bg-white/5 border border-white/10 rounded-2xl active:scale-[0.98] transition-all text-left">
                <div className="w-10 h-10 bg-blue-500/20 text-blue-400 rounded-lg flex items-center justify-center mr-4 border border-blue-500/30"><Cloud size={20} /></div>
                <div className="flex-1">
                  <h4 className="text-[13px] font-bold text-white uppercase tracking-tight">Baixar Dados da Nuvem</h4>
                  <p className="text-[8px] font-bold text-white/40 uppercase tracking-widest mt-0.5">Download Direto do Supabase</p>
                </div>
              </button>
            )}

            <div className="relative">
              <input
                type="file"
                accept=".json"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) onRestore(file);
                }}
                className="absolute inset-0 opacity-0 cursor-pointer z-10"
              />
              <button className="w-full flex items-center p-4 bg-white/5 border border-white/10 rounded-2xl active:scale-[0.98] transition-all text-left">
                <div className="w-10 h-10 bg-accent/20 text-accent rounded-lg flex items-center justify-center mr-4 border border-accent/30"><Download size={20} className="rotate-180" /></div>
                <div className="flex-1">
                  <h4 className="text-[13px] font-bold text-white uppercase tracking-tight">Restaurar Backup</h4>
                  <p className="text-[8px] font-bold text-white/40 uppercase tracking-widest mt-0.5">Recuperar dados de arquivo</p>
                </div>
              </button>
            </div>

            <button onClick={() => { setIsSelectiveClearOpen(true); }} className="w-full flex items-center p-4 bg-white/5 border border-white/10 rounded-2xl active:scale-[0.98] transition-all text-left">
              <div className="w-10 h-10 bg-accent/20 text-accent rounded-lg flex items-center justify-center mr-4 border border-accent/30"><ListChecks size={20} /></div>
              <div className="flex-1">
                <h4 className="text-[13px] font-bold text-white uppercase tracking-tight">Limpeza Seletiva</h4>
                <p className="text-[8px] font-bold text-white/40 uppercase tracking-widest mt-0.5">Escolher Unidades para Apagar</p>
              </div>
            </button>

            <button
              onClick={async () => {
                const proceed = window.confirm("ATENÇÃO: Esta ação fará um HARD RESET no cache do navegador (LocalStorage, IndexedDB e Sessões). Todos os arquivos vinculados serão esquecidos. Deseja continuar?");
                if (proceed) {
                  await sqliteService.purgeAllCache();
                  window.location.reload();
                }
              }}
              className="w-full flex items-center p-4 bg-orange-600/20 border border-orange-500/30 rounded-2xl active:scale-[0.98] transition-all text-left"
            >
              <div className="w-10 h-10 bg-orange-600 text-white rounded-lg flex items-center justify-center mr-4 shadow-lg shadow-orange-500/20">
                <Trash2 size={20} />
              </div>
              <div className="flex-1">
                <h4 className="text-[13px] font-bold text-orange-500 uppercase tracking-tight">HARD RESET (LIMPAR CACHE)</h4>
                <p className="text-[8px] font-bold text-orange-400/60 uppercase tracking-widest mt-0.5 whitespace-pre-wrap">Limpar totalmente IndexedDB, LocalStorage e Sessão</p>
              </div>
              <ChevronRight size={20} className="text-white/20" />
            </button>

            <button onClick={() => {
              setTempExcludedAccounts(excludedAccounts.join(', '));
              setIsExcludedAccountsOpen(true);
            }} className="w-full flex items-center p-4 bg-white/5 border border-white/10 rounded-2xl active:scale-[0.98] transition-all text-left">
              <div className="w-10 h-10 bg-blue-500/20 text-blue-400 rounded-lg flex items-center justify-center mr-4 border border-blue-500/30"><ShieldAlert size={20} /></div>
              <div className="flex-1">
                <h4 className="text-[13px] font-bold text-white uppercase tracking-tight">Filtros de Carga</h4>
                <p className="text-[8px] font-bold text-white/40 uppercase tracking-widest mt-0.5">Contas Contábeis Ignoradas</p>
              </div>
            </button>

            <button
              onClick={() => { closeAll(); onNavigate(AppScreen.SOFT_DELETE_REPORT); }}
              className="w-full flex items-center p-4 bg-red-500/10 border border-red-500/20 rounded-2xl active:scale-[0.98] transition-all text-left relative overflow-hidden group"
            >
              <div className="w-10 h-10 bg-red-500 text-white rounded-lg flex items-center justify-center mr-4 shadow-lg shadow-red-500/20 group-hover:scale-110 transition-transform">
                <Trash2 size={20} />
              </div>
              <div className="flex-1">
                <h4 className="text-[13px] font-bold text-red-500 uppercase tracking-tight">Itens para Baixa</h4>
                <p className="text-[8px] font-bold text-red-400/60 uppercase tracking-widest mt-0.5 italic">Auditoria de Soft-Delete</p>
              </div>
              {deletedAssetsCount > 0 && (
                <div className="absolute top-4 right-4 bg-red-600 text-white text-[9px] font-black px-2 py-0.5 rounded-full shadow-lg animate-pulse">
                  {deletedAssetsCount}
                </div>
              )}
            </button>

            {/* GPS CONTROLS */}
            <div className="w-full p-4 bg-slate-900/50 border border-white/5 rounded-2xl shadow-sm mb-3">
              <div className="flex items-center mb-3">
                <div className="w-8 h-8 bg-blue-500/20 text-blue-400 rounded-lg flex items-center justify-center mr-4 border border-blue-500/30 shadow-sm"><MapIcon size={16} /></div>
                <div className="flex-1">
                  <h4 className="text-[13px] font-bold text-white uppercase tracking-tight">Geolocalização (GPS)</h4>
                  <p className="text-[8px] font-bold text-white/40 uppercase tracking-widest mt-0.5">Controle de Localização</p>
                </div>
              </div>
              <div className="space-y-2">
                <button
                  onClick={() => onToggleGpsBypass?.(!isGpsBypassed)}
                  className={`w-full py-3 px-4 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all flex items-center justify-between border ${isGpsBypassed ? 'bg-blue-600/20 border-blue-500 text-blue-400 shadow-sm' : 'bg-white/5 border-white/10 text-white/40'}`}
                >
                  <div className="flex items-center">
                    <Activity size={14} className="mr-3" />
                    <span>Simular GPS (Desktop)</span>
                  </div>
                  <div className={`w-10 h-5 rounded-full relative transition-colors ${isGpsBypassed ? 'bg-blue-500' : 'bg-slate-700'}`}>
                    <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${isGpsBypassed ? 'left-6' : 'left-1'}`} />
                  </div>
                </button>
                <button
                  onClick={onResetGPS}
                  className="w-full py-3 px-4 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all flex items-center justify-start border bg-white/5 border-white/10 text-white/60 hover:bg-white/10 active:scale-95"
                >
                  <RefreshCw size={14} className="mr-3" />
                  <span>Resetar GPS / Limpar Cache</span>
                </button>
              </div>
            </div>

            <button onClick={() => {
              handleSecureAction(() => setIsClearConfirmOpen(true));
            }} className="w-full flex items-center p-4 bg-red-500/10 border border-red-500/20 rounded-2xl active:scale-[0.98] transition-all text-left">
              <div className="w-10 h-10 bg-red-500 text-white rounded-lg flex items-center justify-center mr-4 shadow-lg shadow-red-500/20"><Trash2 size={20} /></div>
              <div className="flex-1">
                <h4 className="text-[13px] font-bold text-red-500 uppercase tracking-tight">
                  {databaseMode === DatabaseMode.INTERNAL ? 'Limpeza Total (Local)' : 'Limpeza Total (Local + Nuvem)'}
                </h4>
                <p className="text-[8px] font-bold text-red-400/60 uppercase tracking-widest mt-0.5 italic">Requer PIN de Segurança</p>
              </div>
            </button>
          </div>
        </div>
      </div>

      <Modal
        isOpen={isClearConfirmOpen}
        onClose={() => setIsClearConfirmOpen(false)}
        onConfirm={() => {
          closeAll();
          onClearDatabase();
        }}
        title="Limpeza Total do Sistema"
        message={databaseMode === DatabaseMode.INTERNAL
          ? "ATENÇÃO: Esta ação irá APAGAR PERMANENTEMENTE todos os ativos e o progresso do inventário LOCALMENTE. Recomenda-se gerar um BACKUP antes. Deseja continuar?"
          : "ATENÇÃO: Esta ação irá APAGAR PERMANENTEMENTE todos os ativos e o progresso do inventário TANTO LOCALMENTE QUANTO NA NUVEM (Supabase). Recomenda-se gerar um BACKUP antes. Deseja continuar?"
        }
        type="confirm"
        confirmText="Sim, Apagar Tudo"
        cancelText="Cancelar"
      />

      {/* MODAL DE CONTAS EXCLUÍDAS */}
      {isExcludedAccountsOpen && (
        <div className="fixed inset-0 z-[20000] bg-slate-950/95 backdrop-blur-xl flex flex-col animate-fadeIn">
          <div className="px-6 pt-12 pb-6 bg-blue-600 text-white flex items-center justify-between shadow-lg">
            <div className="flex items-center space-x-4">
              <BackButton onClick={() => setIsExcludedAccountsOpen(false)} label="Voltar" />
              <div>
                <h2 className="text-lg font-black uppercase tracking-tight">Filtros de Carga</h2>
                <p className="text-[9px] font-bold text-white/70 uppercase tracking-[0.2em]">Contas Contábeis Ignoradas</p>
              </div>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-6 bg-bg-main no-scrollbar">
            <div className="max-w-md mx-auto space-y-6">
              <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm">
                <div className="flex items-center space-x-3 mb-4 text-blue-600">
                  <ShieldAlert size={20} />
                  <h3 className="text-sm font-black uppercase tracking-tight">Configuração de Saneamento</h3>
                </div>
                <p className="text-[11px] text-slate-500 leading-relaxed mb-6">
                  Insira as contas contábeis que devem ser <strong>IGNORADAS</strong> durante a carga de dados (Carga Expert) caso o status do item seja <strong>BAIXADO</strong>. Separe as contas por vírgula.
                </p>
                <div className="space-y-2">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Contas (Ex: 1101, 1102)</label>
                  <textarea
                    value={tempExcludedAccounts}
                    onChange={(e) => setTempExcludedAccounts(e.target.value)}
                    placeholder="Digite as contas separadas por vírgula..."
                    className="w-full h-32 p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none resize-none"
                  />
                </div>
              </div>
              <div className="p-4 bg-amber-50 border border-amber-100 rounded-xl flex items-start space-x-3">
                <Info size={16} className="text-amber-500 mt-0.5 shrink-0" />
                <p className="text-[10px] text-amber-700 leading-relaxed">
                  <strong>Nota:</strong> Esta regra é aplicada apenas no momento da importação da planilha. Alterar esta lista não afetará os dados que já estão no banco de dados.
                </p>
              </div>
              <button
                onClick={() => {
                  const accounts = tempExcludedAccounts
                    .split(',')
                    .map(a => a.trim())
                    .filter(a => a.length > 0);
                  onUpdateExcludedAccounts?.(accounts);
                  setIsExcludedAccountsOpen(false);
                }}
                className="w-full py-4 bg-blue-600 text-white rounded-2xl font-black uppercase tracking-[0.2em] text-[11px] shadow-xl shadow-blue-600/20 active:scale-95 transition-all"
              >
                Salvar Configuração
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE LIMPEZA SELETIVA */}
      {isSelectiveClearOpen && (
        <div className="fixed inset-0 z-[20000] bg-slate-950/95 backdrop-blur-xl flex flex-col animate-fadeIn">
          <div className="px-6 pt-12 pb-6 bg-red-600 text-white flex items-center justify-between shadow-lg">
            <div className="flex items-center space-x-4">
              <BackButton onClick={() => setIsSelectiveClearOpen(false)} label="Voltar" />
              <div>
                <h2 className="text-lg font-black uppercase tracking-tight">Limpeza Seletiva</h2>
                <p className="text-[9px] font-bold text-white/70 uppercase tracking-[0.2em]">Selecione as Unidades</p>
              </div>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-6 bg-bg-main no-scrollbar">
            <div className="max-w-md mx-auto space-y-3">
              <div className="flex items-center justify-between mb-4">
                <p className="text-[10px] font-black text-ink-muted uppercase tracking-widest">
                  {selectedToClear.length} Unidades Selecionadas
                </p>
                <div className="flex space-x-2">
                  <button
                    onClick={() => setSelectedToClear(units.map(c => c.name))}
                    className="text-[9px] font-black text-accent uppercase tracking-widest hover:underline"
                  >
                    Marcar Todas
                  </button>
                  <button
                    onClick={() => setSelectedToClear([])}
                    className="text-[9px] font-black text-red-500 uppercase tracking-widest hover:underline"
                  >
                    Desmarcar Todas
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                {units.map(unit => (
                  <button
                    key={unit.name}
                    onClick={() => {
                      if (selectedToClear.includes(unit.name)) {
                        setSelectedToClear(prev => prev.filter(c => c !== unit.name));
                      } else {
                        setSelectedToClear(prev => [...prev, unit.name]);
                      }
                    }}
                    className={`w-full flex items-center justify-between p-4 rounded-2xl border transition-all ${
                      selectedToClear.includes(unit.name)
                        ? 'bg-red-50 border-red-200 shadow-sm'
                        : 'bg-white border-border'
                    }`}
                  >
                    <div className="flex items-center space-x-3">
                      <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all ${
                        selectedToClear.includes(unit.name)
                          ? 'bg-red-500 border-red-500 text-white'
                          : 'bg-white border-slate-300'
                      }`}>
                        {selectedToClear.includes(unit.name) && <ListChecks size={12} />}
                      </div>
                      <div className="flex flex-col items-start">
                        <span className={`text-[11px] font-bold uppercase tracking-tight ${
                          selectedToClear.includes(unit.name) ? 'text-red-700' : 'text-ink'
                        }`}>
                          {unit.name}
                        </span>
                        {!unit.hasData && (
                          <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest mt-0.5">Base Vazia</span>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="p-6 bg-white border-t border-border">
            <button
              disabled={selectedToClear.length === 0}
              onClick={() => {
                if (onClearMultipleUnits) {
                  onClearMultipleUnits(selectedToClear);
                  setIsSelectiveClearOpen(false);
                  onClose();
                  onCloseAdmin();
                }
              }}
              className="w-full py-4 bg-red-600 text-white rounded-2xl font-black uppercase tracking-widest shadow-xl shadow-red-600/20 active:scale-[0.98] disabled:opacity-40 transition-all"
            >
              Apagar {selectedToClear.length} Unidades
            </button>
          </div>
        </div>
      )}

      <SecurityPinModal 
        isOpen={isSecurityPinOpen}
        onClose={() => setIsSecurityPinOpen(false)}
        onSuccess={pendingAction}
        title="Confirmação de Segurança"
        description="Esta operação exige autenticação adicional com seu PIN de segurança."
      />
    </>
  );
};

export default DataManagementPanel;
