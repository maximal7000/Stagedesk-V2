import StateScreen, { StateText } from './StateScreen'

// previewExpired: the admin preview token is no longer valid.
export default function ScreenNotFound({ slug, orientation, previewExpired = false }) {
  if (previewExpired) {
    return (
      <StateScreen state="preview-expired" orientation={orientation} title="Vorschau abgelaufen">
        <StateText>Im Admin neu öffnen.</StateText>
      </StateScreen>
    )
  }
  return (
    <StateScreen state="not-found" orientation={orientation} title="Bildschirm nicht gefunden">
      <StateText>
        Für „{slug}“ ist kein Bildschirm angelegt. Im Admin unter Monitore → Bildschirme anlegen.
      </StateText>
    </StateScreen>
  )
}
