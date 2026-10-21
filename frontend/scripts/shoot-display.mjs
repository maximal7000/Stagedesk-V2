// Screenshot-Werkzeug der Anzeige: fotografiert /monitor mit Testdaten in 3840×2160 (bzw. 2160×3840).
//
//   node scripts/shoot-display.mjs [--only <name>[,<name>…]] [--portrait] [--state lost|stale]
//                                  [--layout normal|wide] [--scheme light|dark] [--out <dir>] [--no-build]
//
// Baut die App (außer mit --no-build), startet `vite preview` auf einem freien Port und beantwortet
// /api/monitor/display aus frontend/tests/display-fixtures/<name>.json. Bilder landen in
// docs/superpowers/screenshots/2026-10-19-monitor/ (oder --out <dir>) als
// display-<name>[-<state>][-<layout>][-<scheme>][-portrait].png.
//   --layout überschreibt view.layout (auch in den Unteransichten des Wechsels), --scheme das Farbschema.
//   --state stale: nach dem Laden geht das Netz weg, die Uhr läuft 30 s weiter ("Stand HH:MM").
//   --state lost:  die Route liefert 503, die Uhr läuft 121 s weiter ("Verbindung verloren").
//   Ohne --only gilt bei --state die Testdatei "info", sonst werden alle Testdateien fotografiert.
// Schlägt eine Testdatei fehl, laufen die übrigen weiter; der Exit-Code ist am Ende 1.
// Chromium: CHROMIUM_PATH oder /opt/pw-browsers/chromium (mit --headless=new).
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const FRONTEND = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const FIXTURES = join(FRONTEND, 'tests', 'display-fixtures')
const ASSETS = join(FIXTURES, 'assets')
const OUT = resolve(FRONTEND, '..', 'docs', 'superpowers', 'screenshots', '2026-10-19-monitor')
const VITE = join(FRONTEND, 'node_modules', '.bin', 'vite')
const T0 = new Date('2026-10-19T10:41:40+02:00')
const NOT_FOUND_SLUG = 'foyer-2'

function parseArgs(argv) {
  const opts = { only: null, portrait: false, state: null, layout: null, scheme: null, out: OUT, build: true }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--only') opts.only = argv[++i].split(',').filter(Boolean)
    else if (a === '--portrait') opts.portrait = true
    else if (a === '--state') opts.state = argv[++i]
    else if (a === '--layout') opts.layout = argv[++i]
    else if (a === '--scheme') opts.scheme = argv[++i]
    else if (a === '--out') opts.out = resolve(argv[++i])
    else if (a === '--no-build') opts.build = false
    else throw new Error(`Unbekanntes Argument: ${a}`)
  }
  if (opts.state && !['lost', 'stale'].includes(opts.state)) throw new Error('--state erwartet lost oder stale')
  if (opts.layout && !['normal', 'wide'].includes(opts.layout)) throw new Error('--layout erwartet normal oder wide')
  if (opts.scheme && !['light', 'dark'].includes(opts.scheme)) throw new Error('--scheme erwartet light oder dark')
  return opts
}

function freePort() {
  return new Promise((ok, fail) => {
    const srv = createServer()
    srv.once('error', fail)
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address()
      srv.close(() => ok(port))
    })
  })
}

async function startPreview(port) {
  const proc = spawn(VITE, ['preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
    cwd: FRONTEND, stdio: ['ignore', 'pipe', 'pipe'],
  })
  let log = ''
  proc.stdout.on('data', (d) => { log += d })
  proc.stderr.on('data', (d) => { log += d })
  const url = `http://127.0.0.1:${port}`
  for (let i = 0; i < 100; i++) {
    if (proc.exitCode != null) throw new Error(`vite preview beendet:\n${log}`)
    try {
      const res = await fetch(url)
      if (res.ok) return { proc, url }
    } catch { /* noch nicht bereit */ }
    await new Promise((r) => setTimeout(r, 200))
  }
  proc.kill()
  throw new Error(`vite preview antwortet nicht:\n${log}`)
}

function loadFixture(name, opts) {
  const file = join(FIXTURES, `${name}.json`)
  if (!existsSync(file)) throw new Error(`Testdatei fehlt: ${file}`)
  const payload = JSON.parse(readFileSync(file, 'utf8'))
  if (opts.layout && payload.view) setLayout(payload.view, opts.layout)
  if (opts.scheme) {
    payload.scheme = opts.scheme
    if (payload.screen) payload.screen.scheme = opts.scheme
  }
  if (opts.portrait && payload.screen) payload.screen.orientation = 'portrait'
  return payload
}

function setLayout(view, layout) {
  view.layout = layout
  for (const item of view.data?.items ?? []) if (item.view) setLayout(item.view, layout)
}

function outName(name, opts) {
  const parts = [`display-${opts.state && !opts.only ? opts.state : name}`]
  if (opts.state && opts.only) parts.push(opts.state)
  if (opts.layout) parts.push(opts.layout)
  if (opts.scheme) parts.push(opts.scheme)
  if (opts.portrait) parts.push('portrait')
  return `${parts.join('-')}.png`
}

