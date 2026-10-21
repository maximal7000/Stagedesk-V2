// Dünne Aufrufe der Monitor-API (/api/monitor/…) für das Admin. Jede Funktion liefert response.data.
// Pfade ohne Schrägstrich am Ende (Django-Ninja-Konvention des Projekts).
import apiClient from '../../../lib/api'

const BASE = '/monitor'
const get = (path, params) => apiClient.get(BASE + path, { params }).then((r) => r.data)
const post = (path, body, params) => apiClient.post(BASE + path, body, { params }).then((r) => r.data)
const put = (path, body, params) => apiClient.put(BASE + path, body, { params }).then((r) => r.data)
const del = (path, body, params) => apiClient.delete(BASE + path, { data: body, params }).then((r) => r.data)

// ── Anzeige-Daten (für "Zeigt gerade" in der Übersicht) ─────────────
export const getDisplay = (slug) => get('/display', { screen: slug })

// ── Sondermodi ─────────────────────────────────────────────────────
export const setOnAir = (onAir) => post('/on-air', { on_air: onAir })
export const setEmergency = ({ active, text = '', note = '' }) => post('/emergency', { active, text, note })

// ── Ansichten ──────────────────────────────────────────────────────
export const getViews = () => get('/views')
export const getView = (id) => get('/config', { view_id: id })
export const createView = (body) => post('/views', body)
export const updateView = (id, body) => put('/config', body, { view_id: id })
export const deleteView = (id) => del(`/views/${id}`)
export const getViewVersions = (id) => get('/config/versions', { view_id: id })
export const restoreViewVersion = (versionId) => post('/config/restore', null, { version_id: versionId })
export const regenerateViewToken = (id) => post('/config/regenerate-token', null, { view_id: id })
export const previewView = (draft, screenId = null) => post('/views/preview', { view: draft, screen_id: screenId })
export const getDisruptions = (viewId) => get('/disruptions', { view_id: viewId })
export const searchStops = (q, results = 10) => get('/transit/search', { q, results })

// ── Bildschirme ────────────────────────────────────────────────────
export const getScreens = () => get('/screens')
export const createScreen = (body) => post('/screens', body)
export const updateScreen = (id, body) => put(`/screens/${id}`, body)
export const deleteScreen = (id) => del(`/screens/${id}`)
export const reloadScreen = (id) => post(`/screens/${id}/reload`)
export const regenerateScreenKey = (id) => post(`/screens/${id}/regenerate-key`)
// Leere oder fehlende Liste = alle Bildschirme
export const powerOffToday = (ids) => post('/screens/power-off-today', { screen_ids: ids?.length ? ids : null })
export const undoPowerOffToday = (ids) => del('/screens/power-off-today', { screen_ids: ids?.length ? ids : null })

// ── Medien ─────────────────────────────────────────────────────────
export const getFiles = (kind) => get('/files', kind ? { kind } : undefined)
export const getFile = (id) => get(`/files/${id}`)
export function uploadFile(file, { name = '', kind = 'image' } = {}) {
  const form = new FormData()
  form.append('file', file)
  form.append('name', name)
  form.append('kind', kind)
  return post('/files', form)
}
export const deleteFile = (id) => del(`/files/${id}`)
export const getTrash = () => get('/trash')
export const restoreFromTrash = (kind, id) => post('/trash/restore', null, { kind, id })
export const purgeFromTrash = (kind, id) => del('/trash/purge', undefined, { kind, id })

// ── Klausuren, Termine, Ankündigungen ──────────────────────────────
export const getExams = () => get('/exams')
export const createExam = (body) => post('/exams', body)
export const updateExam = (id, body) => put(`/exams/${id}`, body)
export const deleteExam = (id) => del(`/exams/${id}`)

export const getExamTemplates = () => get('/exam-templates')
export const createExamTemplate = (body) => post('/exam-templates', body)
export const updateExamTemplate = (id, body) => put(`/exam-templates/${id}`, body)
export const deleteExamTemplate = (id) => del(`/exam-templates/${id}`)

export const getEvents = () => get('/events')
export const createEvent = (body) => post('/events', body)
export const updateEvent = (id, body) => put(`/events/${id}`, body)
export const deleteEvent = (id) => del(`/events/${id}`)
export const activateEvent = (id) => post(`/events/${id}/activate`)
export const deactivateEvent = (id) => post(`/events/${id}/deactivate`)

export const getAnnouncements = () => get('/announcements')
export const createAnnouncement = (body) => post('/announcements', body)
export const updateAnnouncement = (id, body) => put(`/announcements/${id}`, body)
export const deleteAnnouncement = (id) => del(`/announcements/${id}`)

// ── Ferien und Notfall-Vorlagen ────────────────────────────────────
export const getHolidays = () => get('/holidays')
export const createHoliday = (body) => post('/holidays', body)
export const updateHoliday = (id, body) => put(`/holidays/${id}`, body)
export const deleteHoliday = (id) => del(`/holidays/${id}`)

export const getEmergencyTemplates = () => get('/emergency-templates')
export const createEmergencyTemplate = (body) => post('/emergency-templates', body)
export const updateEmergencyTemplate = (id, body) => put(`/emergency-templates/${id}`, body)
export const deleteEmergencyTemplate = (id) => del(`/emergency-templates/${id}`)

// ── Einstellungen und WebUntis ─────────────────────────────────────
export const getSettings = () => get('/settings')
export const updateSettings = (body) => put('/settings', body)
export const checkWebuntis = () => post('/webuntis/check')

export const getWebuntisLinks = () => get('/webuntis-links')
export const createWebuntisLink = (body) => post('/webuntis-links', body)
export const updateWebuntisLink = (id, body) => put(`/webuntis-links/${id}`, body)
export const deleteWebuntisLink = (id) => del(`/webuntis-links/${id}`)

// ── Geräte (Geräte-Agent) ──────────────────────────────────────────
export const getDevices = () => get('/devices')
// body: { code, screen_id } oder { code, new_screen: { name, location } }
export const pairDevice = (body) => post('/devices/pair', body)
export const unpairDevice = (id) => post(`/devices/${id}/unpair`)
export const revokeDevice = (id) => post(`/devices/${id}/revoke`)
export const sendDeviceCommand = (id, kind) => post(`/devices/${id}/commands`, { kind })
export const getDeviceCommand = (id, commandId) => get(`/devices/${id}/commands/${commandId}`)
export const getScreenEvents = (screenId, { kind, limit } = {}) => get(`/screens/${screenId}/events`, { kind: kind || undefined, limit })
