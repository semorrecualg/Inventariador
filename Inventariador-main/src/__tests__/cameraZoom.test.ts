// ============================================================================
// cameraZoom.test.ts — Zoom digital do scanner.
//
// A WebView do Android não expõe o zoom do track: sem esta alternativa o
// controlo aparece desactivado e o toque não faz nada. Estes testes fixam a
// geometria que mantém a caixa azul alinhada com a região descodificada.
// ============================================================================
import { describe, it, expect } from 'vitest';
import {
  SOFTWARE_ZOOM_MAX,
  SOFTWARE_ZOOM_MIN,
  SOFTWARE_ZOOM_STEP,
  centerRegionForSoftwareZoom,
  clampSoftwareZoom,
  isUsableQrRegion
} from '../utils/cameraZoom';

// Ecrã de um telemóvel comum, com a região de leitura de 350x150 do modo barras.
const viewport = {
  viewportWidth: 390,
  viewportHeight: 844,
  regionWidth: 350,
  regionHeight: 150
};

describe('zoom digital do scanner', () => {
  it('em 1x deixa a região onde o html5-qrcode a colocou', () => {
    expect(centerRegionForSoftwareZoom({ ...viewport, factor: 1 })).toEqual({ x: 20, y: 347 });
  });

  it('em 2x centra a mesma região no vídeo ampliado', () => {
    expect(centerRegionForSoftwareZoom({ ...viewport, factor: 2 })).toEqual({ x: 215, y: 769 });
  });

  it('em 3x acompanha o tamanho máximo do vídeo', () => {
    expect(centerRegionForSoftwareZoom({ ...viewport, factor: 3 })).toEqual({ x: 410, y: 1191 });
  });

  it('não sai do intervalo 1x–3x', () => {
    expect(clampSoftwareZoom(0.2)).toBe(SOFTWARE_ZOOM_MIN);
    expect(clampSoftwareZoom(9)).toBe(SOFTWARE_ZOOM_MAX);
    expect(clampSoftwareZoom(1.5)).toBe(1.5);
    expect(SOFTWARE_ZOOM_STEP).toBe(0.5);
  });

  it('mantém a região dentro do vídeo ampliado até ao zoom máximo', () => {
    const { x, y } = centerRegionForSoftwareZoom({ ...viewport, factor: SOFTWARE_ZOOM_MAX });
    expect(x).toBeGreaterThanOrEqual(0);
    expect(y).toBeGreaterThanOrEqual(0);
  });
});

// `qrRegion` é um campo interno: se a biblioteca mudar, o zoom fica desactivado
// em vez de ampliar a imagem sem deslocar a região de descodificação.
describe('guarda do qrRegion', () => {
  it('aceita a região que o html5-qrcode 2.3.8 expõe', () => {
    expect(isUsableQrRegion({ x: 20, y: 347, width: 350, height: 150 })).toBe(true);
  });

  it('recusa o campo ausente, nulo ou de outro tipo', () => {
    expect(isUsableQrRegion(undefined)).toBe(false);
    expect(isUsableQrRegion(null)).toBe(false);
    expect(isUsableQrRegion('region')).toBe(false);
    expect(isUsableQrRegion({})).toBe(false);
  });

  it('recusa uma forma diferente — o caso de uma subida da biblioteca', () => {
    expect(isUsableQrRegion({ x: 20, y: 347, w: 350, h: 150 })).toBe(false);
    expect(isUsableQrRegion({ x: 20, y: 347, width: 350 })).toBe(false);
    expect(isUsableQrRegion({ x: '20', y: 347, width: 350, height: 150 })).toBe(false);
    expect(isUsableQrRegion({ x: Number.NaN, y: 347, width: 350, height: 150 })).toBe(false);
    expect(isUsableQrRegion({ x: 20, y: Number.POSITIVE_INFINITY, width: 350, height: 150 })).toBe(false);
  });

  it('recusa uma região sem área', () => {
    expect(isUsableQrRegion({ x: 20, y: 347, width: 0, height: 150 })).toBe(false);
    expect(isUsableQrRegion({ x: 20, y: 347, width: 350, height: -1 })).toBe(false);
  });
});
