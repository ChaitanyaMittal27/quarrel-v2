import { test, expect } from '@playwright/test';
import { noCodes, screen } from './helpers';

for (const width of [1280, 320]) test(`forms, field feedback and focus at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: width === 320 ? 640 : 800 });
  await page.goto('/');
  await expect(page.getByText("Debates are processed by Google Gemini (free tier; Google may use content to improve its products). Don't share personal information.", { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create room', exact: true })).toBeEnabled();
  await screen(page, '01', 'home', width, 'Create room');
  await page.getByRole('button', { name: 'Create room', exact: true }).click();
  const name = page.getByLabel('Your name', { exact: true }), topic = page.getByLabel('The question');
  for (const field of [name, topic]) {
    await expect(field).toHaveAttribute('aria-invalid', 'true');
    await expect(field).toHaveCSS('border-top-color', 'rgb(161, 45, 42)');
    await expect(page.locator(`[id="${await field.getAttribute('aria-describedby')}"]`)).not.toBeEmpty();
  }
  await expect(name).toBeFocused();
  await name.fill('x'.repeat(33)); await topic.fill('x'.repeat(241));
  await page.getByRole('button', { name: 'Create room', exact: true }).click();
  await expect(name).toBeFocused(); await expect(topic).toHaveAttribute('aria-invalid', 'true');
  await screen(page, '02', 'form-errors', width);
  await noCodes(page);
  await name.fill('Valid name'); await topic.fill('A valid question');
  await expect(name).not.toHaveAttribute('aria-invalid', 'true'); await expect(topic).not.toHaveAttribute('aria-invalid', 'true');
  const code = page.getByLabel('Room code', { exact: true });
  await code.fill('bad'); await page.getByRole('button', { name: 'Join room', exact: true }).click();
  await expect(code).toBeFocused(); await expect(code).toHaveAttribute('aria-invalid', 'true');
  await code.fill('ZZZZZZ'); await page.getByRole('button', { name: 'Join room', exact: true }).click();
  await expect(code).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator(`[id="${await code.getAttribute('aria-describedby')}"]`)).toContainText(/find|exist|code/i);
  await noCodes(page);
});
