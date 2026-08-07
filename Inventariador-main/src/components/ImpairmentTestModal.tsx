
import React, { useState, useEffect } from 'react';
import { Asset } from '../types';
import { AlertCircle, Calculator, CheckCircle2, DollarSign, TrendingDown } from 'lucide-react';
import { motion } from 'motion/react';

interface ImpairmentTestModalProps {
  isOpen: boolean;
  onClose: () => void;
  asset: Asset;
  onSave: (updatedAsset: Asset) => void;
}

const ImpairmentTestModal: React.FC<ImpairmentTestModalProps> = ({ isOpen, onClose, asset, onSave }) => {
  const [justValue, setJustValue] = useState<number>(Number(asset._valor_justo || 0));
  const [useValue, setUseValue] = useState<number>(Number(asset._valor_em_uso || 0));
  const [netBookValue, setNetBookValue] = useState<number>(0);
  
  // Cálculo automático do Valor Recuperável (Maior entre Justo e Uso)
  const recoverableValue = Math.max(justValue, useValue);
  
  // Cálculo da Perda (VCL - Recuperável)
  const impairmentLoss = Math.max(0, netBookValue - recoverableValue);

  useEffect(() => {
    // Simulação de VCL atual (Valor de Aquisição - Depreciação Acumulada)
    const v0 = Number(asset._valor_aquisicao || asset.vlraquisic || 0);
    const depr = Number(asset._depreciacao_acumulada || 0);
    setNetBookValue(v0 - depr);
  }, [asset]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[1000] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-2xl overflow-hidden border border-slate-100"
      >
        <div className="bg-slate-900 p-8 text-white">
          <div className="flex items-center gap-4 mb-2">
            <div className="p-2 bg-amber-500 rounded-xl">
              <TrendingDown className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-black uppercase tracking-tight">Teste de Recuperabilidade</h2>
              <p className="text-[10px] text-slate-400 uppercase font-black tracking-[0.2em]">CPC 01 (R1) / IAS 36 - Impairment</p>
            </div>
          </div>
          <div className="mt-4 p-4 bg-white/5 rounded-2xl border border-white/10">
            <p className="text-xs font-bold text-slate-300 uppercase tracking-widest mb-1">Ativo Selecionado</p>
            <p className="text-sm font-black text-white">{asset.etiqueta} - {asset.descricaodoativo}</p>
          </div>
        </div>

        <div className="p-8 space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Valor Justo Líquido (R$)</label>
              <div className="relative">
                <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input 
                  type="number" 
                  value={justValue}
                  onChange={(e) => setJustValue(Number(e.target.value))}
                  className="w-full pl-12 pr-4 py-4 bg-slate-50 border-none rounded-2xl text-sm font-bold focus:ring-2 focus:ring-amber-500 transition-all"
                  placeholder="0,00"
                />
              </div>
              <p className="text-[9px] text-slate-400 italic px-1">Valor de venda menos despesas de alienação.</p>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Valor em Uso (R$)</label>
              <div className="relative">
                <Calculator className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input 
                  type="number" 
                  value={useValue}
                  onChange={(e) => setUseValue(Number(e.target.value))}
                  className="w-full pl-12 pr-4 py-4 bg-slate-50 border-none rounded-2xl text-sm font-bold focus:ring-2 focus:ring-amber-500 transition-all"
                  placeholder="0,00"
                />
              </div>
              <p className="text-[9px] text-slate-400 italic px-1">Valor presente dos fluxos de caixa futuros.</p>
            </div>
          </div>

          <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 uppercase">Valor Contábil Líquido (VCL)</span>
              <span className="text-sm font-black text-slate-900">
                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(netBookValue)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 uppercase">Valor Recuperável (Maior)</span>
              <span className="text-sm font-black text-blue-600">
                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(recoverableValue)}
              </span>
            </div>
            <div className="pt-4 border-t border-slate-200 flex items-center justify-between">
              <span className="text-sm font-black text-slate-900 uppercase tracking-tight">Perda por Impairment</span>
              <span className={`text-lg font-black ${impairmentLoss > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(impairmentLoss)}
              </span>
            </div>
          </div>

          {impairmentLoss > 0 ? (
            <div className="p-4 bg-rose-50 border border-rose-100 rounded-2xl flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold text-rose-900 uppercase">Ajuste Necessário</p>
                <p className="text-[10px] text-rose-700 font-medium">O valor contábil excede o valor recuperável. Uma provisão para perda deve ser registrada conforme CPC 01.</p>
              </div>
            </div>
          ) : (
            <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-2xl flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold text-emerald-900 uppercase">Ativo Saudável</p>
                <p className="text-[10px] text-emerald-700 font-medium">O valor recuperável é superior ao valor contábil. Nenhuma perda precisa ser reconhecida neste período.</p>
              </div>
            </div>
          )}

          <div className="flex items-center gap-4 pt-4">
            <button 
              onClick={onClose}
              className="flex-1 px-6 py-4 bg-slate-100 text-slate-600 rounded-2xl text-sm font-black uppercase tracking-widest hover:bg-slate-200 transition-all"
            >
              Cancelar
            </button>
            <button 
              onClick={() => {
                onSave({
                  ...asset,
                  _valor_justo: justValue,
                  _valor_em_uso: useValue,
                  _valor_recuperavel: recoverableValue,
                  _perda_impairment: impairmentLoss,
                  _data_impairment: new Date().toISOString()
                });
                onClose();
              }}
              className="flex-1 px-6 py-4 bg-slate-900 text-white rounded-2xl text-sm font-black uppercase tracking-widest hover:bg-black transition-all shadow-xl shadow-slate-200"
            >
              Confirmar Teste
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default ImpairmentTestModal;
