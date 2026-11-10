import React, { useEffect, useRef, useState } from 'react';

interface MarqueeProps {
  children: React.ReactNode;
  /** Velocidade em píxeis por segundo (constante, independente do comprimento). */
  speed?: number;
  className?: string;
}

/**
 * Texto em marquee contínuo (direita → esquerda), estilo painel de LED.
 *
 * O conteúdo é repetido o número de vezes necessário para cobrir o contentor
 * e a animação desloca exatamente uma cópia, pelo que o ciclo é contínuo em
 * qualquer largura de ecrã. A duração é calculada pela largura medida, para
 * que a velocidade de leitura seja sempre a mesma.
 *
 * Com `prefers-reduced-motion` a animação para (o texto fica legível).
 */
const Marquee: React.FC<MarqueeProps> = ({ children, speed = 45, className = '' }) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState({ copies: 2, duration: 20 });

  useEffect(() => {
    const track = trackRef.current;
    const container = track?.parentElement;
    const firstCopy = track?.firstElementChild as HTMLElement | null | undefined;
    if (!track || !container || !firstCopy) return;

    const measure = () => {
      const copyWidth = firstCopy.offsetWidth;
      if (!copyWidth) return;
      const copies = Math.max(2, Math.ceil(container.clientWidth / copyWidth) + 1);
      setLayout({ copies, duration: Math.max(8, copyWidth / speed) });
    };

    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    observer.observe(firstCopy);
    return () => observer.disconnect();
  }, [speed]);

  return (
    <div className={`overflow-hidden ${className}`}>
      <div
        ref={trackRef}
        className="marquee-track"
        style={{
          animationDuration: `${layout.duration}s`,
          ['--marquee-shift' as string]: `-${100 / layout.copies}%`,
        }}
      >
        {Array.from({ length: layout.copies }).map((_, index) => (
          <span key={index} className="shrink-0 pr-10" aria-hidden={index > 0 ? true : undefined}>
            {children}
          </span>
        ))}
      </div>
    </div>
  );
};

export default Marquee;
