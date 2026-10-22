// Schutz vor verlorenen Entwürfen (Spec §6.2).
// Seiten melden mit useUnsavedGuard(isDirty) ungespeicherte Änderungen an; solange eine gemeldet ist,
// warnt der Browser beim Schließen oder Neuladen (beforeunload), und confirmLeave() fragt vor
// App-internen Wechseln nach (Sidebar-Links rufen es mit ihrem Ziel vor der Navigation auf).
import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef } from 'react'

export const LEAVE_QUESTION = 'Es gibt ungespeicherte Änderungen. Seite trotzdem verlassen?'

const UnsavedChangesContext = createContext(null)

export default function UnsavedChangesProvider({ children }) {
  const dirtyIds = useRef(new Set())

  const register = useCallback((id, dirty) => {
    if (dirty) dirtyIds.current.add(id)
    else dirtyIds.current.delete(id)
  }, [])

  // target: Pfad des Links. Zeigt er auf die aktuelle Seite, wird nichts verlassen: keine Frage, Meldungen bleiben.
  const confirmLeave = useCallback((target) => {
    if (dirtyIds.current.size === 0) return true
    if (typeof target === 'string' && target === window.location.pathname) return true
    const ok = window.confirm(LEAVE_QUESTION)
    // Die Seite wird gleich verlassen: ihre Meldung gilt nicht mehr, auch falls sie nicht abgebaut wird
    if (ok) dirtyIds.current.clear()
    return ok
  }, [])

  const value = useMemo(() => ({ register, confirmLeave }), [register, confirmLeave])
  return <UnsavedChangesContext.Provider value={value}>{children}</UnsavedChangesContext.Provider>
}

const alwaysLeave = () => true

// Für Links außerhalb der Monitor-Seiten: ohne Provider ist Verlassen immer erlaubt.
// eslint-disable-next-line react-refresh/only-export-components
export function useConfirmLeave() {
  return useContext(UnsavedChangesContext)?.confirmLeave ?? alwaysLeave
}

// eslint-disable-next-line react-refresh/only-export-components
export function useUnsavedGuard(isDirty) {
  const ctx = useContext(UnsavedChangesContext)
  const id = useId()
  const register = ctx?.register

  useEffect(() => {
    if (!register) return undefined
    register(id, !!isDirty)
    return () => register(id, false)
  }, [register, id, isDirty])

  useEffect(() => {
    if (!isDirty) return undefined
    const onBeforeUnload = (e) => {
      e.preventDefault()
      e.returnValue = LEAVE_QUESTION
      return LEAVE_QUESTION
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [isDirty])

  return { confirmLeave: ctx?.confirmLeave ?? alwaysLeave }
}
