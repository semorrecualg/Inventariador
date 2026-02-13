
import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { X, Camera, Zap, RefreshCw, AlertCircle, ScanText, Loader2 } from 'lucide-react';

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
    // Pequeno delay para garantir que o elemento DOM com ID scannerId foi renderizado
    const timer = setTimeout(() => {
      startScanner();
    }, 500);

    const startScanner = async () => {
      try {
        setInitializing(true);
        const html5QrCode = new Html5Qrcode(scannerId);
        scannerRef.current = html5QrCode;

        // Configuração ultra-otimizada para Código 128 e QR Code
        const config = {
          fps: 20, // Aumentado para 20 fps para maior fluidez
          qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
            // Garante um visor retangular ideal para códigos de barras horizontais
            const width = viewfinderWidth * 0.8;
            const height = viewfinderHeight * 0.4;
            return { width, height };
          },
          aspectRatio: 1.0,
          formatsToSupport: [ 
            Html5QrcodeSupportedFormats.CODE_128, 
            Html5QrcodeSupportedFormats.QR_CODE,
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.CODE_39
          ]
        };

        // Solicita especificamente a câmera traseira com foco em qualidade
        await html5QrCode.start(
          { facingMode: "environment" },
          config,
          (decodedText) => {
            // Ao detectar, para o scanner e retorna o valor
            if (html5QrCode.isScanning) {
              html5QrCode.stop().then(() => {
                onScanSuccess(decodedText);
              }).catch(() => {
                onScanSuccess(decodedText);
              });
            }
          },
          () => {} // Ignorar erros de frames não identificados
        );
        
        setInitializing(false);
      } catch (err: any) {
        console.error("Scanner startup error:", err);
        setError("Não foi possível acessar a câmera. Certifique-se de que deu permissão de uso no navegador.");
        setInitializing(false);
      }
    };

    return () => {
      clearTimeout(timer);
      if (scannerRef.current && scannerRef.current.isScanning) {
        scannerRef.current.stop().catch(err => console.error("Cleanup error", err));
      }
    };
  }, [onScanSuccess]);

  return (
    <div className="fixed inset-0 z-[100] bg-black flex flex-col overflow-hidden animate-fadeIn">
      <div className="flex-1 relative flex items-center justify-center bg-black">
        
        {/* Container onde o vídeo da câmera será injetado pelo library */}
        <div id={scannerId} className="w-full h-full min-h-[100vw]"></div>
        
        {/* Overlay de carregamento inicial */}
        {initializing && (
          <div className="absolute inset-0 bg-black flex flex-col items-center justify-center z-50">
            <Loader2 className="text-blue-500 animate-spin mb-4" size={48} />
            <p className="text-white font-black text-[10px] uppercase tracking-widest">Iniciando Lente...</p>
          </div>
        )}

        {/* Camada de Mira Visual (HUD) */}
        {!initializing && !error && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
             <div className="w-[85%] h-[30%] border-2 border-blue-500/30 rounded-3xl relative overflow-hidden shadow-[0_0_0_2000px_rgba(0,0,0,0.6)]">
                {/* Cantoneiras HUD */}
                <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-white rounded-tl-xl"></div>
                <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-white rounded-tr-xl"></div>
                <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-white rounded-bl-xl"></div>
                <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-white rounded-br-xl"></div>
                
                {/* Laser animado */}
                <div className="absolute left-2 right-2 h-0.5 bg-red-500 shadow-[0_0_10px_rgba(239,68,68,1)] scan-beam opacity-90"></div>
             </div>
          </div>
        )}

        {/* Header de Controle */}
        <div className="absolute top-0 left-0 right-0 p-8 flex justify-between items-center bg-gradient-to-b from-black/90 to-transparent z-[60]">
          <button 
            onClick={onBack}
            className="w-12 h-12 bg-white/20 backdrop-blur-xl rounded-2xl flex items-center justify-center text-white active:scale-90 transition-all border border-white/10 shadow-lg"
          >
            <X size={24} />
          </button>
          <div className="flex flex-col items-center">
            <span className="text-white font-black text-[10px] uppercase tracking-[0.4em] drop-shadow-lg">GBR Vision</span>
            <div className="flex items-center space-x-2 mt-1">
               <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></div>
               <span className="text-blue-400 font-black text-[8px] uppercase tracking-widest">Scanner Ativo</span>
            </div>
          </div>
          <div className="w-12 h-12"></div> 
        </div>

        {/* Dica de Uso */}
        {!initializing && !error && (
          <div className="absolute bottom-16 left-0 right-0 text-center px-10 z-[60]">
            <div className="bg-black/60 backdrop-blur-xl border border-white/10 rounded-3xl py-4 px-6 inline-flex items-center space-x-3 shadow-2xl">
                <ScanText size={20} className="text-blue-400" />
                <div className="text-left">
                   <p className="text-[10px] font-black text-white uppercase leading-none">Aponte para a Plaqueta</p>
                   <p className="text-[8px] font-bold text-gray-400 uppercase mt-1">Cód. 128 ou QR Code</p>
                </div>
            </div>
          </div>
        )}
      </div>

      {/* Tratamento de Erro Crítico (Ex: Câmera Negada) */}
      {error && (
        <div className="absolute inset-0 z-[110] bg-gray-950 text-white flex flex-col items-center justify-center p-12 text-center">
           <div className="w-24 h-24 bg-red-500/10 rounded-[2.5rem] flex items-center justify-center text-red-500 mb-8 border border-red-500/20 shadow-2xl">
              <AlertCircle size={48} />
           </div>
           <h3 className="text-2xl font-black uppercase mb-3 tracking-tighter">Acesso Negado</h3>
           <p className="text-gray-400 text-xs font-medium mb-10 leading-relaxed uppercase tracking-wider">{error}</p>
           <div className="flex flex-col w-full space-y-4">
              <button 
                onClick={() => window.location.reload()}
                className="w-full bg-blue-600 py-5 rounded-2xl font-black uppercase tracking-[0.2em] shadow-xl shadow-blue-500/30 active:scale-95 transition-all"
              >
                Tentar Novamente
              </button>
              <button 
                onClick={onBack}
                className="w-full py-4 text-gray-500 font-black uppercase text-[9px] tracking-[0.3em]"
              >
                Voltar ao Menu
              </button>
           </div>
        </div>
      )}
    </div>
  );
};

export default Scanner;
