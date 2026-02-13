
import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { X, Camera, Zap, RefreshCw, AlertCircle, ScanText, Loader2, Sparkles, ShieldAlert, CameraOff } from 'lucide-react';

interface ScannerProps {
  onBack: () => void;
  onScanSuccess: (decodedText: string) => void;
}

const Scanner: React.FC<ScannerProps> = ({ onBack, onScanSuccess }) => {
  const [error, setError] = useState<string | null>(null);
  const [initializing, setInitializing] = useState(true);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const scannerId = "qr-reader-container";

  useEffect(() => {
    // Iniciamos com um pequeno delay para garantir que o DOM está pronto e evitar conflitos de renderização
    const timer = setTimeout(() => {
      startScanner();
    }, 600);

    const startScanner = async () => {
      try {
        setInitializing(true);
        setError(null);

        // Limpeza de instâncias órfãs
        if (scannerRef.current) {
          try { await scannerRef.current.stop(); } catch (e) {}
        }

        const html5QrCode = new Html5Qrcode(scannerId);
        scannerRef.current = html5QrCode;

        // Configuração Master para etiquetas de ativos (Código 128 / QR)
        const config = {
          fps: 25, // Máxima fluidez para não perder frames de foco
          qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
            // Fenda horizontal: Ideal para Código 128 (barras)
            const width = Math.floor(viewfinderWidth * 0.9);
            const height = Math.floor(viewfinderHeight * 0.35);
            return { width, height };
          },
          aspectRatio: 1.0,
          disableFlip: true, // Evita distorção de espelhamento que prejudica leitura de barras
          formatsToSupport: [ 
            Html5QrcodeSupportedFormats.CODE_128, 
            Html5QrcodeSupportedFormats.QR_CODE,
            Html5QrcodeSupportedFormats.CODE_39,
            Html5QrcodeSupportedFormats.EAN_13
          ]
        };

        // Solicitação de câmera com resolução flexível mas tendendo ao alto
        await html5QrCode.start(
          { facingMode: "environment" },
          config,
          (decodedText) => {
            if (html5QrCode.isScanning) {
              html5QrCode.stop().then(() => {
                onScanSuccess(decodedText);
              }).catch(() => onScanSuccess(decodedText));
            }
          },
          () => {} // Frame não identificado (comum durante busca de foco)
        );
        
        setInitializing(false);
      } catch (err: any) {
        console.error("Scanner Error:", err);
        let msg = "Falha ao abrir a câmera.";
        
        // Identificação precisa do erro para orientar o usuário
        const errorStr = err.toString().toLowerCase();
        if (errorStr.includes('notallowederror') || errorStr.includes('permission denied')) {
          msg = "Câmera Bloqueada: Clique no cadeado na barra de endereços do seu navegador e habilite a Permissão de Câmera.";
        } else if (errorStr.includes('notfounderror')) {
          msg = "Nenhuma câmera traseira detectada neste dispositivo.";
        } else if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') {
          msg = "Conexão Insegura (HTTP): O navegador bloqueia a câmera. Use uma conexão HTTPS para funcionar no celular.";
        } else {
          msg = "Erro de inicialização: Certifique-se de que nenhuma outra aba está usando a câmera e tente recarregar.";
        }
        
        setError(msg);
        setInitializing(false);
      }
    };

    return () => {
      clearTimeout(timer);
      if (scannerRef.current && scannerRef.current.isScanning) {
        scannerRef.current.stop().catch(e => console.log("Cleanup silent fail"));
      }
    };
  }, [onScanSuccess]);

  return (
    <div className="fixed inset-0 z-[100] bg-black flex flex-col overflow-hidden animate-fadeIn">
      <div className="flex-1 relative bg-black flex items-center justify-center">
        
        {/* Container do Vídeo - Ocupa a tela toda para melhor imersão */}
        <div id={scannerId} className="w-full h-full bg-black flex items-center justify-center"></div>
        
        {/* Camada de Carregamento */}
        {initializing && (
          <div className="absolute inset-0 bg-black flex flex-col items-center justify-center z-50">
            <div className="relative">
              <Loader2 className="text-blue-500 animate-spin" size={60} />
              <Camera className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-white/50" size={20} />
            </div>
            <p className="text-white font-black text-[10px] uppercase tracking-[0.4em] mt-8 animate-pulse">Iniciando Lente GBR</p>
          </div>
        )}

        {/* HUD Visual (Mira) */}
        {!initializing && !error && (
          <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center">
             <div className="w-[90%] h-[35%] border-2 border-blue-500/30 rounded-[2.5rem] relative overflow-hidden shadow-[0_0_0_2000px_rgba(0,0,0,0.7)]">
                {/* Cantoneiras de Foco */}
                <div className="absolute top-0 left-0 w-12 h-12 border-t-4 border-l-4 border-white rounded-tl-[2rem]"></div>
                <div className="absolute top-0 right-0 w-12 h-12 border-t-4 border-r-4 border-white rounded-tr-[2rem]"></div>
                <div className="absolute bottom-0 left-0 w-12 h-12 border-b-4 border-l-4 border-white rounded-bl-[2rem]"></div>
                <div className="absolute bottom-0 right-0 w-12 h-12 border-b-4 border-r-4 border-white rounded-br-[2rem]"></div>
                
                {/* Linha de Scanner Laser */}
                <div className="absolute left-4 right-4 h-[1.5px] bg-red-500 shadow-[0_0_20px_rgba(239,68,68,1)] scan-beam opacity-90"></div>
                
                {/* Overlay de Textura de Scanner */}
                <div className="absolute inset-0 bg-gradient-to-b from-blue-500/5 via-transparent to-blue-500/5"></div>
             </div>
             
             <div className="mt-10 px-6 py-2 bg-black/40 backdrop-blur-md rounded-full border border-white/10">
                <p className="text-[9px] font-black text-white uppercase tracking-[0.3em]">Mantenha o código centralizado</p>
             </div>
          </div>
        )}

        {/* Controles do Topo */}
        <div className="absolute top-0 left-0 right-0 p-8 flex justify-between items-center z-[60] bg-gradient-to-b from-black/90 to-transparent">
          <button 
            onClick={onBack} 
            className="w-14 h-14 bg-white/10 backdrop-blur-2xl rounded-2xl flex items-center justify-center text-white border border-white/10 shadow-2xl active:scale-90 transition-all"
          >
            <X size={28} />
          </button>
          
          <div className="flex flex-col items-center">
            <span className="text-white font-black text-[11px] uppercase tracking-[0.4em] drop-shadow-2xl">GBR Vision Pro</span>
            <div className="flex items-center space-x-2 mt-1">
               <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></div>
               <span className="text-blue-400 font-bold text-[8px] uppercase tracking-widest">Ativo em 1080p</span>
            </div>
          </div>
          
          <div className="w-14 h-14 bg-blue-600/20 rounded-2xl border border-blue-500/30 flex items-center justify-center text-blue-400">
             <Zap size={24} />
          </div>
        </div>
      </div>

      {/* Tela de Erro e Instrução */}
      {error && (
        <div className="absolute inset-0 z-[110] bg-slate-950 flex flex-col items-center justify-center p-10 text-center animate-fadeIn">
           <div className="w-24 h-24 bg-red-500/10 rounded-[2.5rem] flex items-center justify-center text-red-500 mb-8 border border-red-500/20 shadow-2xl">
              <CameraOff size={48} />
           </div>
           
           <h3 className="text-2xl font-black text-white uppercase mb-4 tracking-tighter italic">Erro de Captura</h3>
           
           <div className="bg-red-500/5 border border-red-500/20 rounded-3xl p-6 mb-10 w-full">
              <p className="text-gray-300 text-[11px] font-bold leading-relaxed uppercase tracking-wider">
                {error}
              </p>
           </div>

           <div className="flex flex-col w-full space-y-4 max-w-xs">
              <button 
                onClick={() => window.location.reload()} 
                className="w-full bg-blue-600 py-5 rounded-2xl font-black uppercase text-white tracking-[0.2em] shadow-xl shadow-blue-600/20 active:scale-95 transition-all"
              >
                Tentar Novamente
              </button>
              
              <button 
                onClick={onBack} 
                className="w-full py-4 text-gray-500 font-black uppercase text-[10px] tracking-[0.3em] flex items-center justify-center"
              >
                Sair do Scanner
              </button>
           </div>
           
           <div className="mt-12 pt-8 border-t border-white/5 w-full">
              <p className="text-[8px] font-black text-gray-600 uppercase tracking-[0.5em]">Tecnologia GBR Inventários</p>
           </div>
        </div>
      )}
    </div>
  );
};

export default Scanner;
