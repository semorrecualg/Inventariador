import React from 'react';
import { ScanFeedbackMode, ScannerMode } from '../types';
import {
  ArrowLeft,
  Battery,
  BookOpen,
  Barcode,
  Moon,
  QrCode,
  RotateCcw,
  ShieldCheck,
  Vibrate,
  Volume2,
  X
} from 'lucide-react';
import { playScanFeedback } from '../utils/scanFeedback';

export interface PreferencesPanelProps {
  onClose: () => void;
  /** LIGADO grava o ativo no ato da leitura; DESLIGADO pede confirmação na ficha. */
  autoConfirmOnScan: boolean;
  onUpdateAutoConfirm: (val: boolean) => void;
  scanFeedbackMode: ScanFeedbackMode;
  onUpdateScanFeedbackMode: (mode: ScanFeedbackMode) => void;
  /** Presente apenas onde existe leitor de câmera (inventário, etiquetagem, menu). */
  scannerMode?: ScannerMode;
  onUpdateScannerMode?: (mode: ScannerMode) => void;
  darkMode: boolean;
  onUpdateDarkMode: (val: boolean) => void;
  batterySaver: boolean;
  onUpdateBatterySaver: (val: boolean) => void;
  /** Abre o manual do sistema quando o contexto oferece essa tela. */
  onOpenManual?: () => void;
  /** Unidade/endereço em que as preferências vão ser aplicadas. */
  contextLabel?: string;
}

const FEEDBACK_OPTIONS: { mode: ScanFeedbackMode; label: string; icon: React.ReactNode }[] = [
  { mode: ScanFeedbackMode.VIBRATE, label: 'Vibrar', icon: <Vibrate size={15} /> },
  { mode: ScanFeedbackMode.SOUND, label: 'Som (bip)', icon: <Volume2 size={15} /> },
  {
    mode: ScanFeedbackMode.BOTH,
    label: 'Ambos',
    icon: (
      <span className="flex items-center gap-0.5">
        <Vibrate size={12} />
        <Volume2 size={12} />
      </span>
    )
  },
  { mode: ScanFeedbackMode.NONE, label: 'Silencioso', icon: <X size={15} /> }
];

