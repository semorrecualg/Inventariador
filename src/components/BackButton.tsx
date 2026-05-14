
import React from 'react';
import { ArrowLeft } from 'lucide-react';

interface BackButtonProps {
  onClick: () => void;
  label?: string;
  subLabel?: string;
}

const BackButton: React.FC<BackButtonProps> = ({ onClick, label, subLabel }) => {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 group active:scale-95 transition-all duration-200"
      aria-label="Voltar"
    >
      <div className="w-10 h-10 rounded-xl bg-white border-2 border-indigo-600 flex items-center justify-center text-indigo-600 shadow-sm group-hover:bg-indigo-50 transition-colors">
        <ArrowLeft size={20} strokeWidth={2.5} />
      </div>
      {(label || subLabel) && (
        <div className="flex flex-col items-start">
          {label && (
            <span className="text-sm font-black text-slate-900 uppercase tracking-tight leading-none">
              {label}
            </span>
          )}
          {subLabel && (
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none mt-1">
              {subLabel}
            </span>
          )}
        </div>
      )}
    </button>
  );
};

export default BackButton;
