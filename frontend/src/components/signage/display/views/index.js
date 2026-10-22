import DeparturesView from './DeparturesView'
import InfoView from './InfoView'
import MediaView from './MediaView'
import RotationView from './RotationView'
import SplitView from './SplitView'
import SubstitutionsView from './SubstitutionsView'

// Props: {view}.
//   View.Footer:   footer bar (disruptions, data age); in "Breit" left of the clock box, otherwise at the bottom
//   View.ownFrame: the view brings its own frame (media, rotation) and gets
//                  {orientation, frame: {scheme, staleSince, wheel, stripe}, screen}
export const VIEW_COMPONENTS = {
  departures: DeparturesView,
  substitutions: SubstitutionsView,
  info: InfoView,
  media: MediaView,
  split: SplitView,
  rotation: RotationView,
}
