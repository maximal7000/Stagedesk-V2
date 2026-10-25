import { POWER_METHOD_OPTIONS } from '../pages/screenData'

export const PROBE_LABELS = { cec: 'CEC', sicp: 'Netzwerk (SICP)', ddc: 'DDC', hdmi: 'HDMI-Signal' }
export const PROBE_TO_METHOD = { cec: 'cec', sicp: 'hybrid', ddc: 'ddc', hdmi: 'hdmi' }

const FALLBACK_ORDER = ['cec', 'hybrid', 'ddc', 'hdmi']

export const methodLabel = (method) => POWER_METHOD_OPTIONS.find((o) => o.value === method)?.label ?? method

export function parseProbe(command) {
  const failed = { error: command?.result || 'Prüfung fehlgeschlagen.' }
  if (command?.status !== 'ok') return failed
  let data
  try { data = JSON.parse(command.result) } catch { return failed }
  if (!data || !Array.isArray(data.methods)) return failed
  const checked = data.checked_at ? new Date(data.checked_at) : null
  return {
    checkedAt: checked && !Number.isNaN(checked.getTime()) ? checked : null,
    methods: data.methods.map((m) => ({
      probe: m.method,
      method: PROBE_TO_METHOD[m.method] ?? m.method,
      state: m.state,
      text: m.text ?? '',
      testable: m.state === 'ok' || m.state === 'warn',
    })),
    recommended: data.recommended ?? 'none',
  }
}

export function testOrder(parsed) {
  const testable = new Set(parsed.methods.filter((m) => m.testable).map((m) => m.method))
  const order = parsed.recommended !== 'none' && testable.has(parsed.recommended) ? [parsed.recommended] : []
  for (const method of FALLBACK_ORDER) {
    if (testable.has(method) && !order.includes(method)) order.push(method)
  }
  return order
}

export function nextMethod(order, current) {
  const i = order.indexOf(current)
  return i >= 0 && i + 1 < order.length ? order[i + 1] : null
}
