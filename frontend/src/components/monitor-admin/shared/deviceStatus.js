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

// Kurze Angaben für die Spalte "Gerät": WLAN (nur bei WLAN), Temperatur, Agent-Version
export function deviceMetrics(device) {
  const out = []
  const network = device?.telemetry?.network
  const dbm = number(network?.signal_dbm)
  if (network?.kind === 'wifi' && dbm !== null) out.push(`WLAN ${Math.round(dbm)} dBm`)
  const temperature = number(device?.telemetry?.system?.temperature_c)
  if (temperature !== null) out.push(`${Math.round(temperature)} °C`)
  if (device?.agent_version) out.push(`Agent ${device.agent_version}`)
  return out
}

export const normalizeCode = (value) => String(value ?? '').replace(/\D/g, '')
export const isCompleteCode = (value) => normalizeCode(value).length === 6
