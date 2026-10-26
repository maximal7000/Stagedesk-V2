import { describe, it, expect, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import ClockBox from './ClockBox'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let root, host
function render(props) {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => { root.render(<ClockBox {...props} />) })
  return host
}
afterEach(() => { act(() => root.unmount()); host.remove() })

const now = new Date(2026, 9, 21, 9, 5, 7)
const stale = new Date(2026, 9, 21, 9, 1, 0)

describe('ClockBox', () => {
  it.each(['header', 'box', 'compact'])('zeigt in der Variante %s HH:MM:SS', (variant) => {
    expect(render({ now, variant }).textContent).toContain('09:05:07')
  })

  it.each(['header', 'box'])('hält in der Variante %s die Breite der Uhr fest', (variant) => {
    expect(render({ now, variant }).querySelector('.d-clock')?.textContent).toBe('09:05:07')
  })

  it('Stand-Hinweis bleibt ohne Sekunden', () => {
    const text = render({ now, variant: 'box', staleSince: stale }).textContent
    expect(text).toContain('Stand 09:01')
    expect(text).not.toContain('09:01:')
  })

  it('Uhr-Kasten nutzt die Kastenfarbe', () => {
    const box = render({ now, variant: 'box' }).querySelector('[data-clock="box"]')
    expect(box.classList.contains('d-card')).toBe(true)
  })
})
