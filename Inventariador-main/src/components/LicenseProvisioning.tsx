import React, { useState } from 'react';
import { Building2, ShieldCheck, Check, X, Eye, EyeOff, KeyRound } from 'lucide-react';
import BackButton from './BackButton';
import {
  provisionLicense,
  normalizeTenantId,
  type LicenseProvisionResult,
} from '../services/tenantProvisioningService';
import {
  validateStrongPassword,
  passwordScore,
  STRONG_PASSWORD_RULE_LABELS,
} from '../utils/passwordPolicy';

interface LicenseProvisioningProps {
  onBack: () => void;
}

/**
 * PROVISIONAMENTO DE LICENÇA (dono/proprietário)
 *
 * Fluxo comercial: venda de licença a um novo cliente → cria o TENANT e o
 * usuário MASTER (autenticação completa, senha FORTE validada em tempo real).
 * O MASTER passa a administrar os sub-usuários de "login rápido" do próprio
 * tenant (UserManagement).
 */
export const LicenseProvisioning: React.FC<LicenseProvisioningProps> = ({ onBack }) => {
  const [clientName, setClientName] = useState('');
  const [masterEmail, setMasterEmail] = useState('');
  const [masterUsername, setMasterUsername] = useState('');
  const [masterName, setMasterName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<LicenseProvisionResult | null>(null);

  const strong = validateStrongPassword(password);
  const passwordsMatch = confirmPassword !== '' && password === confirmPassword;
  const score = passwordScore(password);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!strong.valid) {
      setError(`A senha do MASTER precisa ser forte: ${strong.errors.join('; ')}.`);
      return;
    }
    if (password !== confirmPassword) {
      setError('A confirmação de senha não confere.');
      return;
    }

    setIsLoading(true);
    try {
      const res = await provisionLicense({
        clientName,
        masterEmail,
        masterUsername,
        masterName,
        masterPassword: password,
      });
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao provisionar a licença.');
    } finally {
      setIsLoading(false);
    }
  };

  const resetForm = () => {
    setClientName('');
    setMasterEmail('');
    setMasterUsername('');
    setMasterName('');
    setPassword('');
    setConfirmPassword('');
    setResult(null);
    setError(null);
  };

  return (
    <div className="flex-1 w-full flex flex-col bg-bg-main animate-fadeIn min-h-full">
      <div className="px-6 pt-8 pb-4 bg-surface border-b border-border flex items-center justify-between z-30">
        <div className="flex items-center space-x-3">
          <BackButton onClick={onBack} label="Voltar" />
          <div className="w-10 h-10 bg-accent-soft rounded-xl flex items-center justify-center text-accent">
            <Building2 size={24} />
          </div>
          <div>
            <h1 className="text-lg font-bold text-ink tracking-tight">Licenças</h1>
            <p className="text-[10px] font-medium text-ink-muted uppercase tracking-widest">
              Provisionamento de Novo Cliente
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6 no-scrollbar">
        <div className="max-w-md mx-auto space-y-4">
          {result ? (
            <div className="bg-white rounded-3xl border border-border shadow-sm p-6 animate-scaleIn">
              <div
                className={`w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4 ${
                  result.success ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'
                }`}
              >
                {result.success ? <Check size={28} /> : <X size={28} />}
              </div>
              <h2 className="text-lg font-bold text-ink text-center uppercase tracking-tight">
                {result.success ? 'Licença Provisionada' : 'Falha no Provisionamento'}
              </h2>
              <p className="text-[11px] text-ink-muted text-center mt-2 leading-relaxed">
                {result.message}
              </p>

              {result.success && (
                <div className="mt-4 p-4 bg-bg-main rounded-2xl border border-border space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-[9px] font-bold text-ink-muted uppercase tracking-widest">Tenant</span>
                    <span className="text-[10px] font-black text-ink">{result.tenantid}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[9px] font-bold text-ink-muted uppercase tracking-widest">MASTER</span>
                    <span className="text-[10px] font-black text-ink">{result.masterEmail}</span>
                  </div>
                </div>
              )}

              {result.warnings && result.warnings.length > 0 && (
                <div className="mt-3 space-y-1.5">
                  {result.warnings.map((w, i) => (
                    <p key={i} className="text-[9px] font-bold text-amber-600 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
                      ⚠ {w}
                    </p>
                  ))}
                </div>
              )}

              <button
                onClick={resetForm}
                className="w-full mt-5 py-3.5 bg-slate-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest active:scale-95 transition-all"
              >
                Provisionar Outro Cliente
              </button>
              <button
                onClick={onBack}
                className="w-full mt-2 py-3.5 bg-white border border-border text-ink rounded-2xl font-black text-xs uppercase tracking-widest active:scale-95 transition-all"
              >
                Concluir
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3.5">
              <div className="bg-white rounded-3xl border border-border shadow-sm p-5">
                <div className="flex items-center mb-3">
                  <div className="w-8 h-8 bg-accent-soft text-accent rounded-lg flex items-center justify-center mr-3">
                    <Building2 size={16} />
                  </div>
                  <div>
                    <h3 className="text-[13px] font-bold text-ink uppercase tracking-tight">Novo Cliente</h3>
                    <p className="text-[8px] font-bold text-ink-muted uppercase tracking-widest mt-0.5">
                      O tenantid será derivado automaticamente
                    </p>
                  </div>
                </div>
                <input
                  type="text"
                  required
                  autoComplete="off"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  placeholder="Ex.: Cicopal Goiás"
                  className="w-full px-4 py-3.5 bg-bg-main rounded-2xl border border-border focus:border-accent focus:bg-white outline-none font-bold text-sm transition-all"
                />
                {clientName.trim() && (
                  <p className="text-[9px] font-black text-accent uppercase tracking-widest mt-2 ml-1">
                    Tenant: {normalizeTenantId(clientName) || '—'}
                  </p>
                )}
              </div>

              <div className="bg-white rounded-3xl border border-border shadow-sm p-5 space-y-3">
                <div className="flex items-center mb-1">
                  <div className="w-8 h-8 bg-indigo-50 text-indigo-600 rounded-lg flex items-center justify-center mr-3">
                    <ShieldCheck size={16} />
                  </div>
                  <div>
                    <h3 className="text-[13px] font-bold text-ink uppercase tracking-tight">Usuário MASTER</h3>
                    <p className="text-[8px] font-bold text-ink-muted uppercase tracking-widest mt-0.5">
                      Autenticação completa — dono do novo tenant
                    </p>
                  </div>
                </div>

                <input
                  type="email"
                  required
                  autoComplete="off"
                  value={masterEmail}
                  onChange={(e) => setMasterEmail(e.target.value)}
                  placeholder="E-mail do MASTER"
                  className="w-full px-4 py-3.5 bg-bg-main rounded-2xl border border-border focus:border-accent focus:bg-white outline-none font-bold text-sm transition-all"
                />
                <input
                  type="text"
                  required
                  autoComplete="off"
                  value={masterUsername}
                  onChange={(e) => setMasterUsername(e.target.value.toLowerCase())}
                  placeholder="Username (login)"
                  className="w-full px-4 py-3.5 bg-bg-main rounded-2xl border border-border focus:border-accent focus:bg-white outline-none font-bold text-sm transition-all"
                />
                <input
                  type="text"
                  autoComplete="off"
                  value={masterName}
                  onChange={(e) => setMasterName(e.target.value)}
                  placeholder="Nome completo (opcional)"
                  className="w-full px-4 py-3.5 bg-bg-main rounded-2xl border border-border focus:border-accent focus:bg-white outline-none font-bold text-sm transition-all"
                />
              </div>

              <div className="bg-white rounded-3xl border border-border shadow-sm p-5 space-y-2.5">
                <div className="flex items-center mb-1">
                  <div className="w-8 h-8 bg-amber-50 text-amber-600 rounded-lg flex items-center justify-center mr-3">
                    <KeyRound size={16} />
                  </div>
                  <div>
                    <h3 className="text-[13px] font-bold text-ink uppercase tracking-tight">Senha Forte</h3>
                    <p className="text-[8px] font-bold text-ink-muted uppercase tracking-widest mt-0.5">
                      Regras de complexidade obrigatórias
                    </p>
                  </div>
                </div>

                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-4 pr-12 py-3.5 bg-bg-main rounded-2xl border border-border focus:border-accent focus:bg-white outline-none font-bold text-sm transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted p-1.5"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>

                {password && (
                  <>
                    <div className="flex space-x-1">
                      {[1, 2, 3, 4, 5].map((i) => (
                        <div
                          key={i}
                          className={`h-1.5 flex-1 rounded-full transition-all ${
                            score >= i
                              ? score >= 4
                                ? 'bg-emerald-500'
                                : score >= 3
                                  ? 'bg-amber-400'
                                  : 'bg-red-400'
                              : 'bg-slate-200'
                          }`}
                        />
                      ))}
                    </div>
                    <ul className="space-y-1">
                      {STRONG_PASSWORD_RULE_LABELS.map((label) => (
                        <li
                          key={label}
                          className={`flex items-center text-[9px] font-bold uppercase tracking-widest ${
                            !strong.errors.includes(label) ? 'text-emerald-600' : 'text-ink-muted'
                          }`}
                        >
                          {!strong.errors.includes(label) ? (
                            <Check size={11} className="mr-1.5" />
                          ) : (
                            <X size={11} className="mr-1.5" />
                          )}
                          {label}
                        </li>
                      ))}
                    </ul>
                  </>
                )}

                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirmar senha"
                    className="w-full px-4 pr-12 py-3.5 bg-bg-main rounded-2xl border border-border focus:border-accent focus:bg-white outline-none font-bold text-sm transition-all"
                  />
                </div>
                {confirmPassword && (
                  <p
                    className={`text-[9px] font-bold uppercase tracking-widest ${
                      passwordsMatch ? 'text-emerald-600' : 'text-red-500'
                    }`}
                  >
                    {passwordsMatch ? '✓ Senhas conferem' : '✕ Senhas não conferem'}
                  </p>
                )}
              </div>

              {error && (
                <p className="text-[10px] font-bold text-red-600 bg-red-50 border border-red-100 rounded-2xl px-4 py-3">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-4 bg-accent text-white rounded-[2rem] font-bold uppercase tracking-[0.2em] shadow-xl shadow-accent/20 active:scale-95 transition-all text-sm flex items-center justify-center space-x-3 disabled:opacity-50"
              >
                {isLoading ? (
                  <span className="animate-pulse">Provisionando...</span>
                ) : (
                  <>
                    <ShieldCheck size={18} />
                    <span>Provisionar Licença</span>
                  </>
                )}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default LicenseProvisioning;
