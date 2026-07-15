import React, { useState, useEffect } from "react";
import { useBufferController } from "../hooks/useBufferController";
import { Database, RefreshCw, Save, BatteryWarning, ShieldAlert } from "lucide-react";
import { Capacitor } from "@capacitor/core";

/**
 * Componente de Controle Estritamente Tipado para o Buffer Atômico ("Regra dos 5")
 * com monitoramento e trava mecânica preventiva de baixa energia (<5% sem carregador).
 */
export const BufferIndicator: React.FC = () => {
  const { pendingCount, isFlushing, flush } = useBufferController();
  const [deviceBattery, setDeviceBattery] = useState<{ level: number; isCharging: boolean } | null>(null);
  const [isLowBatteryBlocked, setIsLowBatteryBlocked] = useState(false);

  useEffect(() => {
    let active = true;
    const fetchBattery = async () => {
      try {
        let level = 1.0;
        let isCharging = true;
        const isNative = Capacitor.isNativePlatform();

        if (isNative) {
          const { Device } = await import('@capacitor/device');
          const info = await Device.getBatteryInfo();
          level = info.batteryLevel !== undefined ? info.batteryLevel : 1.0;
          isCharging = info.isCharging !== undefined ? info.isCharging : true;
        } else {
          const nav = typeof navigator !== 'undefined' ? (navigator as unknown as { getBattery?: () => Promise<{ level: number; charging: boolean }> }) : null;
          if (nav && typeof nav.getBattery === 'function') {
            const battery = await nav.getBattery();
            level = battery.level ?? 1.0;
            isCharging = battery.charging ?? true;
          }
        }
        
        if (active) {
          setDeviceBattery({ level, isCharging });
          setIsLowBatteryBlocked(level < 0.05 && !isCharging);
        }
      } catch (err) {
        console.warn("[BufferIndicator Battery] Falha ao coletar dados de bateria:", err);
      }
    };

    fetchBattery();
    const interval = setInterval(fetchBattery, 5000); // Polling frequente para travamento preventivo
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  if (isLowBatteryBlocked) {
    return (
      <div 
        id="buffer-indicator-container-low-battery"
        className="bg-red-50 border-2 border-red-500 p-4 rounded-2xl flex flex-col gap-3 shadow-md animate-pulse-soft transition-all"
      >
        <div className="flex items-start space-x-3">
          <div className="w-9 h-9 rounded-xl bg-red-100 flex items-center justify-center text-red-600 flex-shrink-0">
            <BatteryWarning size={18} className="animate-bounce" />
          </div>
          <div>
            <h4 className="text-[11px] font-black text-red-800 uppercase tracking-wider flex items-center gap-1.5">
              <ShieldAlert size={12} /> TRAVA DE BAIXA ENERGIA ATIVA
            </h4>
            <p className="text-[9px] font-bold text-red-650 uppercase tracking-widest mt-1 leading-normal">
              Bateria em {deviceBattery ? Math.round(deviceBattery.level * 100) : 4}% sem fonte externa. Escritas bloqueadas preventivamente para evitar corrupção da base local gbr_kardek.db.
            </p>
          </div>
        </div>
        
        <div className="flex items-center justify-between border-t border-red-100 pt-2 text-[8px] font-black uppercase text-red-700 tracking-wider">
          <span>{pendingCount} alterações retidas no buffer</span>
          <button
            disabled={true}
            className="flex items-center space-x-1 px-2.5 py-1.5 bg-red-300 text-white rounded-lg text-[8px] font-black uppercase tracking-widest cursor-not-allowed"
          >
            <Save size={10} />
            <span>COMMIT LOCKED</span>
          </button>
        </div>
      </div>
    );
  }

  if (pendingCount === 0) {
    return (
      <div 
        id="buffer-indicator-container"
        className="bg-slate-50 border border-slate-100/50 p-4 rounded-2xl flex items-center justify-between transition-all"
      >
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400">
            <Database size={16} />
          </div>
          <div>
            <h4 className="text-[10px] font-black text-slate-450 uppercase tracking-widest">Base de Dados .DB</h4>
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Sincronizado & Estável</p>
          </div>
        </div>
        <span className="text-[9px] font-black font-mono text-slate-400 bg-slate-100 px-2.5 py-1 rounded-full uppercase tracking-wider">
          OK
          {deviceBattery && ` (${Math.round(deviceBattery.level * 100)}%)`}
        </span>
      </div>
    );
  }

  return (
    <div 
      id="buffer-indicator-container"
      className="bg-amber-50 border border-amber-200/50 p-4 rounded-2xl flex items-center justify-between shadow-sm animate-pulse-soft transition-all"
    >
      <div className="flex items-center space-x-3">
        <div className="w-8 h-8 rounded-xl bg-amber-100 flex items-center justify-center text-amber-600">
          <Database size={16} />
        </div>
        <div>
          <h4 className="text-[10px] font-black text-amber-800 uppercase tracking-widest">Buffer Atômico Ativo</h4>
          <p className="text-[9px] font-bold text-amber-650 uppercase tracking-widest mt-0.5">
            {pendingCount} {pendingCount === 1 ? "alteração retida" : "alterações retidas"}
            {deviceBattery && ` - Bateria: ${Math.round(deviceBattery.level * 100)}%`}
          </p>
        </div>
      </div>
      
      <button
        id="btn-buffer-flush"
        onClick={flush}
        disabled={isFlushing}
        className="flex items-center space-x-1.5 px-3 py-2 bg-amber-500 hover:bg-amber-600 disabled:bg-slate-350 text-white rounded-xl text-[9px] font-black uppercase tracking-widest transition-all hover:scale-102 active:scale-98 shadow-md shadow-amber-500/15"
      >
        {isFlushing ? (
          <RefreshCw size={11} className="animate-spin" />
        ) : (
          <Save size={11} />
        )}
        <span>{isFlushing ? "REGISTRANDO..." : "COMMIT"}</span>
      </button>
    </div>
  );
};
