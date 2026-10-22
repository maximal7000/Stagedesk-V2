import StateScreen, { StateText } from './StateScreen'

export default function ScreenNotFound({ slug, orientation, previewExpired = false }) {
  if (previewExpired) {
    return (
      <StateScreen state="preview-expired" orientation={orientation} title="Vorschau abgelaufen" />
    )
  }
  return (
    <StateScreen state="not-found" orientation={orientation} title="Bildschirm nicht gefunden">
      <StateText>
        Kein Bildschirm mit der Kennung „{slug}“.
      </StateText>
    </StateScreen>
  )
}
