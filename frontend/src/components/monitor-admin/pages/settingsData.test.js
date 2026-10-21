import { describe, it, expect } from 'vitest'
import {
  checkSentence, credentialsComplete, settingsPayload, sourceSentence, SETUP_FIELDS, ON_AIR_FIELDS,
  templateChanges, templateProblems, DEVICE_FIELDS, deviceProblems, legacyScreenNames, installCommand,
} from './settingsData'

const saved = {
  webuntis_server: 'neilo.webuntis.com', webuntis_school: 'katharineum', webuntis_username: 'monitor',
  webuntis_password: '', webuntis_password_set: true, weather_api_key: '', weather_api_key_set: false,
}

describe('checkSentence', () => {
  it('Quelle als Satz', () => {
    expect(checkSentence({ source: 'substitutions', login: true }, null, saved))
      .toEqual({ tone: 'ok', text: 'Vertretungen werden direkt abgerufen.' })
    expect(checkSentence({ source: 'timetable', login: true }, null, saved))
      .toEqual({ tone: 'ok', text: 'Vertretungen werden aus den Stundenplänen der Klassen abgeleitet.' })
  })

  it('keine Verbindung mit Grund', () => {
    expect(checkSentence({ source: 'unavailable', login: false }, null, { ...saved, webuntis_password_set: false }).text)
      .toBe('Keine Verbindung: Die Zugangsdaten sind unvollständig. Bitte Server, Schule, Benutzer und Passwort eintragen und speichern.')
    expect(checkSentence({ source: 'unavailable', login: false }, null, saved).text)
      .toBe('Keine Verbindung: Die Anmeldung ist fehlgeschlagen. Bitte Server, Schule, Benutzer und Passwort prüfen.')
    expect(checkSentence({ source: 'unavailable', login: true }, null, saved).text)
      .toBe('Keine Verbindung: Der Benutzer darf weder Vertretungen noch Stundenpläne abrufen. Bitte die Rechte in WebUntis prüfen.')
    expect(checkSentence({ source: 'unavailable', login: true }, null, saved).tone).toBe('bad')
  })

  it('Fehler der Anfrage: Meldung des Servers, sonst deutscher Satz, nie doppelter Punkt', () => {
    const forbidden = { response: { status: 403, data: { detail: 'Keine Berechtigung' } } }
    expect(checkSentence(null, forbidden, saved).text).toBe('Keine Verbindung: Keine Berechtigung.')
    const network = { message: 'Network Error' }
    expect(checkSentence(null, network, saved).text)
      .toBe('Keine Verbindung: Keine Verbindung zum Server. Bitte die Verbindung prüfen und erneut versuchen.')
  })

  it('gespeicherte Quelle', () => {
    expect(sourceSentence('substitutions')).toBe('Vertretungen werden direkt abgerufen.')
    expect(sourceSentence('unavailable')).toBe('Keine Verbindung beim letzten Test.')
    expect(sourceSentence('')).toBe('Noch nicht getestet.')
  })

  it('Zugangsdaten vollständig: Passwort gespeichert oder im Entwurf', () => {
    expect(credentialsComplete(saved)).toBe(true)
    expect(credentialsComplete({ ...saved, webuntis_password_set: false })).toBe(false)
    expect(credentialsComplete({ ...saved, webuntis_password_set: false }, { webuntis_password: 'neu' })).toBe(true)
    expect(credentialsComplete({ ...saved, webuntis_school: ' ' })).toBe(false)
  })
})

describe('settingsPayload', () => {
  it('nur geänderte Felder; leere Geheimnisse bleiben weg', () => {
    const base = { ...saved, on_air_text: 'ON AIR', on_air_animation: 'pulse', on_air_show_clock: true }
    const draft = { ...base, webuntis_server: ' neu.webuntis.com ', webuntis_password: '', on_air_text: 'LIVE' }
    expect(settingsPayload(base, draft, SETUP_FIELDS)).toEqual({ webuntis_server: 'neu.webuntis.com' })
    expect(settingsPayload(base, draft, ON_AIR_FIELDS)).toEqual({ on_air_text: 'LIVE' })
    expect(settingsPayload(base, { ...draft, webuntis_password: 'geheim', weather_api_key: 'k' }, SETUP_FIELDS))
      .toEqual({ webuntis_server: 'neu.webuntis.com', webuntis_password: 'geheim', weather_api_key: 'k' })
  })

  it('Geheimnisse werden nicht gekürzt, nur Leerzeichen zählen als leer', () => {
    const base = { ...saved }
    expect(settingsPayload(base, { ...base, webuntis_password: ' pw mit Leerzeichen ' }, SETUP_FIELDS))
      .toEqual({ webuntis_password: ' pw mit Leerzeichen ' })
    expect(settingsPayload(base, { ...base, webuntis_password: '   ' }, SETUP_FIELDS)).toEqual({})
  })
})

