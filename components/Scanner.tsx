
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { X, Maximize, Minimize, Camera, RefreshCw, ShieldCheck } from 'lucide-react';
import { ScannerMode, ScanFeedbackMode } from '../types';

interface ScannerProps {
  mode: ScannerMode;
  onScan: (result: string) => void;
  onClose: () => void;
  onModeChange?: (mode: ScannerMode) => void;
  onManualInput?: () => void;
  isInline?: boolean;
  isPaused?: boolean;
  children?: React.ReactNode;
  scanFeedbackMode?: ScanFeedbackMode;
  batterySaver?: boolean;
  torch?: 'on' | 'off';
}

const Scanner: React.FC<ScannerProps> = ({ 
  mode, 
  onScan, 
  onClose, 
  onModeChange, 
  onManualInput, 
  isInline = false,
  isPaused = false,
  children,
  scanFeedbackMode = ScanFeedbackMode.BOTH,
  batterySaver = false,
  torch = 'off'
}) => {
  const isMounted = useRef(true);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const currentModeRef = useRef<ScannerMode>(mode);
  const isStoppingRef = useRef(false);
  const isStartingRef = useRef(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [availableCameras, setAvailableCameras] = useState<{ id: string, label: string }[]>([]);
  const [currentCameraIndex, setCurrentCameraIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [isFlashing, setIsFlashing] = useState(false);
  const trackRef = useRef<MediaStreamTrack | null>(null);

  const [isTabHidden, setIsTabHidden] = useState(false);
  const [isInactive, setIsInactive] = useState(false);
  const inactivityTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    isMounted.current = true;
    
    const handleVisibilityChange = () => {
      setIsTabHidden(document.hidden);
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      isMounted.current = false;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (inactivityTimeoutRef.current) clearTimeout(inactivityTimeoutRef.current);
      // Garantir que o track pare ao desmontar para economizar bateria
      if (trackRef.current) {
        trackRef.current.stop();
        trackRef.current = null;
      }
    };
  }, []);

  const resetInactivityTimeout = useCallback(() => {
    if (inactivityTimeoutRef.current) clearTimeout(inactivityTimeoutRef.current);
    if (isInactive) setIsInactive(false);
    
    // Se estiver em modo de economia, o timeout é mais curto (1 min vs 3 min)
    inactivityTimeoutRef.current = setTimeout(() => {
      if (isMounted.current) setIsInactive(true);
    }, batterySaver ? 60000 : 180000);
  }, [batterySaver, isInactive]);

  // Reset timeout em interações
  useEffect(() => {
    const handleInteraction = () => resetInactivityTimeout();
    window.addEventListener('touchstart', handleInteraction);
    window.addEventListener('mousedown', handleInteraction);
    resetInactivityTimeout();
    return () => {
      window.removeEventListener('touchstart', handleInteraction);
      window.removeEventListener('mousedown', handleInteraction);
    };
  }, [resetInactivityTimeout]);

  const playBeep = () => {
    try {
      if (scanFeedbackMode === ScanFeedbackMode.NONE) return;

      const shouldSound = scanFeedbackMode === ScanFeedbackMode.SOUND || scanFeedbackMode === ScanFeedbackMode.BOTH;
      const shouldVibrate = scanFeedbackMode === ScanFeedbackMode.VIBRATE || scanFeedbackMode === ScanFeedbackMode.BOTH;

      if (shouldSound) {
        const AudioContextClass = window.AudioContext || (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (AudioContextClass) {
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
        }
      }
      
      if (shouldVibrate && navigator.vibrate) {
        navigator.vibrate(batterySaver ? 50 : 100);
      }
    } catch (e) {
      console.error('Feedback failed', e);
    }
  };

  const stopScanner = useCallback(async () => {
    // Se estiver iniciando, espera um pouco para não interromper o play()
    if (isStartingRef.current) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    if (scannerRef.current && !isStoppingRef.current) {
      isStoppingRef.current = true;
      try {
        await scannerRef.current.stop();
        scannerRef.current = null;
        
        if (trackRef.current) {
          trackRef.current.stop();
          trackRef.current = null;
        }
        // Pequeno delay para o hardware liberar a câmera
        await new Promise(resolve => setTimeout(resolve, 300));
      } catch (err) {
        console.warn("Scanner stop error (might already be stopped)", err);
        scannerRef.current = null;
      } finally {
        isStoppingRef.current = false;
      }
    }
  }, []);

  const startScanner = useCallback(async () => {
    if (isStoppingRef.current) {
      // Se estiver parando, espera um pouco e tenta de novo
      setTimeout(startScanner, 100);
      return;
    }

    // Se já estiver rodando no mesmo modo, não faz nada
    if (scannerRef.current && currentModeRef.current === mode) return;

    // Se o modo mudou ou já existe uma instância, limpa antes
    if (scannerRef.current) {
      await stopScanner();
    }

    currentModeRef.current = mode;

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

    const config = {
      fps: 5, // Redução drástica conforme solicitado (frameProcessorFps: 5)
      qrbox: mode === ScannerMode.BARCODE 
        ? { width: 350, height: 150 } 
        : { width: 280, height: 280 },
      formatsToSupport: formats,
      aspectRatio: window.innerHeight > window.innerWidth ? 0.5625 : 1.7777778,
      // Otimização de Resolução: 720p é o ideal para leitura sem aquecer demais. 
      // 1080p+ em navegadores mobile causa processamento excessivo.
      videoConstraints: {
        facingMode: "environment",
        width: { ideal: batterySaver ? 640 : 1280 },
        height: { ideal: batterySaver ? 480 : 720 },
        frameRate: { ideal: batterySaver ? 5 : 10 }
      }
    };

    try {
      setIsLoading(true);
      setError(null);
      isStartingRef.current = true;

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("Seu navegador não suporta acesso à câmera ou você está em uma conexão não segura (HTTPS necessário).");
      }

      // Pequeno delay para garantir que o DOM está pronto
      await new Promise(resolve => setTimeout(resolve, 500));
      if (!isMounted.current) return;
      
      const html5QrCode = new Html5Qrcode("reader");
      scannerRef.current = html5QrCode;

      const onScanSuccess = (decodedText: string) => {
        if (isMounted.current) {
          resetInactivityTimeout();
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
      };

      const onScanFailure = () => {
        // Ignora erros de leitura contínua
      };

      // Tenta iniciar com a câmera selecionada ou facingMode
      try {
        // Se já temos câmeras listadas, usamos o index
        if (availableCameras.length > 0 && currentCameraIndex !== -1 && availableCameras[currentCameraIndex]) {
          await html5QrCode.start(
            availableCameras[currentCameraIndex].id,
            config,
            onScanSuccess,
            onScanFailure
          );
        } else {
          // Caso contrário, tenta o padrão ou busca câmeras
          const cameras = await Html5Qrcode.getCameras().catch(() => []);
          if (isMounted.current && cameras.length > 0) {
            setAvailableCameras(cameras);
            // Inicia com a última câmera (geralmente a traseira principal)
            const lastIndex = cameras.length - 1;
            setCurrentCameraIndex(lastIndex);
            await html5QrCode.start(cameras[lastIndex].id, config, onScanSuccess, onScanFailure);
          } else {
            // Fallback para facingMode se getCameras falhar ou não retornar nada
            await html5QrCode.start(
              { facingMode: "environment" },
              config,
              onScanSuccess,
              onScanFailure
            );
          }
        }
      } catch (e) {
        console.warn("Scanner start failed", e);
        throw e;
      }

      setIsLoading(false);
      isStartingRef.current = false;

      if (!isMounted.current) {
        await html5QrCode.stop().catch(() => {});
        return;
      }

      // Detecção de capacidades (Zoom apenas, Lanterna removida)
      try {
        await new Promise(resolve => setTimeout(resolve, 800)); 
        
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const html5QrCodeAny = html5QrCode as any;
        const track = html5QrCodeAny.getRunningTrack();
        
        if (track) {
          trackRef.current = track;
        }
      } catch (e) {
        console.warn("Capability check failed", e);
      }

    } catch (err) {
      isStartingRef.current = false;
      if (isMounted.current) {
        console.error("Scanner start error", err);
        setError(err instanceof Error ? err.message : "Erro ao acessar câmera. Verifique as permissões.");
        setIsLoading(false);
      }
    }
  }, [mode, onScan, batterySaver, currentCameraIndex]);

  useEffect(() => {
    if (!isPaused && !isTabHidden && !isInactive) {
      startScanner();
    } else {
      stopScanner();
    }
    return () => {
      stopScanner();
    };
  }, [startScanner, stopScanner, isPaused, isTabHidden, isInactive]);

  useEffect(() => {
    const applyTorch = async () => {
      if (!trackRef.current) return;
      try {
        const capabilities = trackRef.current.getCapabilities() as MediaTrackCapabilities & { torch?: boolean };
        if (capabilities.torch) {
          await trackRef.current.applyConstraints({
            advanced: [{ torch: torch === 'on' }]
          } as any); // eslint-disable-line @typescript-eslint/no-explicit-any
        }
      } catch (e) {
        console.warn("Torch control failed", e);
      }
    };
    applyTorch();
  }, [torch]);

  const switchCamera = async () => {
    if (availableCameras.length < 2) return;
    
    const nextIndex = (currentCameraIndex + 1) % availableCameras.length;
    setCurrentCameraIndex(nextIndex);
    
    setIsLoading(true);
    // O useEffect cuidará de parar e reiniciar o scanner pois currentCameraIndex mudou
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
    <div className={`${isInline ? 'relative w-full h-64 rounded-3xl' : 'fixed inset-0 z-[9999]'} bg-black flex flex-col items-center justify-center overflow-hidden shadow-2xl transition-all duration-300`}>
      {/* Inactivity Overlay */}
      {isInactive && !isPaused && (
        <div className="absolute inset-0 z-[110] bg-black/80 backdrop-blur-md flex flex-col items-center justify-center p-8 text-center">
          <div className="w-16 h-16 bg-amber-500/20 rounded-full flex items-center justify-center mb-4 border border-amber-500/30">
            <RefreshCw size={32} className="text-amber-500" />
          </div>
          <h3 className="text-white font-black uppercase tracking-tighter text-lg mb-2">Scanner em Repouso</h3>
          <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-6">
            O scanner foi pausado para economizar bateria e evitar aquecimento.
          </p>
          <button 
            onClick={resetInactivityTimeout}
            className="px-8 py-3 bg-amber-500 text-black rounded-2xl font-black uppercase tracking-widest text-[10px] active:scale-95 transition-all shadow-xl shadow-amber-500/20"
          >
            Retomar Leitura
          </button>
        </div>
      )}

      {/* Loading State */}
      {isLoading && !error && !isPaused && (
        <div className="absolute inset-0 z-[100] bg-black flex flex-col items-center justify-center">
          <div className="w-12 h-12 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin mb-4"></div>
          <p className="text-white text-[10px] font-black uppercase tracking-widest animate-pulse">Iniciando Câmera...</p>
        </div>
      )}

      {/* Viewport Overlay */}
      <div id="reader" key={mode} className={`w-full h-full transition-all duration-500 ${isFlashing ? 'opacity-50' : 'opacity-100'} ${isPaused ? 'blur-xl opacity-40 scale-110' : 'blur-0 opacity-100 scale-100'}`}></div>
      
      {/* Flash Effect */}
      {isFlashing && !isPaused && (
        <div className="absolute inset-0 bg-white z-[100] pointer-events-none animate-pulse"></div>
      )}

      {/* Success Feedback */}
      {showSuccess && !isPaused && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[101] pointer-events-none">
          <div className="bg-emerald-500 text-white px-6 py-3 rounded-2xl shadow-2xl flex items-center space-x-3 border border-white/20 animate-bounce">
            <ShieldCheck size={24} />
            <span className="text-sm font-black uppercase tracking-widest">Lido!</span>
          </div>
        </div>
      )}

      {/* Custom UI Overlay */}
      <div className={`absolute inset-0 pointer-events-none flex flex-col items-center justify-center transition-opacity duration-300 ${isPaused ? 'opacity-0' : 'opacity-100'}`}>
        {/* Bounding Box Simulation */}
        <div className={`border-2 border-blue-500/50 rounded-2xl relative overflow-hidden shadow-[0_0_0_1000px_rgba(0,0,0,0.7)] ${
          mode === ScannerMode.BARCODE 
            ? (isInline ? 'w-[240px] h-[100px]' : 'w-[350px] h-[150px]') 
            : (isInline ? 'w-[200px] h-[200px]' : 'w-[280px] h-[280px]')
        }`}>
          {/* Scanner Line */}
          {!isPaused && <div className="absolute left-0 right-0 h-0.5 bg-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.8)] animate-scanLine"></div>}
          
          {/* Corners */}
          <div className="absolute top-0 left-0 w-4 h-4 border-t-4 border-l-4 border-blue-500 rounded-tl-lg"></div>
          <div className="absolute top-0 right-0 w-4 h-4 border-t-4 border-r-4 border-blue-500 rounded-tr-lg"></div>
          <div className="absolute bottom-0 left-0 w-4 h-4 border-b-4 border-l-4 border-blue-500 rounded-bl-lg"></div>
          <div className="absolute bottom-0 right-0 w-4 h-4 border-b-4 border-r-4 border-blue-500 rounded-br-lg"></div>
        </div>

        {!isInline && (
          <div className="mt-12 text-center px-8">
            <p className="text-white text-xs font-bold uppercase tracking-[0.2em] mb-2">
              {mode === ScannerMode.BARCODE ? 'Modo Código de Barras' : 'Modo QR Code'}
            </p>
            <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest">
              Posicione o código dentro do quadro azul
            </p>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className={`absolute ${isInline ? 'top-4' : 'top-8'} left-0 right-0 px-6 flex items-center justify-between pointer-events-none z-50 transition-opacity duration-300 ${isPaused ? 'opacity-20' : 'opacity-100'}`}>
        {/* Lado Esquerdo: Fechar */}
        <div className="flex-1 flex justify-start">
          {!isInline && (
            <button 
              onClick={onClose}
              className="p-3 bg-white/10 backdrop-blur-md rounded-2xl text-white active:scale-90 transition-all border border-white/10 pointer-events-auto"
            >
              <X size={24} />
            </button>
          )}
        </div>

        {/* Centro: Modo de Leitura */}
        <div className="flex-1 flex justify-center space-x-2">
          {batterySaver && (
            <div className="absolute top-20 left-1/2 -translate-x-1/2 px-3 py-1 bg-amber-500/20 backdrop-blur-md rounded-full border border-amber-500/30 flex items-center space-x-2 animate-pulse">
              <ShieldCheck size={12} className="text-amber-500" />
              <span className="text-[8px] font-black text-amber-500 uppercase tracking-widest">Modo Econômico Ativo</span>
            </div>
          )}

          {onModeChange && (
            <button 
              onClick={() => onModeChange(mode === ScannerMode.BARCODE ? ScannerMode.QRCODE : ScannerMode.BARCODE)}
              className={`p-3 bg-white/10 backdrop-blur-md rounded-2xl text-white active:scale-90 transition-all border border-white/10 flex flex-col items-center justify-center ${isInline ? 'min-w-[48px]' : 'min-w-[64px]'} pointer-events-auto shadow-xl`}
            >
              <RefreshCw size={isInline ? 16 : 20} className="mb-1" />
              <span className={`font-black uppercase tracking-tighter ${isInline ? 'text-[6px]' : 'text-[8px]'}`}>
                {mode === ScannerMode.BARCODE ? 'p/ QR' : 'p/ Barras'}
              </span>
            </button>
          )}
          
          <button 
            onClick={() => {
              stopScanner().then(() => startScanner());
            }}
            className={`p-3 bg-white/10 backdrop-blur-md rounded-2xl text-white active:scale-90 transition-all border border-white/10 flex flex-col items-center justify-center ${isInline ? 'min-w-[48px]' : 'min-w-[64px]'} pointer-events-auto shadow-xl`}
            title="Reiniciar Câmera"
          >
            <Camera size={isInline ? 16 : 20} className={`mb-1 ${isLoading ? 'animate-spin' : ''}`} />
            <span className={`font-black uppercase tracking-tighter ${isInline ? 'text-[6px]' : 'text-[8px]'}`}>
              Reiniciar
            </span>
          </button>
        </div>

        {/* Lado Direito: Zoom & Troca de Câmera */}
        <div className="flex-1 flex justify-end items-center space-x-2 pointer-events-auto">
          {availableCameras.length > 1 && !isInline && (
            <button 
              onClick={switchCamera}
              className="p-3 bg-white/10 backdrop-blur-md rounded-2xl text-white active:scale-90 transition-all border border-white/10 shadow-xl"
            >
              <Camera size={20} />
            </button>
          )}
          {!isInline && (
            <div className="p-1 bg-white/10 backdrop-blur-md rounded-2xl flex items-center border border-white/10 shadow-xl">
              <button onClick={() => handleZoom(-0.5)} className="p-2 text-white active:scale-90"><Minimize size={20} /></button>
              <span className="text-white text-[10px] font-bold w-8 text-center">{zoomLevel.toFixed(1)}x</span>
              <button onClick={() => handleZoom(0.5)} className="p-2 text-white active:scale-90"><Maximize size={20} /></button>
            </div>
          )}
        </div>
      </div>

      {/* Overlay Children (Confirmation UI) */}
      {children && (
        <div className="absolute inset-0 z-[200] flex items-center justify-center p-6 animate-fadeIn">
          {children}
        </div>
      )}

      {error && !isPaused && (
        <div className={`absolute ${isInline ? 'bottom-4' : 'bottom-24'} left-6 right-6 p-4 bg-red-500/20 backdrop-blur-md border border-red-500/50 rounded-2xl text-center pointer-events-auto`}>
          <p className="text-white text-xs font-bold uppercase tracking-tight">{error}</p>
          <button onClick={() => { setError(null); startScanner(); }} className="mt-2 text-white text-[10px] font-bold underline uppercase tracking-widest">Tentar Novamente</button>
        </div>
      )}

      {/* Bottom Tip */}
      {!isInline && (
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
      )}

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

  if (isInline) return scannerContent;
  return createPortal(scannerContent, document.body);
};

export default Scanner;
