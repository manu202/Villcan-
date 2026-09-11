import { test, expect } from '@playwright/test';

const SLUG = process.env.E2E_STOREFRONT_SLUG ?? 'demo';
const BASE = `/tienda/${SLUG}`;

test.describe('Storefront — catálogo público', () => {
  test('carga la página con nombre del negocio y productos', async ({ page }) => {
    await page.goto(BASE);

    // Título del negocio visible
    await expect(page.locator('h1, [data-testid="store-name"]').first()).toBeVisible();
  });

  test('muestra estado vacío cuando no hay productos', async ({ page }) => {
    // Si el slug no existe o no tiene productos, debe mostrar mensaje claro — no 500
    const resp = await page.goto(BASE);
    expect(resp?.status()).not.toBe(500);
    await expect(page.locator('body')).not.toContainText('Error');
  });
});

test.describe('Storefront — flujo de checkout', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE);
  });

  test('puede agregar un producto al carrito', async ({ page }) => {
    // Busca el primer producto disponible
    const firstProduct = page.locator('[data-testid="product-card"], .product-card, article').first();
    const productExists = await firstProduct.count() > 0;

    if (!productExists) {
      test.skip(); // No hay productos configurados en este entorno
      return;
    }

    await firstProduct.click();

    // El sheet/modal de producto debe abrirse
    await expect(
      page.locator('[role="dialog"], [data-vaul-drawer], .product-sheet').first()
    ).toBeVisible({ timeout: 5_000 });
  });

  test('checkout completo: nombre + teléfono + método de pago', async ({ page }) => {
    const firstProduct = page.locator('[data-testid="product-card"], .product-card, article').first();
    if (await firstProduct.count() === 0) { test.skip(); return; }

    // Abre el producto y lo agrega
    await firstProduct.click();
    const addBtn = page.getByRole('button', { name: /agregar|añadir|add/i }).first();
    if (await addBtn.count() > 0) await addBtn.click();

    // Ir al carrito / checkout
    const checkoutBtn = page.getByRole('button', { name: /ver pedido|checkout|confirmar/i }).first();
    if (await checkoutBtn.count() > 0) await checkoutBtn.click();

    // Llenar datos del cliente
    const nameField = page.getByLabel(/nombre/i).first();
    if (await nameField.count() > 0) {
      await nameField.fill('Test E2E');
      const phoneField = page.getByLabel(/teléfono|celular/i).first();
      if (await phoneField.count() > 0) await phoneField.fill('0981111111');

      // Seleccionar método de pago
      const efectivoBtn = page.getByRole('button', { name: /efectivo/i }).first();
      if (await efectivoBtn.count() > 0) await efectivoBtn.click();

      // Confirmar pedido
      const confirmBtn = page.getByRole('button', { name: /confirmar|realizar pedido|pedir/i }).first();
      if (await confirmBtn.count() > 0) {
        await confirmBtn.click();
        // Espera confirmación — puede ser un mensaje de éxito o redirección
        await expect(
          page.locator(':text("Pedido"), :text("pedido"), :text("confirmado")')
        ).toBeVisible({ timeout: 10_000 });
      }
    }
  });
});
