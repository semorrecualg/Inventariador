
import React, { useState } from 'react';
import { AppScreen, User, ScannerMode, ScanFeedbackMode } from '../types';
import { 
  Search, 
  BarChart3, 
  LogOut, 
  ClipboardList, 
  Download, 
  Users,
  Settings,
  Shield,
  X,
  ShieldCheck,
  ChevronRight,
  DatabaseZap,
  Trash2,
  SlidersHorizontal,
  Tag,
  QrCode,
  ScanLine,
  Vibrate,
  Volume2,
  Battery
} from 'lucide-react';

interface MainMenuProps {
  onNavigate: (target: AppScreen) => void;
  onLogout: () => void;
  onExport: () => void;
  onClearDatabase: () => void;
  user: User | null;
  inventoryInfo: { count: number; totalDatabase: number; date: string | null };
  scannerMode: ScannerMode;
  onUpdateScannerMode: (mode: ScannerMode) => void;
  autoConfirmOnScan: boolean;
  onUpdateAutoConfirm: (val: boolean) => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  scanFeedbackMode: ScanFeedbackMode;
  onUpdateScanFeedbackMode: (mode: ScanFeedbackMode) => void;
}

const MainMenu: React.FC<MainMenuProps> = ({ 
  onNavigate, 
  onLogout, 
  onExport, 
  onClearDatabase, 
  user, 
  inventoryInfo, 
  scannerMode, 
  onUpdateScannerMode, 
  autoConfirmOnScan, 
  onUpdateAutoConfirm, 
  isFullscreen, 
  onToggleFullscreen,
  scanFeedbackMode,
  onUpdateScanFeedbackMode
}) => {
  const [isAdminMenuOpen, setIsAdminMenuOpen] = useState(false);
  const [isDataMenuOpen, setIsDataMenuOpen] = useState(false);
  const isAdmin = user?.isAdmin || user?.email.toLowerCase() === "semorr@gmail.com";
  const hasData = inventoryInfo.totalDatabase > 0;

  return (
    <div className="flex flex-col h-full bg-bg-main animate-fadeIn relative overflow-hidden">
      <div className="px-5 pt-10 pb-6 bg-white border-b border-slate-200 flex items-center justify-between shadow-sm z-20">
        <div className="flex items-center space-x-4">
          <div className="w-12 h-12 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-center text-slate-600 shadow-sm">
            <Shield size={24} />
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-0.5">GBR Mobile</p>
            <h1 className="text-lg font-bold text-slate-900 truncate max-w-[180px] tracking-tight">
              {user?.username || 'Operador'}
            </h1>
          </div>
        </div>
        {isAdmin && (
          <button 
            onClick={() => setIsAdminMenuOpen(true)} 
            className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-slate-400 active:scale-90 transition-all shadow-sm hover:bg-white hover:text-slate-900"
          >
            <Settings size={24} />
          </button>
        )}
      </div>

      <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <div className={`w-2 h-2 rounded-full ${hasData ? 'bg-emerald-500 shadow-sm shadow-emerald-200' : 'bg-slate-300'}`} />
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
            {hasData ? `${inventoryInfo.totalDatabase} Ativos` : 'Base Vazia'}
          </span>
        </div>
        <div className="text-[9px] font-bold text-blue-600 uppercase tracking-widest bg-blue-50 px-2 py-1 rounded-lg border border-blue-100 shadow-sm">v24.50 PRO</div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-6 space-y-3 no-scrollbar">
        <button
          disabled={!hasData}
          onClick={() => onNavigate(AppScreen.COMPANY_SELECTION)}
          className="w-full flex items-center p-5 bg-white border border-slate-200 rounded-2xl active:scale-[0.99] disabled:opacity-40 transition-all shadow-sm group hover:border-blue-200"
        >
          <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center mr-4 group-hover:bg-blue-100 transition-colors">
            <ClipboardList size={24} />
          </div>
          <div className="flex-1 text-left">
            <h3 className="text-[16px] font-bold text-slate-900 uppercase tracking-tight">Inventário</h3>
            <p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest mt-0.5">Conferência Física</p>
          </div>
          <ChevronRight size={20} className="text-slate-300 group-hover:text-blue-400 transition-colors" />
        </button>

        <button
          disabled={!hasData}
          onClick={() => onNavigate(AppScreen.LABELING)}
          className="w-full flex items-center p-5 bg-amber-50 border border-amber-100 rounded-2xl active:scale-[0.99] disabled:opacity-40 transition-all shadow-sm group hover:border-amber-200"
        >
          <div className="w-12 h-12 bg-amber-500 text-white rounded-xl flex items-center justify-center mr-4 shadow-md">
            <Tag size={24} />
          </div>
          <div className="flex-1 text-left">
            <h3 className="text-[16px] font-bold text-amber-700 uppercase tracking-tight">ETIQUETAR</h3>
            <p className="text-[10px] text-amber-600 font-bold uppercase tracking-widest mt-0.5 italic">Itens sem plaqueta</p>
          </div>
          <ChevronRight size={20} className="text-amber-300 group-hover:text-amber-500 transition-colors" />
        </button>

        <button
          disabled={!hasData}
          onClick={() => onNavigate(AppScreen.CONSULTATION)}
          className="w-full flex items-center p-4 bg-white border border-slate-200 rounded-2xl active:scale-[0.99] disabled:opacity-40 transition-all shadow-sm group hover:border-emerald-200"
        >
          <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center mr-4 group-hover:bg-emerald-100 transition-colors">
            <Search size={20} />
          </div>
          <div className="flex-1 text-left">
            <h3 className="text-[14px] font-bold text-slate-900 uppercase tracking-tight">Consulta</h3>
            <p className="text-[9px] text-slate-400 uppercase font-bold tracking-widest mt-0.5">Busca de Ativo</p>
          </div>
          <ChevronRight size={16} className="text-slate-300 group-hover:text-emerald-400 transition-colors" />
        </button>

        <button
          disabled={!hasData}
          onClick={() => onNavigate(AppScreen.DASHBOARD)}
          className="w-full flex items-center p-4 bg-white border border-slate-200 rounded-2xl active:scale-[0.99] disabled:opacity-40 transition-all shadow-sm group hover:border-cyan-200"
        >
          <div className="w-10 h-10 bg-cyan-50 text-cyan-600 rounded-xl flex items-center justify-center mr-4 group-hover:bg-cyan-100 transition-colors">
            <BarChart3 size={20} />
          </div>
          <div className="flex-1 text-left">
            <h3 className="text-[14px] font-bold text-slate-900 uppercase tracking-tight">Painel</h3>
            <p className="text-[9px] text-slate-400 uppercase font-bold tracking-widest mt-0.5">Progresso Unitário</p>
          </div>
          <ChevronRight size={16} className="text-slate-300 group-hover:text-cyan-400 transition-colors" />
        </button>
      </div>

      <div className="p-6 bg-white border-t border-slate-200 flex items-center justify-between shadow-sm">
        <button onClick={onLogout} className="flex items-center text-slate-400 hover:text-red-500 transition-colors font-bold uppercase text-[9px] tracking-widest">
          <LogOut size={16} className="mr-2" />
          <span>Sair</span>
        </button>
        <span className="text-[8px] font-bold text-slate-300 uppercase tracking-[0.2em]">GBR Intelligent Systems</span>
      </div>

      {isAdminMenuOpen && (
        <div className="fixed inset-0 z-[300] bg-white/95 backdrop-blur-md flex flex-col items-center justify-center p-8 animate-fadeIn">
          <button onClick={() => setIsAdminMenuOpen(false)} className="absolute top-12 right-8 p-4 bg-slate-50 border border-slate-200 rounded-2xl text-slate-400 active:scale-90 shadow-sm">
            <X size={28} />
          </button>
          <div className="w-full max-w-sm space-y-4">
            <div className="text-center mb-10">
              <div className="w-20 h-20 bg-sky-50 text-sky-600 rounded-[2rem] flex items-center justify-center mx-auto mb-6 border border-sky-100 shadow-xl">
                <ShieldCheck size={40} />
              </div>
              <h2 className="text-2xl font-bold text-slate-900 uppercase tracking-tight">Painel Administrativo</h2>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.3em] mt-2">Protocolo de Segurança GBR</p>
            </div>
            
            <div className="space-y-3 max-h-[60vh] overflow-y-auto no-scrollbar pr-1">
              <button onClick={() => { setIsAdminMenuOpen(false); onNavigate(AppScreen.USER_MANAGEMENT); }} className="w-full flex items-center p-5 bg-white border border-slate-200 rounded-3xl active:scale-[0.98] transition-all text-left shadow-sm">
                <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center mr-5 border border-blue-100"><Users size={20} /></div>
                <div className="flex-1">
                  <h4 className="text-sm font-bold text-slate-900 uppercase tracking-tight">Acessos</h4>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">Gerir Usuários</p>
                </div>
              </button>

              <button onClick={() => { setIsAdminMenuOpen(false); onNavigate(AppScreen.FIELD_CONFIGURATOR); }} className="w-full flex items-center p-5 bg-white border border-slate-200 rounded-3xl active:scale-[0.98] transition-all text-left shadow-sm">
                <div className="w-10 h-10 bg-cyan-50 text-cyan-600 rounded-xl flex items-center justify-center mr-5 border border-cyan-100"><SlidersHorizontal size={20} /></div>
                <div className="flex-1">
                  <h4 className="text-sm font-bold text-slate-900 uppercase tracking-tight">Configurar Campos</h4>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">Controle de Edição</p>
                </div>
              </button>

              <button onClick={() => { setIsAdminMenuOpen(false); onNavigate(AppScreen.QR_CODE_CONFIGURATOR); }} className="w-full flex items-center p-5 bg-white border border-slate-200 rounded-3xl active:scale-[0.98] transition-all text-left shadow-sm">
                <div className="w-10 h-10 bg-purple-50 text-purple-600 rounded-xl flex items-center justify-center mr-5 border border-purple-100"><QrCode size={20} /></div>
                <div className="flex-1">
                  <h4 className="text-sm font-bold text-slate-900 uppercase tracking-tight">Configurar QR Code</h4>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">Definir campos do QR</p>
                </div>
              </button>

              <button
                onClick={onToggleFullscreen}
                className={`w-full flex items-center p-5 border rounded-3xl active:scale-[0.98] transition-all text-left shadow-sm ${isFullscreen ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-900'}`}
              >
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center mr-5 transition-colors ${isFullscreen ? 'bg-white/10 text-white' : 'bg-slate-50 text-slate-600'}`}>
                  <ScanLine size={20} />
                </div>
                <div className="flex-1">
                  <h4 className={`text-sm font-bold uppercase tracking-tight ${isFullscreen ? 'text-white' : 'text-slate-900'}`}>Modo Imersivo</h4>
                  <p className={`text-[9px] font-bold uppercase tracking-widest mt-1 ${isFullscreen ? 'text-white/50' : 'text-slate-400'}`}>{isFullscreen ? 'Ativado' : 'Desativado'}</p>
                </div>
                <div className={`w-10 h-6 rounded-full relative transition-colors ${isFullscreen ? 'bg-emerald-500' : 'bg-slate-200'}`}>
                  <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${isFullscreen ? 'right-1' : 'left-1'}`} />
                </div>
              </button>

              <div className="w-full p-5 bg-slate-50 border border-slate-200 rounded-3xl shadow-sm">
                <div className="flex items-center mb-4">
                  <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center mr-5 border border-blue-100"><ScanLine size={20} /></div>
                  <div className="flex-1">
                    <h4 className="text-sm font-bold text-slate-900 uppercase tracking-tight">Modo do Scanner</h4>
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">Otimização de Leitura</p>
                  </div>
                </div>
                <div className="flex p-1 bg-white border border-slate-200 rounded-2xl">
                  <button 
                    onClick={() => onUpdateScannerMode(ScannerMode.BARCODE)}
                    className={`flex-1 py-3 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all ${scannerMode === ScannerMode.BARCODE ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400'}`}
                  >
                    Código de Barras
                  </button>
                  <button 
                    onClick={() => onUpdateScannerMode(ScannerMode.QRCODE)}
                    className={`flex-1 py-3 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all ${scannerMode === ScannerMode.QRCODE ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400'}`}
                  >
                    QR Code
                  </button>
                </div>
              </div>

              <div className="w-full p-5 bg-slate-50 border border-slate-200 rounded-3xl shadow-sm">
                <div className="flex items-center mb-4">
                  <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center mr-5 border border-emerald-100"><ShieldCheck size={20} /></div>
                  <div className="flex-1">
                    <h4 className="text-sm font-bold text-slate-900 uppercase tracking-tight">Auto-Conferência</h4>
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">Registro Automático no Scan</p>
                  </div>
                </div>
                <div className="flex p-1 bg-white border border-slate-200 rounded-2xl">
                  <button 
                    onClick={() => onUpdateAutoConfirm(true)}
                    className={`flex-1 py-3 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all ${autoConfirmOnScan ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-400'}`}
                  >
                    SIM
                  </button>
                  <button 
                    onClick={() => onUpdateAutoConfirm(false)}
                    className={`flex-1 py-3 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all ${!autoConfirmOnScan ? 'bg-slate-400 text-white shadow-md' : 'text-slate-400'}`}
                  >
                    NÃO
                  </button>
                </div>
              </div>
              

              <div className="w-full p-5 bg-slate-50 border border-slate-200 rounded-3xl shadow-sm">
                <div className="flex items-center mb-4">
                  <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center mr-5 border border-indigo-100"><Vibrate size={20} /></div>
                  <div className="flex-1">
                    <h4 className="text-sm font-bold text-slate-900 uppercase tracking-tight">Feedback do Scanner</h4>
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">Confirmação de Leitura</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 p-1 bg-white border border-slate-200 rounded-2xl mb-3">
                  <button 
                    onClick={() => onUpdateScanFeedbackMode(ScanFeedbackMode.VIBRATE)}
                    className={`py-3 rounded-xl text-[9px] font-bold uppercase tracking-widest transition-all flex flex-col items-center justify-center space-y-1 ${scanFeedbackMode === ScanFeedbackMode.VIBRATE ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400'}`}
                  >
                    <Vibrate size={14} />
                    <span>Vibrar</span>
                  </button>
                  <button 
                    onClick={() => onUpdateScanFeedbackMode(ScanFeedbackMode.SOUND)}
                    className={`py-3 rounded-xl text-[9px] font-bold uppercase tracking-widest transition-all flex flex-col items-center justify-center space-y-1 ${scanFeedbackMode === ScanFeedbackMode.SOUND ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400'}`}
                  >
                    <Volume2 size={14} />
                    <span>Som (Bip)</span>
                  </button>
                  <button 
                    onClick={() => onUpdateScanFeedbackMode(ScanFeedbackMode.BOTH)}
                    className={`py-3 rounded-xl text-[9px] font-bold uppercase tracking-widest transition-all flex flex-col items-center justify-center space-y-1 ${scanFeedbackMode === ScanFeedbackMode.BOTH ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400'}`}
                  >
                    <div className="flex space-x-1">
                      <Vibrate size={12} />
                      <Volume2 size={12} />
                    </div>
                    <span>Ambos</span>
                  </button>
                  <button 
                    onClick={() => onUpdateScanFeedbackMode(ScanFeedbackMode.NONE)}
                    className={`py-3 rounded-xl text-[9px] font-bold uppercase tracking-widest transition-all flex flex-col items-center justify-center space-y-1 ${scanFeedbackMode === ScanFeedbackMode.NONE ? 'bg-slate-400 text-white shadow-md' : 'text-slate-400'}`}
                  >
                    <X size={14} />
                    <span>Nenhum</span>
                  </button>
                </div>
                
                <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 flex items-start space-x-3">
                  <Battery size={16} className="text-amber-500 shrink-0 mt-0.5" />
                  <p className="text-[8px] font-bold text-amber-700 uppercase leading-relaxed tracking-wide">
                    Dica: O uso de <span className="text-amber-900">SOM</span> consome menos bateria que o <span className="text-amber-900">VIBRAR</span>, podendo aumentar a autonomia do dispositivo.
                  </p>
                </div>
              </div>

              <button 
                onClick={() => setIsDataMenuOpen(true)} 
                className="w-full flex items-center p-5 bg-orange-50 border border-orange-100 rounded-3xl active:scale-[0.98] transition-all text-left shadow-sm"
              >
                <div className="w-10 h-10 bg-orange-500 text-white rounded-xl flex items-center justify-center mr-5 shadow-md">
                  <ShieldCheck size={20} />
                </div>
                <div className="flex-1">
                  <h4 className="text-sm font-bold text-orange-700 uppercase tracking-tight">Segurança de Dados</h4>
                  <p className="text-[9px] font-bold text-orange-400 uppercase tracking-widest mt-1">Carga, Exportação e Limpeza</p>
                </div>
                <ChevronRight size={16} className="text-orange-300" />
              </button>
            </div>
            <div className="pt-8 text-center text-[9px] font-bold text-slate-300 uppercase tracking-[0.4em]">GBR Security Protocol</div>
          </div>
        </div>
      )}

      {isDataMenuOpen && (
        <div className="fixed inset-0 z-[400] bg-slate-950/95 backdrop-blur-xl flex flex-col items-center justify-center p-8 animate-fadeIn">
          <button onClick={() => setIsDataMenuOpen(false)} className="absolute top-12 left-8 flex items-center text-white/60 font-bold uppercase text-[10px] tracking-widest active:scale-90">
            <ChevronRight size={20} className="rotate-180 mr-2" />
            Voltar
          </button>
          
          <div className="w-full max-w-sm space-y-6">
            <div className="text-center mb-10">
              <div className="w-20 h-20 bg-orange-500 text-white rounded-[2rem] flex items-center justify-center mx-auto mb-6 border border-orange-400 shadow-2xl shadow-orange-500/20">
                <ShieldCheck size={40} />
              </div>
              <h2 className="text-2xl font-bold text-white uppercase tracking-tight">Gestão de Dados</h2>
              <p className="text-[10px] font-bold text-orange-400 uppercase tracking-[0.3em] mt-2">Operações Sensíveis</p>
            </div>

            <div className="space-y-4">
              <button disabled={!hasData} onClick={() => { setIsDataMenuOpen(false); setIsAdminMenuOpen(false); onExport(); }} className="w-full flex items-center p-6 bg-white/5 border border-white/10 rounded-3xl active:scale-[0.98] disabled:opacity-30 transition-all text-left">
                <div className="w-12 h-12 bg-emerald-500/20 text-emerald-400 rounded-xl flex items-center justify-center mr-5 border border-emerald-500/30"><Download size={24} /></div>
                <div className="flex-1">
                  <h4 className="text-sm font-bold text-white uppercase tracking-tight">Baixar base de dados</h4>
                  <p className="text-[9px] font-bold text-white/40 uppercase tracking-widest mt-1">Exportar XLS</p>
                </div>
              </button>

              <button onClick={() => { 
                setIsDataMenuOpen(false); 
                setIsAdminMenuOpen(false);
                onNavigate(AppScreen.LOAD_DATABASE); 
              }} className="w-full flex items-center p-6 bg-sky-600 text-white rounded-3xl active:scale-[0.98] transition-all text-left shadow-xl shadow-sky-600/20">
                <div className="w-12 h-12 bg-white/20 text-white rounded-xl flex items-center justify-center mr-5"><DatabaseZap size={24} /></div>
                <div className="flex-1">
                  <h4 className="text-sm font-bold uppercase tracking-tight">Carga Expert</h4>
                  <p className="text-[9px] font-bold text-sky-100 uppercase tracking-widest mt-1">Importar Base Master</p>
                </div>
              </button>

              <button onClick={() => { 
                if (confirm("ATENÇÃO: Esta ação irá APAGAR PERMANENTEMENTE todos os ativos e o progresso do inventário. Deseja continuar?")) {
                  setIsDataMenuOpen(false); 
                  setIsAdminMenuOpen(false);
                  onClearDatabase(); 
                }
              }} className="w-full flex items-center p-6 bg-red-500/10 border border-red-500/20 rounded-3xl active:scale-[0.98] transition-all text-left">
                <div className="w-12 h-12 bg-red-500 text-white rounded-xl flex items-center justify-center mr-5 shadow-lg shadow-red-500/20"><Trash2 size={24} /></div>
                <div className="flex-1">
                  <h4 className="text-sm font-bold text-red-500 uppercase tracking-tight">Limpar Banco de Dados</h4>
                  <p className="text-[9px] font-bold text-red-400/60 uppercase tracking-widest mt-1">Apagar Ativos do App</p>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MainMenu;
