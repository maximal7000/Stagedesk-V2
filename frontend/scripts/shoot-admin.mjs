// Screenshot-Werkzeug des Monitor-Admin: fotografiert die Admin-Seiten mit Testdaten in 1440×900.
//
//   node scripts/shoot-admin.mjs [--only <seite>] [--no-build]
//
// Baut die App (außer mit --no-build), startet `vite preview` auf einem freien Port und meldet vor dem
// Laden einen Testnutzer an: Er liegt im Storage-Schlüssel, den oidc-client-ts über `userStore` aus
// src/authConfig.js liest (`oidc.user:<authority>:<client_id>`). Keycloak wird nie kontaktiert.
// Jede Anfrage an /api/** wird aus frontend/tests/admin-fixtures/ beantwortet: GET /api/monitor/screens
// liest monitor-screens.json (Pfad ohne /api/, "/" wird zu "-"). Mit Query gilt zuerst die Datei mit "@query"
// (GET /api/monitor/display?screen=aula → monitor-display@screen=aula.json). Eine Aufnahme mit `variant` liest
// zuerst aus tests/admin-fixtures/<variant>/. Fehlt eine Datei, antwortet die Route mit [] und das Werkzeug
// nennt den Pfad. Schreibende Anfragen antworten mit {"success": true}.
// Bilder: docs/superpowers/screenshots/2026-10-19-monitor/admin-<seite>.png.
// Schlägt eine Seite fehl, laufen die übrigen weiter; der Exit-Code ist am Ende 1.
// Chromium: CHROMIUM_PATH oder /opt/pw-browsers/chromium (mit --headless=new).
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'
import { loadEnv } from 'vite'

const FRONTEND = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const FIXTURES = join(FRONTEND, 'tests', 'admin-fixtures')
const OUT = resolve(FRONTEND, '..', 'docs', 'superpowers', 'screenshots', '2026-10-19-monitor')
const VITE = join(FRONTEND, 'node_modules', '.bin', 'vite')
const T0 = new Date('2026-10-20T10:00:00+02:00')
const ALLOWED_HOSTS = new Set(['127.0.0.1', 'fonts.googleapis.com', 'fonts.gstatic.com'])

// Aufnahme → Pfad in der App, optional mit Testdaten-Variante und einer Handlung vor dem Foto.
// Weitere Seiten kommen mit den folgenden Bauschritten hinzu.
const PAGES = {
  overview: { path: '/monitor-admin' },
  'overview-emergency-dialog': {
    path: '/monitor-admin',
    action: async (page) => {
      await page.getByRole('button', { name: 'Auslösen…' }).click()
      await page.waitForSelector('[data-emergency-dialog] input[type="radio"]:checked')
    },
  },
  'overview-day-off': { path: '/monitor-admin', variant: 'day-off' },
  'overview-emergency-menu': {
    path: '/monitor-admin',
    variant: 'emergency',
    action: async (page) => {
      await page.getByRole('button', { name: 'Weitere Aktionen' }).first().click()
      await page.waitForSelector('[role="menu"]')
    },
  },
  'overview-undo': {
    path: '/monitor-admin',
    action: async (page) => {
      await page.getByRole('switch', { name: 'On-Air' }).click()
      await page.waitForSelector('[data-undo-toast]')
    },
  },
}

function parseArgs(argv) {
  const opts = { only: null, build: true }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--only') opts.only = argv[++i]
    else if (a === '--no-build') opts.build = false
    else throw new Error(`Unbekanntes Argument: ${a}`)
  }
  if (opts.only && !PAGES[opts.only]) throw new Error(`Unbekannte Seite: ${opts.only} (bekannt: ${Object.keys(PAGES).join(', ')})`)
  return opts
}

// Dieselben Werte wie src/authConfig.js im Produktions-Build (Vite lädt .env, .env.production …)
function oidcStorageKey() {
  const env = loadEnv('production', FRONTEND, 'VITE_')
  const url = env.VITE_KEYCLOAK_URL || 'https://auth.t410.de'
  const realm = env.VITE_KEYCLOAK_REALM || 'master'
  const client = env.VITE_KEYCLOAK_CLIENT || 'stagedesk'
  return `oidc.user:${url}/realms/${realm}:${client}`
}

