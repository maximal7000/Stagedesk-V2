import { describe, it, expect } from 'vitest'
import { fileMeta, mediaStatus, uploadKind, uploadProblem } from './mediaData'

describe('mediaStatus', () => {
  it('Status als Text', () => {
    expect(mediaStatus({ status: 'processing' })).toBe('Wird vorbereitet')
    expect(mediaStatus({ status: 'ready' })).toBe('Fertig')
    expect(mediaStatus({ status: 'failed', error: 'PDF enthält keine Seiten.' })).toBe('Fehlgeschlagen: PDF enthält keine Seiten.')
    expect(mediaStatus({ status: 'failed', error: '' })).toBe('Fehlgeschlagen: Grund unbekannt.')
  })
})

describe('fileMeta', () => {
  it('Art, Seitenzahl und Ausrichtung', () => {
    expect(fileMeta({ kind: 'pdf', page_count: 3, orientation: 'portrait' })).toBe('PDF · 3 Seiten · Hochformat')
    expect(fileMeta({ kind: 'image', page_count: 1, orientation: 'landscape' })).toBe('Bild · 1 Seite · Querformat')
    expect(fileMeta({ kind: 'pdf', page_count: 0, orientation: '' })).toBe('PDF')
    expect(fileMeta({ kind: 'pdf', page_count: 2, pages: [{ orientation: 'portrait' }] })).toBe('PDF · 2 Seiten · Hochformat')
  })
})

describe('Upload', () => {
  it('Art aus Typ oder Endung, nur PDF und Bilder bis 50 MB', () => {
    expect(uploadKind({ name: 'a.pdf', type: 'application/pdf' })).toBe('pdf')
    expect(uploadKind({ name: 'a.PDF', type: '' })).toBe('pdf')
    expect(uploadKind({ name: 'a.jpg', type: 'image/jpeg' })).toBe('image')
    expect(uploadProblem({ name: 'a.jpg', type: 'image/jpeg', size: 10 })).toBeNull()
    expect(uploadProblem({ name: 'a.docx', type: 'application/msword', size: 10 }))
      .toBe('„a.docx“ ist kein PDF und kein Bild.')
    expect(uploadProblem({ name: 'b.pdf', type: 'application/pdf', size: 51 * 1024 * 1024 }))
      .toBe('„b.pdf“ ist größer als 50 MB.')
  })
})
