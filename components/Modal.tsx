
import React from 'react';
import { X, AlertTriangle, Info, CheckCircle2 } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm?: () => void;
  title: string;
  message: string;
  type?: 'info' | 'warning' | 'error' | 'success' | 'confirm';
  confirmText?: string;
  cancelText?: string;
}

const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  type = 'info',
  confirmText = 'Confirmar',
  cancelText = 'Cancelar'
}) => {
  if (!isOpen) return null;

  const getIcon = () => {
    switch (type) {
      case 'warning':
      case 'confirm':
        return <AlertTriangle className="text-amber-500" size={32} />;
      case 'error':
        return <X className="text-red-500" size={32} />;
      case 'success':
        return <CheckCircle2 className="text-emerald-500" size={32} />;
      default:
        return <Info className="text-blue-500" size={32} />;
    }
  };

  const getHeaderColor = () => {
    switch (type) {
      case 'warning':
      case 'confirm':
        return 'bg-amber-50 border-amber-100';
      case 'error':
        return 'bg-red-50 border-red-100';
      case 'success':
        return 'bg-emerald-50 border-emerald-100';
      default:
        return 'bg-blue-50 border-blue-100';
    }
  };

  return (
    <div className="fixed inset-0 z-[20000] flex items-center justify-center p-6 bg-slate-900/80 backdrop-blur-sm animate-fadeIn">
      <div className="w-full max-w-sm bg-white rounded-[2.5rem] overflow-hidden shadow-2xl animate-scaleIn border border-slate-200">
        <div className={`p-8 flex flex-col items-center text-center ${getHeaderColor()} border-b`}>
          <div className="mb-4 p-4 bg-white rounded-2xl shadow-sm">
            {getIcon()}
          </div>
          <h3 className="text-xl font-bold text-slate-900 uppercase tracking-tight">{title}</h3>
        </div>
        
        <div className="p-8">
          <p className="text-slate-600 font-medium leading-relaxed whitespace-pre-wrap">
            {message}
          </p>
          
          <div className="mt-8 space-y-3">
            {type === 'confirm' ? (
              <>
                <button
                  onClick={() => {
                    onConfirm?.();
                    onClose();
                  }}
                  className="w-full py-4 bg-slate-900 text-white rounded-2xl font-bold uppercase tracking-widest text-xs shadow-lg active:scale-[0.98] transition-all"
                >
                  {confirmText}
                </button>
                <button
                  onClick={onClose}
                  className="w-full py-4 bg-slate-100 text-slate-500 rounded-2xl font-bold uppercase tracking-widest text-xs active:scale-[0.98] transition-all"
                >
                  {cancelText}
                </button>
              </>
            ) : (
              <button
                onClick={onClose}
                className="w-full py-4 bg-slate-900 text-white rounded-2xl font-bold uppercase tracking-widest text-xs shadow-lg active:scale-[0.98] transition-all"
              >
                OK
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Modal;
