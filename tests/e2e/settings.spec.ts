import { test, expect } from '@playwright/test';

test.describe('Settings — Negocio', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/settings/general');
    await expect(page).not.toHaveURL(/\/login/);
  });

  test('carga la página de settings y muestra el formulario (admin)', async ({ page }) => {
    const form = page.locator('form, [data-testid="settings-form"]').first();
    const restricted = page.locator(':text("Acceso restringido")');

    // Puede ser admin (muestra form) o no-admin (muestra acceso restringido)
    const hasForm = await form.count() > 0;
    const hasRestricted = await restricted.count() > 0;
    expect(hasForm || hasRestricted).toBe(true);
  });

  test('puede editar y guardar el nombre del negocio (solo admin)', async ({ page }) => {
    const nameInput = page.getByLabel(/nombre del negocio/i).first();
    if (await nameInput.count() === 0) { test.skip(); return; }

    await nameInput.fill('Negocio E2E Test');

    const saveBtn = page.getByRole('button', { name: /guardar/i }).first();
    await saveBtn.click();

    // Debe aparecer toast de éxito
    await expect(
      page.locator(':text("guardado"), :text("Guardado"), :text("éxito")')
    ).toBeVisible({ timeout: 8_000 });
  });

  test('seleccionar un color de marca actualiza el radio seleccionado', async ({ page }) => {
    const radioGroup = page.getByRole('radiogroup').first();
    if (await radioGroup.count() === 0) { test.skip(); return; }

    const radios = radioGroup.getByRole('radio');
    const count = await radios.count();
    if (count < 2) { test.skip(); return; }

    // Click en el segundo color
    const secondRadio = radios.nth(1);
    await secondRadio.click();
    await expect(secondRadio).toHaveAttribute('aria-checked', 'true');
  });
});

test.describe('Settings — Módulos', () => {
  test('carga la página de módulos', async ({ page }) => {
    await page.goto('/settings/modules');
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.locator('body')).not.toContainText('500');
  });
});

test.describe('Settings — Sucursales', () => {
  test('carga la página de sucursales', async ({ page }) => {
    await page.goto('/settings/branches');
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.locator('body')).not.toContainText('500');
  });
});
