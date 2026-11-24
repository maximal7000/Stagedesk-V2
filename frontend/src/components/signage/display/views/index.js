import DeparturesView from './DeparturesView'
import InfoView from './InfoView'
import MapView from './MapView'
import MediaView from './MediaView'
import RotationView from './RotationView'
import SplitView from './SplitView'
import SubstitutionsView from './SubstitutionsView'

export const VIEW_COMPONENTS = {
  departures: DeparturesView,
  substitutions: SubstitutionsView,
  info: InfoView,
  media: MediaView,
  split: SplitView,
  rotation: RotationView,
  // Only as a side of a split view (or beside an exam): no view kind of its own
  map: MapView,
}
