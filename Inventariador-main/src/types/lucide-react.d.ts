// Declarações de tipos para imports profundos de ícones individuais do lucide-react
// (padrão `import X from 'lucide-react/dist/esm/icons/x'` usado em App.tsx).
declare module 'lucide-react/dist/esm/icons/*' {
  import type { LucideIcon } from 'lucide-react';
  const Icon: LucideIcon;
  export default Icon;
}
