import EmergencyMode from './EmergencyMode'
import ExamMode from './ExamMode'
import OnAirMode from './OnAirMode'

// Sondermodus je mode.kind. Props: {mode, orientation, panel}; panel ('left'/'right') nur im Splitscreen.
export const MODE_COMPONENTS = {
  emergency: EmergencyMode,
  exam: ExamMode,
  on_air: OnAirMode,
}

// Splitscreen nur für Klausur und On-Air mit display 'split' (Notfall ist immer Vollbild)
export const isSplitMode = (mode) => mode?.kind !== 'emergency' && mode?.display === 'split'
