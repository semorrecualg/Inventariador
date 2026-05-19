import React, { useState } from 'react';
import { Camera } from '@capacitor/camera';
import { Geolocation } from '@capacitor/geolocation';

interface PermissionScreenProps {
  onPermissionsGranted: () => void; // Função que carrega o DatabaseLoader / SQLite
  setBootError: (error: string | null) => void;
}

export const PermissionGate: React.FC<PermissionScreenProps> = ({ 
  onPermissionsGranted, 
  setBootError 
}) => {
  const [showAlert, setShowAlert] = useState(false);
  const [isRequesting, setIsRequesting] = useState(false);

  const executeRealAndroidRequest = async () => {
    if (isRequesting) return;
    setIsRequesting(true);

    try {
      // FORÇA O ANDROID A ABRIR OS POP-UPS NATIVOS REALMENTE
      const cameraReq = await Camera.requestPermissions({ permissions: ['camera'] });
      const geoReq = await Geolocation.requestPermissions({ permissions: ['location'] });

      // VALIDAÇÃO REAL DO SISTEMA OPERACIONAL
      if (cameraReq.camera === 'granted' && geoReq.location === 'granted') {
        setShowAlert(false);
        setBootError(null);
        onPermissionsGranted(); // Libera o app para o auditor trabalhar
      } else {
        // Se o auditor recusar no pop-up do Android, aí sim mostra o alerta
        setShowAlert(true);
      }
    } catch (err) {
      console.error("Erro fatal de hardware:", err);
      setShowAlert(true);
    } finally {
      setIsRequesting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900 flex items-center justify-center p-4 z-50">
      {!showAlert ? (
        /* TELA 1: ACESSO OBRIGATÓRIO */
        <div className="bg-white rounded-3xl p-6 max-w-sm w-full text-center shadow-xl animate-scaleIn">
          <div className="text-blue-500 text-4xl mb-4">🛡️</div>
          <h2 className="text-xl font-bold text-slate-800 mb-4">ACESSO OBRIGATÓRIO</h2>
          <p className="text-sm text-slate-600 mb-6 leading-relaxed">
            O GBR requer acesso nativo à sua Câmera e Localização GPS para gravar os dados no dispositivo com soberania e governança.
          </p>
          <button 
            onClick={executeRealAndroidRequest}
            disabled={isRequesting}
            className="w-full bg-slate-900 text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-800 active:scale-95 transition-all disabled:opacity-50"
          >
            {isRequesting ? "PROCESSANDO..." : "LIBERAR ACESSO (APPLY)"}
          </button>
        </div>
      ) : (
        /* TELA 2: ALERTA INDUSTRIAL (SÓ APARECE SE ELE REALMENTE RECUSAR O POP-UP DO ANDROID) */
        <div className="bg-white rounded-3xl p-6 max-w-sm w-full text-center shadow-xl border-4 border-red-50 animate-bounceOnce">
          <div className="text-red-500 text-4xl mb-4">❌</div>
          <h2 className="text-xl font-bold text-slate-800 mb-2">ALERTA INDUSTRIAL</h2>
          <p className="text-sm text-slate-600 mb-6 leading-relaxed">
            Permissões negadas no sistema operacional. O aplicativo não funcionará em modo soberano sem câmera e GPS conforme regulamentação v24.50.
          </p>
          <button 
            onClick={executeRealAndroidRequest} 
            className="w-full bg-red-600 text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-red-700 active:scale-95 transition-all"
          >
            TENTAR NOVAMENTE
          </button>
        </div>
      )}
    </div>
  );
};
