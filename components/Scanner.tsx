
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { X, Zap, ZapOff, Maximize, Minimize, Camera, RefreshCw, ShieldCheck } from 'lucide-react';
import { ScannerMode } from '../types';

interface ScannerProps {
  mode: ScannerMode;
  onScan: (result: string) => void;
  onClose: () => void;
  onModeChange?: (mode: ScannerMode) => void;
  onManualInput?: () => void;
}

const Scanner: React.FC<ScannerProps> = ({ mode, onScan, onClose, onModeChange, onManualInput }) => {
  const isMounted = useRef(true);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [isTorchOn, setIsTorchOn] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [hasTorch, setHasTorch] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [isFlashing, setIsFlashing] = useState(false);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  const playBeep = () => {
    try {
      const AudioContextClass = window.AudioContext || (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) return;
      const audioCtx = new AudioContextClass();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(880, audioCtx.currentTime); // A5
      gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);

      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 0.1);
      
      if (navigator.vibrate) {
        navigator.vibrate(100);
      }
    } catch (e) {
      console.error('Audio feedback failed', e);
    }
  };

  const startScanner = useCallback(async () => {
    if (scannerRef.current) return;

    const formats = mode === ScannerMode.BARCODE 
      ? [
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E
        ]
      : [Html5QrcodeSupportedFormats.QR_CODE];

    // Simplificado o config para evitar problemas de renderização em alguns dispositivos
    const config = {
      fps: 15,
      qrbox: mode === ScannerMode.BARCODE 
        ? { width: 300, height: 120 } 
        : { width: 250, height: 250 },
      // Removido aspectRatio fixo para permitir que a câmera use sua resolução nativa
      formatsToSupport: formats,
    };

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("Seu navegador não suporta acesso à câmera ou você está em uma conexão não segura.");
      }

      // Pequeno delay para garantir que o elemento DOM esteja pronto
      await new Promise(resolve => setTimeout(resolve, 300));
      if (!isMounted.current) return;
      
      const html5QrCode = new Html5Qrcode("reader");
      scannerRef.current = html5QrCode;

      // Tenta obter as câmeras para escolher a traseira explicitamente se possível
      const cameras = await Html5Qrcode.getCameras().catch(() => []);
      if (!isMounted.current) return;

      let cameraIdOrConfig: string | { facingMode: string } = { facingMode: "environment" };
      
      if (cameras && cameras.length > 0) {
        // Tenta encontrar uma câmera que pareça ser a traseira (back)
        const backCamera = cameras.find(c => c.label.toLowerCase().includes('back') || c.label.toLowerCase().includes('traseira'));
        if (backCamera) {
          cameraIdOrConfig = backCamera.id;
        }
      }

      await html5QrCode.start(
        cameraIdOrConfig,
        config,
        (decodedText) => {
          if (isMounted.current) {
            playBeep();
            setIsFlashing(true);
            setShowSuccess(true);
            setTimeout(() => {
              if (isMounted.current) {
                setIsFlashing(false);
                setTimeout(() => setShowSuccess(false), 1000);
              }
            }, 150);
            onScan(decodedText);
          }
        },
        () => {
          // Ignore frequent noise errors
        }
      );

      if (!isMounted.current) {
        await html5QrCode.stop().catch(() => {});
        return;
      }

      // Check for torch and zoom capabilities safely
      try {
        // Pequeno delay para garantir que o track está estável
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const html5QrCodeAny = html5QrCode as any;
        const track = html5QrCodeAny.getRunningTrack();
        if (track) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const capabilities = track.getCapabilities() as any;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const settings = track.getSettings() as any;
          
          if (capabilities.torch) {
            setHasTorch(true);
            setIsTorchOn(settings.torch || false);
          } else {
            // Fallback para mobile
            const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
            if (isMobile) setHasTorch(true);
          }
        } else {
          const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
          if (isMobile) setHasTorch(true);
        }
      } catch (e) {
        console.warn("Could not check capabilities", e);
        const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
        if (isMobile) setHasTorch(true);
      }

    } catch (err) {
      if (isMounted.current) {
        console.error("Scanner start error", err);
        setError("Não foi possível acessar a câmera. Verifique as permissões e certifique-se de fechar outros apps que possam estar sobrepondo a tela (balões de chat, filtros de luz, etc).");
      }
    }
  }, [mode, onScan]);

  const stopScanner = useCallback(async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
        scannerRef.current = null;
      } catch (err) {
        console.error("Scanner stop error", err);
      }
    }
  }, []);

  useEffect(() => {
    startScanner();
    return () => {
      stopScanner();
    };
  }, [startScanner, stopScanner]);

  const toggleTorch = async () => {
    if (!scannerRef.current) return;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const html5QrCode = scannerRef.current as any;
      const track = typeof html5QrCode.getRunningTrack === 'function' 
        ? html5QrCode.getRunningTrack() 
        : null;

      if (track) {
        // Feedback tátil
        if (navigator.vibrate) navigator.vibrate(50);

        const newState = !isTorchOn;
        
        // Tenta aplicar a restrição de lanterna
        // Alguns dispositivos ignoram se o valor for o mesmo que o atual detectado,
        // então forçamos a mudança baseada no nosso estado interno.
        // Adicionamos uma verificação extra de capacidades
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const capabilities = track.getCapabilities() as any;
        if (!capabilities.torch) {
          console.warn("Torch not supported by this track");
          // Mesmo assim tentamos, pois getCapabilities pode mentir em alguns browsers
        }

        await track.applyConstraints({
          advanced: [{ torch: newState }]
        });
        
        setIsTorchOn(newState);
        
        // Verificação dupla: alguns navegadores precisam de um tempo para atualizar o settings
        setTimeout(async () => {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const settings = track.getSettings() as any;
            if (settings && typeof settings.torch !== 'undefined') {
              setIsTorchOn(settings.torch);
            }
          } catch {
            // Ignora erro na verificação secundária
          }
        }, 500);
      } else {
        console.error("No running track found to toggle torch");
      }
    } catch (e) {
      console.error("Torch toggle failed", e);
      // Fallback: tenta novamente forçando o estado oposto com um pequeno delay
      setTimeout(async () => {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const scannerAny = scannerRef.current as any;
          const track = scannerAny.getRunningTrack();
          if (track) {
            const newState = !isTorchOn;
            await track.applyConstraints({
              advanced: [{ torch: newState }]
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } as any);
            setIsTorchOn(newState);
          }
        } catch (err2) {
          console.error("Torch fallback failed", err2);
        }
      }, 200);
    }
  };

  const handleZoom = async (delta: number) => {
    if (!scannerRef.current) return;
    try {
      const scannerInstance = scannerRef.current as unknown as { getRunningTrack?: () => MediaStreamTrack };
      if (typeof scannerInstance.getRunningTrack === 'function') {
        const track = scannerInstance.getRunningTrack();
        if (track) {
          const capabilities = track.getCapabilities() as MediaTrackCapabilities & { zoom?: { min: number, max: number } };
          if (capabilities.zoom) {
            const newZoom = Math.max(capabilities.zoom.min, Math.min(capabilities.zoom.max, zoomLevel + delta));
            await track.applyConstraints({
              advanced: [{ zoom: newZoom }]
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } as any);
            setZoomLevel(newZoom);
          }
        }
      }
    } catch (e) {
      console.error("Zoom failed", e);
    }
  };

  const scannerContent = (
    <div className="fixed inset-0 z-[9999] bg-black flex flex-col items-center justify-center overflow-hidden">
      {/* Viewport Overlay */}
      <div id="reader" key={mode} className={`w-full h-full transition-opacity duration-75 ${isFlashing ? 'opacity-50' : 'opacity-100'}`}></div>
      
      {/* Flash Effect */}
      {isFlashing && (
        <div className="absolute inset-0 bg-white z-[100] pointer-events-none animate-pulse"></div>
      )}

      {/* Success Feedback */}
      {showSuccess && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[101] pointer-events-none">
          <div className="bg-emerald-500 text-white px-6 py-3 rounded-2xl shadow-2xl flex items-center space-x-3 border border-white/20 animate-bounce">
            <ShieldCheck size={24} />
            <span className="text-sm font-black uppercase tracking-widest">Lido!</span>
          </div>
        </div>
      )}

      {/* Custom UI Overlay */}
      <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center">
        {/* Bounding Box Simulation */}
        <div className={`border-2 border-blue-500/50 rounded-2xl relative overflow-hidden shadow-[0_0_0_1000px_rgba(0,0,0,0.7)] ${
          mode === ScannerMode.BARCODE ? 'w-[300px] h-[120px]' : 'w-[250px] h-[250px]'
        }`}>
          {/* Scanner Line */}
          <div className="absolute left-0 right-0 h-0.5 bg-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.8)] animate-scanLine"></div>
          
          {/* Corners */}
          <div className="absolute top-0 left-0 w-4 h-4 border-t-4 border-l-4 border-blue-500 rounded-tl-lg"></div>
          <div className="absolute top-0 right-0 w-4 h-4 border-t-4 border-r-4 border-blue-500 rounded-tr-lg"></div>
          <div className="absolute bottom-0 left-0 w-4 h-4 border-b-4 border-l-4 border-blue-500 rounded-bl-lg"></div>
          <div className="absolute bottom-0 right-0 w-4 h-4 border-b-4 border-r-4 border-blue-500 rounded-br-lg"></div>
        </div>

        <div className="mt-12 text-center px-8">
          <p className="text-white text-xs font-bold uppercase tracking-[0.2em] mb-2">
            {mode === ScannerMode.BARCODE ? 'Modo Código de Barras' : 'Modo QR Code'}
          </p>
          <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest">
            Posicione o código dentro do quadro azul
          </p>
        </div>
      </div>

      {/* Controls */}
      <div className="absolute top-8 left-0 right-0 px-6 flex items-center justify-between pointer-events-none z-50">
        {/* Lado Esquerdo: Fechar */}
        <div className="flex-1 flex justify-start">
          <button 
            onClick={onClose}
            className="p-3 bg-white/10 backdrop-blur-md rounded-2xl text-white active:scale-90 transition-all border border-white/10 pointer-events-auto"
          >
            <X size={24} />
          </button>
        </div>

        {/* Centro: Modo de Leitura */}
        <div className="flex-1 flex justify-center">
          {onModeChange && (
            <button 
              onClick={() => onModeChange(mode === ScannerMode.BARCODE ? ScannerMode.QRCODE : ScannerMode.BARCODE)}
              className="p-3 bg-white/10 backdrop-blur-md rounded-2xl text-white active:scale-90 transition-all border border-white/10 flex flex-col items-center justify-center min-w-[64px] pointer-events-auto shadow-xl"
            >
              <RefreshCw size={20} className="mb-1" />
              <span className="text-[8px] font-black uppercase tracking-tighter">
                {mode === ScannerMode.BARCODE ? 'p/ QR' : 'p/ Barras'}
              </span>
            </button>
          )}
        </div>

        {/* Lado Direito: Lanterna e Zoom */}
        <div className="flex-1 flex justify-end items-center space-x-2 pointer-events-auto">
          {hasTorch && (
            <button 
              onClick={toggleTorch}
              className={`p-3 backdrop-blur-md rounded-2xl active:scale-90 transition-all border flex flex-col items-center justify-center min-w-[64px] shadow-xl ${isTorchOn ? 'bg-yellow-500 text-white border-yellow-400 shadow-lg shadow-yellow-500/20' : 'bg-white/10 text-white border-white/10'}`}
            >
              {isTorchOn ? <Zap size={20} className="mb-1" /> : <ZapOff size={20} className="mb-1" />}
              <span className="text-[8px] font-black uppercase tracking-tighter">Lanternas</span>
            </button>
          )}

          <div className="p-1 bg-white/10 backdrop-blur-md rounded-2xl flex items-center border border-white/10 shadow-xl">
            <button onClick={() => handleZoom(-0.5)} className="p-2 text-white active:scale-90"><Minimize size={20} /></button>
            <span className="text-white text-[10px] font-bold w-8 text-center">{zoomLevel.toFixed(1)}x</span>
            <button onClick={() => handleZoom(0.5)} className="p-2 text-white active:scale-90"><Maximize size={20} /></button>
          </div>
        </div>
      </div>

      {error && (
        <div className="absolute bottom-24 left-6 right-6 p-4 bg-red-500/20 backdrop-blur-md border border-red-500/50 rounded-2xl text-center pointer-events-auto">
          <p className="text-white text-xs font-bold uppercase tracking-tight">{error}</p>
          <button onClick={() => { setError(null); startScanner(); }} className="mt-2 text-white text-[10px] font-bold underline uppercase tracking-widest">Tentar Novamente</button>
        </div>
      )}

      {/* Bottom Tip */}
      <div className="absolute bottom-24 flex flex-col items-center space-y-4 pointer-events-auto">
        {onManualInput && (
          <button 
            onClick={onManualInput}
            className="px-8 py-4 bg-white/10 backdrop-blur-md rounded-2xl text-white border border-white/20 flex items-center space-x-3 active:scale-95 transition-all shadow-2xl"
          >
            <RefreshCw size={20} className="text-blue-400" />
            <span className="text-[10px] font-black uppercase tracking-widest">Digitar Código Manualmente</span>
          </button>
        )}
        
        <div className="flex items-center space-x-2 text-white/40">
          <Camera size={14} />
          <span className="text-[9px] font-bold uppercase tracking-widest">Processamento de Imagem v24 PRO</span>
        </div>
      </div>

      <style>{`
        @keyframes scanLine {
          0% { top: 0%; }
          50% { top: 100%; }
          100% { top: 0%; }
        }
        .animate-scanLine {
          animation: scanLine 3s ease-in-out infinite;
        }
        #reader {
          background-color: black !important;
          border: none !important;
        }
        #reader video {
          object-fit: cover !important;
          width: 100% !important;
          height: 100% !important;
          display: block !important;
        }
        /* Hide all library UI elements except the video */
        #reader > div:not(:has(video)) {
          display: none !important;
        }
        #reader__scan_region {
          background: transparent !important;
        }
        #reader__dashboard {
          display: none !important;
        }
        /* Hide the library's own shaded region and corners */
        #qr-shaded-region {
          display: none !important;
        }
        #reader__camera_selection {
          display: none !important;
        }
        #reader img {
          display: none !important;
        }
      `}</style>
    </div>
  );

  return createPortal(scannerContent, document.body);
};

export default Scanner;
