import StateScreen from './StateScreen'

export default function Loading({ orientation, bare = false }) {
  if (bare) {
    return (
      <div className="flex h-full items-center">
        <p className="d-head text-[4rem] text-(--d-muted)">Wird geladen</p>
      </div>
    )
  }
  return <StateScreen state="loading" orientation={orientation} title="Wird geladen" titleClassName="text-(--d-muted)" />
}
