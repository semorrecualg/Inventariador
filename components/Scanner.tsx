
import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { X, Camera, Zap, RefreshCw, AlertCircle, ScanText } from 'lucide-react';

interface ScannerProps {
  onBack: () => void;
  onScanSuccess: (decodedText: string) => void;
}

const Scanner: React.FC<ScannerProps> = ({ onBack, onScanSuccess }) => {
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const scannerId = "qr-reader";

  useEffect(() => {
    const startScanner = async () => {
      try {
        setScanning(true);
        const html5QrCode = new Html5Qrcode(scannerId);
        scannerRef.current = html5QrCode;

        // Configuração otimizada para Código 128 (ativos) e QR Codes
        const config = {
          fps: 15,
          qrbox: { width: 280, height: 180 }, // Formato retangular para melhor leitura de códigos de barra
          aspectRatio: 1.0,
          formatsToSupport: [ 
            Html5QrcodeSupportedFormats.CODE_128, 
            Html5QrcodeSupportedFormats.QR_CODE,
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.CODE_39
          ]
        };

        await html5QrCode.start(
          { facingMode: "environment" },
          config,
          (decodedText) => {
            // Sucesso na leitura
            html5QrCode.stop().then(() => {
              onScanSuccess(decodedText);
            }).catch(() => {
              onScanSuccess(decodedText);
            });
          },
          () => {} // Ignorar falhas de frame
        );
      } catch (err) {
        console.error("Scanner error:", err);
        setError("Câmera bloqueada ou não encontrada. Verifique as permissões do navegador.");
        setScanning(false);
      }
    };

    startScanner();

    return () => {
      if (scannerRef.current && scannerRef.current.isScanning) {
        scannerRef.current.stop().catch(err => console.error("Cleanup error", err));
      }
    };
  }, [onScanSuccess]);

  return (
    <div className="fixed inset-0 z-[100] bg-black flex flex-col overflow-hidden animate-fadeIn">
      <div className="flex-1 relative flex items-center justify-center">
        <div id={scannerId} className="w-full h-full object-cover"></div>
        
        {/* Camada de Mira (Overlay) */}
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center bg-black/40">
           <div className="w-[300px] h-[200px] border-2 border-blue-500/50 rounded-3xl relative overflow-hidden shadow-[0_0_0_1000px_rgba(0,0,0,0.5)]">
              {/* Cantoneiras Brancas de Alta Visibilidade */}
              <div className="absolute top-0 left-0 w-10 h-10 border-t-4 border-l-4 border-white rounded-tl-2xl"></div>
              <div className="absolute top-0 right-0 w-10 h-10 border-t-4 border-r-4 border-white rounded-tr-2xl"></div>
              <div className="absolute bottom-0 left-0 w-10 h-10 border-b-4 border-l-4 border-white rounded-bl-2xl"></div>
              <div className="absolute bottom-0 right-0 w-10 h-10 border-b-4 border-r-4 border-white rounded-br-2xl"></div>
              
              {/* Linha de Scanner Animada */}
              <div className="absolute left-4 right-4 h-1 bg-red-500 shadow-[0_0_15px_rgba(239,68,68,0.8)] scan-beam opacity-80"></div>
              
              {/* Indicador de Tipo de Código */}
              <div className="absolute inset-0 flex items-center justify-center opacity-20">
                 <ScanText size={60} className="text-white" />
              </div>
           </div>
        </div>

        {/* Controles Superiores */}
        <div className="absolute top-0 left-0 right-0 p-8 flex justify-between items-center bg-gradient-to-b from-black/80 via-black/40 to-transparent">
          <button 
            onClick={onBack}
            className="w-12 h-12 bg-white/10 backdrop-blur-xl rounded-2xl flex items-center justify-center text-white active:scale-90 transition-all border border-white/10"
          >
            <X size={24} />
          </button>
          <div className="flex flex-col items-center">
            <span className="text-white font-black text-[10px] uppercase tracking-[0.3em]">GBR Intelligence</span>
            <span className="text-blue-400 font-black text-[8px] uppercase tracking-widest mt-1">Scanner de Ativos</span>
          </div>
          <div className="w-12 h-12"></div> {/* Spacer */}
        </div>

        {/* Instruções Inferiores */}
        <div className="absolute bottom-12 left-0 right-0 text-center px-10">
          <div className="bg-black/60 backdrop-blur-xl border border-white/10 rounded-[2rem] py-5 px-8 inline-block shadow-2xl">
             <div className="flex items-center space-x-3 text-white">
                <div className="p-2 bg-blue-600 rounded-xl">
                   <Zap size={18} fill="currentColor" />
                </div>
                <div className="text-left">
                   <p className="text-[11px] font-black uppercase leading-none tracking-tight">Leitura Automática</p>
                   <p className="text-[9px] font-bold text-gray-400 uppercase mt-1">Aproxime da etiqueta (6 dígitos)</p>
                </div>
             </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="absolute inset-0 z-[110] bg-gray-950 text-white flex flex-col items-center justify-center p-10 text-center">
           <div className="w-20 h-20 bg-red-500/10 rounded-3xl flex items-center justify-center text-red-500 mb-6">
              <AlertCircle size={40} />
           </div>
           <h3 className="text-xl font-black uppercase mb-2">Erro de Acesso</h3>
           <p className="text-gray-400 text-sm font-medium mb-8 leading-relaxed">{error}</p>
           <div className="flex flex-col w-full space-y-3">
              <button 
                onClick={() => window.location.reload()}
                className="w-full bg-blue-600 py-5 rounded-2xl font-black uppercase tracking-widest shadow-xl shadow-blue-500/20 active:scale-95 transition-all"
              >
                Recarregar Câmera
              </button>
              <button 
                onClick={onBack}
                className="w-full py-4 text-gray-400 font-black uppercase text-[10px] tracking-widest"
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
