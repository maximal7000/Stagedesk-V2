import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { OFFLINE_HINT, commandResult, commandsFor, watchCommand } from './deviceCommands'

const can = (...perms) => (p) => perms.includes(p)
const device = { id: 5, screen_id: 1, status: 'online', legacy: false }
const kinds = (list) => list.items.map((i) => i.kind)

describe('commandsFor', () => {
  it('ohne monitor.devices gibt es keine Befehle', () => {
    expect(commandsFor(device, can('monitor.view', 'monitor.power')).items).toEqual([])
  })

  it('Power-Knöpfe nur mit monitor.power', () => {
    expect(kinds(commandsFor(device, can('monitor.devices')))).toEqual(
      ['reload', 'restart_browser', 'reboot', 'update_now', 'screenshot', 'test_pattern'])
    expect(kinds(commandsFor(device, can('monitor.devices', 'monitor.power')))).toEqual(
      ['reload', 'restart_browser', 'reboot', 'power_on', 'power_off', 'update_now', 'screenshot', 'test_pattern'])
  })

  it('Beschriftung und Nachfrage stehen wörtlich fest', () => {
    const items = commandsFor(device, can('monitor.devices', 'monitor.power')).items
    expect(items.map((i) => i.label)).toEqual([
      'Neu laden', 'Browser neu starten', 'Pi neu starten', 'Bildschirm an', 'Bildschirm aus',
      'Jetzt aktualisieren', 'Screenshot aufnehmen', 'Testbild'])
    expect(items.find((i) => i.kind === 'reboot').confirm.body).toBe('Pi jetzt neu starten? Die Anzeige ist etwa eine Minute weg.')
    expect(items.find((i) => i.kind === 'update_now').confirm.body)
      .toBe('Updates jetzt installieren? Ein nötiger Neustart wird danach hier angezeigt und nicht automatisch ausgeführt.')
    expect(items.find((i) => i.kind === 'reload').confirm).toBeUndefined()
  })

  it('offline: Befehle bleiben, dazu der Hinweis', () => {
    const list = commandsFor({ ...device, status: 'offline' }, can('monitor.devices'))
    expect(list.items.length).toBeGreaterThan(0)
    expect(list.hint).toBe('Der Befehl wird gesendet, sobald das Gerät wieder verbunden ist (höchstens 5 Minuten).')
    expect(list.hint).toBe(OFFLINE_HINT)
    expect(commandsFor(device, can('monitor.devices')).hint).toBe('')
  })

  it('ohne gekoppeltes Gerät keine Befehle', () => {
    expect(commandsFor(null, can('monitor.devices')).items).toEqual([])
    expect(commandsFor({ id: null, legacy: true, status: 'legacy' }, can('monitor.devices')).items).toEqual([])
  })
})

describe('commandResult', () => {
  it('nennt Ergebnis, Ursache und nächsten Schritt', () => {
    expect(commandResult('reload', { status: 'ok', result: '' })).toEqual({ ok: true, text: 'Neu laden ist ausgeführt.' })
    expect(commandResult('reboot', { status: 'failed', result: 'systemctl: Zugriff verweigert' }).text)
      .toBe('Pi neu starten ist fehlgeschlagen: systemctl: Zugriff verweigert')
    expect(commandResult('screenshot', { status: 'expired', result: '' }).text)
      .toBe('Screenshot aufnehmen wurde nicht ausgeführt, weil das Gerät 5 Minuten nicht verbunden war. Bitte Netzwerk und Strom des Pi prüfen und den Befehl erneut senden.')
  })
})

describe('watchCommand', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  const run = (get, extra = {}) => {
    const done = vi.fn()
    const timeout = vi.fn()
    const stop = watchCommand({ get, onDone: done, onTimeout: timeout, ...extra })
    return { done, timeout, stop }
  }

  it('fragt alle 2 s nach, bis ok kommt', async () => {
    const get = vi.fn()
      .mockResolvedValueOnce({ status: 'pending' })
      .mockResolvedValueOnce({ status: 'sent' })
      .mockResolvedValueOnce({ status: 'ok', result: '' })
    const { done } = run(get)
    await vi.advanceTimersByTimeAsync(1999)
    expect(get).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(get).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(4000)
    expect(get).toHaveBeenCalledTimes(3)
    expect(done).toHaveBeenCalledWith({ status: 'ok', result: '' })
    await vi.advanceTimersByTimeAsync(10000)
    expect(get).toHaveBeenCalledTimes(3)
  })

  it('stoppt bei failed und expired', async () => {
    for (const status of ['failed', 'expired']) {
      const get = vi.fn().mockResolvedValue({ status, result: 'x' })
      const { done } = run(get)
      await vi.advanceTimersByTimeAsync(2000)
      expect(done).toHaveBeenCalledTimes(1)
      await vi.advanceTimersByTimeAsync(6000)
      expect(get).toHaveBeenCalledTimes(1)
    }
  })

  it('gibt nach 2 Minuten auf', async () => {
    const get = vi.fn().mockResolvedValue({ status: 'sent' })
    const { done, timeout } = run(get)
    await vi.advanceTimersByTimeAsync(120000)
    expect(timeout).toHaveBeenCalledTimes(1)
    expect(done).not.toHaveBeenCalled()
    const calls = get.mock.calls.length
    await vi.advanceTimersByTimeAsync(10000)
    expect(get.mock.calls.length).toBe(calls)
  })

  it('stop beendet das Nachfragen', async () => {
    const get = vi.fn().mockResolvedValue({ status: 'sent' })
    const { stop, done } = run(get)
    await vi.advanceTimersByTimeAsync(4000)
    expect(get).toHaveBeenCalledTimes(2)
    stop()
    await vi.advanceTimersByTimeAsync(20000)
    expect(get).toHaveBeenCalledTimes(2)
    expect(done).not.toHaveBeenCalled()
  })

  it('ein Fehler beim Nachfragen beendet nichts, die nächste Runde läuft', async () => {
    const get = vi.fn().mockRejectedValueOnce(new Error('x')).mockResolvedValueOnce({ status: 'ok', result: '' })
    const { done } = run(get)
    await vi.advanceTimersByTimeAsync(4000)
    expect(done).toHaveBeenCalledTimes(1)
  })
})
