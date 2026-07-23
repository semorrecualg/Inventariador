
import React from 'react';
import { Sparkles, ArrowRight } from 'lucide-react';
import { motion } from 'motion/react';

interface AIInsightCardProps {
  title: string;
  suggestion: string;
  onAction: () => void;
  actionLabel: string;
}

const AIInsightCard: React.FC<AIInsightCardProps> = ({ title, suggestion, onAction, actionLabel }) => {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-[#F0F9FF] border border-[#BAE6FD] rounded-2xl p-5 mb-6 shadow-sm relative overflow-hidden"
    >
      <div className="flex items-start space-x-3 relative z-10">
        <div className="p-2 bg-white rounded-xl shadow-sm">
          <Sparkles className="text-ai-end w-5 h-5" />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-bold text-ink mb-1 flex items-center">
            {title}
          </h3>
          <p className="text-xs text-ink-muted leading-relaxed mb-4">
            {suggestion}
          </p>
          <button 
            onClick={onAction}
            className="ai-gradient px-4 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-widest flex items-center space-x-2 active:scale-95 transition-all shadow-lg shadow-ai-start/20"
          >
            <span>{actionLabel}</span>
            <ArrowRight size={14} />
          </button>
        </div>
      </div>
      
      {/* Decorative elements */}
      <div className="absolute top-0 right-0 w-24 h-24 bg-ai-start/5 rounded-full -mr-12 -mt-12 blur-2xl" />
    </motion.div>
  );
};

export default AIInsightCard;
