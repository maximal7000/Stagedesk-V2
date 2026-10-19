import { test } from 'node:test'
import assert from 'node:assert/strict'
import { findViolations, EXCLUDE } from './check-tokens.mjs'

test('erkennt bg-gray-*', () => {
  const v = findViolations('<div className="bg-gray-900">', 'a.jsx')
  assert.equal(v.length, 1)
  assert.ok(v[0].match.includes('bg-gray-900'))
  assert.equal(v[0].line, 1)
})

test('erkennt rounded-xl und rounded-2xl', () => {
  assert.equal(findViolations('<div className="rounded-xl rounded-2xl">', 'a.jsx').length, 2)
})

test('erkennt Akzent-Tönungen', () => {
  assert.equal(findViolations('<div className="bg-accent/10 ring-accent/25 border-accent/40">', 'a.jsx').length, 3)
})

test('saubere Klassen ergeben keine Treffer', () => {
  assert.equal(findViolations('<div className="bg-surface text-fg-muted rounded-lg bg-accent">', 'a.jsx').length, 0)
})

test('Kommentarzeilen werden ignoriert', () => {
  assert.equal(findViolations('// bg-gray-900 im Kommentar', 'a.jsx').length, 0)
  assert.equal(findViolations(' * bg-gray-900', 'a.jsx').length, 0)
  assert.equal(findViolations('/* bg-gray-900 */', 'a.jsx').length, 0)
})

test('Zeilennummern stimmen', () => {
  const v = findViolations('a\nb\n<p className="text-gray-400">', 'a.jsx')
  assert.equal(v[0].line, 3)
})

test('legacy-gray-Block in index.css wird übersprungen', () => {
  const src = 'x\n/* legacy-gray:start */\n:root.light .bg-gray-900 {}\n/* legacy-gray:end */\n.bg-gray-800 {}'
  const v = findViolations(src, 'src/index.css')
  assert.equal(v.length, 1)
  assert.equal(v[0].line, 5)
})

test('EXCLUDE enthält die Ausnahmen', () => {
  for (const p of [
    'src/pages/admin/MonitorAdminPage.jsx',
    'src/pages/MonitorPage.jsx',
    'src/pages/AufgabenMonitorPage.jsx',
    'src/components/monitor/',
    'src/pages/DesignTestPage.jsx',
  ]) assert.ok(EXCLUDE.includes(p), p)
})
