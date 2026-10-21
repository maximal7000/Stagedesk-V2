// Befehle an das Gerät (Spec §5): welche Knöpfe es gibt, ihre Nachfragen und das Nachfragen nach dem Ergebnis.

export const OFFLINE_HINT = 'Der Befehl wird gesendet, sobald das Gerät wieder verbunden ist (höchstens 5 Minuten).'

export const POLL_MS = 2000
export const POLL_MAX_MS = 2 * 60 * 1000

// Reihenfolge der Knöpfe. power: nur mit monitor.power (Backend: POWER_COMMANDS). confirm: Nachfrage vor dem Senden.
export const COMMANDS = [
  { kind: 'reload', label: 'Neu laden' },
  { kind: 'restart_browser', label: 'Browser neu starten' },
  {
    kind: 'reboot', label: 'Pi neu starten',
    confirm: { title: 'Pi neu starten?', body: 'Pi jetzt neu starten? Die Anzeige ist etwa eine Minute weg.', confirmLabel: 'Pi neu starten' },
  },
  { kind: 'power_on', label: 'Bildschirm an', power: true },
  { kind: 'power_off', label: 'Bildschirm aus', power: true },
  {
    kind: 'update_now', label: 'Jetzt aktualisieren',
    confirm: {
      title: 'Jetzt aktualisieren?',
      body: 'Updates jetzt installieren? Ein nötiger Neustart wird danach hier angezeigt und nicht automatisch ausgeführt.',
      confirmLabel: 'Jetzt aktualisieren',
    },
  },
  { kind: 'screenshot', label: 'Screenshot aufnehmen' },
  { kind: 'test_pattern', label: 'Testbild' },
]

export const isPaired = (device) => !!device && device.id != null && !device.legacy

// can: hasPermission(permission). -> { items: [{ kind, label, confirm? }], hint }
// Ohne monitor.devices oder ohne gekoppeltes Gerät gibt es keine Befehle. Offline bleiben sie möglich
// (der Server hält sie 5 Minuten), dazu der Hinweis.
export function commandsFor(device, can) {
  if (!isPaired(device) || !can('monitor.devices')) return { items: [], hint: '' }
  const items = COMMANDS.filter((c) => !c.power || can('monitor.power')).map((c) => ({ kind: c.kind, label: c.label, confirm: c.confirm }))
  return { items, hint: device.status === 'offline' ? OFFLINE_HINT : '' }
}

export const labelOf = (kind) => COMMANDS.find((c) => c.kind === kind)?.label ?? kind

export const isFinished = (status) => status === 'ok' || status === 'failed' || status === 'expired'

// Ergebnis eines beendeten Befehls als Satz für den Toast: { ok, text }
export function commandResult(kind, command) {
  const label = labelOf(kind)
  if (command.status === 'ok') return { ok: true, text: `${label} ist ausgeführt.` }
  if (command.status === 'expired') {
    return {
      ok: false,
      text: `${label} wurde nicht ausgeführt, weil das Gerät 5 Minuten nicht verbunden war. Bitte Netzwerk und Strom des Pi prüfen und den Befehl erneut senden.`,
    }
  }
  const reason = (command.result || '').trim()
  return { ok: false, text: reason ? `${label} ist fehlgeschlagen: ${reason}` : `${label} ist fehlgeschlagen. Bitte das Protokoll prüfen und erneut versuchen.` }
}

export const timeoutText = (kind) =>
  `${labelOf(kind)}: noch keine Antwort des Geräts. Der Befehl läuft weiter, das Ergebnis steht im Protokoll.`

// Fragt alle 2 s mit get() nach, bis der Befehl ok, failed oder expired ist, höchstens 2 Minuten.
// Ein Fehler beim Nachfragen zählt nicht als Ergebnis, die nächste Runde läuft. Rückgabe: stop().
export function watchCommand({ get, onDone, onTimeout, intervalMs = POLL_MS, maxMs = POLL_MAX_MS }) {
  let stopped = false
  let timer = null
  let elapsed = 0
  const tick = async () => {
    timer = null
    elapsed += intervalMs
    let command = null
    try { command = await get() } catch { command = null }
    if (stopped) return
    if (command && isFinished(command.status)) {
      stopped = true
      onDone?.(command)
      return
    }
    if (elapsed >= maxMs) {
      stopped = true
      onTimeout?.()
      return
    }
    timer = setTimeout(tick, intervalMs)
  }
  timer = setTimeout(tick, intervalMs)
  return () => {
    stopped = true
    if (timer) clearTimeout(timer)
    timer = null
  }
}
