import React, { Suspense, lazy, useEffect, useState } from 'react';
import { Package as PackageIcon, AlertTriangle } from 'lucide-react';
import { sqliteService } from './services/sqliteService';

console.log('[GBR-App] Bootstrap iniciado');

// Lazy Loading dos módulos pesados 
const Inventory = lazy(() => import('./components/Inventory'));
const Dashboard = lazy(() => import('./components/Dashboard'));
const DatabaseLoader = lazy(() => import('./components/DatabaseLoader'));

const App: React.FC = () => {
  const [isReady, setIsReady] = useState(false);
  const [bootError, setBootError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'inventory' | 'dashboard'>('inventory');

  useEffect(() => {
    const bootKardek = async () => {
      console.log('[GBR-App] Iniciando Sequência de Boot...');
      try {
        // Tenta iniciar o banco com timeout agressivo de 5s
        await Promise.race([
          sqliteService.initDB(),
          new Promise((_, reject) => setTimeout(() => reject(new Error("TIMEOUT_SQL")), 5000))
        ]);
        console.log('[GBR-App] SQL Ready em modo nativo');
        setIsReady(true);
      } catch (err: any) {
        console.error("[GBR-App] Falha no Trator de Boot:", err);
        setBootError(err.message === "TIMEOUT_SQL" 
          ? "O motor SQL demorou muito para responder (CDN/WASM lento)." 
          : "Ambiente Web detectado - Ativando Modo de Recuperação.");
        setIsReady(true);
      } finally {
        const splash = document.getElementById('gbr-initial-loader');
        if (splash) {
          splash.style.opacity = '0';
          setTimeout(() => { 
            splash.style.display = 'none';
            splash.remove(); 
          }, 400);
        }
      }
    };

    bootKardek();
  }, []);

  if (!isReady && !bootError) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-emerald-500 font-sans p-10">
        <div className="w-16 h-16 border-4 border-slate-800 border-t-emerald-500 rounded-full animate-spin mb-4" />
        <h2 className="text-xl font-black uppercase tracking-tighter">Acionando Kernel...</h2>
        <p className="text-slate-500 text-[10px] mt-2 font-bold uppercase tracking-widest">Sincronizando SQLite WASM</p>
      </div>
    );
  }

  if (bootError) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-6 text-white font-sans text-center">
        <div className="text-emerald-500 mb-6 flex flex-col items-center">
            <AlertTriangle size={64} className="mb-4 text-amber-500 animate-pulse" />
            <h1 className="text-3xl font-black uppercase tracking-tighter italic">Erro de Subsistema</h1>
            <p className="text-slate-400 font-bold uppercase text-[10px] tracking-[0.2em] mt-2">GBR Soberania v24.50</p>
        </div>
        
        <Suspense fallback={<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div>}>
          <div className="w-full max-w-lg border border-slate-800 rounded-[2.5rem] p-1 bg-slate-950/50 shadow-2xl overflow-hidden">
            <DatabaseLoader 
              errorContext={bootError} 
              onSuccess={() => {
                setBootError(null);
                setIsReady(true);
              }} 
            />
          </div>
        </Suspense>

        <p className="mt-8 text-slate-600 text-[10px] font-bold uppercase tracking-widest">Aguardando Intervenção Manual ou Snapshot externo</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row overflow-hidden font-sans">
      <nav className="bg-slate-900 text-white w-full md:w-20 lg:w-64 p-4 flex flex-row md:flex-col gap-4 z-40 border-b md:border-b-0 md:border-r border-slate-800">
        <div className="flex items-center gap-3 mb-0 md:mb-8">
          <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <PackageIcon size={24} />
          </div>
          <div className="hidden lg:block text-left">
            <p className="text-[10px] font-black uppercase text-emerald-400 leading-none">Expert</p>
            <h1 className="font-bold text-lg">Kardek</h1>
          </div>
        </div>
        
        <div className="flex flex-row md:flex-col gap-2 flex-1">
          <button 
            onClick={() => setActiveTab('inventory')}
            className={`flex items-center gap-3 p-3 rounded-xl transition-all ${activeTab === 'inventory' ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' : 'text-slate-400 hover:bg-slate-800'}`}
          >
            <PackageIcon size={20} />
            <span className="hidden lg:block font-bold text-sm uppercase tracking-wider">Inventário</span>
          </button>
          <button 
            onClick={() => setActiveTab('dashboard')}
            className={`flex items-center gap-3 p-3 rounded-xl transition-all ${activeTab === 'dashboard' ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' : 'text-slate-400 hover:bg-slate-800'}`}
          >
            <div className="w-5 h-5 flex items-center justify-center">
               <span className="font-black text-xs">DB</span>
            </div>
            <span className="hidden lg:block font-bold text-sm uppercase tracking-wider">Dashboard</span>
          </button>
        </div>

        <div className="mt-auto hidden md:block">
           <div className="p-3 bg-slate-800/50 border border-slate-700/50 rounded-xl lg:flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-[10px] font-bold">GBR</div>
              <div className="hidden lg:block overflow-hidden text-left">
                <p className="text-xs font-bold truncate">Operador</p>
                <p className="text-[10px] text-slate-500 font-bold truncate uppercase">Soberania v24.50</p>
              </div>
           </div>
        </div>
      </nav>

      <main className="flex-1 overflow-y-auto p-4 md:p-8">
        <Suspense fallback={
          <div className="flex flex-col items-center justify-center h-full gap-4 text-slate-300">
            <div className="w-12 h-12 border-4 border-slate-100 border-t-emerald-500 rounded-full animate-spin" />
            <span className="text-[10px] font-black uppercase tracking-widest italic animate-pulse">Carregando Módulo Industrial...</span>
          </div>
        }>
          {activeTab === 'inventory' ? <Inventory /> : <Dashboard />}
        </Suspense>
      </main>
    </div>
  );
};

export default App;
