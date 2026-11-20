import { randomUUID } from 'node:crypto';
import { test, expect, type Page } from '@playwright/test';
import { lawyers } from '../shared/config/catalog';
import { compose, createAndJoin, noCodes, players, position, screen, type ObservedPlayer } from './helpers';

const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
const plays = (page: Page) => page.evaluate(() => (window as unknown as { __speechRecords: Record<string, unknown>[] }).__speechRecords.filter((r) => r.action === 'play'));
test.beforeAll(() => {
  for (const service of ['api', 'worker']) compose('exec', '-T', service, 'node', '-e',
    "if(process.env.JUDGE_AI_MODE!=='demo')throw new Error('E2E requires demo mode')");
});
async function settings(page: Page, open: boolean) {
  if (await button(page, 'Settings').getAttribute('aria-expanded') !== String(open)) await button(page, 'Settings').click();
}
async function pick(player: ObservedPlayer, name: string) {
  const choice = button(player.page, `Choose ${name}`); await choice.click();
  await expect(player.page.locator('.art-card').filter({ has: player.page.getByRole('heading', { name, exact: true }) }).getByRole('button')).toHaveAttribute('aria-pressed', 'true');
}

for (const width of [1280, 320]) test(`whole demo game, independent players, ${width}px`, async ({ browser }) => {
  const group = await players(browser, width), { a, b } = group;
  const topic = `E2E ${randomUUID()}: should the town build a shared garden?`;
  // Each run creates fresh sessions and a unique room; existing SQL/Redis data is never reset.
  try {
    await createAndJoin(a, b, topic);
    await screen(a.page, '03', 'positions', width, 'Save position');
    await button(a.page, 'Save position').click(); await expect(a.page.getByLabel('Your position', { exact: true })).toBeFocused();
    await a.page.getByLabel('Your position', { exact: true }).fill('x'.repeat(601)); await button(a.page, 'Save position').click();
    await expect(a.page.getByLabel('Your position', { exact: true })).toHaveAttribute('aria-invalid', 'true');
    await position(a, 'A shared garden benefits the community.'); await position(b, 'We should protect the budget first.');
    for (const player of [a, b]) {
      await settings(player.page, true); await pick(player, 'Leo'); await pick(player, 'Tavi');
    }
    await a.page.getByLabel('Reduced motion').selectOption('on');
    await a.page.getByLabel('Text size').selectOption('large');
    await screen(a.page, '04', 'settings', width, 'Choose Zuri');
    await a.page.reload(); await settings(a.page, true);
    await expect(a.page.getByLabel('Reduced motion')).toHaveValue('on');
    await expect(a.page.getByLabel('Text size')).toHaveValue('large');
    await a.page.getByLabel('Reduced motion').selectOption('off');
    await a.page.getByLabel('Text size').selectOption('standard');
    for (const player of [a, b]) {
      await expect(player.page.locator('.game-court [data-asset-id="character:lion"]')).toHaveCount(2);
      await expect(player.page.locator('.game-court [data-asset-id="lawyer:jungle-lawyer-a"]')).toHaveCount(2);
      await settings(player.page, false);
    }
    await button(a.page, 'Ready').click();
    await settings(a.page, true); await pick(a, 'Fern'); await settings(a.page, false);
    await expect.poll(() => b.latest?.players[0]?.lawyerId).toBe('jungle-fern');
    expect(a.latest!.players[0]!.ready).toBe(true);
    for (const player of [a, b]) await expect(player.page.locator('.game-court [data-asset-id="lawyer:jungle-lawyer-b"]')).toHaveCount(1);

    // Hold only the worker so the real pre-plan Start state can be observed deterministically.
    compose('stop', 'worker');
    await button(b.page, 'Ready').click(); await Promise.all([a.phase('planning'), b.phase('planning')]);
    await expect(button(a.page, 'Start debate')).toBeDisabled();
    await expect(a.page.locator('#start-reason')).toHaveText('The plan is still being prepared.');
    await screen(a.page, '05', 'preparing-plan', width, 'Start debate');
    compose('start', 'worker');
    await expect(button(a.page, 'Start debate')).toBeEnabled();
    await expect.poll(() => b.latest?.plan).toEqual(a.latest!.plan);
    await screen(a.page, '06', 'plan', width, 'Start debate');
    await button(a.page, 'Start debate').click();
    await Promise.all([a.phase('debate'), b.phase('debate')]);
    expect(a.latest!.startsAt).toBe(b.latest!.startsAt);
    await expect(a.page.locator('.game-countdown')).toBeVisible(); await expect(b.page.locator('.game-countdown')).toBeVisible();
    await screen(a.page, '07', 'countdown', width);
    await expect(button(a.page, 'Send')).toBeEnabled();
    await expect(button(b.page, 'Send')).toBeDisabled();
    await button(a.page, 'Send').click(); await expect(a.page.getByLabel('Your argument', { exact: true })).toBeFocused();
    await a.page.getByLabel('Your argument', { exact: true }).fill('x'.repeat(601)); await button(a.page, 'Send').click();
    await expect(a.page.getByLabel('Your argument', { exact: true })).toHaveAttribute('aria-invalid', 'true');
    await a.page.getByLabel('Your argument', { exact: true }).fill('Shared gardens build useful community connections.');

    // Two private consultations, including every snapshot/payload seen by the opponent.
    const privateStart = b.network.length, snapshotStart = b.snapshots.length;
    for (const question of ['PRIVATE_ORCHID: how can I make this clearer?', 'PRIVATE_MAPLE: what budget concern should I address?']) {
      await a.page.getByLabel('Your private question', { exact: true }).fill(question);
      await button(a.page, 'Ask your lawyer').click();
      await expect.poll(() => a.latest?.debate?.consultations.filter((c) => c.answer).length).toBe(question.startsWith('PRIVATE_ORCHID') ? 1 : 2);
    }
    await expect(button(a.page, 'Ask your lawyer')).toBeDisabled();
    await expect(a.page.locator('#consult-reason')).toHaveText('You have used both consultations for this subtopic.');
    await expect.poll(() => b.latest?.version).toBe(a.latest!.version);
    await screen(a.page, '08', 'consultations', width, 'Ask your lawyer');
    await expect(b.page.locator('body')).not.toContainText('PRIVATE_');
    for (const raw of b.network.slice(privateStart)) expect(raw).not.toMatch(/PRIVATE_ORCHID|PRIVATE_MAPLE|"state":"consulting"/);
    const answers = a.latest!.debate!.consultations.map((c) => c.answer!);
    for (const snapshot of b.snapshots.slice(snapshotStart)) {
      expect(snapshot.debate!.consultsLeft).toBe(2); expect(snapshot.debate!.consultations).toEqual([]);
      expect(snapshot.debate!.state).not.toBe('consulting');
      for (const answer of answers) expect(JSON.stringify(snapshot)).not.toContain(answer);
    }

    await settings(a.page, true);
    await expect(a.page.getByLabel('Voice on', { exact: true })).toBeChecked();
    await a.page.getByLabel('Autoplay new public items', { exact: true }).check();
    await a.page.getByLabel('Volume', { exact: true }).fill('0.4');
    await a.page.getByLabel('Speed').fill('1.3');
    await settings(a.page, false);
    const before = (await plays(a.page)).length;
    await button(a.page, 'Send').click();
    await expect.poll(() => a.latest?.messages.filter((m) => m.kind === 'argument').length).toBe(1);
    const presentation = a.latest!.messages.find((m) => m.kind === 'argument')!;
    expect(presentation.source).toBe('demo'); expect(presentation.label).toBeTruthy();
    await expect(b.page.locator('[data-kind="argument"]')).toContainText(presentation.text);
    await expect(a.page.locator('[data-kind="argument"] .game-source')).toHaveText('Demo');
    await expect(a.page.locator('[data-kind="argument"]')).toContainText(presentation.label!);
    await expect.poll(async () => (await plays(a.page)).length).toBeGreaterThan(before);
    const request = (await plays(a.page)).at(-1)!;
    const item = a.latest!.speech.find((s) => s.speechId === request.speechId)!;
    const fern = lawyers.find((lawyer) => lawyer.id === 'jungle-fern')!;
    expect(item.voice).toEqual({ geminiVoice: fern.geminiVoice, browserVoice: fern.browserVoice });
    expect(request).toMatchObject({ engine: 'browser', voice: 'E2E English', pitch: item.voice.browserVoice.pitch, volume: .4 });
    expect(Number(request.rate)).toBeCloseTo(item.voice.browserVoice.rate * 1.3, 3);
    await expect(a.page.locator('[data-role="lawyer"][data-slot="A"] [data-state="speaking"]')).toBeVisible();
    await button(a.page, 'Stop argument').click(); await expect(button(a.page, 'Play argument')).toBeEnabled();
    await button(a.page, 'Play argument').click(); await expect(button(a.page, 'Stop argument')).toBeVisible();
    await settings(a.page, true); await a.page.getByLabel('Mute', { exact: true }).check();
    await settings(a.page, false); await expect(button(a.page, 'Play argument')).toBeDisabled();
    await settings(a.page, true); await a.page.getByLabel('Mute', { exact: true }).uncheck(); await settings(a.page, false);
    const arena = a.page.locator('.game-arena-column');
    await expect(a.page.locator('.game-footer')).not.toContainText('API:');
    if (width > 900) {
      await expect(arena).toHaveCSS('position', 'sticky');
      await arena.evaluate((element) => window.scrollTo(0, element.getBoundingClientRect().top + window.scrollY + 100));
      await expect.poll(() => arena.evaluate((element) => Math.round(element.getBoundingClientRect().top))).toBe(20);
    } else await expect(arena).toHaveCSS('position', 'static');
    await screen(a.page, '09', 'debate', width, 'Send');

    // A real outage, rather than page.offline, exercises proxy errors and Socket.IO retry.
    compose('stop', 'api');
    await Promise.all([expect(a.page.locator('.game-reconnecting')).toHaveText('Reconnecting…'), expect(b.page.locator('.game-reconnecting')).toHaveText('Reconnecting…')]);
    await new Promise((resolve) => setTimeout(resolve, 10_000));
    for (const player of [a, b]) { await expect(player.page.getByRole('alert')).toHaveCount(0); await expect(button(player.page, 'Leave room')).toBeVisible(); }
    await screen(a.page, '10', 'reconnecting', width);
    compose('start', 'api');
    for (const player of [a, b]) {
      await expect(player.page.locator('.game-reconnecting')).toHaveCount(0, { timeout: 45_000 });
      await expect(player.page.locator('.game-connection')).toContainText('connected');
    }
    // Reload restores history and autoplay preference, but no interaction has unlocked audio.
    await a.page.reload();
    await expect(a.page.getByLabel('Your argument', { exact: true })).toBeVisible();
    expect(await plays(a.page)).toEqual([]);

    // Stop worker before B sends: capture paused clocks and let the real 30s backstop fire.
    compose('stop', 'worker');
    const raw = 'E2E raw fallback: protect the town budget with a small pilot.';
    await expect(button(b.page, 'Send')).toBeEnabled();
    await b.page.getByLabel('Your argument', { exact: true }).fill(raw); await button(b.page, 'Send').click();
    await expect.poll(() => b.latest?.debate?.state).toBe('lawyering');
    await expect.poll(() => a.latest?.debate?.state).toBe('lawyering');
    const paused = { ...b.latest!.debate!.clocks };
    expect(a.latest!.debate!.clocks).toEqual(paused);
    const pausedAt = b.latest!.serverNow;
    expect(b.latest!.debate!.activeSlot).toBeNull(); expect(b.latest!.debate!.deadline).toBeNull();
    await expect(b.page.getByText('Both clocks are paused.', { exact: true }).first()).toBeVisible();
    await expect.poll(() => b.latest?.messages.find((m) => m.text === raw)?.source, { timeout: 45_000 }).toBe('fallback');
    const fallback = b.latest!.messages.find((m) => m.text === raw)!;
    const resumed = b.snapshots.find((r) => r.messages.some((m) => m.id === fallback.id))!;
    expect(resumed.debate!.clocks.B).toBe(paused.B);
    expect(Date.parse(fallback.at) - Date.parse(pausedAt)).toBeGreaterThanOrEqual(29_000);
    // A's clock resumes when the fallback is saved, a few ms before its snapshot is read.
    expect(resumed.debate!.clocks.A).toBe(Math.max(0, paused.A - (Date.parse(resumed.serverNow) - Date.parse(fallback.at))));
    await expect(a.page.locator('[data-kind="argument"]').filter({ hasText: raw })).toContainText('Fallback');
    expect(await plays(a.page)).toEqual([]);
    await settings(a.page, true);
    await expect.poll(async () => (await plays(a.page)).length).toBe(1);
    expect((await plays(a.page))[0]).toMatchObject({ engine: 'browser', speechId: `${a.latest!.debateId}:${fallback.id}` });
    await settings(a.page, false);
    compose('start', 'worker');

    // No state injection or clock shortening: both real 60s-per-seat subtopic clocks expire.
    for (const ordinal of [1, 2]) {
      const summary = await a.snapshot((r) => r.summary?.ordinal === ordinal && r.summary.current !== null, 270_000);
      // Capture this four-second screen immediately; peer assertions must not consume its window.
      await expect(a.page.locator('.game-summary')).toContainText('Demo summary');
      await screen(a.page, ordinal === 1 ? '11' : '12', `summary-${ordinal}`, width);
      if (ordinal === 2) compose('stop', 'worker');
      const peerSummary = await b.snapshot((r) => r.summary?.ordinal === ordinal && r.summary.current !== null);
      expect(peerSummary.summary).toEqual(summary.summary);
      expect(summary.summary!.current!.text).toContain('Aster'); expect(summary.summary!.current!.text).toContain('Birch');
      expect(summary.summary!.current!.text).not.toMatch(/Player [AB]/u);
      expect(Date.parse(summary.summary!.showUntil!) - Date.parse(summary.summary!.current!.at)).toBe(4000);
      const after = await a.snapshot((r) => r.version > summary.version && r.setup.phase !== 'summary', 15_000);
      expect(Date.parse(after.serverNow)).toBeGreaterThanOrEqual(Date.parse(summary.summary!.showUntil!));
    }
    await a.phase('jury');
    await screen(a.page, '12a', 'jury', width);
    compose('start', 'worker');
    await Promise.all([a.phase('complete'), b.phase('complete')]);
    expect(a.latest!.verdict).toEqual(b.latest!.verdict);
    expect(a.latest!.messages.find((m) => m.id === fallback.id)).toEqual(fallback);
    await expect(a.page.locator('.game-verdict-label')).toHaveText('Demo verdict, not a real judgment');
    await expect(a.page.locator('.game-verdict').getByText('Demo verdict, not a real judgment', { exact: true })).toHaveCount(1);
    expect(a.latest!.verdict!.text).toContain('Aster and Birch');
    for (const summary of a.latest!.summaries) await expect(a.page.locator('.game-verdict').getByText(summary.text, { exact: true })).toHaveCount(1);
    await screen(a.page, '13', 'verdict', width, 'Rematch');
    await expect(button(a.page, 'Mark as reviewed')).toBeEnabled({ timeout: 30_000 });
    await button(a.page, 'Mark as reviewed').click();
    await expect(button(a.page, 'Mark as reviewed')).toHaveCount(0);
    await expect(button(b.page, 'Mark as reviewed')).toBeEnabled();
    const debateId = a.latest!.debateId, setup = a.latest!.setup;
    const canvas = await a.page.locator('.game-shell').evaluate((element) => getComputedStyle(element).backgroundColor);
    for (const player of [a, b]) {
      await player.page.getByRole('link', { name: 'My results', exact: true }).click();
      const result = player.page.locator('.game-results li').filter({ hasText: topic });
      await expect(result).toBeVisible(); await expect(result).toContainText(player === a ? 'Reviewed' : 'Not reviewed');
      await expect(player.page.locator('.game-shell')).toHaveCSS('background-color', canvas);
      await screen(player.page, '14', 'results', width);
      await result.getByRole('link').click(); await expect(player.page.getByRole('heading', { name: topic, exact: true })).toBeVisible();
      await expect(player.page.locator('.game-shell')).toHaveCSS('background-color', canvas);
      await screen(player.page, '15', 'saved-result', width);
      await player.page.getByRole('link', { name: 'Back to game', exact: true }).click();
      await player.phase('complete'); await expect(button(player.page, 'Rematch')).toBeEnabled();
    }
    await button(a.page, 'Rematch').click(); await expect(a.page.locator('#rematch-reason')).toContainText('Waiting for Birch');
    await button(b.page, 'Rematch').click(); await Promise.all([a.phase('positions'), b.phase('positions')]);
    expect(a.latest!.debateId).not.toBe(debateId); expect(a.latest!.setup).toEqual({ ...setup, phase: 'positions', positions: { A: null, B: null } });
    await expect(a.page.getByLabel('Your position', { exact: true })).toBeEmpty();
    await screen(a.page, '16', 'rematch', width, 'Save position');
    await button(a.page, 'Leave room').click(); await expect(button(a.page, 'Create room')).toBeVisible();
    await a.page.getByRole('link', { name: 'My results', exact: true }).click();
    await expect(a.page.locator('.game-results')).toContainText(topic);
    await noCodes(a.page); await noCodes(b.page);
  } catch (error) {
    for (const [name, player] of [['A', a], ['B', b]] as const) {
      await test.info().attach(`failure-${name}`, { body: await player.page.screenshot({ fullPage: true }), contentType: 'image/png' });
      await test.info().attach(`screen-${name}`, { body: await player.page.locator('body').innerText(), contentType: 'text/plain' });
    }
    throw error;
  } finally {
    // Restore disrupted services even on assertion failure so the next test starts healthy.
    compose('start', 'api', 'worker');
    await group.close();
  }
});
