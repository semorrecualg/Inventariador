import React, { useState, useMemo } from 'react';
import { NCMClassifier } from '../types';
import { Plus, Edit2, Trash2, Save, X, Search, FileText } from 'lucide-react';

interface NCMClassifierTableProps {
  classifiers: NCMClassifier[];
  onSave: (classifier: Partial<NCMClassifier>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

const NCMClassifierTable: React.FC<NCMClassifierTableProps> = ({ 
  classifiers, 
  onSave, 
  onDelete
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<NCMClassifier>>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  const handleStartEdit = (cls: NCMClassifier) => {
    setEditingId(cls.id);
    setEditForm(cls);
  };

  const handleCancel = () => {
    setEditingId(null);
    setEditForm({});
    setIsAdding(false);
  };

  const handleSave = async () => {
    if (!editForm.ncm_code || !editForm.description || !editForm.group_code) {
      alert('Preencha os campos obrigatórios (NCM, Descrição e Grupo)');
      return;
    }
    await onSave(editForm);
    handleCancel();
  };

  const filteredClassifiers = useMemo(() => {
    return classifiers.filter(c => 
      c.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.ncm_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.group_code.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [classifiers, searchTerm]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
          <input 
            type="text"
            placeholder="Buscar por NCM, descrição ou grupo..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
          />
        </div>
        <button 
          onClick={() => {
            setIsAdding(true);
            setEditForm({
              ncm_code: '',
              description: '',
              group_code: '',
              annual_depreciation_rate: 10,
              useful_life_months: 120
            });
          }}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700 transition-all shadow-md"
        >
          <Plus className="w-4 h-4" />
          <span>Novo Classificador</span>
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Código NCM</th>
              <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Descrição do Bem</th>
              <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Grupo (4)</th>
              <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Taxa Anual (%)</th>
              <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Vida Útil (Meses)</th>
              <th className="px-6 py-4 text-right text-[10px] font-bold text-slate-400 uppercase tracking-widest">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isAdding && (
              <tr className="bg-emerald-50/30">
                <td className="px-6 py-3">
                  <input 
                    type="text"
                    value={editForm.ncm_code || ''}
                    onChange={(e) => setEditForm({...editForm, ncm_code: e.target.value})}
                    className="w-full px-2 py-1 border border-emerald-200 rounded-lg text-sm"
                    placeholder="0000.00.00"
                  />
                </td>
                <td className="px-6 py-3">
                  <input 
                    type="text"
                    value={editForm.description || ''}
                    onChange={(e) => setEditForm({...editForm, description: e.target.value})}
                    className="w-full px-2 py-1 border border-emerald-200 rounded-lg text-sm"
                    placeholder="Descrição do Ativo"
                  />
                </td>
                <td className="px-6 py-3">
                  <input 
                    type="text"
                    maxLength={4}
                    value={editForm.group_code || ''}
                    onChange={(e) => setEditForm({...editForm, group_code: e.target.value.replace(/\D/g, '')})}
                    className="w-20 px-2 py-1 border border-emerald-200 rounded-lg text-sm"
                    placeholder="0000"
                  />
                </td>
                <td className="px-6 py-3">
                  <input 
                    type="number"
                    value={editForm.annual_depreciation_rate || ''}
                    onChange={(e) => {
                      const rate = Number(e.target.value);
                      setEditForm({
                        ...editForm, 
                        annual_depreciation_rate: rate,
                        useful_life_months: rate > 0 ? Math.round(1200 / rate) : 0
                      });
                    }}
                    className="w-20 px-2 py-1 border border-emerald-200 rounded-lg text-sm"
                  />
                </td>
                <td className="px-6 py-3">
                  <input 
                    type="number"
                    value={editForm.useful_life_months || ''}
                    onChange={(e) => setEditForm({...editForm, useful_life_months: Number(e.target.value)})}
                    className="w-20 px-2 py-1 border border-emerald-200 rounded-lg text-sm"
                  />
                </td>
                <td className="px-6 py-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <button onClick={handleSave} className="p-1.5 text-emerald-600 hover:bg-emerald-100 rounded-lg transition-colors">
                      <Save className="w-4 h-4" />
                    </button>
                    <button onClick={handleCancel} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg transition-colors">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            )}

            {filteredClassifiers.map(cls => (
              <tr key={cls.id} className="hover:bg-slate-50 transition-colors">
                {editingId === cls.id ? (
                  <>
                    <td className="px-6 py-3">
                      <input 
                        type="text"
                        value={editForm.ncm_code || ''}
                        onChange={(e) => setEditForm({...editForm, ncm_code: e.target.value})}
                        className="w-full px-2 py-1 border border-emerald-200 rounded-lg text-sm"
                      />
                    </td>
                    <td className="px-6 py-3">
                      <input 
                        type="text"
                        value={editForm.description || ''}
                        onChange={(e) => setEditForm({...editForm, description: e.target.value})}
                        className="w-full px-2 py-1 border border-emerald-200 rounded-lg text-sm"
                      />
                    </td>
                    <td className="px-6 py-3">
                      <input 
                        type="text"
                        maxLength={4}
                        value={editForm.group_code || ''}
                        onChange={(e) => setEditForm({...editForm, group_code: e.target.value.replace(/\D/g, '')})}
                        className="w-20 px-2 py-1 border border-emerald-200 rounded-lg text-sm"
                      />
                    </td>
                    <td className="px-6 py-3">
                      <input 
                        type="number"
                        value={editForm.annual_depreciation_rate || ''}
                        onChange={(e) => {
                          const rate = Number(e.target.value);
                          setEditForm({
                            ...editForm, 
                            annual_depreciation_rate: rate,
                            useful_life_months: rate > 0 ? Math.round(1200 / rate) : 0
                          });
                        }}
                        className="w-20 px-2 py-1 border border-emerald-200 rounded-lg text-sm"
                      />
                    </td>
                    <td className="px-6 py-3">
                      <input 
                        type="number"
                        value={editForm.useful_life_months || ''}
                        onChange={(e) => setEditForm({...editForm, useful_life_months: Number(e.target.value)})}
                        className="w-20 px-2 py-1 border border-emerald-200 rounded-lg text-sm"
                      />
                    </td>
                    <td className="px-6 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={handleSave} className="p-1.5 text-emerald-600 hover:bg-emerald-100 rounded-lg transition-colors">
                          <Save className="w-4 h-4" />
                        </button>
                        <button onClick={handleCancel} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg transition-colors">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="px-6 py-4 text-sm font-mono text-slate-700">{cls.ncm_code}</td>
                    <td className="px-6 py-4 text-sm font-medium text-slate-700">{cls.description}</td>
                    <td className="px-6 py-4">
                      <span className="px-2 py-1 bg-slate-100 text-slate-600 rounded-md text-[10px] font-bold">
                        {cls.group_code}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600 font-bold">{cls.annual_depreciation_rate}%</td>
                    <td className="px-6 py-4 text-sm text-slate-500">{cls.useful_life_months} meses</td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => handleStartEdit(cls)} className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors">
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button onClick={() => onDelete(cls.id)} className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-100">
        <div className="flex items-start gap-3">
          <FileText className="w-5 h-5 text-emerald-500 mt-0.5" />
          <div className="text-xs text-slate-600 leading-relaxed">
            <p className="font-bold text-emerald-700 mb-1">Classificação Automática por NCM:</p>
            <p>O código NCM (Nomenclatura Comum do Mercosul) permite classificar automaticamente os ativos importados via Nota Fiscal, vinculando-os ao grupo contábil e taxas de depreciação corretas.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NCMClassifierTable;
