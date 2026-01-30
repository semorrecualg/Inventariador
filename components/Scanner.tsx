
import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { X, Camera, Zap, RefreshCw, AlertCircle } from 'lucide-react';

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

        const config = {
          fps: 10,
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1.0
        };

        await html5QrCode.start(
          { facingMode: "environment" },
          config,
          (decodedText) => {
            html5QrCode.stop().then(() => {
              onScanSuccess(decodedText);
            });
          },
          (errorMessage) => {
            // Failure is frequent as it parses every frame, we ignore it
          }
        );
      } catch (err) {
        console.error("Scanner error:", err);
        setError("Não foi possível acessar a câmera. Verifique as permissões.");
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
    <div className="fixed inset-0 z-[60] bg-black flex flex-col overflow-hidden">
      {/* Viewfinder area */}
      <div className="flex-1 relative flex items-center justify-center">
        <div id={scannerId} className="w-full h-full object-cover"></div>
        
        {/* Viewfinder Overlay */}
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
           <div className="w-[250px] h-[250px] border-2 border-blue-500 rounded-3xl relative">
              {/* Corner brackets */}
              <div className="absolute -top-1 -left-1 w-8 h-8 border-t-4 border-l-4 border-white rounded-tl-xl"></div>
              <div className="absolute -top-1 -right-1 w-8 h-8 border-t-4 border-r-4 border-white rounded-tr-xl"></div>
              <div className="absolute -bottom-1 -left-1 w-8 h-8 border-b-4 border-l-4 border-white rounded-bl-xl"></div>
              <div className="absolute -bottom-1 -right-1 w-8 h-8 border-b-4 border-r-4 border-white rounded-br-xl"></div>
              
              {/* Scanning Beam */}
              <div className="absolute left-2 right-2 h-0.5 bg-blue-400 shadow-[0_0_15px_rgba(96,165,250,0.8)] scan-beam"></div>
           </div>
        </div>

        {/* Header Controls */}
        <div className="absolute top-0 left-0 right-0 p-6 flex justify-between items-center bg-gradient-to-b from-black/70 to-transparent">
          <button 
            onClick={onBack}
            className="w-10 h-10 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center text-white"
          >
            <X size={24} />
          </button>
          <div className="text-white font-bold tracking-wider text-sm">ESCANEAR ATIVO</div>
          <button className="w-10 h-10 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center text-white">
            <Zap size={20} />
          </button>
        </div>

        {/* Bottom Text */}
        <div className="absolute bottom-10 left-0 right-0 text-center px-10">
          <div className="bg-white/10 backdrop-blur-md rounded-2xl py-4 px-6 inline-block">
             <p className="text-white text-sm font-medium">Aponte para o código de barras ou QR Code</p>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-8 bg-gray-900 text-white flex flex-col items-center justify-center text-center">
           <AlertCircle size={48} className="text-red-500 mb-4" />
           <p className="font-bold mb-4">{error}</p>
           <button 
             onClick={() => window.location.reload()}
             className="flex items-center space-x-2 bg-blue-600 px-6 py-3 rounded-xl font-bold"
           >
             <RefreshCw size={20} />
             <span>Tentar Novamente</span>
           </button>
           <button 
             onClick={onBack}
             className="mt-4 text-gray-400 font-medium"
           >
             Voltar ao Menu
           </button>
        </div>
      )}
    </div>
  );
};

export default Scanner;
