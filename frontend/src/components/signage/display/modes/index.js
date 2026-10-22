import EmergencyMode from './EmergencyMode'
import ExamMode from './ExamMode'
import OnAirMode from './OnAirMode'

// Props: {mode, orientation, panel}; panel ('left'/'right') only in split screen.
export const MODE_COMPONENTS = {
  emergency: EmergencyMode,
  exam: ExamMode,
  on_air: OnAirMode,
}

// Split screen only for exam and on-air with display 'split' (emergency is always full screen)
export const isSplitMode = (mode) => mode?.kind !== 'emergency' && mode?.display === 'split'
