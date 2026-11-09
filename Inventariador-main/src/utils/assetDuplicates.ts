import { Asset } from '../types';

/**
 * Serial comparável: caixa alta, sem acentos e só `[A-Z0-9]` — a mesma classe
 * de normalização dos campos de código da base mestre. Evita que variações de
 * escrita (`sm-01`, `SM 01`, `Sm01`) escapem ao alerta de duplicidade.
 */
export const normalizeSerial = (value: unknown): string =>
  String(value ?? '')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9]/g, '');

/** Seriais com menos de 3 caracteres são residuais ("1", "S/N", "—") e não
 *  devem gerar falsos positivos. */
const MIN_SERIAL_LENGTH = 3;

/**
 * Procura outros ativos com o mesmo serial (ignorando o próprio registro em
 * edição). Retorna todos os conflitos para o auditor decidir qual abrir.
 */
export const findSerialDuplicates = (
  serial: unknown,
  assets: Asset[],
  ignoreId?: string | number
): Asset[] => {
  const key = normalizeSerial(serial);
  if (key.length < MIN_SERIAL_LENGTH) return [];
  const ignored = ignoreId === undefined ? null : String(ignoreId);
  return assets.filter(asset => {
    if (ignored !== null && String(asset.id) === ignored) return false;
    return normalizeSerial(asset.serial) === key;
  });
};
