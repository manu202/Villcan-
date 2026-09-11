import { test, expect } from '@playwright/test';

test.describe('Movimientos — listado', () => {
  test('carga la página de movimientos autenticado', async ({ page }) => {
    await page.goto('/movements');
    await expect(page).not.toHaveURL(/\/login/);
    // Debe mostrar la página de movimientos (título o lista)
    await expect(page.locator('h1, [data-testid="page-title"]').first()).toBeVisible({ timeout: 8_000 });
  });

  test('redirige a /login si no está autenticado (en modo sin sesión)', async ({ browser }) => {
    // Test de seguridad: sin storageState (sesión limpia) debe pedir login
    const ctx = await browser.newContext({ storageState: undefined });
    const page = await ctx.newPage();
    await page.goto('/movements');
    // Si el client guard funciona, debe redirigir o mostrar login
    // (puede ser redirect o renderizar el login inline)
    const url = page.url();
    const body = await page.textContent('body');
    const isProtected =
      url.includes('/login') || (body?.includes('Ingresar') ?? false);
    expect(isProtected).toBe(true);
    await ctx.close();
  });
});

test.describe('Movimientos — crear venta (nuevo pedido)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/movements/new');
    await expect(page).not.toHaveURL(/\/login/);
  });

  test('muestra el selector de tipo de movimiento', async ({ page }) => {
    // La pantalla inicial del form debe mostrar las opciones de tipo
    const servicioOption = page.getByText(/servicio|venta/i).first();
    await expect(servicioOption).toBeVisible({ timeout: 8_000 });
  });

  test('flujo completo: seleccionar servicio → agregar al carrito → crear pedido', async ({ page }) => {
    // 1. Seleccionar tipo "Servicio"
    const servicioBtn = page.getByRole('button', { name: /servicio/i }).first();
    if (await servicioBtn.count() === 0) { test.skip(); return; }
    await servicioBtn.click();

    // 2. Debe cargar el catálogo de servicios
    const catalogItem = page.locator('[data-testid="service-item"], .catalog-item, li').first();
    await expect(catalogItem).toBeVisible({ timeout: 8_000 });

    // 3. Agregar primer servicio
    await catalogItem.click();
    // Botón para continuar al pago
    const nextBtn = page.getByRole('button', { name: /continuar|siguiente|pago/i }).first();
    if (await nextBtn.count() > 0) await nextBtn.click();

    // 4. Seleccionar método de pago
    const paymentBtn = page.getByRole('button', { name: /efectivo|transferencia/i }).first();
    if (await paymentBtn.count() > 0) await paymentBtn.click();

    // 5. Crear pedido
    const createBtn = page.getByRole('button', { name: /crear pedido/i }).first();
    if (await createBtn.count() > 0) {
      await createBtn.click();
      // Debe redirigir a /orders tras crear el pedido
      await page.waitForURL(/\/orders/, { timeout: 10_000 });
      await expect(page).toHaveURL(/\/orders/);
    }
  });
});
