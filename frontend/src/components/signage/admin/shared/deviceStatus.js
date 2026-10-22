// Ampel und Kennzahlen eines Geräts (Spec §7.1) aus GET /api/monitor/devices.
// Der Text des Servers (status_text) gilt; die Farbe folgt allein aus status.
const TONES = { online: 'ok', warning: 'warn', offline: 'bad', off: 'off', legacy: 'warn', unpaired: 'none' }
const LABELS = { online: 'Online', warning: 'Warnung', offline: 'Offline', off: 'Aus', legacy: 'Altes Skript', unpaired: 'Kein Gerät gekoppelt' }
const SEPARATOR = ' · '
const pad = (n) => String(n).padStart(2, '0')

function seenText(device) {
  const at = device.last_seen_at ? new Date(device.last_seen_at) : null
  if (!at || Number.isNaN(at.getTime())) return 'noch nie gesehen'
  return `zuletzt gesehen ${pad(at.getHours())}:${pad(at.getMinutes())}`
}

function fallbackDetail(device) {
  if (device.status === 'warning') return device.warnings?.[0]?.text ?? ''
  if (device.status === 'offline' || device.status === 'off') return seenText(device)
  return ''
}

// -> { tone: 'ok' | 'warn' | 'bad' | 'off' | 'none', label, detail }
export function deviceStatusView(device) {
  const status = device?.status
  const tone = TONES[status] ?? 'none'
  const text = (device?.status_text || '').trim()
  if (!device) return { tone, label: LABELS.unpaired, detail: '' }
  if (!text) return { tone, label: LABELS[status] ?? '', detail: fallbackDetail(device) }
  const cut = text.indexOf(SEPARATOR)
  if (cut === -1) return { tone, label: text, detail: '' }
  return { tone, label: text.slice(0, cut), detail: text.slice(cut + SEPARATOR.length) }
}

const number = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)

// Hardware-Angaben für die Spalte "Gerät": Agent-Version und Messwerte (WLAN nur bei Funk, Temperatur).
// `warn` markiert den Messwert, der eine aktive Warnung ausgelöst hat.
export function deviceFacts(device) {
  const codes = new Set((device?.warnings || []).map((w) => w.code))
  const metrics = []
  const network = device?.telemetry?.network
  const dbm = number(network?.signal_dbm)
  if (network?.kind === 'wifi' && dbm !== null) metrics.push({ text: `WLAN ${Math.round(dbm)} dBm`, warn: codes.has('wifi') })
  const temperature = number(device?.telemetry?.system?.temperature_c)
  if (temperature !== null) metrics.push({ text: `${Math.round(temperature)} °C`, warn: codes.has('temperature') })
  return { agent: device?.agent_version ? `Agent ${device.agent_version}` : '', metrics }
}

export const normalizeCode = (value) => String(value ?? '').replace(/\D/g, '')
export const isCompleteCode = (value) => normalizeCode(value).length === 6

const pad2 = (n) => String(n).padStart(2, '0')
const asDate = (v) => {
  const d = v ? new Date(v) : null
  return d && !Number.isNaN(d.getTime()) ? d : null
}

// "Stand HH:MM": Zeitpunkt der letzten Meldung des Geräts
export function reportTime(device) {
  const at = asDate(device?.last_seen_at)
  return at ? `${pad2(at.getHours())}:${pad2(at.getMinutes())}` : ''
}

export function formatUptime(seconds) {
  const s = number(seconds)
  if (s === null) return ''
  const days = Math.floor(s / 86400)
  const hours = Math.floor((s % 86400) / 3600)
  const minutes = Math.floor((s % 3600) / 60)
  if (days > 0) return `${days} ${days === 1 ? 'Tag' : 'Tage'} ${hours} Std`
  if (hours > 0) return `${hours} Std ${minutes} Min`
  return `${minutes} Min`
}

const DAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa']
const dayTime = (v) => {
  const d = asDate(v)
  return d ? `${DAYS[d.getDay()]} ${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}., ${pad2(d.getHours())}:${pad2(d.getMinutes())}` : ''
}

// Der Agent meldet an/aus/standby; on/off bleiben für ältere Meldungen
const DISPLAY_POWER = { an: 'an', on: 'an', standby: 'Standby', aus: 'aus', off: 'aus' }
const NETWORK_KIND = { wifi: 'WLAN', lan: 'LAN', ethernet: 'LAN' }

// Telemetrie in vier Gruppen für die Geräte-Box: [{ title, rows: [{ label, value, warn }] }].
// Fehlende Werte (null) erscheinen nicht; eine Gruppe ohne Werte entfällt.
export function telemetryGroups(device) {
  const t = device?.telemetry || {}
  const codes = new Set((device?.warnings || []).map((w) => w.code))
  const groups = []
  const add = (title, rows) => {
    const kept = rows.filter((r) => r && r.value !== '' && r.value != null)
    if (kept.length) groups.push({ title, rows: kept })
  }
  const row = (label, value, warn = false) => ({ label, value, warn })
  const text = (v) => (typeof v === 'string' && v.trim() ? v.trim() : '')
  const percent = (v, suffix) => (number(v) === null ? '' : `${Math.round(v)} %${suffix}`)

  const net = t.network || {}
  add('Netz', [
    row('Verbindung', NETWORK_KIND[net.kind] ?? text(net.kind)),
    row('Netzwerk', net.kind === 'wifi' ? text(net.ssid) : ''),
    row('Signal', net.kind === 'wifi' && number(net.signal_dbm) !== null ? `${Math.round(net.signal_dbm)} dBm` : '', codes.has('wifi')),
    row('IP', text(net.ip)),
    row('MAC', text(net.mac)),
  ])

  const sys = t.system || {}
  let throttle = ''
  if (sys.throttled_now === true) throttle = 'aktiv'
  else if (sys.throttled_since_boot === true) throttle = 'seit dem Start aufgetreten'
  else if (sys.throttled_now === false) throttle = 'keine'
  add('System', [
    row('Modell', text(sys.model)),
    row('Seriennummer', text(sys.serial)),
    row('Temperatur', number(sys.temperature_c) === null ? '' : `${Math.round(sys.temperature_c)} °C`, codes.has('temperature')),
    row('Drosselung', throttle, codes.has('throttled')),
    row('Speicher', percent(sys.disk_percent, ' belegt'), codes.has('disk')),
    row('Arbeitsspeicher', percent(sys.ram_percent, ' belegt')),
    row('Laufzeit', formatUptime(sys.uptime_s)),
    row('System', text(sys.os)),
  ])

  const disp = t.display || {}
  add('Anzeige', [
    row('Auflösung', text(disp.resolution)),
    row('Browser', typeof disp.browser_running === 'boolean' ? (disp.browser_running ? 'läuft' : 'läuft nicht') : '', codes.has('browser')),
    row('Bildschirm', DISPLAY_POWER[disp.power] ?? text(disp.power)),
  ])

  const upd = t.updates || {}
  let result = ''
  if (upd.last_ok === true) result = 'erfolgreich'
  else if (upd.last_ok === false) result = text(upd.last_error) ? `fehlgeschlagen: ${text(upd.last_error)}` : 'fehlgeschlagen'
  add('Updates', [
    row('Letzter Lauf', dayTime(upd.last_at)),
    row('Ergebnis', result, upd.last_ok === false),
    row('Ausstehende Pakete', number(upd.pending_packages) === null ? '' : String(upd.pending_packages)),
    row('Neustart nötig seit', dayTime(upd.reboot_required_since), codes.has('reboot_pending')),
  ])
  return groups
}
