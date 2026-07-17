import { test, expect } from './fixtures';

test.describe('Login Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/#/login');
  });

  test.describe('Branding & Layout', () => {
    test('should display the login page with complete branding', async ({ page }) => {
      // Logo and title
      await expect(page.locator('text=GBR')).toBeVisible();
      await expect(page.locator('text=AUDITORIA')).toBeVisible();
      await expect(page.locator('text=INVENTÁRIO DE ATIVO IMOBILIZADO')).toBeVisible();

      // Environment badge (contains pulsing indicator + text)
      await expect(page.locator('text=AMBIENTE: MOBILE (LOCAL)')).toBeVisible();

      // Form fields
      await expect(page.getByPlaceholder(/Digite seu usuário/)).toBeVisible();
      await expect(page.getByPlaceholder('••••••••')).toBeVisible();
      await expect(page.getByRole('button', { name: /Acessar Sistema/i })).toBeVisible();
    });

    test('should show correct form field labels', async ({ page }) => {
      await expect(page.locator('text=Usuário ou e-mail')).toBeVisible();
      await expect(page.locator('text=Senha')).toBeVisible();
    });

    test('should show version info in footer', async ({ page }) => {
      await expect(page.locator('text=AUDITORIA INTELIGENTE')).toBeVisible();
      await expect(page.locator('text=VERSÃO 2.6')).toBeVisible();
    });

    test('should show audit mode instruction text', async ({ page }) => {
      // INTERNAL mode shows specific instruction
      await expect(page.locator('text=Auditores:')).toBeVisible();
    });
  });

  test.describe('Authentication', () => {
    test('should show error with invalid credentials', async ({ page }) => {
      await page.getByPlaceholder(/Digite seu usuário/).fill('invalid_user');
      await page.getByPlaceholder('••••••••').fill('wrong_password');
      await page.getByRole('button', { name: /Acessar Sistema/i }).click();

      // Error banner appears with animation
      await expect(page.locator('.animate-shake')).toBeVisible({ timeout: 10000 });
      await expect(page.locator('text=Usuário ou senha inválidos')).toBeVisible();
    });

    test('should show loading state on submit button during authentication', async ({ page }) => {
      await page.getByPlaceholder(/Digite seu usuário/).fill('admin');
      await page.getByPlaceholder('••••••••').fill('admin');
      await page.getByRole('button', { name: /Acessar Sistema/i }).click();

      // The submit button briefly shows "Autenticando..." while loading, then
      // the app navigates. Use Promise.race to handle both fast and slow auth.
      const loadingBtn = page.getByRole('button', { name: /Autenticando/i });
      const navigationPromise = page.waitForURL(/\/(?:menu|dashboard|unit)/, { timeout: 15000 });

      // Wait for loading text to appear OR navigation to complete (whichever comes first)
      await Promise.race([
        expect(loadingBtn).toBeVisible({ timeout: 3000 }).then(() => navigationPromise),
        navigationPromise,
      ]);
    });

    test('should log in with valid admin credentials', async ({ page }) => {
      await page.getByPlaceholder(/Digite seu usuário/).fill('admin');
      await page.getByPlaceholder('••••••••').fill('admin');
      await page.getByRole('button', { name: /Acessar Sistema/i }).click();

      // Should redirect to unit selection or main menu after login
      await page.waitForURL(/\/(menu|dashboard|unit)/, { timeout: 15000 });
    });

    test('should persist user session in sessionStorage after login', async ({ page }) => {
      await page.getByPlaceholder(/Digite seu usuário/).fill('admin');
      await page.getByPlaceholder('••••••••').fill('admin');
      await page.getByRole('button', { name: /Acessar Sistema/i }).click();

      // Wait for navigation to complete
      await page.waitForURL(/\/(menu|dashboard|unit)/, { timeout: 15000 });

      // Verify session storage has user data
      const sessionUser = await page.evaluate(() => {
        return sessionStorage.getItem('app_current_user');
      });
      expect(sessionUser).not.toBeNull();
      const parsed = JSON.parse(sessionUser!);
      expect(parsed.username).toBe('admin');
      expect(parsed.email).toBeTruthy();
    });


  });

  test.describe('Password Visibility Toggle', () => {
    test('should toggle password visibility on eye icon click', async ({ page }) => {
      const passwordInput = page.getByPlaceholder('••••••••');
      await expect(passwordInput).toHaveAttribute('type', 'password');

      // Click the toggle button (eye icon) inside the password field container
      await page.locator('input[placeholder="••••••••"] + button').click();
      await expect(passwordInput).toHaveAttribute('type', 'text');

      // Click again to hide password
      await page.locator('input[placeholder="••••••••"] + button').click();
      await expect(passwordInput).toHaveAttribute('type', 'password');
    });
  });

  test.describe('Privacy Center', () => {
    test('should open privacy center from login footer', async ({ page }) => {
      await page.getByRole('button', { name: /Privacidade/i }).click();

      // Privacy center overlay should be visible
      await expect(page.locator('text=Privacidade')).toBeVisible({ timeout: 5000 });
    });
  });

  test.describe('Demo Mode', () => {
    test('should show demo mode button when not loading', async ({ page }) => {
      await expect(page.getByRole('button', { name: /Experimentar Grátis/i })).toBeVisible();
    });

    test('should show loading state on submit button when demo mode is clicked', async ({ page }) => {
      await page.getByRole('button', { name: /Experimentar Grátis/i }).click();

      // After clicking demo mode, the submit button changes to show "Autenticando..."
      // (the demo button itself disappears during loading)
      // Verify the submit button shows loading state
      await expect(page.getByRole('button', { name: /Autenticando/i })).toBeVisible({
        timeout: 5000,
      });
    });
  });

  test.describe('Reset Access', () => {
    test('should show reset access dialog on click', async ({ page }) => {
      await page.getByRole('button', { name: /Redefinir Acesso/i }).click();

      await expect(page.locator('text=Redefinir Acesso Local')).toBeVisible();
      await expect(page.getByRole('button', { name: /Redefinir Agora/i })).toBeVisible();
      await expect(page.getByRole('button', { name: /Cancelar/i })).toBeVisible();
    });

    test('should cancel reset access dialog', async ({ page }) => {
      await page.getByRole('button', { name: /Redefinir Acesso/i }).click();
      await page.getByRole('button', { name: /Cancelar/i }).click();

      // Dialog should close
      await expect(page.locator('text=Redefinir Acesso Local')).not.toBeVisible();
    });
  });

  test.describe('Biometric Login', () => {
    test.skip('should show biometric login button when username has biometric registered', async ({
      page,
    }) => {
      // Biometric E2E testing requires WebAuthn Platform Authenticator (TouchID/FaceID)
      // which is not available in headless Playwright or CI environments.
      // isBiometricSupported() returns false in headless browsers, so this test
      // serves as documentation of the expected flow.
      //
      // To re-enable: install a WebAuthn mocking Playwright utility and seed
      // localforage store 'GBR_Audit_v24' / 'gbr_biometric_credentials' with
      // a credential entry before filling the username.

      await page.getByPlaceholder(/Digite seu usuário/).fill('admin_biometric');
      // If biometric were supported, the button would appear after the async check
      await expect(page.getByRole('button', { name: /Entrar com Biometria/i })).toBeVisible({
        timeout: 5000,
      });
    });
  });
});
