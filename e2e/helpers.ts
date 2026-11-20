import { execFileSync } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { expect, type Browser, type Page } from '@playwright/test';
import type { RoomSnapshot } from '../shared/contract/rooms';

export function compose(...args: string[]) {
  return execFileSync('docker', ['compose', '-p', 'quarrel-e2e', '-f', 'docker-compose.yml', '-f', 'e2e/compose.yml', ...args],
    { encoding: 'utf8', timeout: 120_000, stdio: ['ignore', 'pipe', 'pipe'] });
}

/** Browser APIs are faked, not the game's API, clocks, worker, or snapshots. */
export async function instrument(page: Page) {
  await page.addInitScript(() => {
    const records: Record<string, unknown>[] = [];
    const requests: string[] = [];
    Object.assign(window, { __speechRecords: records });
    const nativeFetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
      if (String(input).endsWith('/speech') && typeof init?.body === 'string') requests.push(JSON.parse(init.body).speechId);
      return nativeFetch(input, init);
    };
    let current: SpeechSynthesisUtterance | null = null;
    let timer: ReturnType<typeof setTimeout>;
    const voice = { name: 'E2E English', lang: 'en-US', voiceURI: 'e2e-en', localService: true, default: true };
    Object.defineProperty(window, 'SpeechSynthesisUtterance', { configurable: true, value: class {
      lang = ''; pitch = 1; rate = 1; volume = 1; voice: unknown = null;
      onstart: unknown = null; onend: unknown = null; onerror: unknown = null;
      constructor(public text = '') {}
    } });
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
      getVoices: () => [voice],
      cancel: () => { clearTimeout(timer); current = null; records.push({ engine: 'browser', action: 'stop' }); },
      speak: (utterance: SpeechSynthesisUtterance) => {
        current = utterance;
        records.push({ engine: 'browser', action: 'play', speechId: requests.at(-1), voice: utterance.voice?.name,
          text: utterance.text, pitch: utterance.pitch, rate: utterance.rate, volume: utterance.volume });
        queueMicrotask(() => utterance.onstart?.(new Event('start') as SpeechSynthesisEvent));
        timer = setTimeout(() => { if (current === utterance) { current = null; utterance.onend?.(new Event('end') as SpeechSynthesisEvent); } }, 2000);
      },
    } });
    HTMLAudioElement.prototype.play = function () {
      records.push({ engine: 'server', action: 'play', speechId: requests.at(-1), volume: this.volume, rate: this.playbackRate });
      queueMicrotask(() => this.dispatchEvent(new Event('playing')));
      return Promise.resolve();
    };
  });
}

export class ObservedPlayer {
  snapshots: RoomSnapshot[] = [];
  latest: RoomSnapshot | null = null;
  network: string[] = [];
  private listeners = new Set<(room: RoomSnapshot) => void>();
  constructor(readonly page: Page) {
    const take = (payload: unknown) => {
      if (payload && typeof payload === 'object' && 'room' in payload) {
        const room = (payload as { room: RoomSnapshot | null }).room;
        if (!room || !this.latest || room.roomId !== this.latest.roomId || room.version >= this.latest.version) this.latest = room;
        if (room) { this.snapshots.push(room); for (const listener of this.listeners) listener(room); }
      }
    };
    const packet = (raw: string) => {
      this.network.push(raw);
      for (const part of raw.split('\x1e')) if (part.startsWith('42')) {
        const [event, body] = JSON.parse(part.slice(2));
        if (event === 'room:snapshot') take(body);
      }
    };
    page.on('response', async (response) => {
      const path = new URL(response.url()).pathname;
      if (!path.startsWith('/api/') && !path.startsWith('/socket.io/')) return;
      try { const body = await response.text(); if (path.startsWith('/socket.io/')) packet(body); else { this.network.push(body); take(JSON.parse(body)); } } catch { /* Shutdown can interrupt responses. */ }
    });
    page.on('websocket', (socket) => socket.on('framereceived', ({ payload }) => {
      packet(payload.toString());
    }));
  }
  snapshot(predicate: (room: RoomSnapshot) => boolean, timeout = 30_000): Promise<RoomSnapshot> {
    const previous = this.snapshots.find(predicate);
    if (previous) return Promise.resolve(previous);
    return new Promise((resolve, reject) => {
      const listener = (room: RoomSnapshot) => {
        if (predicate(room)) { clearTimeout(timer); this.listeners.delete(listener); resolve(room); }
      };
      const timer = setTimeout(() => { this.listeners.delete(listener); reject(new Error('Timed out waiting for a room snapshot event')); }, timeout);
      this.listeners.add(listener);
    });
  }
  async phase(phase: string) {
    await expect.poll(() => this.latest?.setup.phase, { timeout: 30_000 }).toBe(phase);
    return this.latest!;
  }
}

export async function players(browser: Browser, width: number) {
  const aContext = await browser.newContext({ viewport: { width, height: width === 320 ? 640 : 800 } });
  const bContext = await browser.newContext({ viewport: { width, height: width === 320 ? 640 : 800 } });
  const a = new ObservedPlayer(await aContext.newPage()), b = new ObservedPlayer(await bContext.newPage());
  await Promise.all([instrument(a.page), instrument(b.page)]);
  return { a, b, close: async () => { await Promise.all([aContext.close(), bContext.close()]); } };
}

export async function screen(page: Page, number: string, name: string, width: number, control?: string) {
  await noCodes(page);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  if (control) { await page.getByRole('button', { name: control, exact: true }).scrollIntoViewIfNeeded(); await expect(page.getByRole('button', { name: control, exact: true })).toBeInViewport(); }
  await page.evaluate(() => window.scrollTo(0, 0));
  await mkdir('e2e/screenshots', { recursive: true });
  await page.screenshot({ path: `e2e/screenshots/${number}-${name}-${width === 320 ? 'phone' : 'desktop'}.png`, fullPage: true });
}

export async function createAndJoin(a: ObservedPlayer, b: ObservedPlayer, topic: string) {
  await Promise.all([a.page.goto('/'), b.page.goto('/')]);
  await a.page.getByLabel('Your name', { exact: true }).fill('Aster');
  await a.page.getByLabel('The question').fill(topic);
  await a.page.getByLabel('Writing time per player').selectOption('120');
  await a.page.getByRole('button', { name: 'Create room', exact: true }).click();
  await a.phase('waiting');
  await screen(a.page, '02a', 'waiting', a.page.viewportSize()!.width, 'Copy code');
  await b.page.getByLabel('Your name', { exact: true }).fill('Birch');
  await b.page.getByLabel('Room code', { exact: true }).fill(a.latest!.code);
  await b.page.getByRole('button', { name: 'Join room', exact: true }).click();
  await Promise.all([a.phase('positions'), b.phase('positions')]);
  await expect.poll(() => a.latest?.players.every((p) => p.connected)).toBe(true);
}

export async function position(player: ObservedPlayer, text: string) {
  await player.page.getByLabel('Your position', { exact: true }).fill(text);
  await player.page.getByRole('button', { name: 'Save position', exact: true }).click();
  await expect.poll(() => player.latest?.setup.positions[player.latest.you.slot]).toBe(text);
}

export async function noCodes(page: Page) {
  const { ERROR_STATUS } = await import('../shared/contract/common');
  const body = await page.locator('body').innerText();
  for (const code of Object.keys(ERROR_STATUS)) expect(body).not.toContain(code);
}
