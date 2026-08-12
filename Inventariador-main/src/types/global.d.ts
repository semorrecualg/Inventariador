// Declarações de tipos para módulos sem tipos
declare module 'lucide-react/dist/esm/icons/*' {
  import { LucideIcon } from 'lucide-react';
  const icon: LucideIcon;
  export default icon;
}

// A função isAdminEmail deve ser importada de '../utils/authUtils' (não declarada
// globalmente — a declaração global apenas de tipos mascarava a ausência do
// import e quebrava o runtime com ReferenceError em supabaseService).
declare global {
  interface Window {
    pushScreen?: (s: import('../types').AppScreen, params?: import('../types').NavigationParams) => void;
  }
}

export {};
