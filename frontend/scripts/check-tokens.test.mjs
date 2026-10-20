import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
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
    'src/pages/MonitorPage.jsx',
    'src/pages/AufgabenMonitorPage.jsx',
    'src/components/display/',
    'src/pages/DesignTestPage.jsx',
  ]) assert.ok(EXCLUDE.includes(p), p)
})

test('Monitor-Admin wird geprüft', () => {
  assert.ok(!EXCLUDE.some((p) => 'src/components/monitor-admin/x.jsx'.startsWith(p)))
  assert.ok(!EXCLUDE.includes('src/pages/admin/MonitorAdminPage.jsx'))
})

test('Block-Kommentar mit Code dahinter wird geprüft', () => {
  assert.equal(findViolations('/* x */ className="bg-gray-900"', 'a.jsx').length, 1)
  assert.equal(findViolations('/* bg-gray-900 */', 'a.jsx').length, 0)
  assert.equal(findViolations('/* bg-gray-900', 'a.jsx').length, 0)
})

test('mehrere Muster in einer Zeile', () => {
  const v = findViolations('<div className="bg-gray-900 rounded-xl border-accent/20 text-gray-400">', 'a.jsx')
  assert.deepEqual(v.map((x) => x.line), [1, 1, 1, 1])
  assert.equal(v.length, 4)
})

describe('CLI', () => {
  const script = fileURLToPath(new URL('./check-tokens.mjs', import.meta.url))
  const root = mkdtempSync(join(tmpdir(), 'ct-'))
  mkdirSync(join(root, 'src/clean'), { recursive: true })
  mkdirSync(join(root, 'src/dirty'), { recursive: true })
  writeFileSync(join(root, 'src/clean/A.jsx'), '<div className="bg-surface" />\n')
  writeFileSync(join(root, 'src/dirty/B.jsx'), '<div className="bg-gray-900" />\n')
  const run = (...args) => spawnSync('node', [script, ...args], { env: { ...process.env, CHECK_TOKENS_ROOT: root }, encoding: 'utf8' })

  test('sauberer Pfad: exit 0', () => assert.equal(run('--only', 'src/clean').status, 0))
  test('Verstoß: exit 1 mit datei:zeile: muster', () => {
    const r = run('--only', 'src/dirty/B.jsx')
    assert.equal(r.status, 1)
    assert.match(r.stdout, /src\/dirty\/B\.jsx:1: bg-gray-900/)
  })
  test('Pfad ohne Treffer: exit 2', () => {
    const r = run('--only', 'frontend/src/clean')
    assert.equal(r.status, 2)
    assert.match(r.stderr, /frontend\/src\/clean/)
  })
  test('ein Treffer, ein Tippfehler: exit 2', () => assert.equal(run('--only', 'src/clean', 'src/nope').status, 2))
  test('--only ohne Werte: exit 2', () => assert.equal(run('--only').status, 2))
})
