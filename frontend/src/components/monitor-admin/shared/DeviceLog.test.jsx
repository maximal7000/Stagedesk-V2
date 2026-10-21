import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { createElement, act } from 'react'
import { createRoot } from 'react-dom/client'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

vi.mock('./api', () => ({ getScreenEvents: vi.fn() }))
const api = await import('./api')
const { default: DeviceLog } = await import('./DeviceLog')

const EVENTS = [
  { id: 3, kind: 'command', text: 'Neu laden: ok', created_at: '2026-10-20T09:30:00', person: 'Mara Beispiel' },
  { id: 2, kind: 'offline', text: 'Gerät nicht mehr erreichbar', created_at: '2026-10-20T08:00:00', person: '' },
  { id: 1, kind: 'paired', text: 'Gerät gekoppelt', created_at: '2026-10-19T14:05:00', person: 'Tom Test' },
]

let root, container
beforeEach(() => { vi.clearAllMocks(); api.getScreenEvents.mockImplementation(() => Promise.resolve(EVENTS)) })
afterEach(() => { if (root) act(() => root.unmount()); container?.remove(); root = undefined })

async function mount() {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => { root.render(createElement(DeviceLog, { screenId: 1 })) })
}
const select = () => container.querySelector('select')

describe('DeviceLog', () => {
  it('zeigt Zeilen mit Zeit, Art, Text und Person', async () => {
    await mount()
    expect(api.getScreenEvents).toHaveBeenCalledWith(1, { limit: 100 })
    const rows = container.querySelectorAll('tbody tr')
    expect(rows).toHaveLength(3)
    expect(rows[0].textContent).toContain('Di 20.10., 09:30')
    expect(rows[0].textContent).toContain('Befehl')
    expect(rows[0].textContent).toContain('Neu laden: ok')
    expect(rows[0].textContent).toContain('Mara Beispiel')
    expect(rows[1].textContent).toContain('Verbindung')
    expect(rows[2].textContent).toContain('Kopplung')
  })

  it('bietet die Filter nach Art an', async () => {
    await mount()
    expect([...select().options].map((o) => o.textContent)).toEqual(['Alle', 'Verbindung', 'Warnungen', 'Updates', 'Befehle', 'Kopplung'])
  })

  it('filtert nach Gruppe und fragt jede Art der Gruppe ab', async () => {
    api.getScreenEvents.mockImplementation((id, { kind }) => Promise.resolve(EVENTS.filter((e) => e.kind === kind)))
    await mount()
    await act(async () => {
      select().value = 'connection'
      select().dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(api.getScreenEvents).toHaveBeenCalledWith(1, { kind: 'online', limit: 100 })
    expect(api.getScreenEvents).toHaveBeenCalledWith(1, { kind: 'offline', limit: 100 })
    const rows = container.querySelectorAll('tbody tr')
    expect(rows).toHaveLength(1)
    expect(rows[0].textContent).toContain('nicht mehr erreichbar')
  })

  it('leer: Noch keine Einträge.', async () => {
    api.getScreenEvents.mockImplementation(() => Promise.resolve([]))
    await mount()
    expect(container.textContent).toContain('Noch keine Einträge.')
    expect(container.querySelector('table')).toBeNull()
  })

  it('Ladefehler nennt Ursache und nächsten Schritt', async () => {
    api.getScreenEvents.mockImplementation(() => Promise.reject(Object.assign(new Error('x'), { response: { status: 503, data: {} } })))
    await mount()
    expect(container.querySelector('[role="alert"]').textContent).toContain('Das Protokoll konnte nicht geladen werden.')
  })
})
