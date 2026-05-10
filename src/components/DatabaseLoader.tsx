import React, { useState } from 'react';
import { Database, AlertCircle, Upload, Loader2, CheckCircle2 } from 'lucide-react';
import { sqliteService } from '../services/sqliteService';

interface DatabaseLoaderProps {
  errorContext?: string;
  onSuccess?: () => void;
}

const DatabaseLoader: React.FC<DatabaseLoaderProps> = ({ errorContext, onSuccess }) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setStatus('loading');
    setIsProcessing(true);

    try {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const arrayBuffer = reader.result as ArrayBuffer;
          const uint8Array = new Uint8Array(arrayBuffer);
          
          // Hydrate the SQLite Service with the uploaded binary
          try {
            await sqliteService.initDB(uint8Array);
            setStatus('success');
            setTimeout(() => {
              onSuccess?.();
            }, 800);
          } catch (err) {
            console.error("GBR-Preflight failed:", err);
            const msg = err instanceof Error ? err.message : "Arquivo inválido";
            alert(`Falha na Importação: ${msg}`);
            setStatus('error');
          }
        } catch (err) {
          console.error("Failed to process DB file:", err);
          setStatus('error');
        } finally {
          setIsProcessing(false);
        }
      };
      reader.readAsArrayBuffer(file);
    } catch (err) {
      console.error("File read error:", err);
      setStatus('error');
      setIsProcessing(false);
    }
  };

  return (
    <div className="bg-white p-8 rounded-[2rem] shadow-2xl border border-slate-200 max-w-md w-full space-y-6 relative overflow-hidden">
      {/* Background Accent */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-slate-50 -mr-16 -mt-16 rounded-full" />

      <div className="flex items-center gap-4 text-slate-800 relative z-10">
        <div className="w-14 h-14 bg-slate-900 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-slate-900/10">
          <Database size={32} />
        </div>
        <div>
          <h2 className="text-xl font-black tracking-tight uppercase leading-none">Recuperação</h2>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Soberania de Dados GBR</p>
        </div>
      </div>

      {errorContext && status === 'idle' && (
        <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl flex gap-3 animate-in fade-in slide-in-from-top-2">
          <AlertCircle className="text-amber-500 shrink-0" size={20} />
          <p className="text-xs text-amber-800 font-bold leading-relaxed">{errorContext}</p>
        </div>
      )}

      <div className="space-y-4">
        <p className="text-sm text-slate-500 font-medium leading-relaxed">
          O ambiente de execução foi redefinido. Para restaurar o inventário, por favor selecione seu arquivo de banco de dados <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded text-slate-900">.db</span>.
        </p>
        
        <label className={`
          flex flex-col items-center justify-center p-10 border-2 border-dashed rounded-[1.5rem] transition-all relative
          ${status === 'loading' ? 'bg-slate-50 border-slate-200 pointer-events-none' : 
            status === 'success' ? 'bg-emerald-50 border-emerald-200' :
            'cursor-pointer border-slate-200 hover:border-slate-400 hover:bg-slate-50/50'}
        `}>
          {status === 'loading' ? (
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="text-emerald-500 animate-spin" size={40} />
              <span className="text-[10px] font-black uppercase tracking-widest text-emerald-600 animate-pulse">Processando SQL...</span>
            </div>
          ) : status === 'success' ? (
            <div className="flex flex-col items-center gap-2">
              <CheckCircle2 className="text-emerald-500" size={40} />
              <span className="text-[10px] font-black uppercase tracking-widest text-emerald-600">Integridade Validada</span>
            </div>
          ) : (
            <>
              <Upload className="mb-3 text-slate-400" size={40} />
              <span className="text-xs font-black uppercase tracking-wider text-slate-600">Importar Snapshot</span>
              <span className="text-[10px] text-slate-400 font-bold mt-1 uppercase">Soverign DB / JSON / XLSX</span>
            </>
          )}
          <input 
            type="file" 
            className="hidden" 
            accept=".db,.sqlite,.sqlite3"
            onChange={handleFileUpload}
            disabled={isProcessing}
          />
        </label>
      </div>

      <div className="pt-2">
        <div className="flex items-center gap-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest bg-slate-50 p-3 rounded-xl border border-slate-100">
          <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
          Protocolo de Segurança v24.50 Ativo
        </div>
      </div>
    </div>
  );
};

export default DatabaseLoader;
