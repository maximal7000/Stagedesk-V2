export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024

const KIND_LABELS = { pdf: 'PDF', image: 'Bild', background: 'Hintergrund', logo: 'Logo' }

export function mediaStatus(file) {
  if (file.status === 'processing') return 'Wird vorbereitet'
  if (file.status === 'failed') {
    const reason = (file.error || '').trim() || 'Grund unbekannt.'
    return `Fehlgeschlagen: ${reason}`
  }
  return 'Fertig'
}

export function fileMeta(file) {
  const parts = [KIND_LABELS[file.kind] ?? file.kind]
  if (file.page_count > 0) parts.push(file.page_count === 1 ? '1 Seite' : `${file.page_count} Seiten`)
  const orientation = file.orientation || file.pages?.[0]?.orientation
  if (orientation) parts.push(orientation === 'portrait' ? 'Hochformat' : 'Querformat')
  return parts.join(' · ')
}

const isPdf = (file) => file.type === 'application/pdf' || /\.pdf$/i.test(file.name || '')

export const uploadKind = (file) => (isPdf(file) ? 'pdf' : 'image')

export function uploadProblem(file) {
  if (!isPdf(file) && !(file.type || '').startsWith('image/')) {
    return `„${file.name}“ ist kein PDF und kein Bild.`
  }
  if (file.size > MAX_UPLOAD_BYTES) return `„${file.name}“ ist größer als 50 MB.`
  return null
}
