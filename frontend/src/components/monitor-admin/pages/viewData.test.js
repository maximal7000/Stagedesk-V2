import { describe, it, expect } from 'vitest'
import {
  KIND_OPTIONS, changedKeys, draftFromView, moveItem, newStop, previewPayload, rotationChoices,
  stopTransport, usedOn, viewPayload, viewProblems,
} from './viewData'

const VIEW = {
  id: 7, name: ' Abfahrten Halle ', kind: 'departures', style: 'auto', api_token: 'geheim', slug: 'departures-hall',
  show_weather: false, weather_city: '', show_qr_code: false, qr_code_url: '', qr_code_label: '',
  transit_stops: [{ id: '1', name: 'Katharineum', walk_minutes: 1 }],
  rotation_items: [], media_items: [], custom_countdown_date: '2026-11-01T09:00:00+00:00',
  page_seconds: 15, media_seconds: 10,
}

describe('KIND_OPTIONS', () => {
  it('nennt die sechs Typen in der Reihenfolge der Vorgabe, je mit einem Satz', () => {
    expect(KIND_OPTIONS.map((k) => k.label)).toEqual(['Abfahrten', 'Vertretungsplan', 'Geteilt', 'Medien', 'Info', 'Wechsel'])
    for (const k of KIND_OPTIONS) expect(k.description).toMatch(/^[A-ZÄÖÜ].*\.$/)
  })
})

describe('draftFromView', () => {
  it('nimmt nur bearbeitbare Felder und zeigt den Countdown als Ortszeit', () => {
    const draft = draftFromView(VIEW)
    expect(draft).not.toHaveProperty('api_token')
    expect(draft).not.toHaveProperty('id')
    expect(draft.name).toBe(' Abfahrten Halle ')
    // jsdom läuft in der Zeitzone des Rechners: Ortszeit-Format ohne Zone
    expect(draft.custom_countdown_date).toMatch(/^2026-11-01T\d\d:00$/)
    expect(draftFromView({ ...VIEW, custom_countdown_date: null }).custom_countdown_date).toBe('')
  })
})

describe('changedKeys / viewPayload / previewPayload', () => {
  const base = draftFromView(VIEW)

  it('meldet nur geänderte Felder', () => {
    expect(changedKeys(base, base)).toEqual([])
    const draft = { ...base, style: 'dense', transit_stops: [...base.transit_stops] }
    expect(changedKeys(base, draft)).toEqual(['style'])
  })

  it('bildet den Entwurf auf die Anfrage ab: getrimmt, Zahlen, Haltestellen normalisiert', () => {
    const draft = {
      ...base,
      name: '  Halle  ',
      page_seconds: '20',
      custom_countdown_date: '',
      transit_stops: [{ id: '1', name: ' Katharineum ', walk_minutes: '3', max_departures: '', filter_lines: [' 5 ', '', '11'], filter_direction: ' Moisling ' }],
      rotation_items: [{ view_id: '3', seconds: '20' }, { view_id: null, seconds: 15 }],
      media_items: ['4', 5],
    }
    const payload = viewPayload(draft, ['name', 'page_seconds', 'custom_countdown_date', 'transit_stops', 'rotation_items', 'media_items'])
    expect(payload).toEqual({
      name: 'Halle',
      page_seconds: 20,
      custom_countdown_date: null,
      transit_stops: [{
        id: '1', name: 'Katharineum', walk_minutes: 3, max_departures: 10, filter_lines: ['5', '11'],
        filter_direction: 'Moisling', filter_via: '', show_bus: true, show_rail: true, show_long_distance: true,
      }],
      // Zeilen ohne gewählte Ansicht gehen nicht mit
      rotation_items: [{ view_id: 3, seconds: 20 }],
      media_items: [4, 5],
    })
  })

  it('behält Zusatz-Haltestelle und weitere Schlüssel einer Haltestelle', () => {
    const stop = { id: '1', name: 'A', extra_id: '9', extra_name: 'B', extra_show_bus: false, source: 'db' }
    const [out] = viewPayload({ transit_stops: [stop] }, ['transit_stops']).transit_stops
    expect(out).toMatchObject({ extra_id: '9', extra_name: 'B', extra_show_bus: false, source: 'db' })
  })

  it('schickt der Vorschau die id und nur die Änderungen', () => {
    const draft = { ...base, style: 'dark' }
    expect(previewPayload(7, base, draft)).toEqual({ id: 7, style: 'dark' })
    expect(previewPayload(7, base, base)).toEqual({ id: 7 })
  })
})

describe('viewProblems', () => {
  it('verlangt Name und vollständige Wechsel-Einträge', () => {
    expect(viewProblems({ name: ' ', kind: 'info' })).toEqual(['Der Name fehlt. Bitte einen Namen eintragen.'])
    expect(viewProblems({ name: 'W', kind: 'rotation', rotation_items: [] }))
      .toEqual(['Der Wechsel braucht mindestens eine Ansicht. Bitte eine Ansicht hinzufügen.'])
    expect(viewProblems({ name: 'W', kind: 'rotation', rotation_items: [{ view_id: null, seconds: 10 }] }))
      .toEqual(['In Zeile 1 des Wechsels fehlt die Ansicht. Bitte eine wählen oder die Zeile entfernen.'])
    expect(viewProblems({ name: 'W', kind: 'rotation', rotation_items: [{ view_id: 2, seconds: 3 }] }))
      .toEqual(['In Zeile 1 des Wechsels muss die Dauer zwischen 5 und 600 Sekunden liegen.'])
    expect(viewProblems({ name: 'W', kind: 'rotation', rotation_items: [{ view_id: 2, seconds: 30 }] })).toEqual([])
  })
})

