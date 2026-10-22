import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { createElement, act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('../shared/api', () => ({
  getExams: vi.fn(() => Promise.resolve([])),
  getEvents: vi.fn(),
  getAnnouncements: vi.fn(() => Promise.resolve([])),
  getScreens: vi.fn(() => Promise.resolve([{ id: 1, name: 'Glocke' }])),
  getViews: vi.fn(() => Promise.resolve([{ id: 7, name: 'Info Mensa' }])),
  getExamTemplates: vi.fn(() => Promise.resolve([])),
  activateEvent: vi.fn(() => Promise.resolve({})),
  deactivateEvent: vi.fn(() => Promise.resolve({})),
  updateEvent: vi.fn(() => Promise.resolve({})),
  createEvent: vi.fn(() => Promise.resolve({})),
  deleteExam: vi.fn(), deleteEvent: vi.fn(), deleteAnnouncement: vi.fn(),
  updateExam: vi.fn(), createExam: vi.fn(), updateAnnouncement: vi.fn(), createAnnouncement: vi.fn(),
  createExamTemplate: vi.fn(), deleteExamTemplate: vi.fn(),
}))

const api = await import('../shared/api')
const { toast } = await import('sonner')
const { default: Exams } = await import('./Exams')

const manual = (is_active) => ({
  id: 4, name: 'Elternabend', description: '', color: '#7c3aed', is_active, active_from: null, active_until: null,
  assignments: [{ screen_id: 1, view_id: 7, screen_name: 'Glocke', view_name: 'Info Mensa' }],
})

let root, container
async function mount() {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => { root.render(createElement(MemoryRouter, null, createElement(Exams))) })
}
const button = (name) => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === name || b.getAttribute('aria-label') === name)
const click = async (el) => { await act(async () => { el.click() }) }
function typeInto(input, value) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
  setter.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

beforeEach(() => { vi.clearAllMocks() })
afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe('Exams: Termine von Hand', () => {
  it('ein Termin ohne Zeitraum steht unter "Kommt" und lässt sich aktivieren', async () => {
    api.getEvents.mockResolvedValueOnce([manual(false)]).mockResolvedValueOnce([manual(true)])
    await mount()
    expect(container.querySelector('[data-group="upcoming"]').textContent).toContain('Nur von Hand')
    await click(button('Elternabend aktivieren'))
    expect(api.activateEvent).toHaveBeenCalledWith(4)
    expect(container.querySelector('[data-group="running"]').textContent).toContain('Manuell aktiv')
    expect(button('Elternabend deaktivieren')).toBeTruthy()
  })

  it('deaktiviert einen aktiven Termin', async () => {
    api.getEvents.mockResolvedValue([manual(true)])
    await mount()
    await click(button('Elternabend deaktivieren'))
    expect(api.deactivateEvent).toHaveBeenCalledWith(4)
  })

  it('speichert einen Termin ohne Zeiten mit null', async () => {
    api.getEvents.mockResolvedValue([manual(false)])
    await mount()
    await click(button('Elternabend bearbeiten'))
    await click(button('Speichern'))
    expect(toast.error).not.toHaveBeenCalled()
    expect(api.updateEvent).toHaveBeenCalledWith(4, expect.objectContaining({ active_from: null, active_until: null }))
  })

  it('lehnt einen Termin mit nur einer Zeit ab', async () => {
    api.getEvents.mockResolvedValue([manual(false)])
    await mount()
    await click(button('Elternabend bearbeiten'))
    const from = [...document.querySelectorAll('label')].find((l) => l.textContent === 'Von').control
    await act(async () => { typeInto(from, '2026-10-22T18:00') })
    await click(button('Speichern'))
    expect(api.updateEvent).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledWith('Beginn und Ende angeben oder beide leer lassen.')
  })
})
