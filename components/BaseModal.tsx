
import React from 'react';
import { X } from 'lucide-react';

interface BaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  maxWidth?: string;
}

const BaseModal: React.FC<BaseModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  maxWidth = 'max-w-lg'
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-6 bg-slate-900/80 backdrop-blur-sm animate-fadeIn">
      <div className={`w-full ${maxWidth} bg-white rounded-[2.5rem] overflow-hidden shadow-2xl animate-scaleIn border border-slate-200 flex flex-col max-h-[90vh]`}>
        <div className="p-8 flex items-center justify-between border-b bg-slate-50">
          <h3 className="text-xl font-bold text-slate-900 uppercase tracking-tight">{title}</h3>
          <button 
            onClick={onClose}
            className="p-3 bg-white border border-slate-200 rounded-2xl text-slate-400 hover:text-slate-900 transition-all shadow-sm active:scale-90"
          >
            <X size={20} />
          </button>
        </div>
        
        <div className="p-8 overflow-y-auto custom-scrollbar">
          {children}
        </div>
      </div>
    </div>
  );
};

export default BaseModal;
