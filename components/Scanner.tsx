
import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { X, Zap, Loader2, CameraOff } from 'lucide-react';

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
    const timer = setTimeout(() => {
      startScanner();
    }, 500);

    const startScanner = async () => {
      try {
        setInitializing(true);
        setError(null);

        if (scannerRef.current) {
          try { await scannerRef.current.stop(); } catch {
            // Do nothing
          }
        }

        const html5QrCode = new Html5Qrcode(scannerId);
        scannerRef.current = html5QrCode;

        // OTIMIZAÇÃO DE BATERIA: FPS reduzido para 15 (suficiente para códigos estáticos)
        const config = {
          fps: 15, 
          qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
            const width = Math.floor(viewfinderWidth * 0.85);
            const height = Math.floor(viewfinderHeight * 0.3);
            return { width, height };
          },
          aspectRatio: 1.0,
          disableFlip: true,
          formatsToSupport: [ 
            Html5QrcodeSupportedFormats.CODE_128, 
            Html5QrcodeSupportedFormats.QR_CODE,
            Html5QrcodeSupportedFormats.CODE_39
          ]
        };

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
          () => {
            // Do nothing
          } 
        );
        
        setInitializing(false);
      } catch {
        setError("Erro ao acessar câmera. Verifique permissões.");
        setInitializing(false);
      }
    };

    return () => {
      clearTimeout(timer);
      if (scannerRef.current && scannerRef.current.isScanning) {
        scannerRef.current.stop().catch(() => {
            // Do nothing
          });
      }
    };
  }, [onScanSuccess]);

  return (
    <div className="fixed inset-0 z-[100] bg-black flex flex-col overflow-hidden animate-fadeIn">
      <div className="flex-1 relative bg-black flex items-center justify-center">
        <div id={scannerId} className="w-full h-full bg-black"></div>
        
        {initializing && (
          <div className="absolute inset-0 bg-black flex flex-col items-center justify-center z-50">
            <Loader2 className="text-indigo-500 animate-spin" size={40} />
            <p className="text-white font-bold text-[10px] uppercase tracking-widest mt-4">Iniciando Lente</p>
          </div>
        )}

        {!initializing && !error && (
          <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center">
             <div className="w-[85%] h-[30%] border border-indigo-500/50 rounded-2xl relative shadow-[0_0_0_2000px_rgba(0,0,0,0.8)]">
                <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-white rounded-tl-xl"></div>
                <div className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-white rounded-tr-xl"></div>
                <div className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-white rounded-bl-xl"></div>
                <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-white rounded-br-xl"></div>
                <div className="absolute left-2 right-2 h-[1px] bg-red-500/50 shadow-[0_0_10px_red] top-1/2"></div>
             </div>
          </div>
        )}

        <div className="absolute top-0 left-0 right-0 p-6 flex justify-between items-center z-[60]">
          <button onClick={onBack} className="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center text-white"><X size={24} /></button>
          <div className="flex flex-col items-center">
            <span className="text-white font-bold text-[10px] uppercase tracking-widest">Scanner Ativo</span>
            <span className="text-indigo-400 font-bold text-[8px] uppercase tracking-widest">Otimizado para Bateria</span>
          </div>
          <div className="w-12 h-12 bg-white/5 rounded-xl flex items-center justify-center text-slate-400"><Zap size={20} /></div>
        </div>
      </div>

      {error && (
        <div className="absolute inset-0 z-[110] bg-slate-950 flex flex-col items-center justify-center p-10 text-center">
           <CameraOff size={48} className="text-red-500 mb-6" />
           <p className="text-gray-300 text-sm font-bold uppercase mb-8">{error}</p>
           <button onClick={onBack} className="px-8 py-4 bg-indigo-600 text-white rounded-xl font-bold uppercase text-xs">Voltar</button>
        </div>
      )}
    </div>
  );
};

export default Scanner;
