import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  BookOpen, 
  Target, 
  Camera, 
  Plane, 
  Layers, 
  Activity, 
  X, 
  CheckCircle2,
  AlertTriangle,
  Lightbulb,
  GraduationCap,
  ChevronRight,
  RefreshCcw,
  ShieldCheck
} from 'lucide-react';

interface POPGuideProps {
  isOpen: boolean;
  onClose: () => void;
  onCertified?: () => void;
}

const POPGuide: React.FC<POPGuideProps> = ({ isOpen, onClose, onCertified }) => {
  const [showQuiz, setShowQuiz] = useState(false);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [quizResult, setQuizResult] = useState<'success' | 'failure' | null>(null);

  const quizQuestions = [
    {
      id: 1,
      question: "Para o Mapa Patrimonial ser preciso, onde você deve começar o 'bip' em uma sala?",
      options: [
        "Pelo centro da sala, para irradiar a posição.",
        "Pelos cantos/extremidades (vértices) do ambiente.",
        "Por qualquer ativo, a ordem não importa.",
        "Apenas pelos ativos mais caros."
      ],
      correct: 1,
      feedback: "Lembre-se da Técnica dos Vértices: bipar os cantos ajuda o algoritmo a desenhar o perímetro real."
    },
    {
      id: 2,
      question: "Qual o requisito técnico para que o botão 'Salvar' seja liberado no app?",
      options: [
        "Apenas preencher a descrição do bem.",
        "Ter internet 5G ativa no momento.",
        "Confirmação do OCR (leitura da foto) + Posição Indoor.",
        "Digitar o serial manualmente 3 vezes."
      ],
      correct: 2,
      feedback: "A Prova de Vida exige OCR e Localização para garantir que você está fisicamente no local."
    },
    {
      id: 3,
      question: "O que acontece se você trocar de andar e não ajustar o 'Seletor de Nível'?",
      options: [
        "Os ativos aparecerão sobrepostos (ghosting) no mapa, gerando erro de auditoria.",
        "O app fecha automaticamente para segurança.",
        "O GPS corrige a altitude sozinho com 100% de precisão.",
        "Nada, o sistema ignora a altitude por padrão."
      ],
      correct: 0,
      feedback: "A altitude evita que ativos de andares diferentes se misturem na visualização do Gestor."
    }
  ];

  const handleFinishQuiz = () => {
    const isCorrect = quizQuestions.every((q, idx) => answers[idx] === q.correct);
    if (isCorrect) {
      setQuizResult('success');
      onCertified?.();
    } else {
      setQuizResult('failure');
    }
  };

  const steps = [
    {
      id: 'vertices',
      icon: Target,
      title: 'A Técnica dos Vértices',
      subtitle: 'Para o Mapa Patrimonial',
      instruction: 'Ao iniciar um novo endereço (ex: uma sala ou corredor), comece sempre bipando os ativos que estão nos cantos (extremidades) do ambiente.',
      why: 'Isso ajuda o algoritmo de Convex Hull a desenhar o perímetro real do setor logo no início.',
      color: 'blue'
    },
    {
      id: 'ocr',
      icon: Camera,
      title: 'Captura de Identidade',
      subtitle: 'OCR + Prova de Vida',
      instruction: 'Foque a câmera na etiqueta patrimonial já colada. Garanta boa iluminação e estabilidade.',
      rule: 'O botão de "Salvar" só é liberado após o OCR confirmar a leitura e a foto ser registrada.',
      color: 'emerald'
    },
    {
      id: 'offline',
      icon: Plane,
      title: 'Resiliência Offline',
      subtitle: 'Modo Avião / Bateria',
      instruction: 'Após realizar o Check-in de Âncora (GPS), você pode ativar o Modo Avião para economizar energia.',
      benefit: 'A Odometria Indoor trabalhará de forma dedicada, sem interrupções de busca por sinal de rede.',
      color: 'amber'
    },
    {
      id: 'altitude',
      icon: Layers,
      title: 'Troca de Nível',
      subtitle: 'Gestão de Altitude',
      instruction: 'Ao subir para um mezanino ou trocar de andar, ajuste imediatamente o seletor de nível no app.',
      attention: 'Isso evita o "Ghosting": quando ativos de andares diferentes se misturem no mapa patrimonial.',
      color: 'purple'
    },
    {
      id: 'sensors',
      icon: Activity,
      title: 'Indicador de Sensores',
      subtitle: 'O LED de Saúde (v2.6)',
      instruction: 'Mantenha o olho no LED na parte superior. Se ficar vermelho, pare e recalibre.',
      recalibrar: 'Faça movimentos em "8" com o celular no ar para restaurar a precisão da bússola.',
      color: 'rose'
    }
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[5000] flex items-center justify-center p-4 sm:p-6">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-slate-900/80 backdrop-blur-md"
          />
          
          <motion.div 
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            className="relative w-full max-w-2xl h-[85vh] bg-white rounded-[2.5rem] shadow-2xl flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="px-8 pt-8 pb-6 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 bg-blue-600 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-blue-200">
                  <BookOpen size={24} />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-900 tracking-tight">GUIA POP</h2>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Manual de Boas Práticas V2.7</p>
                </div>
              </div>
              <button 
                onClick={onClose}
                className="w-10 h-10 bg-white border border-slate-200 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-600 transition-all active:scale-90"
              >
                <X size={20} />
              </button>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto p-6 sm:p-8 space-y-6">
              {!showQuiz ? (
                <>
                  <div className="bg-blue-50 border border-blue-100 p-4 rounded-2xl flex items-start space-x-3 mb-2">
                    <Lightbulb size={20} className="text-blue-600 mt-0.5 flex-shrink-0" />
                    <p className="text-xs font-bold text-blue-900/70 leading-relaxed uppercase tracking-tighter">
                      Auditor, estas regras garantem que o Mapa Patrimonial reflita a realidade física da empresa com precisão cirúrgica.
                    </p>
                  </div>

                  {steps.map((step, idx) => {
                    const Icon = step.icon;
                    return (
                      <motion.div 
                        key={step.id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: idx * 0.1 }}
                        className="group bg-white border border-slate-100 rounded-[2rem] p-6 shadow-sm hover:shadow-xl hover:border-blue-100 transition-all"
                      >
                        <div className="flex items-start justify-between mb-4">
                          <div className="flex items-center space-x-4">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${
                              step.color === 'blue' ? 'bg-blue-50 text-blue-600 border-blue-100' :
                              step.color === 'emerald' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                              step.color === 'amber' ? 'bg-amber-50 text-amber-600 border-amber-100' :
                              step.color === 'purple' ? 'bg-purple-50 text-purple-600 border-purple-100' :
                              'bg-rose-50 text-rose-600 border-rose-100'
                            }`}>
                              <Icon size={20} />
                            </div>
                            <div>
                              <h3 className="font-black text-slate-800 text-sm uppercase tracking-tight">{step.title}</h3>
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none mt-0.5">{step.subtitle}</p>
                            </div>
                          </div>
                          <div className="text-[10px] font-black text-slate-200">0{idx + 1}</div>
                        </div>

                        <div className="pl-14">
                          <p className="text-sm font-medium text-slate-600 leading-relaxed mb-4">
                            &quot;{step.instruction}&quot;
                          </p>

                          <div className="space-y-2">
                            {step.why && (
                              <div className="flex items-start space-x-2 bg-blue-50/50 px-3 py-2 rounded-xl">
                                <CheckCircle2 size={12} className="text-blue-500 mt-0.5 flex-shrink-0" />
                                <span className="text-[10px] font-bold text-blue-900/60 uppercase"><span className="text-blue-700">POR QUE:</span> {step.why}</span>
                              </div>
                            )}
                            {step.rule && (
                              <div className="flex items-start space-x-2 bg-indigo-50/50 px-3 py-2 rounded-xl border border-indigo-100/50">
                                <ShieldCheck size={12} className="text-indigo-500 mt-0.5 flex-shrink-0" />
                                <span className="text-[10px] font-bold text-indigo-900/60 uppercase"><span className="text-indigo-700">REGRA:</span> {step.rule}</span>
                              </div>
                            )}
                            {step.benefit && (
                              <div className="flex items-start space-x-2 bg-emerald-50/50 px-3 py-2 rounded-xl">
                                <CheckCircle2 size={12} className="text-emerald-500 mt-0.5 flex-shrink-0" />
                                <span className="text-[10px] font-bold text-emerald-900/60 uppercase"><span className="text-emerald-700">BENEFÍCIO:</span> {step.benefit}</span>
                              </div>
                            )}
                            {step.attention && (
                              <div className="flex items-start space-x-2 bg-purple-50/50 px-3 py-2 rounded-xl">
                                <AlertTriangle size={12} className="text-purple-500 mt-0.5 flex-shrink-0" />
                                <span className="text-[10px] font-bold text-purple-900/60 uppercase"><span className="text-purple-700">ATENÇÃO:</span> {step.attention}</span>
                              </div>
                            )}
                            {step.recalibrar && (
                              <div className="flex items-start space-x-2 bg-rose-50/50 px-3 py-2 rounded-xl">
                                <Activity size={12} className="text-rose-500 mt-0.5 flex-shrink-0" />
                                <span className="text-[10px] font-bold text-rose-900/60 uppercase"><span className="text-rose-700">RECALIBRAR:</span> {step.recalibrar}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </>
              ) : (
                <div className="space-y-8 py-4">
                  <div className="flex flex-col items-center text-center">
                    <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mb-4">
                      <GraduationCap size={32} />
                    </div>
                    <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight">Certificação Digital Auditor</h3>
                    <p className="text-xs font-bold text-slate-400 max-w-[280px] mt-1">Responda as questões abaixo para liberar o seu acesso ao inventário de campo.</p>
                  </div>

                  {quizQuestions.map((q, qIdx) => (
                    <div key={q.id} className="space-y-4">
                      <div className="flex items-start space-x-3">
                        <span className="w-6 h-6 bg-slate-900 text-white rounded-lg flex items-center justify-center text-[10px] font-black shrink-0 mt-0.5">{q.id}</span>
                        <h4 className="text-sm font-bold text-slate-700 leading-tight">{q.question}</h4>
                      </div>
                      <div className="grid gap-2 pl-9">
                        {q.options.map((opt, oIdx) => (
                          <button
                            key={oIdx}
                            onClick={() => setAnswers(prev => ({ ...prev, [qIdx]: oIdx }))}
                            className={`p-4 rounded-2xl text-left text-xs font-bold transition-all border ${
                              answers[qIdx] === oIdx 
                                ? 'bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-100' 
                                : 'bg-slate-50 border-slate-100 text-slate-600 hover:bg-slate-100'
                            }`}
                          >
                            {opt}
                          </button>
                        ))}
                      </div>
                      {quizResult === 'failure' && answers[qIdx] !== undefined && answers[qIdx] !== q.correct && (
                        <div className="ml-9 p-3 bg-rose-50 border border-rose-100 rounded-xl flex items-start space-x-2">
                          <AlertTriangle size={14} className="text-rose-500 mt-0.5 shrink-0" />
                          <p className="text-[10px] font-bold text-rose-700 leading-tight">{q.feedback}</p>
                        </div>
                      )}
                    </div>
                  ))}

                  {quizResult === 'success' && (
                    <motion.div 
                      initial={{ scale: 0.9, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="p-6 bg-emerald-50 border border-emerald-100 rounded-[2rem] flex flex-col items-center text-center space-y-4"
                    >
                      <div className="w-12 h-12 bg-emerald-500 text-white rounded-full flex items-center justify-center">
                        <CheckCircle2 size={24} />
                      </div>
                      <div>
                        <h4 className="text-sm font-black text-emerald-800 uppercase tracking-tight">Parabéns, Auditor Certificado!</h4>
                        <p className="text-[10px] font-bold text-emerald-600/80 uppercase mt-1">Sua permissão de inventário foi liberada com sucesso.</p>
                      </div>
                    </motion.div>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-8 bg-slate-50 border-t border-slate-100">
              {!showQuiz ? (
                <button 
                  onClick={() => setShowQuiz(true)}
                  className="w-full h-16 bg-blue-600 text-white rounded-2xl text-xs font-black uppercase tracking-[0.2em] shadow-xl active:scale-95 transition-all flex items-center justify-center space-x-3"
                >
                  <span>INICIAR CERTIFICAÇÃO</span>
                  <ChevronRight size={18} />
                </button>
              ) : quizResult === 'success' ? (
                <button 
                  onClick={onClose}
                  className="w-full h-16 bg-slate-900 text-white rounded-2xl text-xs font-black uppercase tracking-[0.2em] shadow-xl active:scale-95 transition-all"
                >
                  FINALIZAR E ENTRAR NO APP
                </button>
              ) : (
                <div className="flex space-x-3">
                  <button 
                    onClick={() => {
                        setAnswers({});
                        setQuizResult(null);
                        setShowQuiz(false);
                    }}
                    className="w-16 h-16 bg-white border border-slate-200 text-slate-400 rounded-2xl flex items-center justify-center active:scale-95 transition-all"
                  >
                    <RefreshCcw size={20} />
                  </button>
                  <button 
                    onClick={handleFinishQuiz}
                    disabled={Object.keys(answers).length < quizQuestions.length}
                    className="flex-1 h-16 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.15em] shadow-xl active:scale-95 transition-all disabled:opacity-30 disabled:pointer-events-none"
                  >
                    AVALIAR RESULTADOS
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default POPGuide;
