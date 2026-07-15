# Changelog

All notable changes to the **GBR Auditoria Patrimonial — Inventariador de Ativo Imobilizado** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [2.7.0] — 2026-07-15

### Added

#### Testing Infrastructure
- **Playwright E2E test suite** — Cross-browser smoke tests (Chromium, Firefox, WebKit, mobile Chrome, mobile Safari) with `playwright.config.ts`, custom fixtures (`loginAsAdmin`, `waitForAppReady`), HTML reporter, and webServer config.
- **Login E2E tests** — 14 tests across 8 blocks covering branding, form labels, version info, authentication (valid/invalid/loading/sessionStorage), password toggle, privacy center, demo mode, reset access (show/cancel), and biometric (skipped for CI). Uses `Promise.race` pattern for loading state assertions.
- **Dashboard E2E tests** — 9 tests covering header navigation, tab switching, KPI visibility, progress percentage, quick actions (inventory/labeling), activity section (with `or()` combinator), charts, and status distribution.
- **Navigation E2E tests** — 4 tests covering app shell mount, login route rendering, catch-all route handling, and privacy center visibility.
- **Smoke tests** — 7 health-check tests across 3 blocks (App Shell, Critical Routes, Public Routes) with console error capture and filtering.
- **Unit tests** — Vitest unit tests for `ErrorBoundary`, `Login`, and `Modal` components.
- **Vitest configuration** — Dedicated `vitest.config.ts` for unit/component test runner.

#### New Components
- **`AdminPanel.tsx`** — Administrative panel for managing users, permissions, and system settings.
- **`DataManagementPanel.tsx`** — Database management UI for import/export, backup/restore, and storage monitoring.
- **`PreferencesPanel.tsx`** — User preferences panel with theme toggle, language selection, and notification settings.

#### Store Architecture
- **Zustand stores** — Extracted state management from `App.tsx` into dedicated stores:
  - `useAuthStore` — Authentication state, user session, login/logout actions
  - `useInventoryStore` — Asset inventory, filters, and campaign selections
  - `useSyncStore` — Sync queue, status, and conflict resolution state
  - `useUIStore` — Theme, modals, notifications, and UI preferences
- **Router module** — Extracted routing logic into `src/router/` directory with route definitions and navigation utilities.

### Changed

#### Security Improvements
- **Encryption key storage**: Migrated from `localStorage` to Web Crypto API built-in key storage (`crypto.subtle`) for encryption keys. Keys are no longer serializable or extractable, preventing XSS-based key theft.
- **Hardcoded PIN replacement**: Replaced plain-text `'0000'` PIN with Web Crypto API hashed PIN verification using random salt.
- **Backdoor removal**: Eliminated hardcoded `semorr@gmail.com` admin bypass. All admin verification now goes through proper server-side checks.

#### Performance Optimization
- **Router migration**: Custom `AppScreen` state-based routing replaced with React Router v6 `HashRouter` with lazy-loaded routes (`React.lazy` + `Suspense`).
- **Bundle optimization**: Converted `App.tsx` lucide-react imports from barrel (loads ~1,500 modules) to 14 direct deep imports (`lucide-react/dist/esm/icons/*`).
- **Memoization**: Extracted `StatCard` to module-level `React.memo` component. Wrapped `exportFilteredData` in `useCallback` with proper deps. Hoisted `formatCurrency` to module level.
- **Dependency consolidation**: Replaced `framer-motion` with `motion` library (single dependency, same API).

#### Component Refactoring
- **`BaseManagerPanel.tsx`** — Refactored to use modular sub-components with reduced prop drilling.
- **`CampaignManager.tsx`**, **`UserManagement.tsx`**, **`UnitSelector.tsx`** — Reduced prop counts and extracted inline logic.
- **`AssetControlModule.tsx`**, **`AssetUnitizeModal.tsx`** — Improved state management patterns.
- **`Login.tsx`** — Applied Vercel best practices: derived state during render, lazy state init, functional setState.
- **`Dashboard.tsx`** — Extracted `StatCard` to module-level `React.memo`, wrapped callbacks in `useCallback`, hoisted utility functions.
- **`SecurityPinModal.tsx`** — Updated to use proper PIN hashing for verification.

### Fixed