/** Interruptor acessível (role="switch") usado nas três preferências on/off. */
const Switch: React.FC<{
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}> = ({ checked, onChange, label }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    onClick={() => onChange(!checked)}
    className={`w-11 h-6 rounded-full relative shrink-0 transition-colors ${checked ? 'bg-success' : 'bg-border'}`}
  >
    <span
      className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm transition-all ${checked ? 'left-6' : 'left-1'}`}
    />
  </button>
);

const PreferencesPanel: React.FC<PreferencesPanelProps> = ({
  onClose,
  autoConfirmOnScan,
  onUpdateAutoConfirm,
  scanFeedbackMode,
  onUpdateScanFeedbackMode,
  scannerMode,
  onUpdateScannerMode,
  darkMode,
  onUpdateDarkMode,
  batterySaver,
  onUpdateBatterySaver,
  onOpenManual,
  contextLabel
}) => {
  const canChangeScannerMode = !!scannerMode && !!onUpdateScannerMode;
  const isDefaultSetup =
    autoConfirmOnScan &&
    scanFeedbackMode === ScanFeedbackMode.BOTH &&
    (!canChangeScannerMode || scannerMode === ScannerMode.BARCODE);

  const restoreDefaults = () => {
    onUpdateAutoConfirm(true);
    onUpdateScanFeedbackMode(ScanFeedbackMode.BOTH);
    if (canChangeScannerMode && onUpdateScannerMode) {
      onUpdateScannerMode(ScannerMode.BARCODE);
    }
  };

  return (
    <div className="fixed inset-0 z-[10000] bg-bg-main flex flex-col animate-fadeIn">
      {/* Barra superior */}
      <div className="bg-surface border-b border-border px-4 py-3 flex items-center gap-3 sticky top-0 z-[10001] safe-area-top">
        <button
          type="button"
          onClick={onClose}
          className="p-2 -ml-1 rounded-xl text-ink-muted active:bg-accent-soft transition-colors"
          aria-label="Fechar ajustes de campo"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="text-sm font-black text-ink uppercase tracking-tight leading-tight">
            Ajustes de Campo
          </h1>
          <p className="text-[9px] font-bold text-ink-muted uppercase tracking-[0.18em] mt-0.5 truncate">
            {contextLabel ? contextLabel : 'Preferências do auditor'}
          </p>
        </div>
        <span className="px-2 py-1 rounded-lg bg-accent-soft text-accent text-[8px] font-black uppercase tracking-widest">
          Neste dispositivo
        </span>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar px-4 py-4">
        <div className="w-full max-w-md mx-auto space-y-4 pb-8">
          {/* LEITURA */}
          <section className="bg-surface border border-border rounded-2xl p-4 shadow-sm">
            <div className="flex items-center mb-3">
              <div className="w-9 h-9 bg-accent-soft text-accent rounded-xl flex items-center justify-center mr-3 border border-border">
                <Barcode size={17} />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-[12px] font-black text-ink uppercase tracking-tight">Leitura</h2>
                <p className="text-[8px] font-bold text-ink-muted uppercase tracking-widest mt-0.5">
                  Scanner, conferência e captura
                </p>
              </div>
            </div>

            {/* Feedback */}
            <div className="flex items-center justify-between mb-2">
              <p className="text-[9px] font-black text-ink-muted uppercase tracking-widest">
                Feedback da leitura
              </p>
              <button
                type="button"
                onClick={() => playScanFeedback(scanFeedbackMode, batterySaver)}
                className="px-2.5 py-1 rounded-lg bg-accent-soft text-accent text-[9px] font-black uppercase tracking-widest active:scale-95 transition-all"
                aria-label="Testar feedback da leitura"
              >
                Testar
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2 p-1 bg-bg-main border border-border rounded-xl">
              {FEEDBACK_OPTIONS.map(option => {
                const active = scanFeedbackMode === option.mode;
                return (
                  <button
                    key={option.mode}
                    type="button"
                    onClick={() => onUpdateScanFeedbackMode(option.mode)}
                    aria-pressed={active}
                    className={`py-2.5 rounded-lg text-[9px] font-bold uppercase tracking-widest transition-all flex flex-col items-center justify-center gap-1 ${
                      active
                        ? 'bg-surface text-accent shadow-sm border border-accent/30'
                        : 'text-ink-muted border border-transparent'
                    }`}
                  >
                    {option.icon}
                    <span>{option.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="h-px bg-border my-4" />

            {/* Auto-conferência */}
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-accent-soft text-accent rounded-lg flex items-center justify-center shrink-0 border border-border">
                <ShieldCheck size={15} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-black text-ink uppercase tracking-tight">
                  Auto-Conferência
                </p>
                <p className="text-[9px] font-medium text-ink-muted leading-snug mt-1">
                  {autoConfirmOnScan
                    ? 'Grava o ativo no ato da leitura — fluxo rápido, sem ficha intermédia.'
                    : 'Abre a ficha de confirmação para revisar local e património antes de gravar.'}
                </p>
              </div>
              <Switch
                checked={autoConfirmOnScan}
                onChange={onUpdateAutoConfirm}
                label="Auto-Conferência no scanner"
              />
            </div>

            {/* Modo de captura */}
            {canChangeScannerMode && (
              <>
                <div className="h-px bg-border my-4" />
                <p className="text-[9px] font-black text-ink-muted uppercase tracking-widest mb-2">
                  Padrão de captura
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => onUpdateScannerMode?.(ScannerMode.BARCODE)}
                    aria-pressed={scannerMode === ScannerMode.BARCODE}
                    className={`py-2.5 rounded-xl text-[9px] font-bold uppercase tracking-widest transition-all flex items-center justify-center gap-2 border ${
                      scannerMode === ScannerMode.BARCODE
                        ? 'bg-accent-soft text-accent border-accent/30'
                        : 'bg-bg-main text-ink-muted border-border'
                    }`}
                  >
                    <Barcode size={14} />
                    <span>Código de barras</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onUpdateScannerMode?.(ScannerMode.QRCODE)}
                    aria-pressed={scannerMode === ScannerMode.QRCODE}
                    className={`py-2.5 rounded-xl text-[9px] font-bold uppercase tracking-widest transition-all flex items-center justify-center gap-2 border ${
                      scannerMode === ScannerMode.QRCODE
                        ? 'bg-accent-soft text-accent border-accent/30'
                        : 'bg-bg-main text-ink-muted border-border'
                    }`}
                  >
                    <QrCode size={14} />
                    <span>QR Code</span>
                  </button>
                </div>
              </>
            )}

            {!isDefaultSetup && (
              <button
                type="button"
                onClick={restoreDefaults}
                className="mt-4 w-full py-2 rounded-xl border border-border text-ink-muted text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-2 active:scale-[0.99] transition-all"
              >
                <RotateCcw size={12} />
                Restaurar padrões de leitura
              </button>
            )}
          </section>

          {/* ENERGIA */}
          <section className="bg-surface border border-border rounded-2xl p-4 shadow-sm">
            <div className="flex items-center mb-3">
              <div className="w-9 h-9 bg-accent-soft text-accent rounded-xl flex items-center justify-center mr-3 border border-border">
                <Battery size={17} />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-[12px] font-black text-ink uppercase tracking-tight">
                  Energia e visibilidade
                </h2>
                <p className="text-[8px] font-bold text-ink-muted uppercase tracking-widest mt-0.5">
                  Autonomia da bateria em campo
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-bg-main text-ink-muted rounded-lg flex items-center justify-center shrink-0 border border-border">
                <Battery size={15} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-black text-ink uppercase tracking-tight">
                  Economia de bateria
                </p>
                <p className="text-[9px] font-medium text-ink-muted leading-snug mt-1">
                  Vibração curta, pausa da câmara mais cedo e menos atualizações de telemetria.
                </p>
              </div>
              <Switch
                checked={batterySaver}
                onChange={onUpdateBatterySaver}
                label="Economia de bateria"
              />
            </div>

            <div className="h-px bg-border my-3" />

            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-bg-main text-ink-muted rounded-lg flex items-center justify-center shrink-0 border border-border">
                <Moon size={15} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-black text-ink uppercase tracking-tight">
                  Modo escuro
                </p>
                <p className="text-[9px] font-medium text-ink-muted leading-snug mt-1">
                  Reduz o brilho da interface para leitura em ambientes com pouca luz.
                </p>
              </div>
              <Switch checked={darkMode} onChange={onUpdateDarkMode} label="Modo escuro" />
            </div>
          </section>

          {onOpenManual && (
            <button
              type="button"
              onClick={onOpenManual}
              className="w-full p-4 bg-surface border border-border rounded-2xl shadow-sm flex items-center gap-3 active:scale-[0.99] transition-all text-left"
            >
              <div className="w-9 h-9 bg-accent-soft text-accent rounded-xl flex items-center justify-center border border-border">
                <BookOpen size={17} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-black text-ink uppercase tracking-tight">
                  Manual do sistema
                </p>
                <p className="text-[9px] font-medium text-ink-muted leading-snug mt-0.5">
                  Regras de inventário, perfis e integração Protheus.
                </p>
              </div>
            </button>
          )}

          <p className="text-center text-[8px] font-bold text-ink-muted/70 uppercase tracking-[0.3em] pt-2">
            Preferências aplicadas a este dispositivo
          </p>
        </div>
      </div>
    </div>
  );
};

export default PreferencesPanel;
