import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { themes, playerCharacters, lawyers, resolveCharacter, resolveLawyer } from '@quarrel/shared/config'
import { assetRegistry, assetTypes, resolveAsset, prepareAsset, type AssetType } from '../src/assets/registry'
import { themeVisuals } from '../src/assets/theme-visuals'
import { AssetView } from '../src/components/art/AssetView'
import { DebateArena } from '../src/components/art/DebateArena'
import { Gallery } from '../src/gallery/Gallery'
import { themeStyles } from '../src/themes/styles'

describe('UI step 1: bundled art and catalog', () => {
  it('every catalog and theme reference resolves to a registry entry of the correct role', () => {
    for (const [catalog, type] of [[playerCharacters, 'character'], [lawyers, 'lawyer']] as const) {
      for (const entry of catalog) expect(resolveAsset(`${type}:${entry.assetId}`, type)).toMatchObject({ usedFallback: false, entry: { type } })
    }
    for (const theme of themes) {
      expect(themeVisuals[theme.id]).toEqual({ background: `background:${theme.assets.background}`, bench: `bench:${theme.assets.bench}`,
        judge: `judge:${theme.judge.assetId}`, jury: `jury:${theme.jury.assetId}` })
      for (const [type, id] of Object.entries(themeVisuals[theme.id])) expect(resolveAsset(id, type as AssetType).usedFallback).toBe(false)
      for (const slot of ['A', 'B'] as const) {
        expect(playerCharacters.some((entry) => entry.id === theme.defaults.characters[slot])).toBe(true)
        expect(lawyers.some((entry) => entry.id === theme.defaults.lawyers[slot])).toBe(true)
        expect(resolveCharacter('unknown', theme, slot).id).toBe(theme.defaults.characters[slot])
        expect(resolveLawyer('unknown', theme, slot).id).toBe(theme.defaults.lawyers[slot])
      }
    }
  })
  it('all 32 IDs are unique, metadata is complete, and each entry has exactly one renderer', () => {
    expect(assetRegistry).toHaveLength(32)
    expect(new Set(assetRegistry.map((entry) => entry.id)).size).toBe(32)
    for (const type of assetTypes) expect(assetRegistry.filter((entry) => entry.type === type)).toHaveLength(type === 'character' || type === 'lawyer' ? 8 : 4)
    for (const entry of assetRegistry) {
      expect(entry.id.startsWith(`${entry.type}:`)).toBe(true)
      expect(entry.nativeThemes.every((id) => themes.some((theme) => theme.id === id))).toBe(true)
      expect(entry.supportedStates).toContain('idle')
      expect(Object.values(entry.anchors).flat().every((value) => value >= 0 && value <= 1)).toBe(true)
      expect(entry.viewBox.split(' ').map(Number).every(Number.isFinite)).toBe(true)
      expect(Object.keys(entry.renderer).sort()).toEqual(entry.renderer.kind === 'svg' ? ['kind', 'src'] : ['Component', 'kind'])
      expect(entry.renderer.kind).toBe(entry.type === 'bench' || entry.type === 'jury' ? 'svg' : 'component')
    }
  })
  it('unknown or wrong-role IDs only fall back within the requested role; display input is validated', () => {
    for (const type of assetTypes) {
      for (const id of ['unknown', null, 'character:lion', 'judge:lemur']) {
        const result = resolveAsset(id, type)
        expect(result.entry.type).toBe(type)
        expect(result.usedFallback).toBe(!assetRegistry.some((entry) => entry.id === id && entry.type === type))
      }
    }
    expect(prepareAsset('character:lion', 'character', ' Lion ', 'speaking', true)).toMatchObject({ label: 'Lion', state: 'speaking', paused: true })
    expect(prepareAsset('jury:jungle-jury', 'jury', 'Jury', 'speaking').state).toBe('idle')
    expect(prepareAsset('character:lion', 'character', 'Lion', 'objection').state).toBe('idle')
    expect(prepareAsset('character:lion', 'character', 'Lion').paused).toBe(false)
    for (const label of ['', '   ', null, 4]) expect(() => prepareAsset('', 'character', label)).toThrow('label')
    expect(() => prepareAsset('', 'character', 'Lion', 'idle', 'yes')).toThrow('paused')
    expect(() => resolveAsset('', 'unknown' as AssetType)).toThrow('role')
  })
  it('repeated SVG instances have unique titles/pattern IDs and all fragment references resolve', () => {
    const elements = [...assetRegistry, ...assetRegistry].map((entry, index) => createElement(AssetView, { key: index, id: entry.id, type: entry.type, label: 'Art sample' }))
    const markup = renderToStaticMarkup(createElement('div', null, elements))
    const ids = [...markup.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1])
    expect(ids.length).toBeGreaterThan(40)
    expect(new Set(ids).size).toBe(ids.length)
    for (const match of markup.matchAll(/aria-labelledby="([^"]+)"|url\(#([^)]+)\)/g)) expect(ids).toContain(match[1] ?? match[2])
    expect(markup).toContain('alt="Art sample"')
    expect(markup).not.toContain('data-fallback="true"')
    const invalid = renderToStaticMarkup(createElement(AssetView, { id: 'judge:lemur', type: 'character', label: 'Player', paused: true }))
    expect(invalid).toContain('data-asset-id="character:courtroom-advocate-a"')
    expect(invalid).toContain('data-paused="true"')
  })
  it('standalone SVG files retain their viewBoxes, local geometry and no shared fragment IDs', () => {
    for (const theme of themes) for (const type of ['benches', 'juries']) {
      const source = readFileSync(new URL(`../src/assets/${type}/${theme.id}.svg`, import.meta.url), 'utf8')
      expect(source).toContain(type === 'benches' ? 'viewBox="0 0 192 92"' : 'viewBox="0 0 192 112"')
      expect(source).toContain('<path')
      expect(source).not.toMatch(/\sid=|<script|<image|<foreignObject|url\(http/)
    }
  })
  it('each theme renders a complete stage with duplicate global choices and caller-owned clocks', () => {
    for (const theme of themes) {
      const markup = renderToStaticMarkup(createElement(DebateArena, { theme, state: 'speaking', paused: true,
        players: { A: { name: 'One', characterId: 'jungle-lion', lawyerId: 'superhero-aster' }, B: { name: 'Two', characterId: 'jungle-lion', lawyerId: 'superhero-aster' } },
        clocks: { A: { display: '00:42', active: true }, B: { display: '01:00', active: false } } }))
      expect(markup.match(/data-asset-id="character:lion"/g)).toHaveLength(2)
      expect(markup.match(/data-asset-id="lawyer:superhero-lawyer-a"/g)).toHaveLength(2)
      for (const id of Object.values(themeVisuals[theme.id])) expect(markup).toContain(`data-asset-id="${id}"`)
      expect(markup).toContain('00:42'); expect(markup).toContain('01:00')
      expect(markup).not.toContain(playerCharacters[0]!.personality)
      expect(markup).not.toContain('Aster')
      const defaults = renderToStaticMarkup(createElement(DebateArena, { theme, players: { A: { name: 'A' }, B: { name: 'B' } }, clocks: { A: { display: '—', active: false }, B: { display: '—', active: false } } }))
      expect(defaults).not.toContain('data-fallback="true"')
    }
  })
  it('gallery exposes every name/description/personality without a live room; styles bridge the theme palette', () => {
    const markup = renderToStaticMarkup(createElement(Gallery))
    expect(markup.match(/class="art-card"/g)).toHaveLength(16)
    for (const entry of [...playerCharacters, ...lawyers]) {
      expect(markup).toContain(entry.name)
      const text = renderToStaticMarkup(createElement('span', null, entry.personality)).replace(/^<span>|<\/span>$/g, '')
      expect(markup).toContain(text)
    }
    expect(markup).toContain('320px stage preview')
    for (const theme of themes) expect(themeStyles(theme)).toMatchObject({ '--art-paper': theme.palette.paper,
      '--art-ink': theme.palette.ink, '--art-idle-duration': `${theme.animations.idle.durationMs}ms` })
  })
})
