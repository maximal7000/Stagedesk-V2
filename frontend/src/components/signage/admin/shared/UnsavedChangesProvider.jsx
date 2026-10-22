// Pages report unsaved changes with useUnsavedGuard(isDirty); while one is reported the browser warns
// on close or reload (beforeunload) and confirmLeave() asks before in-app navigation (sidebar links
// call it with their target before navigating).
import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef } from 'react'

export const LEAVE_QUESTION = 'Es gibt ungespeicherte Änderungen. Seite trotzdem verlassen?'

const UnsavedChangesContext = createContext(null)

export default function UnsavedChangesProvider({ children }) {
  const dirtyIds = useRef(new Set())

  const register = useCallback((id, dirty) => {
    if (dirty) dirtyIds.current.add(id)
    else dirtyIds.current.delete(id)
  }, [])

  // target: path of the link. If it points at the current page nothing is left: no question, reports stay.
  const confirmLeave = useCallback((target) => {
    if (dirtyIds.current.size === 0) return true
    if (typeof target === 'string' && target === window.location.pathname) return true
    const ok = window.confirm(LEAVE_QUESTION)
    // The page is about to be left: its report no longer counts, even if it does not unmount
    if (ok) dirtyIds.current.clear()
    return ok
  }, [])

  const value = useMemo(() => ({ register, confirmLeave }), [register, confirmLeave])
  return <UnsavedChangesContext.Provider value={value}>{children}</UnsavedChangesContext.Provider>
}

const alwaysLeave = () => true

// For links outside the signage pages: without a provider leaving is always allowed.
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
