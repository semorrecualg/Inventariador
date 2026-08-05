import React, { useState } from 'react';
import { LoginFlow } from './components/LoginFlow';
import { DatabaseMode } from './types';

export default function LoginDemo() {
  const [showFlow, setShowFlow] = useState(true);

  if (!showFlow) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center p-4">
        <button
          onClick={() => setShowFlow(true)}
          className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition"
        >
          Voltar ao Login
        </button>
      </div>
    );
  }

  return (
    <LoginFlow
      onLogin={(credentials) => {
        console.log('Login bem-sucedido:', credentials);
        setShowFlow(false);
      }}
      users={[]}
      databaseMode={DatabaseMode.INTERNAL}
      onOpenPrivacyCenter={() => {}}
      onUpdateScreen={() => {}}
      onShowModal={() => {}}
      onDemoMode={() => {
        console.log('Modo demo ativado');
        setShowFlow(false);
      }}
      onHandleSubmit={async () => {}}
      onBiometricLogin={async () => false}
    />
  );
}