- **Biometric E2E test** — Changed to `test.skip` (WebAuthn requires platform authenticator not available in headless Playwright).
- **Password toggle selector** — Changed from `button[role="button"]` to adjacent sibling CSS selector `input[placeholder="••••••••"] + button`.
- **Demo mode test assertion** — Changed from checking demo button disabled state (button hides during loading) to checking submit button shows "Autenticando...".
- **Loading state test** — Replaced `.catch()` silent swallowing with `Promise.race` pattern between loading assertion and navigation promise.
- **Dashboard percentage regex** — Removed `$` anchor for broader text matching.
- **Login test routes** — Updated from `/` to `/#/login` for HashRouter compatibility.
- **Dashboard test auth** — Added `loginAsAdmin()` in `beforeEach` for proper session seeding.

### Security

- Encryption keys stored via Web Crypto API `crypto.subtle` (non-extractable, non-exportable).
- PIN verification uses Web Crypto API hashing with random salt instead of plain-text comparison.
- Admin backdoor (`semorr@gmail.com`) removed — all admin access validated server-side.
- State management extracted to isolated Zustand stores with no cross-store privilege leakage.

---

## [2.6.0] — 2026-07-15

### Added

#### Core Architecture
- **React 18 + TypeScript SPA** — Vite-powered single-page application with Capacitor native integration for Android/iOS mobile deployment.
- **Custom AppScreen routing** — State-driven screen navigation with `onUpdateScreen()` and `pushScreen()` patterns.
- **SQLite dual-storage engine** — Hybrid persistence layer using `sql.js` (WebAssembly) for online and `localforage`/IndexedDB for offline-first data sovereignty.
- **Supabase cloud sync** — Optional cloud authentication and data synchronization with offline fallback and conflict resolution.
- **WebAuthn biometric auth** — Platform authenticator (Touch ID / Face ID / Windows Hello) for passwordless login.

#### Authentication & Access Control
- **Login screen** — Credential-based authentication with admin master bypass, LDAP-style user lookup, and role-based access (`ADMIN`, `AUDITOR`, `MASTER`).
- **Biometric registration & login** — WebAuthn-based device biometric enrollment and authentication.
- **Demo mode** — One-click sandbox environment using `demoService` with seeded SQLite database for evaluation.
- **Session persistence** — `app_current_user` saved to `sessionStorage` with audit logging on every login.
- **Reset access** — Selective session clear that preserves asset data while resetting user state.
- **Database mode selector** — Toggle between LOCAL, SUPABASE, and hybrid deployment modes.

#### Inventory Management
- **Asset inventory engine** — Virtualized asset list via `react-virtuoso` with SQLite-backed filtering by address, unit, campaign, and status.
- **Barcode & QR code scanning** — Integrated `html5-qrcode` scanner with configurable feedback modes (vibrate, sound, both, none).
- **Asset tagging system** — `TAG_INVENTARIO` classification: `CONFERIDO`, `DIVERGENCIA`, `NOVO_ITEM`, `FALTA_ETIQUETAR`, `ADOTADO`.
- **Address-based inventory isolation** — `AddressSelector` filters assets by physical location anchor, reducing global asset set (~12K) to geolocated fractions.
- **Asset detail view** — Full CRUD with photo capture (`browser-image-compression`), GPS coordinates, signature capture, and editable field configuration.
- **Unit-wise configuration** — Per-unit geofencing, GPS compliance rules, and campaign assignments.

#### Dashboard & Analytics
- **Multi-tab dashboard** — Overview (efficiency KPIs), Financial (asset valuation), and Units (per-unit progress) tabs.
- **Recharts visualizations** — Status distribution donut charts, audit activity bar charts, and unit progress indicators.
- **KPI cards** — Real-time counts of verified, pending, divergent, and total assets with animated micro-interactions.
- **Smart hints** — Contextual tips triggered from each KPI card using a `DASHBOARD_HINTS` registry.
- **Data export** — Export filtered asset data to XLSX spreadsheets.

#### Asset Control Module
- **Asset groups management** — Organize assets into hierarchical groups with multi-select operations.
- **Chart of accounts reconciliation** — Compare physical inventory against accounting GL accounts with discrepancy detection.
- **NCM classifier** — Brazilian tax classification codes integration.
- **Depreciation engine** — Calculate and report asset depreciation schedules.
- **Impairment testing** — Fair value assessment workflow with modal-driven impairment tests.
- **Soft delete & audit trails** — Full `_deleted` flag lifecycle with restore capability and complete audit log.

