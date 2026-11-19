import { execFileSync } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'

it('repository text is UTF-8 without BOM or mojibake', () => {
  const root = resolve(import.meta.dirname, '../..')
  // Include new, nonignored source too, so this protects edits before the owner stages them.
  const paths = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: root }).toString('utf8').split('\0')
  const failures: string[] = []
  for (const file of new Set(paths)) {
    if (!file || /(^|\/)(node_modules|coverage|dist|\.git)(\/|$)|(^|\/)\.env|(^|\/)(?:package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb?)$|\.(?:png|jpe?g|gif|webp|ico|woff2?|ttf|eot|mp[34]|wav|ogg|pdf|zip)$/i.test(file)) continue
    const path = resolve(root, file)
    if (!existsSync(path)) continue // A pre-existing working-tree deletion is not a text file.
    const bytes = readFileSync(path)
    if (bytes.includes(0)) continue
    let text: string
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes) }
    catch { failures.push(`${file}: invalid UTF-8`); continue }
    if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) failures.push(`${file}: BOM`)
    const corrupt = /\u00e2[\u0080-\u00bf\u20ac\u2010-\u214f]|\u00c3|\u00c2|\ufffd|\u00f0\u0178|\u00ef\u00bb\u00bf/u
    text.split(/\r?\n/).forEach((line, index) => { if (corrupt.test(line)) failures.push(`${file}:${index + 1}: garbled text`) })
  }
  expect(failures).toEqual([])
})
