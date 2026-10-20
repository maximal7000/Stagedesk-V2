import StateScreen from './StateScreen'

// Erster Start ohne Daten. Kein Spinner, keine Animation. bare: nur der Text, im Rahmen einer Ansicht.
export default function Loading({ orientation, bare = false }) {
  if (bare) {
    return (
      <div className="flex h-full items-center">
        <p className="d-oswald text-[4rem] font-light text-(--d-muted)">Wird geladen</p>
      </div>
    )
  }
  return <StateScreen state="loading" orientation={orientation} title="Wird geladen" titleClassName="font-light text-(--d-muted)" />
}