const ASSET_TYPES = { '.svg': 'image/svg+xml', '.html': 'text/html; charset=utf-8', '.png': 'image/png', '.webp': 'image/webp' }

async function shoot(context, baseUrl, name, opts) {
  const payload = loadFixture(name, opts)
  const page = await context.newPage()
  try {
    return await shootPage(page, context, baseUrl, name, payload, opts)
  } finally {
    if (opts.state === 'stale') await context.setOffline(false)
    await page.close()
  }
}

async function shootPage(page, context, baseUrl, name, payload, opts) {
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))

  // Kein echter WebSocket: der Push-Kanal bleibt still, statt gegen einen fehlenden Server zu laufen
  await page.addInitScript(() => {
    class SilentSocket {
      constructor() { this.readyState = 0 }
      send() {}
      close() { this.readyState = 3 }
    }
    window.WebSocket = SilentSocket
  })

  let failing = false
  await page.route('**/api/monitor/display*', (route) => (failing
    ? route.fulfill({ status: 503, contentType: 'application/json', body: '{"detail":"Service Unavailable"}' })
    : route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) })))
  await page.route('**/media/monitor/**', (route) => serveAsset(route))
  await page.route('**/WebUntis/monitor**', (route) => serveAsset(route, 'untis-fallback.html'))

  if (opts.state) await page.clock.install({ time: T0 })
  else await page.clock.setFixedTime(new Date(T0.getTime() + 20000))

  const slug = payload.screen?.slug ?? NOT_FOUND_SLUG
  await page.goto(`${baseUrl}/monitor?screen=${encodeURIComponent(slug)}`)
  await page.waitForSelector('[data-display-state]:not([data-display-state="loading"])', { timeout: 15000 })

  if (opts.state === 'stale') {
    await context.setOffline(true)
    await page.clock.fastForward(30000)
    await page.waitForFunction(() => document.body.textContent.includes('Stand'))
  } else if (opts.state === 'lost') {
    failing = true
    await page.clock.fastForward(60000)
    await page.waitForTimeout(300)
    await page.clock.fastForward(61000)
    // Ein zwischengespeicherter Notfall bleibt auch ohne Verbindung stehen (statt "Verbindung verloren")
    await page.waitForSelector('[data-display-state="lost"], [data-mode-kind="emergency"]', { timeout: 15000 })
  }

  await page.evaluate(() => document.fonts.ready)
  await page.waitForFunction(() => [...document.images].every((img) => img.complete))
  await page.waitForTimeout(150)
  const file = join(opts.out, outName(name, opts))
  // Endlose Animationen (On-Air) stehen auf dem Ausgangszustand, Überblendungen am Ende
  await page.screenshot({ path: file, animations: 'disabled' })
  if (errors.length) throw new Error(`${name}: Fehler im Browser:\n${errors.join('\n')}`)
  return file
}

async function serveAsset(route, fixed) {
  const file = join(ASSETS, fixed ?? new URL(route.request().url()).pathname.split('/').pop())
  if (!existsSync(file)) return route.fulfill({ status: 404, body: '' })
  const ext = file.slice(file.lastIndexOf('.'))
  return route.fulfill({ status: 200, contentType: ASSET_TYPES[ext] ?? 'application/octet-stream', body: readFileSync(file) })
}

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  const names = opts.only
    ? opts.only
    : opts.state
      ? ['info']
      : readdirSync(FIXTURES).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).sort()

  if (opts.build) {
    const res = spawnSync('npm', ['run', 'build'], { cwd: FRONTEND, stdio: 'inherit' })
    if (res.status !== 0) process.exit(res.status ?? 1)
  }
  if (!existsSync(join(FRONTEND, 'dist', 'index.html'))) throw new Error('dist/ fehlt, erst bauen (ohne --no-build)')
  mkdirSync(opts.out, { recursive: true })

  const { proc, url } = await startPreview(await freePort())
  const failed = []
  let browser
  try {
    browser = await chromium.launch({
      executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium',
      args: ['--headless=new'],
    })
    const portrait = opts.portrait
    const context = await browser.newContext({
      viewport: portrait ? { width: 2160, height: 3840 } : { width: 3840, height: 2160 },
      deviceScaleFactor: 1,
      locale: 'de-DE',
      timezoneId: 'Europe/Berlin',
      serviceWorkers: 'block',
    })
    // Nur der Vorschau-Server ist erreichbar; alles andere (Keycloak, CDNs) wird abgewiesen
    await context.route((u) => u.hostname !== '127.0.0.1', (route) => route.abort())
    // Jede Testdatei für sich: ein Fehler bricht nicht den ganzen Lauf ab, setzt aber den Exit-Code
    for (const name of names) {
      try {
        console.log(await shoot(context, url, name, opts))
      } catch (e) {
        failed.push(name)
        console.error(`FEHLER ${name}: ${e.message || e}`)
      }
    }
  } finally {
    if (browser) await browser.close()
    proc.kill()
  }
  if (failed.length) {
    console.error(`${failed.length} von ${names.length} Testdateien fehlgeschlagen: ${failed.join(', ')}`)
    process.exitCode = 1
  }
}

main().catch((e) => {
  console.error(e.message || e)
  process.exit(1)
})
