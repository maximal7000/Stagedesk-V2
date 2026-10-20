import DeparturesView from './DeparturesView'
import InfoView from './InfoView'
import SubstitutionsView from './SubstitutionsView'

// Ansicht je view.kind. Eine Ansicht kann eine Fußleiste mitbringen (`View.Footer`, nur dichte Rahmen),
// die links neben der Uhr-Box steht. media, split und rotation folgen in Task 12.
export const VIEW_COMPONENTS = {
  departures: DeparturesView,
  substitutions: SubstitutionsView,
  info: InfoView,
}
