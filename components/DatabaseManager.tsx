
import React, { useState, useEffect } from 'react';
import { Database, Upload, Download, Trash2, ShieldCheck, AlertTriangle, Check, Loader2, FileJson, FileSpreadsheet, RefreshCw, Activity, FolderOpen } from 'lucide-react';
import { assetRepository } from '../services/assetRepository';
import { requestPersistentStorage, isStoragePersisted } from '../services/localDbService';
import { backupInventory, restoreInventory } from '../services/persistenceService';
import { sqliteService } from '../services/sqliteService';
import { InventoryState, DatabaseMode } from '../types';

interface DatabaseManagerProps {
  mode: DatabaseMode;
  onRestore: (state: InventoryState) => void;
  onClearDatabase: () => void;
  onClose: () => void;
}

const DatabaseManager: React.FC<DatabaseManagerProps> = ({ mode, onRestore, onClearDatabase, onClose }) => {
  const [isPersisted, setIsPersisted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [fileStatus, setFileStatus] = useState<{ status: string, path: string, lastModified?: string, fileName?: string } | null>(null);
  const [message, setMessage] = useState<{ text: string, type: 'success' | 'error' | 'info' } | null>(null);

  useEffect(() => {
    isStoragePersisted().then(setIsPersisted);
    sqliteService.getFileStatus().then(status => setFileStatus(status as { status: string; path: string; lastModified?: string; fileName?: string }));
  }, []);

  const handleReconnect = async () => {
    try {
      await sqliteService.linkExistingFile();
      const status = await sqliteService.getFileStatus();
      setFileStatus(status);
      setMessage({ text: 'Banco físico reconectado com sucesso.', type: 'success' });
    } catch {
      setMessage({ text: 'Falha ao reconectar banco físico.', type: 'error' });
    }
  };

  const handleExportSqlite = async () => {
    await sqliteService.exportDatabaseFile();
    setMessage({ text: 'Arquivo .db exportado para o sistema.', type: 'success' });
  };

  const handleRequestPersistence = async () => {
    const result = await requestPersistentStorage();
    setIsPersisted(result);
    if (result) {
      setMessage({ text: 'Persistência durável concedida pelo navegador.', type: 'success' });
    } else {
      setMessage({ text: 'O navegador negou a persistência durável. Os dados podem ser limpos se o disco estiver cheio.', type: 'error' });
    }
  };

  const handleImportJson = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    setMessage({ text: 'Importando dados...', type: 'info' });

    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const json = JSON.parse(event.target?.result as string);
          const assets = Array.isArray(json) ? json : (json.assets || []);
          await assetRepository.importJson(assets);
          setMessage({ text: `${assets.length} ativos importados com sucesso.`, type: 'success' });
          // Opcional: recarregar a página ou notificar o App
        } catch (_err) {
          console.error('JSON Import error:', _err);
          setMessage({ text: 'Erro ao processar JSON: ' + (_err as Error).message, type: 'error' });
        } finally {
          setIsLoading(false);
        }
      };
      reader.readAsText(file);
    } catch {
      setMessage({ text: 'Erro ao ler arquivo.', type: 'error' });
      setIsLoading(false);
    }
  };

  const handleImportCsv = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    setMessage({ text: 'Importando dados CSV...', type: 'info' });

    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const csv = event.target?.result as string;
          await assetRepository.importCsv(csv);
          setMessage({ text: 'Dados CSV importados com sucesso.', type: 'success' });
        } catch (__err) {
          console.error('CSV Import error:', __err);
          setMessage({ text: 'Erro ao processar CSV: ' + (__err as Error).message, type: 'error' });
        } finally {
          setIsLoading(false);
        }
      };
      reader.readAsText(file);
    } catch {
      setMessage({ text: 'Erro ao ler arquivo.', type: 'error' });
      setIsLoading(false);
    }
  };

  const handleBackup = async () => {
    setIsLoading(true);
    const success = await backupInventory(mode);
    setIsLoading(false);
    if (success) {
      setMessage({ text: 'Backup gerado com sucesso.', type: 'success' });
    } else {
      setMessage({ text: 'Falha ao gerar backup.', type: 'error' });
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50">
      <div className="p-6 bg-white border-b border-slate-200">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 bg-accent/10 rounded-lg text-accent">
            <Database size={24} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900">Gestão de Banco de Dados</h2>
            <p className="text-sm text-slate-500">Arquitetura SQLite-like (IndexedDB) para Inventário Offline</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {message && (
          <div className={`p-4 rounded-xl flex items-start gap-3 animate-slideIn ${
            message.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' :
            message.type === 'error' ? 'bg-rose-50 text-rose-700 border border-rose-100' :
            'bg-blue-50 text-blue-700 border border-blue-100'
          }`}>
            {message.type === 'success' ? <Check size={20} /> : <AlertTriangle size={20} />}
            <p className="text-sm font-medium">{message.text}</p>
          </div>
        )}

        {/* Soberania de Dados (Físico) */}
        <section className="bg-white p-6 rounded-2xl border-2 border-blue-600 shadow-lg overflow-hidden relative">
          <div className="absolute top-0 right-0 p-3 opacity-5">
            <FolderOpen size={80} className="text-blue-900" />
          </div>
          
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-black text-[11px] text-blue-900 uppercase tracking-[0.25em] flex items-center gap-2">
              <ShieldCheck size={18} className="text-blue-600" />
              Soberania do Ativo Digital
            </h3>
            <div className="h-px flex-1 bg-blue-100 ml-4"></div>
          </div>
          
          <div className="space-y-4">
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
              <div className="flex justify-between items-start mb-2">
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Pasta de Trabalho Selecionada</span>
                <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-tighter ${
                  fileStatus?.status === 'linked' ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' : 'bg-amber-100 text-amber-700 border border-amber-200'
                }`}>
                  {fileStatus?.status === 'linked' ? 'VÍNCULO ATIVO' : 'DESCONECTADO'}
                </span>
              </div>
              <div className="flex items-center gap-2 bg-white p-3 rounded-lg border border-slate-200 shadow-inner">
                <FolderOpen size={16} className="text-slate-400 shrink-0" />
                <p className="text-[11px] font-mono font-bold text-slate-700 break-all flex-1">
                  {fileStatus?.path || 'Configuração pendente...'}
                </p>
              </div>
              
              <div className="mt-3 flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <div className={`w-2 h-2 rounded-full ${fileStatus?.status === 'linked' ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`} />
                  <span className="text-[9px] font-bold text-slate-500 uppercase tracking-[0.1em]">
                    Base: {fileStatus?.fileName || '---'}
                  </span>
                </div>
                {fileStatus?.lastModified && (
                  <span className="text-[8px] font-bold text-slate-300 uppercase italic">
                    Modificado: {fileStatus.lastModified}
                  </span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button 
                onClick={handleReconnect}
                className="flex items-center justify-center gap-2 py-3 bg-blue-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-blue-500/30 hover:bg-blue-700 transition-all active:scale-95 group"
              >
                <RefreshCw size={14} className="group-active:animate-spin" />
                Validar Acesso
              </button>
              <button 
                onClick={handleExportSqlite}
                className="flex items-center justify-center gap-2 py-3 border-2 border-blue-600 text-blue-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-50 transition-all active:scale-95"
              >
                <Download size={14} />
                Exportar .DB
              </button>
            </div>

            <div className={`p-4 rounded-xl border flex items-start gap-3 ${
              mode === DatabaseMode.SUPABASE 
                ? 'bg-blue-50 border-blue-100 shadow-sm' 
                : 'bg-amber-50 border-amber-100'
            }`}>
              {mode === DatabaseMode.SUPABASE ? (
                <ShieldCheck size={18} className="text-blue-600 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle size={18} className="text-amber-600 shrink-0 mt-0.5" />
              )}
              <div className="space-y-1">
                <p className={`text-[10px] font-black uppercase tracking-wider ${
                  mode === DatabaseMode.SUPABASE ? 'text-blue-900' : 'text-amber-900'
                }`}>
                  {mode === DatabaseMode.SUPABASE ? 'Redundância Cloud de Segurança' : 'Soberania de Dados Locais'}
                </p>
                <p className={`text-[10px] leading-relaxed font-medium ${
                  mode === DatabaseMode.SUPABASE ? 'text-blue-700' : 'text-amber-700'
                }`}>
                  {mode === DatabaseMode.SUPABASE 
                    ? "O App utiliza o princípio da redundância. Mesmo com dados na nuvem, é vital manter este banco físico sincronizado para garantir a continuidade operacional em caso de instabilidade na rede."
                    : "Este arquivo é a sua única cópia de segurança real. Se você limpar os dados do navegador Chrome, use o botão 'Reconectar Pasta' para recuperar este vínculo."}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Status de Persistência do Navegador */}
        <section className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Activity className={isPersisted ? "text-emerald-500" : "text-amber-500"} size={20} />
              <h3 className="font-bold text-slate-800 text-xs uppercase tracking-tight">Persistência de Sistema (Quota)</h3>
            </div>
            <span className={`px-2 py-1 rounded text-[9px] font-black uppercase tracking-tighter ${
              isPersisted ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
            }`}>
              {isPersisted ? "DURÁVEL" : "VOLÁTIL"}
            </span>
          </div>
          <div className="flex items-center gap-3 mb-4">
             <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div className={`h-full transition-all duration-1000 ${isPersisted ? 'w-full bg-emerald-500' : 'w-1/3 bg-amber-500'}`}></div>
             </div>
          </div>
          <p className="text-[10px] text-slate-500 leading-relaxed font-medium">
            {isPersisted 
              ? "O navegador marcou este App como persistente. O Android não apagará os dados do banco mesmo com pouco espaço em disco."
              : "Status de armazenamento padrão. O sistema Android pode apagar dados se o celular ficar sem espaço."}
          </p>
          {!isPersisted && (
            <button 
              onClick={handleRequestPersistence}
              className="mt-4 w-full py-3 bg-slate-100 text-slate-900 border border-slate-200 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-200"
            >
              Forçar Persistência Durável
            </button>
          )}
        </section>

        {/* Carga de Dados */}
        <section className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
            <Upload size={18} className="text-accent" />
            Carga Inicial de Dados
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col items-center justify-center p-4 border-2 border-dashed border-slate-200 rounded-xl hover:border-accent hover:bg-accent/5 cursor-pointer transition-all">
              <FileJson size={24} className="text-slate-400 mb-2" />
              <span className="text-xs font-bold text-slate-600">Importar JSON</span>
              <input type="file" accept=".json" onChange={handleImportJson} className="hidden" />
            </label>
            <label className="flex flex-col items-center justify-center p-4 border-2 border-dashed border-slate-200 rounded-xl hover:border-accent hover:bg-accent/5 cursor-pointer transition-all">
              <FileSpreadsheet size={24} className="text-slate-400 mb-2" />
              <span className="text-xs font-bold text-slate-600">Importar CSV</span>
              <input type="file" accept=".csv" onChange={handleImportCsv} className="hidden" />
            </label>
          </div>
          <p className="text-[10px] text-slate-400 mt-3 text-center italic">
            * Suporta arquivos exportados do Protheus ou SAP em formato compatível.
          </p>
        </section>

        {/* Backup e Restauração */}
        <section className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
            <Download size={18} className="text-blue-500" />
            Backup e Segurança
          </h3>
          <div className="space-y-3">
            <button 
              onClick={handleBackup}
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-2 py-3 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 hover:bg-slate-50 transition-colors"
            >
              {isLoading ? <Loader2 className="animate-spin" size={18} /> : <Download size={18} />}
              Exportar Backup Completo (JSON)
            </button>
            <label className="w-full flex items-center justify-center gap-2 py-3 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 hover:bg-slate-50 cursor-pointer transition-all">
              <Upload size={18} />
              Restaurar de Arquivo
              <input 
                type="file" 
                accept=".json" 
                className="hidden" 
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    const state = await restoreInventory(file, mode);
                    if (state) onRestore(state);
                  }
                }}
              />
            </label>
          </div>
        </section>

        {/* Limpeza */}
        <section className="bg-rose-50 p-5 rounded-2xl border border-rose-100 shadow-sm">
          <h3 className="font-semibold text-rose-800 mb-2 flex items-center gap-2">
            <Trash2 size={18} />
            Zona de Perigo
          </h3>
          <p className="text-xs text-rose-600 mb-4">
            A limpeza do banco de dados local removerá todos os ativos e configurações. Certifique-se de ter um backup ou sincronização ativa.
          </p>
          <button 
            className="w-full py-2.5 bg-rose-600 text-white rounded-xl text-sm font-bold hover:bg-rose-700 transition-colors"
            onClick={() => {
              if (window.confirm('TEM CERTEZA? Esta ação é irreversível e apagará todos os dados locais.')) {
                onClearDatabase();
                setMessage({ text: 'Banco de dados limpo com sucesso.', type: 'success' });
              }
            }}
          >
            Limpar Banco de Dados Local
          </button>
        </section>
      </div>

      <div className="p-6 bg-white border-t border-slate-200">
        <button 
          onClick={onClose}
          className="w-full py-3 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 transition-colors"
        >
          Fechar Gerenciador
        </button>
      </div>
    </div>
  );
};

export default DatabaseManager;
