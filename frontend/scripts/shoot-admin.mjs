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
// nennt den Pfad. Schreibende Anfragen lesen <pfad>.<methode>.json (POST /api/monitor/views/preview →
// monitor-views-preview.post.json), sonst antworten sie mit {"success": true}. Fehlerfälle beschreibt
// fulfillFixture (Testdatei mit "__status" oder "__abort").
// Live-Vorschau: Eine Aufnahme mit `preview` beantwortet GET /api/monitor/display?preview=… (das iframe der
// Vorschau) mit tests/display-fixtures/<preview>.json, damit die Vorschau Inhalt zeigt.
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
const DISPLAY_FIXTURES = join(FRONTEND, 'tests', 'display-fixtures')
const OUT = resolve(FRONTEND, '..', 'docs', 'superpowers', 'screenshots', '2026-10-19-monitor')
const VITE = join(FRONTEND, 'node_modules', '.bin', 'vite')
const T0 = new Date('2026-10-20T10:00:00+02:00')
const ALLOWED_HOSTS = new Set(['127.0.0.1', 'fonts.googleapis.com', 'fonts.gstatic.com'])

// Aufnahme → Pfad in der App, optional mit Testdaten-Variante, einer Handlung vor dem Foto und
// eigener Fensterhöhe (height) für lange Seiten; `preview` wählt die Anzeige-Testdaten der Live-Vorschau.
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
  'overview-pair-dialog': {
    path: '/monitor-admin',
    action: async (page) => {
      await page.getByRole('button', { name: 'Bildschirm koppeln', exact: true }).click()
      await page.getByLabel('Kopplungscode').fill('482 913')
      await page.getByRole('button', { name: 'Weiter', exact: true }).click()
      await page.getByLabel('Bildschirm', { exact: true }).selectOption({ label: 'Mensa' })
    },
  },
  'overview-pair-new-screen': {
    path: '/monitor-admin',
    action: async (page) => {
      await page.getByRole('button', { name: 'Bildschirm koppeln', exact: true }).click()
      await page.getByLabel('Kopplungscode').fill('482913')
      await page.getByRole('button', { name: 'Weiter', exact: true }).click()
      await page.getByRole('radio', { name: 'Neuer Bildschirm' }).click()
      await page.getByLabel('Name', { exact: true }).fill('Foyer')
      await page.getByLabel('Ort', { exact: true }).fill('Eingangshalle Nord')
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
  screens: { path: '/monitor-admin/screens' },
  'screen-detail': { path: '/monitor-admin/screens/1', height: 2900 },
  // Gerät gekoppelt: Telemetrie, Befehle, Screenshot; Ein- und Ausschalten mit Methode, Updates, Protokoll
  'screen-detail-device': {
    path: '/monitor-admin/screens/1', height: 1250,
    action: async (page) => {
      await page.locator('[data-section="device"] [data-telemetry-group]').first().waitFor()
      await page.locator('[data-section="device"]').evaluate((el) => el.scrollIntoView({ block: 'start' }))
    },
  },
  // Gerät offline: Befehle mit Hinweis
  'screen-detail-device-offline': {
    path: '/monitor-admin/screens/1', variant: 'device-offline', height: 1250,
    action: async (page) => {
      await page.locator('[data-section="device"] [data-device-commands]').waitFor()
      await page.locator('[data-section="device"]').evaluate((el) => el.scrollIntoView({ block: 'start' }))
    },
  },
  'screen-detail-log': {
    path: '/monitor-admin/screens/1', height: 900,
    action: async (page) => {
      await page.locator('[data-section="log"] tbody tr').first().waitFor()
      await page.locator('[data-section="log"]').evaluate((el) => el.scrollIntoView({ block: 'start' }))
    },
  },
  'screen-detail-reboot-confirm': {
    path: '/monitor-admin/screens/1', height: 1200,
    action: async (page) => {
      await page.getByRole('button', { name: 'Pi neu starten', exact: true }).click()
      await page.waitForSelector('[role="alertdialog"]')
    },
  },
  'screen-detail-dirty': {
    path: '/monitor-admin/screens/1',
    action: async (page) => {
      await page.getByLabel('Ort').fill('Eingangshalle Nord')
      await page.locator('[data-schedule-editor] li').nth(1).getByRole('button', { name: 'So', exact: true }).click()
      await page.getByRole('region', { name: 'Ungespeicherte Änderungen' }).waitFor()
    },
  },
  // Nur Ein- und Ausschalten (ohne monitor.setup): Anzeige lesend, keine Kiosk-URL
  'screen-detail-power-only': { path: '/monitor-admin/screens/1', variant: 'power-only', height: 1100 },
  'screen-detail-key': {
    path: '/monitor-admin/screens/1',
    action: async (page) => {
      await page.getByRole('button', { name: 'Neu erzeugen' }).click()
      await page.waitForSelector('[role="alertdialog"]')
    },
  },
  views: { path: '/monitor-admin/views' },
  'view-new': {
    path: '/monitor-admin/views/new',
    action: async (page) => {
      await page.getByRole('radio', { name: /^Abfahrten/ }).click()
      await page.getByLabel('Name', { exact: true }).waitFor()
    },
  },
  'view-edit-departures': {
    path: '/monitor-admin/views/1', preview: 'departures', height: 2450,
    action: async (page) => {
      await page.getByRole('radio', { name: 'Dunkel' }).click()
      await page.getByLabel('Max. Zeilen Kohlmarkt').fill('8')
      await page.waitForSelector('[data-disruptions]')
      await waitForPreview(page)
    },
  },
  'view-edit-rotation': {
    path: '/monitor-admin/views/4', preview: 'rotation', height: 1060,
    action: waitForPreview,
  },
  'view-edit-info': { path: '/monitor-admin/views/3', preview: 'info', action: waitForPreview },
  'view-edit-split': { path: '/monitor-admin/views/5', preview: 'split', height: 1300, action: waitForPreview },
  'view-edit-media': { path: '/monitor-admin/views/6', preview: 'media-landscape', height: 1100, action: waitForPreview },
  exams: { path: '/monitor-admin/exams', height: 1240 },
  'exam-form': {
    path: '/monitor-admin/exams',
    action: async (page) => {
      await page.getByRole('button', { name: 'Abitur Mathematik bearbeiten' }).click()
      await page.waitForSelector('[data-exam-panel="exam"]')
    },
  },
  'exam-template-menu': {
    path: '/monitor-admin/exams',
    action: async (page) => {
      await page.getByRole('button', { name: 'Aus Vorlage' }).click()
      await page.waitForSelector('[role="menu"]')
    },
  },
  'event-form': {
    path: '/monitor-admin/exams',
    action: async (page) => {
      await page.getByRole('button', { name: 'Elternsprechtag bearbeiten' }).click()
      await page.waitForSelector('[data-exam-panel="event"]')
    },
  },
  media: { path: '/monitor-admin/media' },
  'media-processing': { path: '/monitor-admin/media', variant: 'media-processing' },
  'media-detail': {
    path: '/monitor-admin/media',
    action: async (page) => {
      await page.locator('[data-media="11"] button').click()
      await page.waitForSelector('[data-media-panel] img')
    },
  },
  schedules: { path: '/monitor-admin/schedules', variant: 'schedules', height: 1380 },
  settings: {
    path: '/monitor-admin/settings', height: 2000,
    action: async (page) => {
      await page.getByRole('button', { name: 'Verbindung testen' }).click()
      await page.waitForSelector('[data-check-result]')
    },
  },
  // Zustände: nur lesend, leer, Fehler, Dialoge
  'overview-view-only': { path: '/monitor-admin', variant: 'view-only' },
  'overview-error': { path: '/monitor-admin', variant: 'error' },
  'overview-empty': { path: '/monitor-admin', variant: 'empty' },
  'screens-empty': { path: '/monitor-admin/screens', variant: 'empty' },
  'views-empty': { path: '/monitor-admin/views', variant: 'empty' },
  'view-edit-missing': { path: '/monitor-admin/views/1', variant: 'missing' },
  'view-delete-dialog': {
    path: '/monitor-admin/views/1', preview: 'departures',
    action: async (page) => {
      await waitForPreview(page)
      await page.getByRole('button', { name: 'Löschen', exact: true }).click()
      await page.waitForSelector('[role="alertdialog"]')
    },
  },
  'overview-override-menu': {
    path: '/monitor-admin',
    variant: 'override',
    action: async (page) => {
      await page.getByRole('button', { name: 'Weitere Aktionen' }).first().click()
      await page.waitForSelector('[role="menu"]')
    },
  },
  'screen-detail-override': { path: '/monitor-admin/screens/1', variant: 'override' },
  'screen-delete-dialog': {
    path: '/monitor-admin/screens/1',
    action: async (page) => {
      await page.getByRole('button', { name: 'Löschen', exact: true }).click()
      await page.waitForSelector('[role="alertdialog"]')
    },
  },
  'exams-empty': { path: '/monitor-admin/exams', variant: 'empty' },
  'exams-offline': { path: '/monitor-admin/exams', variant: 'offline' },
  'media-empty': { path: '/monitor-admin/media', variant: 'empty' },
  'schedules-empty': { path: '/monitor-admin/schedules', variant: 'empty' },
  'settings-devices': {
    path: '/monitor-admin/settings', height: 2000,
    action: async (page) => {
      await page.waitForSelector('[data-section="devices"]')
      await page.locator('[data-section="devices"]').scrollIntoViewIfNeeded()
    },
  },
  'settings-onair-only': { path: '/monitor-admin/settings', variant: 'onair-only', height: 1180 },
  'stop-filter-dialog': {
    path: '/monitor-admin/views/1', preview: 'departures',
    action: async (page) => {
      await page.getByRole('button', { name: 'Filter für Hauptbahnhof / ZOB' }).click()
      await page.waitForSelector('[data-stop-filter-dialog]')
    },
  },
}

// Bis das iframe der Live-Vorschau die Anzeige gerendert hat
async function waitForPreview(page) {
  await page.waitForSelector('[data-live-preview][data-preview-state="ready"]', { timeout: 15000 })
  await page.frameLocator('iframe[title="Vorschau der Ansicht"]').locator('[data-display-state="view"]').first().waitFor({ timeout: 15000 })
  await page.waitForTimeout(400)
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

async function answerApi(route, missing, shot) {
  const req = route.request()
  const { pathname, search, searchParams } = new URL(req.url())
  const apiPath = pathname.slice(pathname.indexOf('/api/') + 5)
  const variant = shot.variant
  if (req.method() !== 'GET') {
    const posted = fixtureFor(`${apiPath}.${req.method().toLowerCase()}`, '', variant)
    return fulfillFixture(route, posted ? readFileSync(posted, 'utf8') : '{"success":true}')
  }
  if (apiPath === 'monitor/display' && searchParams.has('preview') && shot.preview) {
    const body = readFileSync(join(DISPLAY_FIXTURES, `${shot.preview}.json`), 'utf8')
    return route.fulfill({ status: 200, contentType: 'application/json', body })
  }
  const file = fixtureFor(apiPath, search.slice(1), variant)
  if (!file) {
    missing.add(`GET /api/${apiPath}${search}`)
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  }
  return fulfillFixture(route, readFileSync(file, 'utf8'))
}

// Fehlerfälle: Eine Testdatei {"__status": 503, "body": {...}} antwortet mit diesem Status,
// {"__abort": true} bricht die Anfrage ab (Netzwerkfehler wie bei fehlender Verbindung).
function fulfillFixture(route, text) {
  const data = JSON.parse(text)
  if (data && !Array.isArray(data) && typeof data === 'object') {
    if (data.__abort) return route.abort('connectionrefused')
    if (data.__status) {
      return route.fulfill({ status: data.__status, contentType: 'application/json', body: JSON.stringify(data.body ?? {}) })
    }
  }
  return route.fulfill({ status: 200, contentType: 'application/json', body: text })
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
    await page.route('**/api/**', (route) => answerApi(route, missing, shot))
    // Seitenbilder der Medien-Vorschau aus tests/display-fixtures/assets/
    await page.route('**/media/monitor/**', (route) => route.fulfill({
      status: 200, contentType: 'image/svg+xml',
      body: readFileSync(join(DISPLAY_FIXTURES, 'assets', new URL(route.request().url()).pathname.split('/').pop())),
    }))
    await page.clock.setFixedTime(T0)
    if (shot.height) await page.setViewportSize({ width: 1440, height: shot.height })

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
      args: ['--headless=new', '--lang=de-DE'],
      // Datums- und Zeitfelder folgen der Sprache des Browsers: deutsch, 24 Stunden
      env: { ...process.env, LANG: 'de_DE.UTF-8', LANGUAGE: 'de_DE:de' },
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
