import { test, expect } from '@playwright/test';

// A minimal valid 1x1 PNG, inlined so this suite needs no binary fixture file.
const PNG_1X1_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

test.describe('Catálogo — imagen de servicio (Storage)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/services/new');
    await expect(page).not.toHaveURL(/\/login/);
  });

  test('carga el formulario de nuevo servicio con el campo de imagen', async ({ page }) => {
    await expect(page.getByLabel(/subir imagen/i)).toBeAttached({ timeout: 8_000 });
  });

  test('subir una imagen muestra el estado "Subiendo" y luego la vista previa', async ({ page }) => {
    const fileInput = page.getByLabel(/subir imagen/i);
    await expect(fileInput).toBeAttached({ timeout: 8_000 });

    // BranchContext resolves the current branch asynchronously; the upload
    // handler refuses (correctly, "Seleccioná una sucursal...") if it fires
    // before that resolves. The nav's branch name can render before the
    // form's own currentBranch closure is ready, so a fixed settle window
    // is more reliable here than racing a UI signal.
    await page.waitForTimeout(2_500);

    await fileInput.setInputFiles({
      name: 'test-service-image.png',
      mimeType: 'image/png',
      buffer: Buffer.from(PNG_1X1_BASE64, 'base64'),
    });

    // Real Storage round trip: upload → public URL → <img> preview.
    // No mocking — this is exactly the S-1/S-4 branch-scoped bucket path.
    await expect(page.locator('img.image-preview')).toBeVisible({ timeout: 15_000 });

    const src = await page.locator('img.image-preview').getAttribute('src');
    expect(src).toBeTruthy();
    expect(src).toMatch(/service-images/);

    // The uploaded object must actually be publicly fetchable, not just
    // referenced by a URL the <img> tag silently fails to load.
    const resp = await page.request.get(src!);
    expect(resp.status()).toBe(200);
  });

  test('un archivo que no es imagen no rompe la página (validación del navegador vía accept="image/*")', async ({ page }) => {
    const fileInput = page.getByLabel(/subir imagen/i);
    await expect(fileInput).toHaveAttribute('accept', 'image/*', { timeout: 8_000 });
  });
});
