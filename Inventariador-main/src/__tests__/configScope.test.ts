// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import {
  CONTRACT_CONFIG_COLUMNS,
  CONTRACT_CONFIG_COLUMN_SET,
  DEVICE_CONFIG_COLUMNS,
  DEVICE_CONFIG_KEYS,
  DEVICE_CONFIG_KEY_SET
} from '../utils/configScope';
import { stripDevicePreferences } from '../utils/fieldPreferences';
import { buildConfigCloudPayload } from '../services/supabaseService';
import { ScannerMode, ScanFeedbackMode, DatabaseStatus, DatabaseMode } from '../types';

/**
 * Fonte única do escopo da configuração (utils/configScope).
 *
 * Estes testes são o contrato entre as três peças que antes divergiam: o
 * payload da nuvem, o strip do snapshot e o mapeamento de volta.
 */
describe('configScope — contrato vs. dispositivo', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('as duas listas não se sobrepõem (nem em camelCase, nem em snake_case)', () => {
    DEVICE_CONFIG_KEYS.forEach((key) => {
      expect(CONTRACT_CONFIG_COLUMN_SET.has(key)).toBe(false);
      expect(Object.keys(CONTRACT_CONFIG_COLUMNS)).not.toContain(key);
    });
    DEVICE_CONFIG_COLUMNS.forEach((column) => {
      expect(CONTRACT_CONFIG_COLUMN_SET.has(column)).toBe(false);
      expect(DEVICE_CONFIG_KEY_SET.has(column)).toBe(false);
    });
  });

  it('o payload da nuvem é exactamente a lista de contrato', () => {
    const built = buildConfigCloudPayload({ tenantid: 'CICOPAL' }, 'CICOPAL');

    const columns = Object.keys(built!.payload).filter(
      (key) => key !== 'id' && key !== 'tenantid' // identidade resolvida na função
    );
    expect(columns.sort()).toEqual([]);

    const full = buildConfigCloudPayload(
      {
        tenantid: 'CICOPAL',
        companies: ['010101'],
        lastUpdated: '2026-11-15T00:00:00.000Z',
        status: DatabaseStatus.LOADED,
        editableFields: ['SERIAL'],
        qrCodeFields: ['ETIQUETA'],
        inventorySearchMode: 'MANUAL',
        immersiveMode: true,
        protheusIntegrationEnabled: false,
        protheusApiUrl: 'https://erp',
        mandatoryPhotoOnDivergence: true,
        mandatoryPhotoOnNewItem: false,
        databaseMode: DatabaseMode.SUPABASE
      },
      'CICOPAL'
    );

    const sent = Object.keys(full!.payload).filter((key) => key !== 'id' && key !== 'tenantid');
    expect(sent.sort()).toEqual(Object.values(CONTRACT_CONFIG_COLUMNS).sort());
  });

  it('nenhuma preferência de dispositivo sobe, mesmo com o estado completo', () => {
    const built = buildConfigCloudPayload(
      {
        tenantid: 'CICOPAL',
        scannerMode: ScannerMode.QRCODE,
        autoConfirmOnScan: false,
        scanFeedbackMode: ScanFeedbackMode.NONE,
        darkMode: true,
        batterySaver: true
      },
      'CICOPAL'
    );

    const columns = Object.keys(built!.payload);
    DEVICE_CONFIG_COLUMNS.forEach((column) => expect(columns).not.toContain(column));
    DEVICE_CONFIG_KEYS.forEach((key) => expect(columns).not.toContain(key));
  });

  it('o strip do snapshot usa a mesma lista', () => {
    const snapshot: Record<string, unknown> = { tenantid: 'CICOPAL', companies: ['010101'] };
    DEVICE_CONFIG_KEYS.forEach((key) => {
      snapshot[key] = 'valor';
    });

    const stripped = stripDevicePreferences(snapshot);

    DEVICE_CONFIG_KEYS.forEach((key) => expect(stripped).not.toHaveProperty(key));
    expect(stripped.companies).toEqual(['010101']);
    expect(stripped.tenantid).toBe('CICOPAL');
  });
});
