
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { X, Zap, ZapOff, Maximize, Minimize, Camera } from 'lucide-react';
import { ScannerMode } from '../types';

interface ScannerProps {
  mode: ScannerMode;
  onScan: (result: string) => void;
  onClose: () => void;
}

const Scanner: React.FC<ScannerProps> = ({ mode, onScan, onClose }) => {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [isTorchOn, setIsTorchOn] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [hasTorch, setHasTorch] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

    const config = {
      fps: 20,
      qrbox: mode === ScannerMode.BARCODE 
        ? { width: 300, height: 120 } 
        : { width: 250, height: 250 },
      aspectRatio: 1.0,
      formatsToSupport: formats,
      experimentalFeatures: {
        useBarCodeDetectorIfSupported: true
      }
    };

    try {
      const html5QrCode = new Html5Qrcode("reader");
      scannerRef.current = html5QrCode;

      await html5QrCode.start(
        { facingMode: "environment" },
        config,
        (decodedText) => {
          playBeep();
          onScan(decodedText);
        },
        () => {
          // Ignore frequent noise errors
        }
      );

      // Check for torch and zoom capabilities
      const track = (html5QrCode as any).getRunningTrack();
      const capabilities = track.getCapabilities() as MediaTrackCapabilities & { torch?: boolean, zoom?: { min: number, max: number } };
      
      if (capabilities.torch) setHasTorch(true);
      
      // Auto-flashlight if low light (simulated via exposure if supported)
      // Note: Web API doesn't directly expose light level easily without extra permissions
      // but we can check if the track supports torch and suggest it.

    } catch (err) {
      console.error("Scanner start error", err);
      setError("Não foi possível acessar a câmera. Verifique as permissões.");
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
    const track = (scannerRef.current as any).getRunningTrack();
    try {
      await track.applyConstraints({
        advanced: [{ torch: !isTorchOn } as MediaTrackConstraintSet & { torch: boolean }]
      });
      setIsTorchOn(!isTorchOn);
    } catch (e) {
      console.error("Torch toggle failed", e);
    }
  };

  const handleZoom = async (delta: number) => {
    if (!scannerRef.current) return;
    const track = (scannerRef.current as any).getRunningTrack();
    const capabilities = track.getCapabilities() as MediaTrackCapabilities & { zoom?: { min: number, max: number } };
    
    if (capabilities.zoom) {
      const newZoom = Math.max(capabilities.zoom.min, Math.min(capabilities.zoom.max, zoomLevel + delta));
      try {
        await track.applyConstraints({
          advanced: [{ zoom: newZoom } as MediaTrackConstraintSet & { zoom: number }]
        });
        setZoomLevel(newZoom);
      } catch (e) {
        console.error("Zoom failed", e);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-[1000] bg-black flex flex-col items-center justify-center animate-fadeIn">
      {/* Viewport Overlay */}
      <div id="reader" className="w-full h-full"></div>
      
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
      <div className="absolute top-8 left-0 right-0 px-6 flex items-center justify-between">
        <button 
          onClick={onClose}
          className="p-3 bg-white/10 backdrop-blur-md rounded-2xl text-white active:scale-90 transition-all border border-white/10"
        >
          <X size={24} />
        </button>

        <div className="flex items-center space-x-3">
          {hasTorch && (
            <button 
              onClick={toggleTorch}
              className={`p-3 backdrop-blur-md rounded-2xl active:scale-90 transition-all border ${isTorchOn ? 'bg-yellow-500 text-white border-yellow-400 shadow-lg shadow-yellow-500/20' : 'bg-white/10 text-white border-white/10'}`}
            >
              {isTorchOn ? <Zap size={24} /> : <ZapOff size={24} />}
            </button>
          )}
          <div className="p-1 bg-white/10 backdrop-blur-md rounded-2xl flex items-center border border-white/10">
            <button onClick={() => handleZoom(-0.5)} className="p-2 text-white active:scale-90"><Minimize size={20} /></button>
            <span className="text-white text-[10px] font-bold w-8 text-center">{zoomLevel.toFixed(1)}x</span>
            <button onClick={() => handleZoom(0.5)} className="p-2 text-white active:scale-90"><Maximize size={20} /></button>
          </div>
        </div>
      </div>

      {error && (
        <div className="absolute bottom-24 left-6 right-6 p-4 bg-red-500/20 backdrop-blur-md border border-red-500/50 rounded-2xl text-center">
          <p className="text-white text-xs font-bold uppercase tracking-tight">{error}</p>
          <button onClick={() => { setError(null); startScanner(); }} className="mt-2 text-white text-[10px] font-bold underline uppercase tracking-widest">Tentar Novamente</button>
        </div>
      )}

      {/* Bottom Tip */}
      <div className="absolute bottom-10 flex items-center space-x-2 text-white/40">
        <Camera size={14} />
        <span className="text-[9px] font-bold uppercase tracking-widest">Processamento de Imagem v24 PRO</span>
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
        #reader video {
          object-fit: cover !important;
          width: 100% !important;
          height: 100% !important;
        }
        #reader__scan_region {
          display: none !important;
        }
      `}</style>
    </div>
  );
};

export default Scanner;
