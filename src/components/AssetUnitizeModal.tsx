
import React, { useState } from 'react';
import { Asset } from '../types';
import { motion } from 'framer-motion';
import { Layers, Info } from 'lucide-react';

interface AssetUnitizeModalProps {
  isOpen: boolean;
  onClose: () => void;
  asset: Asset;
  onConfirm: (numberOfUnits: number, percentages?: number[]) => void;
}

const AssetUnitizeModal: React.FC<AssetUnitizeModalProps> = ({ isOpen, onClose, asset, onConfirm }) => {
  const [units, setUnits] = useState(2);
  const [method, setMethod] = useState<'EQUAL' | 'PERCENT'>('EQUAL');
  const [percentages, setPercentages] = useState<number[]>([]);

  if (!isOpen) return null;

  const handleUnitChange = (val: number) => {
    const n = Math.max(2, Math.min(50, val));
    setUnits(n);
    setPercentages(new Array(n).fill(Math.floor(100 / n)));
  };

  const handlePercentageChange = (idx: number, val: number) => {
    const newPcts = [...percentages];
    newPcts[idx] = val;
    setPercentages(newPcts);
  };

  const totalPct = percentages.reduce((a, b) => a + b, 0);

  return (
    <div className="fixed inset-0 z-[1000] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-xl overflow-hidden border border-slate-100"
      >
        <div className="bg-emerald-600 p-8 text-white">
          <div className="flex items-center gap-4 mb-2">
            <div className="p-2 bg-white/20 rounded-xl">
              <Layers className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-black uppercase tracking-tight">Unitarização Contábil</h2>
              <p className="text-[10px] text-emerald-100 uppercase font-black tracking-[0.2em]">Desmembramento de Ativo - CPC 27</p>
            </div>
          </div>
          <div className="mt-4 p-4 bg-white/10 rounded-2xl border border-white/10">
            <p className="text-[10px] font-bold text-emerald-100 uppercase tracking-widest mb-1">Ativo Pai</p>
            <p className="text-sm font-black text-white">{asset.ETIQUETA} - {asset.DESCRICAODOATIVO}</p>
            <p className="text-[10px] font-bold text-emerald-200 mt-1">Valor Total: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(asset._valor_aquisicao || asset.VLRAQUISIC || 0))}</p>
          </div>
        </div>

        <div className="p-8 space-y-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Número de Unidades</label>
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => handleUnitChange(units - 1)}
                  className="w-8 h-8 flex items-center justify-center bg-slate-100 rounded-lg text-slate-600 font-bold hover:bg-slate-200"
                >
                  -
                </button>
                <span className="text-lg font-black text-slate-800 w-8 text-center">{units}</span>
                <button 
                  onClick={() => handleUnitChange(units + 1)}
                  className="w-8 h-8 flex items-center justify-center bg-slate-100 rounded-lg text-slate-600 font-bold hover:bg-slate-200"
                >
                  +
                </button>
              </div>
            </div>

            <div className="flex p-1 bg-slate-100 rounded-xl">
              <button 
                onClick={() => setMethod('EQUAL')}
                className={`flex-1 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${method === 'EQUAL' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500'}`}
              >
                Rateio Igual
              </button>
              <button 
                onClick={() => setMethod('PERCENT')}
                className={`flex-1 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${method === 'PERCENT' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500'}`}
              >
                Por Percentual
              </button>
            </div>
          </div>

          {method === 'PERCENT' && (
            <div className="space-y-3 max-h-40 overflow-y-auto pr-2 scrollbar-hide">
              {percentages.map((pct, idx) => (
                <div key={idx} className="flex items-center justify-between gap-4 p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="text-[10px] font-bold text-slate-500 uppercase">Unidade {idx + 1}</span>
                  <div className="flex items-center gap-2">
                    <input 
                      type="number" 
                      value={pct}
                      onChange={(e) => handlePercentageChange(idx, Number(e.target.value))}
                      className="w-16 px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs font-bold text-right focus:ring-2 focus:ring-emerald-500 outline-none"
                    />
                    <span className="text-xs font-bold text-slate-400">%</span>
                  </div>
                </div>
              ))}
              <div className={`p-3 rounded-xl flex items-center justify-between ${totalPct === 100 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                <span className="text-[10px] font-black uppercase tracking-widest">Total</span>
                <span className="text-xs font-black">{totalPct}%</span>
              </div>
            </div>
          )}

          <div className="p-4 bg-blue-50 border border-blue-100 rounded-2xl flex items-start gap-3">
            <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
            <p className="text-[10px] text-blue-700 font-medium leading-relaxed">
              O sistema irá gerar {units} novos registros e marcar o ativo original como &quot;Unitarizado&quot;. 
              Os valores de aquisição, residual e depreciação acumulada serão rateados automaticamente.
            </p>
          </div>

          <div className="flex items-center gap-4 pt-2">
            <button 
              onClick={onClose}
              className="flex-1 px-6 py-4 bg-slate-100 text-slate-600 rounded-2xl text-sm font-black uppercase tracking-widest hover:bg-slate-200 transition-all"
            >
              Cancelar
            </button>
            <button 
              disabled={method === 'PERCENT' && totalPct !== 100}
              onClick={() => {
                onConfirm(units, method === 'PERCENT' ? percentages : undefined);
                onClose();
              }}
              className="flex-1 px-6 py-4 bg-emerald-600 text-white rounded-2xl text-sm font-black uppercase tracking-widest hover:bg-emerald-700 transition-all shadow-xl shadow-emerald-100 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Confirmar
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default AssetUnitizeModal;
