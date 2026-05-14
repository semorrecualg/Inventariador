
import React from 'react';
import { motion } from 'motion/react';
import { 
  Palette, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  PlusCircle, 
  Database, 
  Cloud,
  Shield,
  Layout,
  Info,
  Calculator
} from 'lucide-react';

interface ColorSectionProps {
  title: string;
  description: string;
  colors: {
    name: string;
    variable: string;
    hex: string;
    icon?: React.ReactNode;
    rule?: string;
  }[];
}

const ColorSection: React.FC<ColorSectionProps> = ({ title, description, colors }) => (
  <div className="mb-10">
    <div className="flex items-center space-x-3 mb-4">
      <div className="w-8 h-8 bg-accent/10 rounded-lg flex items-center justify-center text-accent">
        <Palette size={18} />
      </div>
      <div>
        <h3 className="text-lg font-bold text-ink tracking-tight uppercase">{title}</h3>
        <p className="text-[10px] font-bold text-ink-muted uppercase tracking-widest">{description}</p>
      </div>
    </div>
    
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {colors.map((color, idx) => (
        <motion.div 
          key={idx}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: idx * 0.05 }}
          className="bg-white border border-border rounded-2xl p-4 flex items-start space-x-4 hover:shadow-lg transition-all"
        >
          <div 
            className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 shadow-sm"
            style={{ backgroundColor: color.hex }}
          >
            {color.icon && <div className="text-white">{color.icon}</div>}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1">
              <p className="text-sm font-bold text-ink truncate">{color.name}</p>
              <span className="text-[9px] font-mono text-ink-muted bg-bg-main px-1.5 py-0.5 rounded uppercase">{color.hex}</span>
            </div>
            <p className="text-[10px] font-bold text-ink-muted uppercase tracking-widest mb-2">{color.variable}</p>
            {color.rule && (
              <div className="flex items-start space-x-1.5 bg-bg-main/50 p-2 rounded-lg border border-border/50">
                <Info size={12} className="text-accent shrink-0 mt-0.5" />
                <p className="text-[10px] text-ink-muted leading-relaxed italic">{color.rule}</p>
              </div>
            )}
          </div>
        </motion.div>
      ))}
    </div>
  </div>
);

const ThemePalette: React.FC = () => {
  const phaseColors = [
    { name: 'Welcome', variable: '--color-phase-welcome', hex: '#0284C7', icon: <Layout size={20} />, rule: 'Utilizado na tela inicial e introdução do onboarding.' },
    { name: 'Internal', variable: '--color-phase-internal', hex: '#3B82F6', icon: <Shield size={20} />, rule: 'Indica configurações de banco de dados local e segurança.' },
    { name: 'Supabase', variable: '--color-phase-supabase', hex: '#10B981', icon: <Cloud size={20} />, rule: 'Representa a conexão e sincronização com a nuvem.' },
    { name: 'Data', variable: '--color-phase-data', hex: '#F59E0B', icon: <Database size={20} />, rule: 'Fase de processamento, carga e validação de dados.' },
  ];

  const moduleColors = [
    { name: 'Inventariador', variable: '--color-mod-inventory', hex: '#0284C7', icon: <CheckCircle2 size={20} />, rule: 'Módulo de campo focado em auditoria física e geolocalização.' },
    { name: 'Controle Ativo', variable: '--color-mod-control', hex: '#EA580C', icon: <Calculator size={20} />, rule: 'Módulo contábil focado em cálculos e relatórios fiscais.' },
  ];

  const tagColors = [
    { name: 'Pendente', variable: '--color-tag-pending', hex: '#64748B', icon: <Clock size={20} />, rule: 'Itens que ainda não foram auditados no ciclo atual.' },
    { name: 'Conferido', variable: '--color-tag-checked', hex: '#10B981', icon: <CheckCircle2 size={20} />, rule: 'Itens validados sem divergências encontradas.' },
    { name: 'Divergência', variable: '--color-tag-divergence', hex: '#EF4444', icon: <AlertCircle size={20} />, rule: 'Itens com inconsistências entre o físico e o contábil.' },
    { name: 'Novo Item', variable: '--color-tag-new', hex: '#3B82F6', icon: <PlusCircle size={20} />, rule: 'Bens localizados no físico mas inexistentes na base contábil.' },
  ];

  const stateColors = [
    { name: 'Novo', variable: '--color-state-new', hex: '#10B981', rule: 'Bem em estado de novo, sem sinais de uso.' },
    { name: 'Bom', variable: '--color-state-good', hex: '#3B82F6', rule: 'Bem conservado, operando em condições normais.' },
    { name: 'Recuperável', variable: '--color-state-repair', hex: '#F59E0B', rule: 'Necessita manutenção para retornar à operação plena.' },
    { name: 'Inservível', variable: '--color-state-useless', hex: '#EF4444', rule: 'Bem sem condições de uso ou recuperação econômica.' },
  ];

  return (
    <div className="max-w-6xl mx-auto p-6 animate-fadeIn">
      <div className="mb-12 text-center">
        <h2 className="text-3xl font-bold text-ink mb-2 tracking-tight uppercase">Guia Visual de Cores e Regras</h2>
        <p className="text-ink-muted uppercase font-bold text-xs tracking-[0.2em]">Padronização Visual GBR v24.50</p>
      </div>

      <ColorSection 
        title="Fases do Onboarding" 
        description="Cores que guiam o usuário através do processo de configuração inicial."
        colors={phaseColors} 
      />

      <ColorSection 
        title="Módulos do Sistema" 
        description="Diferenciação visual entre as áreas de atuação do sistema."
        colors={moduleColors} 
      />

      <ColorSection 
        title="Status de Inventário (Tags)" 
        description="Cores críticas para identificação rápida do progresso da auditoria."
        colors={tagColors} 
      />

      <ColorSection 
        title="Estado de Conservação" 
        description="Classificação física do bem conforme normas de auditoria."
        colors={stateColors} 
      />

      <div className="mt-12 p-8 bg-accent/5 border border-accent/10 rounded-[2.5rem] text-center">
        <p className="text-xs text-ink-muted leading-relaxed max-w-2xl mx-auto italic">
          &quot;A padronização visual garante que o auditor identifique instantaneamente o status de um bem ou a fase de um processo, reduzindo erros operacionais e aumentando a velocidade de execução em campo.&quot;
        </p>
      </div>
    </div>
  );
};

export default ThemePalette;
