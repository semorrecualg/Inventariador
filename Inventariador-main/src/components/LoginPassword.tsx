import React, { useState } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, ArrowRight, Lock, Eye, EyeOff, AlertCircle, Fingerprint, Loader2 } from 'lucide-react';

interface LoginPasswordProps {
  email: string;
  onNext: (password: string) => void;
  onBack: () => void;
  isLoading?: boolean;
  error?: string;
  hasBiometric?: boolean;
  onBiometricLogin?: () => void;
  appLogo?: string;
}

export const LoginPassword: React.FC<LoginPasswordProps> = ({ 
  email,
  onNext, 
  onBack,
  isLoading = false,
  error,
  hasBiometric = false,
  onBiometricLogin,
  appLogo
}) => {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [localError, setLocalError] = useState('');

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setPassword(value);
    if (localError) setLocalError('');
  };

  const handleNext = (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) {
      setLocalError('Por favor, digite sua senha');
      return;
    }
    if (password.length < 4) {
      setLocalError('Senha deve ter no mínimo 4 caracteres');
      return;
    }
    onNext(password);
  };

  const displayError = error || localError;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-blue-50 flex flex-col px-6 py-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex items-center justify-between mb-12"
      >
        <button
          onClick={onBack}
          disabled={isLoading}
          className="w-10 h-10 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="text-center flex-1">
          <div className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Passo 2 de 2</div>
        </div>
        <div className="w-10" />
      </motion.div>

      {/* Logo Mini */}
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="flex justify-center mb-8"
      >
        <div className="w-16 h-16 bg-white rounded-2xl shadow-md flex items-center justify-center p-1 border border-blue-100">
          <img 
            src={appLogo}
            alt="Logo"
            className="w-full h-full object-contain"
            onError={(e) => {
              (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect fill="%232563EB" width="100" height="100" rx="15"/><circle cx="50" cy="30" r="12" fill="white"/><rect x="30" y="45" width="40" height="25" rx="2" fill="white"/></svg>';
            }}
          />
        </div>
      </motion.div>

      {/* Title */}
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.2 }}
        className="text-center mb-2"
      >
        <h2 className="text-3xl font-bold text-slate-900 mb-2">Agora sua senha</h2>
        <p className="text-slate-600 text-sm break-all">{email}</p>
      </motion.div>

      {/* Form */}
      <motion.form
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.3 }}
        onSubmit={handleNext}
        className="flex-1 flex flex-col max-w-xs w-full mx-auto pt-8"
      >
        {/* Input Group */}
        <div className="mb-6">
          <div
            className={`relative flex items-center bg-white rounded-2xl border-2 transition-all ${
              isFocused ? 'border-blue-500 shadow-lg shadow-blue-500/10' : 'border-slate-200'
            }`}
          >
            <Lock className={`w-5 h-5 ml-4 transition-colors ${isFocused ? 'text-blue-600' : 'text-slate-400'}`} />
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={handleChange}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              placeholder="Digite sua senha"
              className="flex-1 px-4 py-4 bg-transparent border-0 outline-none text-slate-900 placeholder-slate-400 text-base"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="mr-4 text-slate-600 hover:text-slate-900 transition-colors"
            >
              {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Error Message */}
        {displayError && (
          <motion.div
            initial={{ y: -10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.3 }}
            className="flex items-start gap-2 p-3 mb-6 bg-red-50 border border-red-200 rounded-lg"
          >
            <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-700">{displayError}</p>
          </motion.div>
        )}

        {/* Biometric Login */}
        {hasBiometric && onBiometricLogin && (
          <motion.button
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.4 }}
            type="button"
            onClick={onBiometricLogin}
            disabled={isLoading}
            className="w-full py-3 px-4 mb-4 bg-gradient-to-r from-green-50 to-emerald-50 border-2 border-green-200 text-green-700 font-semibold rounded-xl hover:bg-green-50 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Verificando...
              </>
            ) : (
              <>
                <Fingerprint className="w-5 h-5" />
                Usar Biometria
              </>
            )}
          </motion.button>
        )}

        {/* Action Buttons */}
        <div className="mt-auto space-y-3">
          <button
            type="submit"
            disabled={isLoading || !password}
            className="w-full py-4 px-6 bg-gradient-to-r from-blue-600 to-blue-700 text-white font-bold rounded-2xl shadow-lg shadow-blue-600/30 hover:shadow-xl hover:shadow-blue-600/40 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Autenticando...
              </>
            ) : (
              <>
                Acessar
                <ArrowRight className="w-5 h-5" />
              </>
            )}
          </button>

          <button
            type="button"
            onClick={onBack}
            disabled={isLoading}
            className="w-full py-3 px-6 bg-white border-2 border-slate-200 text-slate-900 font-semibold rounded-2xl hover:bg-slate-50 transition-all active:scale-95 disabled:opacity-50"
          >
            Voltar
          </button>
        </div>
      </motion.form>

      {/* Security Badge */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.5 }}
        className="text-center mt-8 px-4"
      >
        <p className="text-xs text-slate-500 flex items-center justify-center gap-1">
          🔒 Sua senha é criptografada e segura
        </p>
      </motion.div>
    </div>
  );
};

export default LoginPassword;
