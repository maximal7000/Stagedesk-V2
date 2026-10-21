import DeparturesView from './DeparturesView'
import InfoView from './InfoView'
import MediaView from './MediaView'
import RotationView from './RotationView'
import SplitView from './SplitView'
import SubstitutionsView from './SubstitutionsView'

// Ansicht je view.kind. Props: {view}.
//   View.Footer:   Fußleiste (Störungen, Stand der Daten); bei "Breit" links neben dem Uhr-Kasten, sonst unten
//   View.ownFrame: die Ansicht bringt ihren Rahmen selbst mit (Medien, Wechsel) und bekommt dazu
//                  {orientation, frame: {staleSince, wheel, stripe}, screen}
export const VIEW_COMPONENTS = {
  departures: DeparturesView,
  substitutions: SubstitutionsView,
  info: InfoView,
  media: MediaView,
  split: SplitView,
  rotation: RotationView,
}
