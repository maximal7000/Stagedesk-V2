const PREFIX = 'stagedesk.display.'

export function save(slugKey, payload) {
  try {
    localStorage.setItem(PREFIX + slugKey, JSON.stringify({ payload, savedAt: Date.now() }))
  } catch {
    // Speicher voll oder gesperrt: Anzeige läuft ohne Zwischenspeicher weiter.
  }
}

export function load(slugKey) {
  try {
    const raw = localStorage.getItem(PREFIX + slugKey)
    if (!raw) return null
    const hit = JSON.parse(raw)
    if (!hit || typeof hit !== 'object' || !('payload' in hit)) return null
    return { payload: hit.payload, savedAt: hit.savedAt }
  } catch {
    return null
  }
}
