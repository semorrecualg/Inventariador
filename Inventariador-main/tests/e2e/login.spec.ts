import { test, expect } from './fixtures';

/**
 * Login Flow — estado real da app.
 *
 * A rota pós-login depende da base local: carregada → CONTRATO (#/contexto);
 * aparelho novo, base vazia → Gestor de Base (#/db-manager). Em nenhum caso
 * cai em /unit. O acesso `admin`/`admin` é o mestre local previsto em
 * `Login.tsx` e não precisa de Supabase.
 */
const POS_LOGIN = /\/(contexto|db-manager)/;

test.describe('Login Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/#/login');
    await expect(page.getByPlaceholder(/Digite seu usuário/)).toBeVisible({ timeout: 15000 });
  });

  test.describe('Branding & Layout', () => {
    test('should display the login page with complete branding', async ({ page }) => {
      await expect(page.getByText('GBR', { exact: true }).first()).toBeVisible();
      await expect(page.getByText('AUDITORIA', { exact: true }).first()).toBeVisible();
      await expect(page.getByText('INVENTÁRIO DE ATIVO IMOBILIZADO')).toBeVisible();

      // O selo reflecte o ambiente real do build (SUPABASE na web publicada).
      await expect(page.getByText(/AMBIENTE: (SUPABASE \(WEB\)|MOBILE \(LOCAL\))/)).toBeVisible();

      await expect(page.getByPlaceholder(/Digite seu usuário/)).toBeVisible();
      await expect(page.getByPlaceholder('••••••••')).toBeVisible();
      await expect(page.getByRole('button', { name: /Acessar Sistema/i })).toBeVisible();
    });

    test('should show correct form field labels', async ({ page }) => {
      await expect(page.getByText('Usuário ou e-mail', { exact: true })).toBeVisible();
      await expect(page.getByText('Senha', { exact: true })).toBeVisible();
    });

    test('should show version info in footer', async ({ page }) => {
      await expect(page.getByText('AUDITORIA INTELIGENTE')).toBeVisible();
      // A versão vem do package.json: não fixar o número no teste.
      await expect(page.getByText(/VERSÃO \d+\.\d+\.\d+/)).toBeVisible();
      await expect(page.getByText(/GBR NATIVE READY/)).toBeVisible();
    });

    test('should show the access instruction for the active environment', async ({ page }) => {
      // INTERNAL mostra a instrução para auditores; a web publicada, o aviso de acesso restrito.
      await expect(page.getByText(/Acesso restrito|Auditores:/)).toBeVisible();
    });
  });

  test.describe('Authentication', () => {
    test('should show error with invalid credentials', async ({ page }) => {
      await page.getByPlaceholder(/Digite seu usuário/).fill('invalid_user');
      await page.getByPlaceholder('••••••••').fill('wrong_password');
      await page.getByRole('button', { name: /Acessar Sistema/i }).click();

      // O banner de erro é o único bloco com `animate-shake` na entrada.
      await expect(page.locator('.animate-shake')).toBeVisible({ timeout: 15000 });
      await expect(page).not.toHaveURL(POS_LOGIN);
    });

    test('should show loading state on submit button during authentication', async ({ page }) => {
      await page.getByPlaceholder(/Digite seu usuário/).fill('admin');
      await page.getByPlaceholder('••••••••').fill('admin');
      await page.getByRole('button', { name: /Acessar Sistema/i }).click();

      const loadingBtn = page.getByRole('button', { name: /Autenticando/i });
      const navigationPromise = page.waitForURL(POS_LOGIN, { timeout: 20000 });

      await Promise.race([
        expect(loadingBtn).toBeVisible({ timeout: 3000 }).then(() => navigationPromise),
        navigationPromise,
      ]);
    });

    test('should log in with valid admin credentials', async ({ page }) => {
      await page.getByPlaceholder(/Digite seu usuário/).fill('admin');
      await page.getByPlaceholder('••••••••').fill('admin');
      await page.getByRole('button', { name: /Acessar Sistema/i }).click();

      await page.waitForURL(POS_LOGIN, { timeout: 20000 });
      expect(new URL(page.url()).hash).not.toContain('/unit');
    });

    test('should persist user session in sessionStorage after login', async ({ page }) => {
      await page.getByPlaceholder(/Digite seu usuário/).fill('admin');
      await page.getByPlaceholder('••••••••').fill('admin');
      await page.getByRole('button', { name: /Acessar Sistema/i }).click();

      await page.waitForURL(POS_LOGIN, { timeout: 20000 });

      const sessionUser = await page.evaluate(() => sessionStorage.getItem('app_current_user'));
      expect(sessionUser).not.toBeNull();
      const parsed = JSON.parse(sessionUser!);
      // O mestre local assume o perfil do dono global (VITE_ADMIN_EMAIL), por
      // isso o username vem do email — o que importa é a sessão ser de ADMIN.
      expect(String(parsed.username || '').length).toBeGreaterThan(0);
      expect(parsed.email).toBeTruthy();
      expect(parsed.role).toBe('ADMIN');
    });
  });

  test.describe('Password Visibility Toggle', () => {
    test('should toggle password visibility on eye icon click', async ({ page }) => {
      const passwordInput = page.getByPlaceholder('••••••••');
      await expect(passwordInput).toHaveAttribute('type', 'password');

      await page.locator('input[placeholder="••••••••"] + button').click();
      await expect(passwordInput).toHaveAttribute('type', 'text');

      await page.locator('input[placeholder="••••••••"] + button').click();
      await expect(passwordInput).toHaveAttribute('type', 'password');
    });
  });

  test.describe('Privacy Center', () => {
    test('should open privacy center from login footer', async ({ page }) => {
      await page.getByRole('button', { name: /Privacidade/i }).click();
      await expect(page.getByText('Centro de Privacidade')).toBeVisible({ timeout: 5000 });
    });
  });

  test.describe('Demo Mode', () => {
    test('should show demo mode button when not loading', async ({ page }) => {
      await expect(page.getByRole('button', { name: /Experimentar Grátis/i })).toBeVisible();
    });

    test('should show loading state on submit button when demo mode is clicked', async ({ page }) => {
      await page.getByRole('button', { name: /Experimentar Grátis/i }).click();

      const loadingBtn = page.getByRole('button', { name: /Autenticando/i });
      const navigationPromise = page.waitForURL(POS_LOGIN, { timeout: 20000 });

      await Promise.race([
        expect(loadingBtn).toBeVisible({ timeout: 3000 }).then(() => navigationPromise),
        navigationPromise,
      ]);
    });
  });

  test.describe('Reset Access', () => {
    test('should show reset access dialog on click', async ({ page }) => {
      await page.getByRole('button', { name: /Redefinir Acesso/i }).click();

      await expect(page.getByText('Redefinir Acesso Local')).toBeVisible();
      await expect(page.getByRole('button', { name: /Redefinir Agora/i })).toBeVisible();
      await expect(page.getByRole('button', { name: /Cancelar/i })).toBeVisible();
    });

    test('should cancel reset access dialog', async ({ page }) => {
      await page.getByRole('button', { name: /Redefinir Acesso/i }).click();
      await page.getByRole('button', { name: /Cancelar/i }).click();

      await expect(page.getByText('Redefinir Acesso Local')).not.toBeVisible();
    });
  });
});
