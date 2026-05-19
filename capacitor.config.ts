import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.gbr.inventario.expert',
  appName: 'GBR KARDEK',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    cleartext: true,
    allowNavigation: ['*']
  },
  plugins: {
    Filesystem: {
      androidIsEncryption: false
    },
    CapacitorSQLite: {
      iosDatabaseLocation: 'Library/CapacitorDatabase',
      iosIsEncryption: false,
      iosKeychainPrefix: 'cap',
      iosBiometric: {
        biometricAuth: false,
        biometricTitle : "Biometric login for queries"
      },
      androidIsEncryption: false,
      androidBiometric: {
        biometricAuth: false,
        biometricTitle : "Biometric login for queries"
      }
    }
  }
};

export default config;
