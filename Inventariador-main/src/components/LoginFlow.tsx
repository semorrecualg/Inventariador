import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { LoginWelcome } from './LoginWelcome';
import { LoginEmail } from './LoginEmail';
import { LoginPassword } from './LoginPassword';
import { User, DatabaseMode, AppScreen, ModalConfig } from '../types';
import { hasBiometricRegistered } from '../services/biometricService';
import { APP_LOGO } from '../constants';

type LoginStep = 'welcome' | 'email' | 'password';

interface LoginFlowProps {
  onLogin: (user: User) => void;
  users: User[];
  databaseMode: DatabaseMode;
  onOpenPrivacyCenter: () => void;
  onUpdateScreen: (screen: AppScreen) => void;
  onShowModal: (config: Partial<ModalConfig>) => void;
  isDatabaseEmpty?: boolean;
  isKeyboardVisible?: boolean;
  onUpdateDatabaseMode?: (mode: DatabaseMode) => void;
  isInitializing?: boolean;
  dbInitialized?: boolean;
  onDemoMode: () => void;
  onHandleSubmit: (username: string, password: string) => Promise<void>;
  onBiometricLogin: (username: string) => Promise<boolean>;
}

export const LoginFlow: React.FC<LoginFlowProps> = ({
  onLogin,
  users,
  databaseMode,
  onOpenPrivacyCenter,
  onUpdateScreen,
  onShowModal,
  onUpdateDatabaseMode,
  onDemoMode,
  onHandleSubmit,
  onBiometricLogin
}) => {
  const [currentStep, setCurrentStep] = useState<LoginStep>('welcome');
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [hasBiometric, setHasBiometric] = useState(false);

  // Check for biometric when email changes
  useEffect(() => {
    if (currentStep === 'password' && email) {
      const checkBio = async () => {
        try {
          const supported = await hasBiometricRegistered(email.toLowerCase());
          setHasBiometric(supported);
        } catch (err) {
          console.error('[LoginFlow] Erro ao verificar biometria:', err);
          setHasBiometric(false);
        }
      };
      checkBio();
    }
  }, [currentStep, email]);

  const handleGetStarted = () => {
    setCurrentStep('email');
    setEmail('');
    setError('');
  };

  const handleEmailSubmit = (emailValue: string) => {
    setEmail(emailValue);
    setCurrentStep('password');
    setError('');
  };

  const handlePasswordSubmit = async (password: string) => {
    setIsLoading(true);
    setError('');

    try {
      await onHandleSubmit(email, password);
    } catch (err: any) {
      setError(err?.message || 'Erro ao fazer login. Tente novamente.');
      console.error('[LoginFlow] Erro no login:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleBiometricLogin = async () => {
    setIsLoading(true);
    setError('');

    try {
      const success = await onBiometricLogin(email);
      if (!success) {
        setError('Falha na autenticação biométrica. Tente com sua senha.');
      }
    } catch (err: any) {
      setError(err?.message || 'Erro na autenticação biométrica.');
      console.error('[LoginFlow] Erro biométrico:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleBackToWelcome = () => {
    setCurrentStep('welcome');
    setEmail('');
    setError('');
  };

  const handleBackToEmail = () => {
    setCurrentStep('email');
    setError('');
  };

  return (
    <div className="relative w-full h-screen overflow-hidden bg-slate-50">
      <AnimatePresence mode="wait">
        {currentStep === 'welcome' && (
          <motion.div
            key="welcome"
            initial={{ opacity: 0, y: 100 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -100 }}
            transition={{ duration: 0.3 }}
            className="absolute inset-0"
          >
            <LoginWelcome
              onGetStarted={handleGetStarted}
              onDemoMode={onDemoMode}
              isLoading={isLoading}
              appLogo={APP_LOGO}
            />
          </motion.div>
        )}

        {currentStep === 'email' && (
          <motion.div
            key="email"
            initial={{ opacity: 0, y: 100 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -100 }}
            transition={{ duration: 0.3 }}
            className="absolute inset-0"
          >
            <LoginEmail
              onNext={handleEmailSubmit}
              onBack={handleBackToWelcome}
              isLoading={isLoading}
              appLogo={APP_LOGO}
            />
          </motion.div>
        )}

        {currentStep === 'password' && (
          <motion.div
            key="password"
            initial={{ opacity: 0, y: 100 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -100 }}
            transition={{ duration: 0.3 }}
            className="absolute inset-0"
          >
            <LoginPassword
              email={email}
              onNext={handlePasswordSubmit}
              onBack={handleBackToEmail}
              isLoading={isLoading}
              error={error}
              hasBiometric={hasBiometric}
              onBiometricLogin={handleBiometricLogin}
              appLogo={APP_LOGO}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default LoginFlow;
