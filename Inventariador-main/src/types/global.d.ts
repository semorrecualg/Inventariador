// Declarações de tipos para módulos sem tipos
declare module 'lucide-react/dist/esm/icons/*' {
  import { LucideIcon } from 'lucide-react';
  const icon: LucideIcon;
  export default icon;
}

// Declaração global para isAdminEmail usado em supabaseService
declare global {
  function isAdminEmail(email: string): boolean;
  interface Window {
    pushScreen?: (s: import('../types').AppScreen, params?: import('../types').NavigationParams) => void;
  }
}

export {};
