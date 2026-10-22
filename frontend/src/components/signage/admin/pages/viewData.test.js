import { describe, it, expect } from 'vitest'
import {
  EDITABLE_FIELDS, KIND_OPTIONS, LAYOUT_OPTIONS, layoutHelp, changedKeys, draftFromView, moveItem, newStop, normalizeStop, previewPayload, rotationChoices,
  kindChangeProblem, stopTransport, usedOn, viewPayload, viewProblems,
} from './viewData'

const VIEW = {
  id: 7, name: ' Abfahrten Halle ', kind: 'departures', layout: 'auto', api_token: 'geheim', slug: 'departures-hall',
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
    const draft = { ...base, layout: 'wide', transit_stops: [...base.transit_stops] }
    expect(changedKeys(base, draft)).toEqual(['layout'])
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
    const draft = { ...base, layout: 'wide' }
    expect(previewPayload(7, base, draft)).toEqual({ id: 7, layout: 'wide' })
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
      { id: '2', name: 'Sandstraße', walk_minutes: 3, max_departures: 51 },
    ]
    expect(viewProblems({ ...ok, transit_stops: stops }, ['transit_stops'])).toEqual([
      'Haltestelle „Kohlmarkt“: Fußweg: bitte eine ganze Zahl von 0 bis 60 eintragen.',
      'Haltestelle „Sandstraße“: Max. Zeilen: bitte eine ganze Zahl von 1 bis 50 eintragen.',
    ])
  })
  it('lässt alte Haltestellen mit 0 (ohne Grenze) oder bis 50 Zeilen speichern', () => {
    const stops = [
      { id: '1', name: 'Kohlmarkt', walk_minutes: 0, max_departures: 0 },
      { id: '2', name: 'Sandstraße', walk_minutes: 3, max_departures: 50 },
    ]
    expect(viewProblems({ ...ok, transit_stops: stops }, ['transit_stops'])).toEqual([])
    expect(stops.map((s) => normalizeStop(s).max_departures)).toEqual([10, 50])
  })
})

describe('gespeicherter WebUntis-Link', () => {
  it('schickt einen gelösten Link als null mit', () => {
    expect(viewPayload({ webuntis_url: ' https://a ', webuntis_link_id: null }, ['webuntis_url', 'webuntis_link_id']))
      .toEqual({ webuntis_url: 'https://a', webuntis_link_id: null })
    expect(draftFromView({ webuntis_link_id: 3 }).webuntis_link_id).toBe(3)
  })
})

describe('Abfahrten: Erweitert', () => {
  const view = { ...VIEW, transit_duration: 60, transit_source_db: true, transit_source_nahsh: true, transit_show_via: false,
    transit_disruption_hidden: ['a1'] }
  const base = draftFromView(view)

  it('Vorausschau, Quellen, Zwischenhalte und ausgeblendete Meldungen sind bearbeitbar', () => {
    expect(base).toMatchObject({ transit_duration: 60, transit_source_db: true, transit_show_via: false, transit_disruption_hidden: ['a1'] })
    const draft = { ...base, transit_duration: '90', transit_source_nahsh: false, transit_show_via: true, transit_disruption_hidden: ['a1', 'b2'] }
    const keys = changedKeys(base, draft)
    expect(keys).toEqual(['transit_duration', 'transit_source_nahsh', 'transit_show_via', 'transit_disruption_hidden'])
    expect(viewPayload(draft, keys)).toEqual({
      transit_duration: 90, transit_source_nahsh: false, transit_show_via: true, transit_disruption_hidden: ['a1', 'b2'],
    })
  })

  it('Vorausschau wie im Backend: 10 bis 240 Minuten', () => {
    const problems = (v) => viewProblems({ ...base, transit_duration: v }, ['transit_duration'])
    expect(problems(240)).toEqual([])
    expect(problems('')).toEqual(['Vorausschau: bitte eine ganze Zahl von 10 bis 240 eintragen.'])
    expect(problems(9)).toHaveLength(1)
  })
})

describe('Aufteilung', () => {
  it('bietet Automatisch, Normal und Breit mit den Hilfetexten der Vorgabe', () => {
    expect(LAYOUT_OPTIONS).toEqual([
      { value: 'auto', label: 'Automatisch' }, { value: 'normal', label: 'Normal' }, { value: 'wide', label: 'Breit' },
    ])
    expect(layoutHelp('normal', 'info')).toBe('Inhalt rechts neben dem Schullogo.')
    expect(layoutHelp('wide', 'info')).toBe('Inhalt über die ganze Breite, das Schullogo liegt dahinter.')
    expect(layoutHelp('auto', 'info')).toBe('Info und Medien: Normal. Abfahrten, Vertretungsplan, Geteilt und Wechsel: Breit.')
  })

  it('sendet layout und nie style, dazu die Felder des Vertretungsplans', () => {
    expect(EDITABLE_FIELDS).toContain('layout')
    expect(EDITABLE_FIELDS).not.toContain('style')
    expect(EDITABLE_FIELDS).not.toContain('substitutions_next_day')
    const draft = draftFromView({ ...VIEW, style: 'ci', layout: 'wide', substitutions_source: 'account', substitutions_show_exams: null })
    expect(draft).not.toHaveProperty('style')
    const out = viewPayload({ ...draft, substitutions_custom_format: ' vplan-x ', substitutions_next_day_from: '' }, EDITABLE_FIELDS)
    expect(out).not.toHaveProperty('style')
    expect(out).toMatchObject({ layout: 'wide', substitutions_source: 'account', substitutions_show_exams: null,
      substitutions_custom_format: 'vplan-x', substitutions_next_day_from: '' })
  })
})

describe('kindChangeProblem', () => {
  const views = [
    { id: 1, name: 'Abfahrten', kind: 'departures' },
    { id: 4, name: 'Wechsel Mensa', kind: 'rotation', rotation_items: [{ view_id: 1, seconds: 20 }] },
    { id: 5, name: 'Alter Wechsel', kind: 'rotation', deleted_at: '2026-01-01T00:00:00Z', rotation_items: [{ view_id: 2, seconds: 20 }] },
  ]

  it('sperrt den Wechsel-Typ für ein Mitglied eines Wechsels und nennt dessen Namen', () => {
    expect(kindChangeProblem(1, 'rotation', views)).toBe('Diese Ansicht ist Teil des Wechsels „Wechsel Mensa“. Erst dort entfernen.')
  })

  it('lässt andere Typen, Nicht-Mitglieder und gelöschte Wechsel zu', () => {
    expect(kindChangeProblem(1, 'info', views)).toBeNull()
    expect(kindChangeProblem(2, 'rotation', views)).toBeNull()
    expect(kindChangeProblem(3, 'rotation', undefined)).toBeNull()
  })
})

describe('Typ im Entwurf', () => {
  it('ist bearbeitbar und wird nur bei Änderung gesendet', () => {
    const base = draftFromView(VIEW)
    expect(base.kind).toBe('departures')
    const draft = { ...base, kind: 'info' }
    expect(changedKeys(base, draft)).toEqual(['kind'])
    expect(viewPayload(draft, ['kind'])).toEqual({ kind: 'info' })
    expect(previewPayload(7, base, draft)).toEqual({ id: 7, kind: 'info' })
  })
})
