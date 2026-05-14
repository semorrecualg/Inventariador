
import React, { useMemo } from 'react';
import { Asset } from '../types';
import { calculateDepreciation, generateDepreciationSchedule } from '../services/depreciationService';
import { 
  FileText, 
  Calendar, 
  DollarSign, 
  TrendingDown, 
  PieChart, 
  ArrowLeft,
  Printer
} from 'lucide-react';

interface AssetLedgerProps {
  asset: Asset;
  onBack: () => void;
}

const AssetLedger: React.FC<AssetLedgerProps> = ({ asset, onBack }) => {
  const deprInfo = useMemo(() => calculateDepreciation(asset), [asset]);
  const schedule = useMemo(() => generateDepreciationSchedule(asset), [asset]);

  const formatCurrency = (val: number) => 
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

  return (
    <div className="bg-white rounded-3xl shadow-xl border border-slate-100 overflow-hidden animate-fadeIn">
      {/* Header */}
      <div className="bg-slate-900 p-6 text-white flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="p-2 hover:bg-white/10 rounded-xl transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-lg font-bold uppercase tracking-tight">Ficha do Ativo Imobilizado</h2>
            <p className="text-[10px] text-slate-400 uppercase font-black tracking-[0.2em]">Controle Contábil - CPC 27</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => window.print()} className="p-2 bg-white/10 hover:bg-white/20 rounded-xl transition-colors">
            <Printer className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="p-8 space-y-8">
        {/* Resumo Principal */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-emerald-100 text-emerald-600 rounded-lg">
                <DollarSign className="w-5 h-5" />
              </div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Valor de Aquisição</span>
            </div>
            <div className="text-2xl font-black text-slate-900">{formatCurrency(Number(asset._valor_aquisicao || asset.VLRAQUISIC || 0))}</div>
            <div className="mt-2 text-[10px] text-slate-500 font-bold uppercase">Data: {asset._data_aquisicao || asset.DATAAQUISIC || '-'}</div>
          </div>

          <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-rose-100 text-rose-600 rounded-lg">
                <TrendingDown className="w-5 h-5" />
              </div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Depreciação Acumulada</span>
            </div>
            <div className="text-2xl font-black text-rose-600">{formatCurrency(deprInfo.accumulatedDepreciation)}</div>
            <div className="mt-2 text-[10px] text-slate-500 font-bold uppercase">Meses Decorridos: {deprInfo.monthsElapsed}</div>
          </div>

          <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-blue-100 text-blue-600 rounded-lg">
                <PieChart className="w-5 h-5" />
              </div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Valor Contábil Líquido</span>
            </div>
            <div className="text-2xl font-black text-emerald-600">{formatCurrency(deprInfo.netBookValue)}</div>
            <div className="mt-2 text-[10px] text-slate-500 font-bold uppercase">Status: {deprInfo.isFullyDepreciated ? 'TOTALMENTE DEPRECIADO' : 'EM DEPRECIAÇÃO'}</div>
          </div>
        </div>

        {/* Detalhes Técnicos */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="space-y-6">
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
              <FileText className="w-4 h-4 text-emerald-600" />
              Dados Cadastrais
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-white border border-slate-100 rounded-xl">
                <p className="text-[9px] font-bold text-slate-400 uppercase mb-1">Etiqueta</p>
                <p className="text-sm font-black text-slate-800">{asset.ETIQUETA || '---'}</p>
              </div>
              <div className="p-4 bg-white border border-slate-100 rounded-xl">
                <p className="text-[9px] font-bold text-slate-400 uppercase mb-1">Registro</p>
                <p className="text-sm font-black text-slate-800">{asset.REGISTRO || '---'}</p>
              </div>
              <div className="p-4 bg-white border border-slate-100 rounded-xl col-span-2">
                <p className="text-[9px] font-bold text-slate-400 uppercase mb-1">Descrição</p>
                <p className="text-xs font-bold text-slate-700 uppercase">{asset.DESCRICAODOATIVO || '---'}</p>
              </div>
              <div className="p-4 bg-white border border-slate-100 rounded-xl">
                <p className="text-[9px] font-bold text-slate-400 uppercase mb-1">Conta Contábil</p>
                <p className="text-sm font-black text-slate-800">{asset._conta_contabil || asset.CONTACONTABIL || '---'}</p>
              </div>
              <div className="p-4 bg-white border border-slate-100 rounded-xl">
                <p className="text-[9px] font-bold text-slate-400 uppercase mb-1">Unidade Operacional</p>
                <p className="text-sm font-black text-slate-800">{asset._unidade_operacional || asset.UNIDADE_OPERACIONAL || '---'}</p>
              </div>
              <div className="p-4 bg-white border border-slate-100 rounded-xl">
                <p className="text-[9px] font-bold text-slate-400 uppercase mb-1">Centro de Custo</p>
                <p className="text-sm font-black text-slate-800">{asset._centro_custo || asset.CENTRODECUSTO || '---'}</p>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
              <Calendar className="w-4 h-4 text-emerald-600" />
              Parâmetros de Depreciação
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-white border border-slate-100 rounded-xl">
                <p className="text-[9px] font-bold text-slate-400 uppercase mb-1">Vida Útil (Meses)</p>
                <p className="text-sm font-black text-slate-800">{asset._vida_util_meses || 60} meses</p>
              </div>
              <div className="p-4 bg-white border border-slate-100 rounded-xl">
                <p className="text-[9px] font-bold text-slate-400 uppercase mb-1">Valor Residual</p>
                <p className="text-sm font-black text-slate-800">{formatCurrency(Number(asset._valor_residual || 0))}</p>
              </div>
              <div className="p-4 bg-white border border-slate-100 rounded-xl">
                <p className="text-[9px] font-bold text-slate-400 uppercase mb-1">Quota Mensal</p>
                <p className="text-sm font-black text-emerald-600">{formatCurrency(deprInfo.monthlyQuota)}</p>
              </div>
              <div className="p-4 bg-white border border-slate-100 rounded-xl">
                <p className="text-[9px] font-bold text-slate-400 uppercase mb-1">Início Depreciação</p>
                <p className="text-sm font-black text-slate-800">{asset._data_inicio_depreciacao || asset._data_aquisicao || asset.DATAAQUISIC || '---'}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Tabela de Projeção */}
        <div className="space-y-4">
          <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
            <TrendingDown className="w-4 h-4 text-emerald-600" />
            Cronograma de Depreciação (Próximos Meses)
          </h3>
          <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50">
                  <th className="px-6 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">Mês/Ano</th>
                  <th className="px-6 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">Quota Mensal</th>
                  <th className="px-6 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">Depr. Acumulada</th>
                  <th className="px-6 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">VCL</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {schedule.slice(0, 12).map((item, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-3 text-xs font-bold text-slate-700">{String(item.month).padStart(2, '0')}/{item.year}</td>
                    <td className="px-6 py-3 text-xs font-medium text-slate-600">{formatCurrency(item.quota)}</td>
                    <td className="px-6 py-3 text-xs font-medium text-rose-500">{formatCurrency(item.accumulated)}</td>
                    <td className="px-6 py-3 text-xs font-black text-emerald-600">{formatCurrency(item.vcl)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="p-4 bg-slate-50 text-center">
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Exibindo os primeiros 12 meses da projeção</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AssetLedger;
