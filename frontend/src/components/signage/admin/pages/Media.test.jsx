import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { createElement, act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const perms = new Set()
vi.mock('../../../../contexts/UserContext', () => ({ useUser: () => ({ hasPermission: (p) => perms.has(p) }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('../shared/api', () => ({
  getFiles: vi.fn(),
  getFile: vi.fn(),
  renameFile: vi.fn(),
  uploadFile: vi.fn(),
  deleteFile: vi.fn(),
  restoreFromTrash: vi.fn(),
}))

const api = await import('../shared/api')
const { toast } = await import('sonner')
const { default: Media } = await import('./Media')

const plan = (name = 'Speiseplan') => ({ id: 11, name, kind: 'pdf', status: 'ready', page_count: 2, first_page_url: '', orientation: 'portrait' })

let root, container
async function mount() {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => { root.render(createElement(MemoryRouter, null, createElement(Media))) })
}
function typeInto(input, value) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
  setter.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}
const button = (text) => [...container.querySelectorAll('button')].find((b) => b.textContent.trim() === text)
const click = async (el) => { await act(async () => { el.click() }) }
const open = () => click(container.querySelector('[data-media="11"] button'))

beforeEach(() => {
  perms.clear()
  vi.clearAllMocks()
  api.getFiles.mockResolvedValue([plan()])
  api.getFile.mockResolvedValue({ ...plan(), pages: [], used_in: [] })
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe('Media', () => {
  it('benennt eine Datei um und lädt die Liste neu', async () => {
    perms.add('signage.view').add('signage.media')
    api.renameFile.mockResolvedValue(plan('Speiseplan November'))
    await mount()
    await open()
    const form = container.querySelector('[data-media-rename]')
    expect(button('Umbenennen').disabled).toBe(true)
    await act(async () => { typeInto(form.querySelector('input'), '  Speiseplan November ') })
    api.getFiles.mockResolvedValue([plan('Speiseplan November')])
    await act(async () => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) })
    expect(api.renameFile).toHaveBeenCalledWith(11, 'Speiseplan November')
    expect(toast.success).toHaveBeenCalledWith('Umbenannt.')
    expect(container.querySelector('[data-media="11"]').textContent).toContain('Speiseplan November')
    expect(button('Umbenennen').disabled).toBe(true)
  })

  it('leerer Name wird nicht gespeichert', async () => {
    perms.add('signage.view').add('signage.media')
    await mount()
    await open()
    const form = container.querySelector('[data-media-rename]')
    await act(async () => { typeInto(form.querySelector('input'), '   ') })
    expect(form.textContent).toContain('Name fehlt.')
    expect(button('Umbenennen').disabled).toBe(true)
    await act(async () => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) })
    expect(api.renameFile).not.toHaveBeenCalled()
  })

  it('ohne signage.media kein Umbenennen', async () => {
    perms.add('signage.view')
    await mount()
    await open()
    expect(container.querySelector('[data-media-rename]')).toBeNull()
  })
})