#### Mapping & Geolocation
- **Asset map** — MapLibre GL-based interactive map with asset pins, clustering, and geofence visualization.
- **GPS compliance guard** — Enforce GPS capture at inventory time with configurable radius rules.
- **Reverse geocoding** — Address resolution from coordinates during field inventory.

#### Administrative
- **User management** — Create, edit, delete users with role assignment and permission gates.
- **Campaign manager** — Full inventory campaign lifecycle (created → active → closed → archived) with snapshot closure and statistics.
- **Field configurator** — Customize which asset fields are editable, scannable, and visible per deployment.
- **QR code configurator** — Configure which asset fields are encoded into QR labels.
- **Unit configurator** — Manage operational units, filiais, and their geo-configurations.
- **Database manager screen** — Administration panel for database health monitoring.

#### Privacy & Security
- **Privacy center** — GDPR/LGPD-aligned privacy controls and consent management.
- **Onboarding wizard** — First-run tutorial with trust establishment (`TrustOnboarding`).
- **Biometric registration** — Dedicated enrollment screen for WebAuthn credentials.
- **Session timeout handling** — Automatic logout on inactivity with security PIN re-prompt.

#### Sync & Resilience
- **Background sync service** — Resilient sync queue with retry logic, photo blob uploads, and conflict resolution.
- **Memory guard service** — Heap monitoring and proactive garbage collection triggers.
- **Navigation guard** — Prevent accidental navigation away from unsaved inventory sessions.
- **Buffer controller** — I/O buffering for SQLite batch operations.
- **Telemetry & diagnostics** — Error telemetry capture, database integrity SHA-256 checks, stress test manager.
- **File system storage** — Capacitor Filesystem integration for offline photo and report storage.

#### Reporting
- **Audit logs viewer** — Searchable, filterable audit trail with user, action, and timestamp columns.
- **Soft delete report** — View all soft-deleted assets with restoration capability.
- **Impairment report** — Generated PDF reports via `jspdf` + `jspdf-autotable`.
- **Asset print view** — Print-optimized asset detail view.
- **Public Kardex** — Read-only asset ledger view for external stakeholders.

#### UI/UX
- **Dark mode** — Full theme system with Tailwind v4 dark mode support.
- **Motion animations** — Framer Motion-powered transitions, fade-in, slide-up, and shake effects.
- **Responsive layout** — Mobile-first design with keyboard-aware viewport adjustments.
- **Environment badge** — Real-time indicator showing active database mode (LOCAL, SUPABASE, etc.).
- **Password visibility toggle** — Eye icon show/hide on password fields.
- **Demo mode button** — One-click sandbox with Sparkles icon and pulse animation.
- **Reset access** — Footer-level session reset with confirmation dialog.
- **Loading states** — Animated spinners and disabled states on all async actions.
- **Error boundaries** — React error boundary wrapping the entire app tree.
- **Floating help** — Contextual help button with AI-powered assistant integration (`AIAssistant`).

### Security

- SHA-256 integrity checks on database snapshots.
- Role-based access control (`PermissionGate`) enforced across all administrative screens.
- Audit logging on all login events, asset mutations, and administrative actions.
- Privacy center with consent management and data disclosure controls.
- Session isolation: `app_current_user` in sessionStorage (not localStorage) to prevent XSS session leakage.

### Dependencies

| Package | Version | Purpose |
|---|---|---|
| React | ^18.3.1 | UI framework |
| TypeScript | ^5.2.2 | Type safety |
| Vite | ^5.1.4 | Build tool |
| Tailwind CSS | ^4.2.1 | Styling |
| Capacitor | ^6.2.1 | Native mobile bridge |
| Supabase JS | ^2.105.4 | Cloud auth + sync |
| sql.js | 1.11.0 | SQLite WASM engine |
| localforage | ^1.10.0 | IndexedDB offline storage |
| Zustand | ^4.5.0 | State management |
| react-router-dom | ^6.26.0 | Client routing |
| Recharts | ^2.12.2 | Charts |
| MapLibre GL | ^5.24.0 | Map rendering |
| lucide-react | ^0.344.0 | Icons |
| jsPDF | ^4.2.1 | PDF generation |
| Tesseract.js | ^7.0.0 | OCR engine |

[2.7.0]: #
[2.6.0]: #
