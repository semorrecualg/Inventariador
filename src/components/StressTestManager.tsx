
import React, { useState, useEffect } from 'react';
import { stressTestService } from '../services/stressTestService';
import { localDb } from '../services/localDbService';
import { sqliteService } from '../services/sqliteService';
import { ShieldAlert, Database, RefreshCw, CheckCircle2, AlertCircle, Terminal, Wrench, Trash2 } from 'lucide-react';
import BackButton from './BackButton';
import { ModalConfig } from '../types';

interface StressTestStats {
  assetCount: number;
  logCount: number;
  configCount: number;
  stressKeys: string[];
}

interface StressTestManagerProps {
  onBack: () => void;
  onShowModal: (config: Partial<ModalConfig>) => void;
}

const StressTestManager: React.FC<StressTestManagerProps> = ({ onBack, onShowModal }) => {
  const [stats, setStats] = useState<StressTestStats | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const loadStats = async () => {
    const s = await stressTestService.getStats();
    setStats(s);
  };

  useEffect(() => {
    loadStats();
  }, []);

  const handlePopulate = async () => {
    setIsLoading(true);
    try {
      await stressTestService.populateData(10000, 2000);
      await loadStats();
      setMessage("Dados de estresse gerados: 10.000 ativos e 2.000 logs.");
    } catch (e: unknown) {
      const err = e as Error;
      setMessage("Erro: " + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectiveClear = async () => {
    onShowModal({
      title: 'Executar Limpeza Seletiva',
      message: 'Esta ação irá simular a limpeza de cache do sistema, removendo logs e configurações, mas preservando os ativos. Deseja continuar?',
      type: 'confirm',
      showCancel: true,
      onConfirm: async () => {
        setIsLoading(true);
        try {
          // Mesma lógica do handleClearSession no Login.tsx
          await Promise.all([
            localDb.auditLogs.clear(),
            localDb.unitConfigs.clear()
          ]);

          const keysToKeep = ['app_database_mode', 'inventory_assets_v24_internal_secure', 'inventory_assets_v24_supabase_secure'];
          const allKeys = Object.keys(localStorage);
          allKeys.forEach(key => {
            if (!keysToKeep.some(k => key.includes(k))) {
              localStorage.removeItem(key);
            }
          });

          await loadStats();
          setMessage("Limpeza Seletiva Executada. Verifique se os Ativos foram preservados.");
        } catch (e: unknown) {
          const err = e as Error;
          setMessage("Erro: " + err.message);
        } finally {
          setIsLoading(false);
        }
      }
    });
  };

  const handleHardReset = async () => {
    onShowModal({
      title: 'HARD RESET (DBA)',
      message: 'ATENÇÃO: Esta ação irá DESTRUIR o arquivo .db e recriar o schema do zero. TODOS os dados de ativos e logs serão perdidos permanentemente. Confirmar operação de baixo nível?',
      type: 'error',
      showCancel: true,
      confirmText: 'Sim, Destruir Banco',
      onConfirm: async () => {
        setIsLoading(true);
        try {
          await sqliteService.hardResetDatabase();
          await loadStats();
          setMessage("HARD RESET CONCLUÍDO. Banco de dados recriado.");
        } catch (e: unknown) {
          const err = e as Error;
          setMessage("Erro no Reset: " + err.message);
        } finally {
          setIsLoading(false);
        }
      }
    });
  };

  return (
    <div className="p-6 h-full bg-slate-900 flex flex-col animate-fadeIn overflow-y-auto relative">
      {/* Background Watermark */}
      <div className="absolute inset-0 flex items-center justify-center opacity-[0.03] pointer-events-none overflow-hidden">
        <Terminal size={400} className="text-white rotate-12" />
      </div>

      <div className="mb-6 flex items-center justify-between relative z-10">
        <BackButton onClick={onBack} label="Sair do Modo Dev" />
        <div className="flex items-center space-x-2 bg-amber-500 px-3 py-1 rounded-full shadow-lg shadow-amber-500/20">
          <Wrench size={12} className="text-slate-900" />
          <span className="text-[9px] font-black text-slate-900 uppercase tracking-widest">Developer Mode</span>
        </div>
      </div>

      <div className="space-y-6 max-w-md mx-auto w-full relative z-10">
        <div className="text-center mb-2">
          <h1 className="text-2xl font-black text-white uppercase tracking-tighter italic">
            STRESS <span className="text-amber-500">TEST</span>
          </h1>
          <p className="text-[8px] font-black text-slate-500 uppercase tracking-[0.4em] mt-1">
            Ambiente de Auditoria Técnica
          </p>
        </div>

        {/* Stats Card */}
        <div className="bg-slate-800 p-6 rounded-[2rem] border border-slate-700 shadow-2xl">
          <h2 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-4 flex items-center">
            <Database size={14} className="mr-2" /> Estatísticas do Banco
          </h2>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 bg-slate-900/50 rounded-2xl border border-slate-700">
              <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Ativos (SQL)</p>
              <p className="text-2xl font-black text-white">{stats?.assetCount.toLocaleString() || 0}</p>
            </div>
            <div className="p-4 bg-slate-900/50 rounded-2xl border border-slate-700">
              <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Logs (SQL)</p>
              <p className="text-2xl font-black text-white">{stats?.logCount.toLocaleString() || 0}</p>
            </div>
          </div>

          <div className="mt-4 p-4 bg-slate-900/50 rounded-2xl border border-slate-700">
            <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-2">Chaves LocalStorage (Stress)</p>
            <div className="flex flex-wrap gap-2">
              {stats && stats.stressKeys.length > 0 ? stats.stressKeys.map((k: string) => (
                <span key={k} className="px-2 py-1 bg-amber-500/10 text-amber-500 text-[8px] font-bold rounded-md uppercase border border-amber-500/20">{k}</span>
              )) : <span className="text-[8px] text-slate-600 italic">Nenhuma chave de teste encontrada</span>}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="space-y-3">
          <button
            onClick={handlePopulate}
            disabled={isLoading}
            className="w-full bg-white text-slate-900 font-black py-4 rounded-2xl shadow-lg active:scale-[0.98] transition-all uppercase tracking-[0.2em] text-xs flex items-center justify-center space-x-2 disabled:opacity-50"
          >
            {isLoading ? <RefreshCw className="animate-spin" size={16} /> : <Database size={16} />}
            <span>Gerar 10.000 Ativos + Logs</span>
          </button>

          <button
            onClick={handleSelectiveClear}
            disabled={isLoading}
            className="w-full bg-amber-500 text-slate-900 font-black py-4 rounded-2xl shadow-lg shadow-amber-500/20 active:scale-[0.98] transition-all uppercase tracking-[0.2em] text-xs flex items-center justify-center space-x-2 disabled:opacity-50"
          >
            {isLoading ? <RefreshCw className="animate-spin" size={16} /> : <ShieldAlert size={16} />}
            <span>Executar Limpeza Seletiva</span>
          </button>

          <button
            onClick={handleHardReset}
            disabled={isLoading}
            className="w-full bg-red-600 text-white font-black py-4 rounded-2xl shadow-lg shadow-red-600/20 active:scale-[0.98] transition-all uppercase tracking-[0.2em] text-xs flex items-center justify-center space-x-2 disabled:opacity-50"
          >
            {isLoading ? <RefreshCw className="animate-spin" size={16} /> : <Trash2 size={16} />}
            <span>Hard Reset (DBA)</span>
          </button>
        </div>

        {message && (
          <div className={`p-4 rounded-2xl border flex items-start space-x-3 animate-fadeIn ${message.startsWith('Erro') ? 'bg-red-500/10 border-red-500/20 text-red-400' : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'}`}>
            {message.startsWith('Erro') ? <AlertCircle size={18} className="shrink-0" /> : <CheckCircle2 size={18} className="shrink-0" />}
            <p className="text-[10px] font-bold uppercase tracking-widest leading-relaxed">{message}</p>
          </div>
        )}

        <div className="p-4 bg-slate-800 border border-slate-700 rounded-2xl">
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest leading-relaxed">
            <span className="font-black text-amber-500">Objetivo do Teste:</span> Validar que a limpeza seletiva remove logs e chaves temporárias, mas mantém os ativos (SQL) e chaves de inventário críticas (LocalStorage).
          </p>
        </div>
      </div>
    </div>
  );
};

export default StressTestManager;
