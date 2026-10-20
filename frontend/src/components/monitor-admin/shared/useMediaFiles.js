// Medien-Liste mit Abfrage alle 3 s, solange eine Datei vorbereitet wird (status 'processing'). Ohne solche
// Datei läuft kein Intervall; beim Verlassen der Seite wird es aufgeräumt. Eine ältere Antwort überschreibt
// nie eine neuere.
import { useCallback, useEffect, useRef, useState } from 'react'
import * as api from './api'

export const POLL_MS = 3000

export const hasProcessing = (files) => (files || []).some((f) => f.status === 'processing')

const loadFiles = () => api.getFiles()

export function useMediaFiles(load = loadFiles) {
  const [files, setFiles] = useState(null)
  const [error, setError] = useState(null)
  const loadRef = useRef(load)
  const seq = useRef(0)
  const alive = useRef(true)
  useEffect(() => { loadRef.current = load })

  const reload = useCallback(async () => {
    const mine = ++seq.current
    try {
      const data = await loadRef.current()
      if (!alive.current || mine !== seq.current) return
      setFiles(data)
      setError(null)
    } catch (e) {
      if (alive.current && mine === seq.current) setError(e)
    }
  }, [])

  useEffect(() => {
    alive.current = true
    reload()
    return () => { alive.current = false }
  }, [reload])

  const polling = hasProcessing(files)
  useEffect(() => {
    if (!polling) return undefined
    const timer = setInterval(reload, POLL_MS)
    return () => clearInterval(timer)
  }, [polling, reload])

  return { files, error, reload, polling }
}