describe('rotationChoices', () => {
  it('bietet keine Wechsel-Ansichten und nicht die eigene an', () => {
    const views = [
      { id: 1, kind: 'departures' }, { id: 2, kind: 'rotation' }, { id: 3, kind: 'info' }, { id: 4, kind: 'rotation' },
    ]
    expect(rotationChoices(views, 4).map((v) => v.id)).toEqual([1, 3])
    expect(rotationChoices(views, 1).map((v) => v.id)).toEqual([3])
  })
})

describe('moveItem', () => {
  it('verschiebt nach vorn und hinten, ohne die Liste zu verändern', () => {
    const list = ['a', 'b', 'c', 'd']
    expect(moveItem(list, 0, 2)).toEqual(['b', 'c', 'a', 'd'])
    expect(moveItem(list, 3, 1)).toEqual(['a', 'd', 'b', 'c'])
    expect(moveItem(list, 1, 1)).toBe(list)
    expect(moveItem(list, 5, 0)).toBe(list)
    expect(list).toEqual(['a', 'b', 'c', 'd'])
  })
})

describe('usedOn', () => {
  const now = new Date('2026-10-20T10:00:00+02:00')
  const screens = [
    { id: 1, name: 'Glocke', default_view_id: 7, override_view_id: null, schedule: [] },
    { id: 2, name: 'Mensa', default_view_id: 3, override_view_id: 7, override_until: '2026-10-20T12:00:00+02:00', schedule: [{ view_id: 7 }] },
    { id: 3, name: 'Aula', default_view_id: 3, override_view_id: 7, override_until: '2026-10-19T12:00:00+02:00', schedule: [] },
  ]
  it('listet Bildschirme mit der Rolle der Ansicht', () => {
    expect(usedOn(7, screens, now)).toEqual([
      { id: 1, name: 'Glocke', role: 'Standard-Ansicht' },
      { id: 2, name: 'Mensa', role: 'Vorübergehend, Zeitplan' },
    ])
    expect(usedOn(99, screens, now)).toEqual([])
  })
})

describe('Haltestellen', () => {
  it('legt neue Haltestellen mit 10 Zeilen und allen Verkehrsmitteln an', () => {
    expect(newStop({ id: '8000237', name: 'Lübeck Hbf', source: 'db' })).toEqual({
      id: '8000237', name: 'Lübeck Hbf', walk_minutes: 0, max_departures: 10, filter_lines: [],
      filter_direction: '', filter_via: '', show_bus: true, show_rail: true, show_long_distance: true,
    })
  })
  it('beschreibt die Verkehrsmittel', () => {
    expect(stopTransport({})).toBe('Bus, Zug, Fernzug')
    expect(stopTransport({ show_rail: false, show_long_distance: false })).toBe('Bus')
    expect(stopTransport({ show_bus: false, show_rail: false, show_long_distance: false })).toBe('Keine')
  })
})

describe('viewProblems: Zahlenfelder', () => {
  const ok = { name: 'A', kind: 'departures' }
  it('meldet leere und zu große Zahlen der geänderten Felder', () => {
    expect(viewProblems({ ...ok, page_seconds: '' }, ['page_seconds']))
      .toEqual(['Blättertakt: bitte eine ganze Zahl von 5 bis 120 eintragen.'])
    expect(viewProblems({ ...ok, media_seconds: 601 }, ['media_seconds']))
      .toEqual(['Sekunden pro Seite: bitte eine ganze Zahl von 3 bis 600 eintragen.'])
    expect(viewProblems({ ...ok, pdf_per_screen: 4, split_left_percent: '' }, ['pdf_per_screen', 'split_left_percent'])).toEqual([
      'Seiten nebeneinander: bitte eine ganze Zahl von 1 bis 3 eintragen.',
      'Breite links: bitte eine ganze Zahl von 20 bis 80 eintragen.',
    ])
    expect(viewProblems({ ...ok, page_seconds: 20, media_seconds: 3 }, ['page_seconds', 'media_seconds'])).toEqual([])
  })
  it('lässt ungeänderte Felder in Ruhe (alte Werte blockieren nichts)', () => {
    expect(viewProblems({ ...ok, page_seconds: 2 }, ['name'])).toEqual([])
  })
  it('prüft Fußweg und Max. Zeilen jeder Haltestelle', () => {
    const stops = [
      { id: '1', name: 'Kohlmarkt', walk_minutes: '', max_departures: 10 },
      { id: '2', name: 'Sandstraße', walk_minutes: 3, max_departures: 31 },
    ]
    expect(viewProblems({ ...ok, transit_stops: stops }, ['transit_stops'])).toEqual([
      'Haltestelle „Kohlmarkt“: Fußweg: bitte eine ganze Zahl von 0 bis 60 eintragen.',
      'Haltestelle „Sandstraße“: Max. Zeilen: bitte eine ganze Zahl von 1 bis 30 eintragen.',
    ])
  })
})

describe('gespeicherter WebUntis-Link', () => {
  it('schickt einen gelösten Link als null mit', () => {
    expect(viewPayload({ webuntis_url: ' https://a ', webuntis_link_id: null }, ['webuntis_url', 'webuntis_link_id']))
      .toEqual({ webuntis_url: 'https://a', webuntis_link_id: null })
    expect(draftFromView({ webuntis_link_id: 3 }).webuntis_link_id).toBe(3)
  })
})