function testUser() {
  return {
    id_token: 'test-id-token',
    access_token: 'test-access-token',
    refresh_token: 'test-refresh-token',
    token_type: 'Bearer',
    scope: 'openid profile email',
    session_state: null,
    // Weit in der Zukunft: kein stilles Erneuern während des Laufs
    expires_at: Math.floor(Date.now() / 1000) + 10 * 365 * 24 * 3600,
    profile: {
      sub: 'test-user',
      preferred_username: 'testnutzer',
      given_name: 'Test',
      family_name: 'Nutzer',
      email: 'test@example.org',
      realm_access: { roles: ['admin'] },
    },
  }
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

function fixtureFor(apiPath, query, variant) {
  const base = apiPath.replace(/^\/+|\/+$/g, '').replace(/\//g, '-')
  const names = query ? [`${base}@${query}.json`, `${base}.json`] : [`${base}.json`]
  const dirs = variant ? [join(FIXTURES, variant), FIXTURES] : [FIXTURES]
  for (const dir of dirs) {
    for (const name of names) {
      if (existsSync(join(dir, name))) return join(dir, name)
    }
  }
  return null
}

async function answerApi(route, missing, variant) {
  const req = route.request()
  const { pathname, search } = new URL(req.url())
  const apiPath = pathname.slice(pathname.indexOf('/api/') + 5)
  if (req.method() !== 'GET') {
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{"success":true}' })
  }
  const file = fixtureFor(apiPath, search.slice(1), variant)
  if (!file) {
    missing.add(`GET /api/${apiPath}${search}`)
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  }
  return route.fulfill({ status: 200, contentType: 'application/json', body: readFileSync(file, 'utf8') })
}

async function shoot(context, baseUrl, name, storageKey) {
  const shot = PAGES[name]
  const page = await context.newPage()
  const errors = []
  const missing = new Set()
  page.on('pageerror', (e) => errors.push(e.message))
  try {
    // Testnutzer vor dem ersten Skript ablegen; dazu kein echter WebSocket
    await page.addInitScript(([key, user]) => {
      window.localStorage.setItem(key, user)
      class SilentSocket {
        constructor() { this.readyState = 0 }
        send() {}
        close() { this.readyState = 3 }
      }
      window.WebSocket = SilentSocket
    }, [storageKey, JSON.stringify(testUser())])
    await page.route('**/api/**', (route) => answerApi(route, missing, shot.variant))
    await page.clock.setFixedTime(T0)

    await page.goto(`${baseUrl}${shot.path}`)
    await page.waitForSelector('[data-admin-page]:not([data-state="loading"])', { timeout: 15000 })
    if (shot.action) await shot.action(page)
    await page.evaluate(() => document.fonts.ready)
    await page.waitForTimeout(150)
    const file = join(OUT, `admin-${name}.png`)
    await page.screenshot({ path: file, animations: 'disabled' })
    if (missing.size) console.warn(`${name}: ohne Testdaten beantwortet: ${[...missing].join(', ')}`)
    if (errors.length) throw new Error(`${name}: Fehler im Browser:\n${errors.join('\n')}`)
    return file
  } finally {
    await page.close()
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  const names = opts.only ? [opts.only] : Object.keys(PAGES)

  if (opts.build) {
    const res = spawnSync('npm', ['run', 'build'], { cwd: FRONTEND, stdio: 'inherit' })
    if (res.status !== 0) process.exit(res.status ?? 1)
  }
  if (!existsSync(join(FRONTEND, 'dist', 'index.html'))) throw new Error('dist/ fehlt, erst bauen (ohne --no-build)')
  mkdirSync(OUT, { recursive: true })

  const storageKey = oidcStorageKey()
  const { proc, url } = await startPreview(await freePort())
  const failed = []
  let browser
  try {
    browser = await chromium.launch({
      executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium',
      args: ['--headless=new'],
    })
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
      locale: 'de-DE',
      timezoneId: 'Europe/Berlin',
      serviceWorkers: 'block',
    })
    // Erreichbar sind nur der Vorschau-Server und Google Fonts (Titel-Schrift); Keycloak und alles andere
    // wird abgewiesen. /api/** fängt die Seite vorher ab.
    const blocked = new Set()
    await context.route((u) => !ALLOWED_HOSTS.has(u.hostname), (route) => {
      blocked.add(new URL(route.request().url()).host)
      return route.abort()
    })
    for (const name of names) {
      try {
        console.log(await shoot(context, url, name, storageKey))
      } catch (e) {
        failed.push(name)
        console.error(`FEHLER ${name}: ${e.message || e}`)
      }
    }
    if (blocked.size) console.warn(`Abgewiesene Hosts: ${[...blocked].join(', ')}`)
  } finally {
    if (browser) await browser.close()
    proc.kill()
  }
  if (failed.length) {
    console.error(`${failed.length} von ${names.length} Seiten fehlgeschlagen: ${failed.join(', ')}`)
    process.exitCode = 1
  }
}

main().catch((e) => {
  console.error(e.message || e)
  process.exit(1)
})
