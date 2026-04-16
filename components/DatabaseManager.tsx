
import React, { useState, useEffect } from 'react';
import { Database, Upload, Download, Trash2, ShieldCheck, AlertTriangle, Check, Loader2, FileJson, FileSpreadsheet, FolderClosed, HardDrive, RefreshCw } from 'lucide-react';
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
  const [fileStatus, setFileStatus] = useState<{ status: string, path: string, lastModified?: string } | null>(null);
  const [message, setMessage] = useState<{ text: string, type: 'success' | 'error' | 'info' } | null>(null);

  useEffect(() => {
    isStoragePersisted().then(setIsPersisted);
    sqliteService.getFileStatus().then(setFileStatus);
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
        <section className="bg-white p-5 rounded-2xl border-2 border-blue-100 shadow-sm overflow-hidden relative">
          <div className="absolute top-0 right-0 p-2 opacity-10">
            <HardDrive size={64} className="text-blue-600" />
          </div>
          <h3 className="font-black text-[10px] text-blue-600 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
            <FolderClosed size={16} />
            Soberania de Dados (Modo Físico)
          </h3>
          
          <div className="space-y-4">
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
              <div className="flex justify-between items-start mb-2">
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Local do Arquivo (.db)</span>
                <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase ${
                  fileStatus?.status === 'linked' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                }`}>
                  {fileStatus?.status === 'linked' ? 'VINCULADO' : 'DESCONECTADO'}
                </span>
              </div>
              <p className="text-[11px] font-mono text-slate-700 break-all bg-white p-2 rounded border border-slate-200">
                {fileStatus?.path || 'Nenhum arquivo físico vinculado'}
              </p>
              {fileStatus?.lastModified && (
                <p className="text-[8px] font-bold text-slate-400 uppercase mt-2">
                  Última Sincronização: {fileStatus.lastModified}
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button 
                onClick={handleReconnect}
                className="flex items-center justify-center gap-2 py-3 bg-blue-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-sm hover:bg-blue-700 transition-all active:scale-95"
              >
                <RefreshCw size={14} />
                Reconectar Pasta
              </button>
              <button 
                onClick={handleExportSqlite}
                className="flex items-center justify-center gap-2 py-3 border-2 border-blue-600 text-blue-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-50 transition-all active:scale-95"
              >
                <Download size={14} />
                Exportar .DB
              </button>
            </div>
          </div>
        </section>

        {/* Status de Persistência */}
        <section className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <ShieldCheck className={isPersisted ? "text-emerald-500" : "text-slate-400"} size={20} />
              <h3 className="font-semibold text-slate-800">Integridade e Persistência</h3>
            </div>
            <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase ${
              isPersisted ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"
            }`}>
              {isPersisted ? "DURÁVEL" : "TEMPORÁRIO"}
            </span>
          </div>
          <p className="text-xs text-slate-500 mb-4">
            A persistência durável impede que o sistema operacional apague seus dados de inventário para liberar espaço em disco.
          </p>
          {!isPersisted && (
            <button 
              onClick={handleRequestPersistence}
              className="w-full py-2.5 bg-slate-900 text-white rounded-xl text-sm font-semibold hover:bg-slate-800 transition-colors"
            >
              Solicitar Persistência Durável
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
