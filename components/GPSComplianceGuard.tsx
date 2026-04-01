
import React, { useState, useEffect } from 'react';
import { UnitConfig } from '../types';

interface GPSComplianceGuardProps {
  children: React.ReactNode;
  onGpsStatusChange?: (isAvailable: boolean) => void;
  userRole?: string;
  unitConfig?: UnitConfig | null;
  isFieldMode?: boolean;
}

const GPSComplianceGuard: React.FC<GPSComplianceGuardProps> = ({ children, onGpsStatusChange, isFieldMode }) => {
  // Always return children to remove blocking screen as requested by user
  // We still keep the state monitoring in the background if needed
  const [, setStatus] = useState<'checking' | 'granted' | 'denied' | 'unavailable' | 'out-of-range' | 'bypassed'>('checking');

  const checkGPS = async () => {
    if (!navigator.geolocation) {
      setStatus('unavailable');
      onGpsStatusChange?.(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      () => {
        setStatus('granted');
        onGpsStatusChange?.(true);
      },
      (err) => {
        // Silenciar log se o erro for vazio ou apenas aviso
        if (err.code !== 1) { 
          console.warn('GPS Background Monitoring:', err.message);
        }
        setStatus('denied');
        onGpsStatusChange?.(false);
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
    );
  };

  useEffect(() => {
    checkGPS();
  }, [isFieldMode]);

  return <>{children}</>;
};

export default GPSComplianceGuard;
