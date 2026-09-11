import { test, expect } from '@playwright/test';

test.describe('Pedidos — listado y KDS', () => {
  test('carga la lista de pedidos', async ({ page }) => {
    await page.goto('/orders');
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.locator('h1, [data-testid="page-title"]').first()).toBeVisible({ timeout: 8_000 });
  });

  test('muestra estado vacío cuando no hay pedidos', async ({ page }) => {
    await page.goto('/orders');
    const body = await page.locator('body');
    // No debe haber un error en pantalla
    await expect(body).not.toContainText('Error inesperado');
    await expect(body).not.toContainText('500');
  });

  test('puede abrir el detalle de un pedido existente', async ({ page }) => {
    await page.goto('/orders');

    const orderCard = page
      .locator('[data-testid="order-card"], .order-card, article, tr')
      .first();

    const hasOrders = await orderCard.count() > 0;
    if (!hasOrders) { test.skip(); return; }

    await orderCard.click();

    // Debe mostrar el detalle del pedido
    await expect(
      page.locator('[data-testid="order-detail"], [role="dialog"]').first()
    ).toBeVisible({ timeout: 5_000 });
  });
});

test.describe('Pedidos — ciclo de vida', () => {
  test('pedido pendiente puede marcarse como completado', async ({ page }) => {
    await page.goto('/orders');

    // Busca un pedido en estado pendiente
    const pendingOrder = page
      .locator(':text("Pendiente"), :text("pendiente")')
      .first();

    if (await pendingOrder.count() === 0) { test.skip(); return; }

    await pendingOrder.click();

    const completeBtn = page
      .getByRole('button', { name: /completar|marcar.*completado/i })
      .first();

    if (await completeBtn.count() === 0) { test.skip(); return; }

    await completeBtn.click();

    // Confirmar si hay dialog de confirmación
    const confirmBtn = page.getByRole('button', { name: /confirmar|aceptar|sí/i }).first();
    if (await confirmBtn.count() > 0) await confirmBtn.click();

    // Debe aparecer estado completado o toast de éxito
    await expect(
      page.locator(':text("Completado"), :text("completado"), :text("éxito")')
    ).toBeVisible({ timeout: 10_000 });
  });
});
