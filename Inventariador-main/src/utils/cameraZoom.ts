/**
 * Zoom digital do leitor.
 *
 * O zoom óptico do html5-qrcode depende de `zoom` no
 * `MediaStreamTrack.getCapabilities()`. A WebView do Android (Capacitor) não o
 * reporta nem aceita a constraint (o Chrome reporta), por isso nesse aparelho o
 * botão ficava desactivado e o toque não fazia nada.
 *
 * Sem zoom de hardware, o vídeo é desenhado `factor` vezes maior e centrado no
 * viewfinder. O html5-qrcode lê a região de descodificação (`qrRegion`) no
 * sistema de coordenadas do elemento de vídeo, portanto a mesma região centrada
 * passa a cobrir `1/factor` do sensor: a caixa azul mostra exactamente o que é
 * descodificado e cada barra ocupa mais píxeis no canvas do leitor, em vez de
 * ser reduzida para a largura do ecrã.
 */
export const SOFTWARE_ZOOM_MIN = 1;
export const SOFTWARE_ZOOM_MAX = 3;
export const SOFTWARE_ZOOM_STEP = 0.5;

export const clampSoftwareZoom = (factor: number): number =>
  Math.min(SOFTWARE_ZOOM_MAX, Math.max(SOFTWARE_ZOOM_MIN, factor));

/**
 * Coordenadas da região de leitura no vídeo ampliado. A largura e a altura não
 * mudam (o canvas de descodificação mantém o tamanho); muda a origem, para a
 * região continuar centrada no que a caixa mostra.
 */
export const centerRegionForSoftwareZoom = (params: {
  viewportWidth: number;
  viewportHeight: number;
  regionWidth: number;
  regionHeight: number;
  factor: number;
}): { x: number; y: number } => {
  const factor = clampSoftwareZoom(params.factor);
  return {
    x: (params.viewportWidth * factor - params.regionWidth) / 2,
    y: (params.viewportHeight * factor - params.regionHeight) / 2
  };
};