describe('Notfall-Vorlagen', () => {
  const original = [
    { id: 1, title: 'Räumung', text: 'Raus', note: '', sort_order: 0 },
    { id: 2, title: 'Unwetter', text: 'Drinnen', note: '', sort_order: 1 },
    { id: 3, title: 'Alt', text: 'x', note: '', sort_order: 2 },
  ]

  it('neu, geändert (auch Reihenfolge) und entfernt', () => {
    const draft = [
      { id: 2, title: 'Unwetter', text: 'Drinnen', note: '' },
      { id: 1, title: 'Räumung', text: 'Raus', note: 'Schulhof' },
      { key: 'n1', title: ' Amok ', text: 'Türen zu', note: '' },
    ]
    expect(templateChanges(original, draft)).toEqual({
      create: [{ title: 'Amok', text: 'Türen zu', note: '', sort_order: 2 }],
      update: [
        { id: 2, body: { title: 'Unwetter', text: 'Drinnen', note: '', sort_order: 0 } },
        { id: 1, body: { title: 'Räumung', text: 'Raus', note: 'Schulhof', sort_order: 1 } },
      ],
      remove: [3],
    })
  })

  it('unverändert: nichts zu tun', () => {
    expect(templateChanges(original, original)).toEqual({ create: [], update: [], remove: [] })
  })

  it('Titel und Text sind Pflicht', () => {
    expect(templateProblems([{ title: 'A', text: 'B' }])).toBeNull()
    expect(templateProblems([{ title: 'A', text: 'B' }, { title: ' ', text: 'B' }])).toBe('Vorlage 2: Titel und Text eintragen.')
  })
})

describe('Geräte-Einstellungen', () => {
  const base = {
    device_offline_minutes: 10, warn_temperature_c: 80, warn_disk_percent: 90, warn_wifi_dbm: -75,
    warn_reboot_days: 7, require_device_token: false,
  }

  it('Payload enthält nur geänderte Geräte-Felder, Zahlen als Zahl', () => {
    const draft = { ...base, warn_temperature_c: '75', require_device_token: true }
    expect(settingsPayload(base, draft, DEVICE_FIELDS)).toEqual({ warn_temperature_c: 75, require_device_token: true })
    expect(settingsPayload(base, { ...base, warn_wifi_dbm: '-75' }, DEVICE_FIELDS)).toEqual({})
  })

  it('Bereichsprüfung nennt Feld und Bereich auf Deutsch', () => {
    expect(deviceProblems(base, base)).toBeNull()
    expect(deviceProblems(base, { ...base, device_offline_minutes: '1' }))
      .toBe('Offline melden nach: Bitte eine ganze Zahl von 2 bis 240 eintragen.')
    expect(deviceProblems(base, { ...base, warn_temperature_c: '' })).toContain('Warnung ab Temperatur')
    expect(deviceProblems(base, { ...base, warn_wifi_dbm: '-30' })).toContain('-95 bis -40')
    expect(deviceProblems(base, { ...base, warn_disk_percent: '90.5' })).toContain('50 bis 99')
    expect(deviceProblems(base, { ...base, warn_reboot_days: '61' })).toContain('1 bis 60')
  })

  it('ungeänderte Felder werden nicht geprüft', () => {
    const odd = { ...base, warn_reboot_days: 99 }
    expect(deviceProblems(odd, odd)).toBeNull()
  })

  it('Namen der Bildschirme mit altem Skript', () => {
    const devices = [{ id: 1, screen_id: 1, legacy: false }, { id: null, screen_id: 4, legacy: true }, { id: null, screen_id: 2, legacy: true }]
    const screens = [{ id: 1, name: 'Glocke' }, { id: 2, name: 'Aula' }, { id: 4, name: 'Mensa' }]
    expect(legacyScreenNames(devices, screens)).toEqual(['Aula', 'Mensa'])
    expect(legacyScreenNames([], screens)).toEqual([])
    expect(legacyScreenNames([{ screen_id: 9, legacy: true }], screens)).toEqual(['Bildschirm 9'])
  })

  it('Installationsbefehl aus der aktuellen Adresse', () => {
    expect(installCommand('https://stagedesk.t410.de'))
      .toBe('curl -fsSL https://stagedesk.t410.de/api/monitor/agent/install.sh | sudo bash')
  })
})
