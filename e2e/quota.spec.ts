import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { noCodes, resetRoomLimits, setExhaustedQuota, clearExhaustedQuota } from './helpers';

test('create quota reports a human wait time under the button', async ({ page }) => {
  resetRoomLimits();
  setExhaustedQuota();
  await page.goto('/');
  try {
    await expect(page.locator('.game-ai-notice')).toContainText("Today's free AI limit is reached.");
    await expect(page.locator('.game-voice-notice')).toContainText('Voice is resting until');
  } finally { clearExhaustedQuota(); }
  await page.getByLabel('Your name', { exact: true }).fill('Quota tester');
  await page.getByLabel('The question').fill(`E2E quota ${randomUUID()}`);
  await page.getByRole('button', { name: 'Create room', exact: true }).click();
  await page.getByRole('button', { name: 'Leave room', exact: true }).click();
  await page.getByLabel('Your name', { exact: true }).fill('Quota tester');
  await page.getByLabel('The question').fill(`E2E second ${randomUUID()}`);
  await page.getByRole('button', { name: 'Create room', exact: true }).click();
  await expect(page.locator('form').filter({ has: page.getByRole('button', { name: 'Create room', exact: true }) }).locator('.game-field-error')).toContainText(/Try again in \d+ minute/);
  await noCodes(page);
});
