
import React, { useState, useEffect } from 'react';
import { Delete, Lock, AlertTriangle } from 'lucide-react';
import { motion } from 'motion/react';

interface SecurityPinModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  title?: string;
  description?: string;
}

const SecurityPinModal: React.FC<SecurityPinModalProps> = ({ 
  isOpen, 
  onClose, 
  onSuccess,
  title = "Verificação de Segurança",
  description = "Insira seu PIN de acesso para confirmar esta operação sensível."
}) => {
  const [pin, setPin] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  
  // O PIN padrão para demonstração é "0000"
  const CORRECT_PIN = "0000";

  useEffect(() => {
    if (!isOpen) {
      setPin('');
      setError(null);
      setIsVerifying(false);
    }
  }, [isOpen]);

  const handleNumberClick = (num: string) => {
    if (pin.length < 4) {
      setPin(prev => prev + num);
      setError(null);
    }
  };

  const handleDelete = () => {
    setPin(prev => prev.slice(0, -1));
    setError(null);
  };

  const handleVerify = async () => {
    if (pin.length !== 4) return;
    
    setIsVerifying(true);
    
    // Simula um delay de verificação criptográfica
    await new Promise(resolve => setTimeout(resolve, 800));
    
    if (pin === CORRECT_PIN) {
      onSuccess();
      onClose();
    } else {
      setError("PIN Incorreto. Tente novamente.");
      setPin('');
      setIsVerifying(false);
      
      // Feedback tátil (vibration) se disponível
      if ('vibrate' in navigator) {
        navigator.vibrate(200);
      }
    }
  };

  useEffect(() => {
    if (pin.length === 4) {
      handleVerify();
    }
  }, [pin]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[20000] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
        onClick={onClose}
      />
      
      <motion.div 
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 20 }}
        className="relative w-full max-w-xs bg-white rounded-[2rem] shadow-2xl overflow-hidden border border-slate-200"
      >
        <div className="p-6 text-center">
          <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-emerald-100 shadow-sm">
            <Lock size={24} />
          </div>
          
          <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight leading-tight mb-1">
            {title}
          </h3>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-relaxed px-4">
            {description}
          </p>
          
          <div className="mt-8 flex justify-center space-x-3">
            {[0, 1, 2, 3].map((i) => (
              <div 
                key={i}
                className={`w-4 h-4 rounded-full border-2 transition-all duration-300 ${
                  pin.length > i 
                    ? 'bg-emerald-500 border-emerald-500 scale-110 shadow-[0_0_10px_rgba(16,185,129,0.4)]' 
                    : 'bg-transparent border-slate-200'
                } ${error ? 'border-red-500 bg-red-50' : ''}`}
              />
            ))}
          </div>
          
          {error && (
            <motion.div 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-4 flex items-center justify-center space-x-1.5 text-red-500"
            >
              <AlertTriangle size={12} />
              <span className="text-[9px] font-black uppercase tracking-widest">{error}</span>
            </motion.div>
          )}
          
          <div className="mt-8 grid grid-cols-3 gap-3">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
              <button
                key={num}
                onClick={() => handleNumberClick(num)}
                disabled={isVerifying}
                className="h-14 bg-slate-50 border border-slate-100 rounded-2xl text-xl font-black text-slate-700 active:bg-emerald-500 active:text-white active:scale-95 transition-all flex items-center justify-center shadow-sm"
              >
                {num}
              </button>
            ))}
            <div />
            <button
              onClick={() => handleNumberClick('0')}
              disabled={isVerifying}
              className="h-14 bg-slate-50 border border-slate-100 rounded-2xl text-xl font-black text-slate-700 active:bg-emerald-500 active:text-white active:scale-95 transition-all flex items-center justify-center shadow-sm"
            >
              0
            </button>
            <button
              onClick={handleDelete}
              disabled={isVerifying}
              className="h-14 bg-red-50 border border-red-100 rounded-2xl text-red-500 active:bg-red-500 active:text-white active:scale-95 transition-all flex items-center justify-center shadow-sm"
            >
              <Delete size={20} />
            </button>
          </div>
          
          <button 
            onClick={onClose}
            className="mt-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] hover:text-slate-600 transition-colors"
          >
            Cancelar Operação
          </button>
        </div>
        
        {isVerifying && (
          <div className="absolute inset-0 bg-white/60 backdrop-blur-[1px] flex flex-col items-center justify-center z-10">
            <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-3" />
            <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Validando...</span>
          </div>
        )}
      </motion.div>
    </div>
  );
};

export default SecurityPinModal;
