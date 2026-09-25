import { test, expect } from '@playwright/test';

test.describe('Errores de usuarios (/errors)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/errors');
    await expect(page).not.toHaveURL(/\/login/);
  });

  test('carga sin error, mostrando la lista o el acceso restringido para no-admin', async ({ page }) => {
    const restricted = page.locator(':text("Acceso restringido")');
    const title = page.getByRole('heading', { name: /errores de usuarios/i });

    await expect(title).toBeVisible({ timeout: 8_000 });
    await expect(page.locator('body')).not.toContainText('500');

    if (await restricted.count() > 0) {
      await expect(restricted).toBeVisible();
      return;
    }

    // Admin view: either the empty state or the error list must render,
    // never an indefinite spinner / a fetch error toast.
    const emptyState = page.getByText(/sin errores registrados/i);
    const errorList = page.locator('.error-list, [data-testid="error-item"]');
    await expect(emptyState.or(errorList.first())).toBeVisible({ timeout: 8_000 });
  });

  test('un item de error puede expandirse para ver el detalle (admin, si hay errores)', async ({ page }) => {
    // isAdminAnywhere/data-loading race, same shape as closings.spec.ts's
    // waitForBranchContextReady: settle past it with a fixed wait rather
    // than racing the transient "Acceso restringido" render.
    await page.waitForTimeout(2_500);
    const restricted = page.locator(':text("Acceso restringido")');
    if (await restricted.count() > 0) { test.skip(); return; }

    const firstError = page.locator('.error-item, [data-testid="error-item"]').first();
    if (await firstError.count() === 0) { test.skip(); return; }

    await firstError.getByRole('button').first().click();
    await expect(firstError.locator('.error-details, [data-testid="error-detail"]')).toBeVisible({
      timeout: 5_000,
    });
  });

  test('sin sesión, la página no expone errores de otros usuarios', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: undefined });
    const page = await ctx.newPage();
    await page.goto('/errors');

    // AuthGuard's session check is async (client-side only, no server
    // redirect -- see AuthGuard.tsx) -- give it time to resolve and
    // navigate before asserting, instead of racing it.
    await page.waitForURL(/\/login/, { timeout: 8_000 }).catch(() => undefined);

    const url = page.url();
    const body = await page.textContent('body');
    const isProtected = url.includes('/login') || (body?.includes('Ingresar') ?? false);
    expect(isProtected).toBe(true);
    expect(body).not.toContain('@example.com');
    await ctx.close();
  });
});
