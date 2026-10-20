// Fehlermeldungen für die Oberfläche: die Meldung des Servers (detail/message) oder ein deutscher Satz mit
// Ursache und nächstem Schritt. Die englischen axios-Texte ("Network Error" …) erscheinen nie.
const BY_STATUS = {
  401: 'Die Anmeldung ist abgelaufen. Bitte die Seite neu laden und erneut anmelden.',
  403: 'Dafür fehlt die Berechtigung. Bitte eine Person mit Admin-Rechten fragen.',
  404: 'Der Eintrag wurde nicht gefunden. Bitte die Seite neu laden.',
}

// Englische Standardtexte von Django Ninja/Django (HTTP-Statusnamen); sie werden nie angezeigt
const FRAMEWORK_DEFAULTS = new Set([
  'Unauthorized', 'Forbidden', 'Not Found', 'Method Not Allowed', 'Bad Request', 'Unprocessable Entity',
  'Internal Server Error', 'Service Unavailable', 'Bad Gateway', 'Gateway Timeout', 'Not Acceptable',
  'Conflict', 'Too Many Requests', 'Request Entity Too Large', 'Payload Too Large', 'Unsupported Media Type',
  'Not Implemented', 'Cannot parse request body',
])

export function errorText(error, fallback = 'Die Aktion ist fehlgeschlagen. Bitte erneut versuchen.') {
  const response = error?.response
  const data = response?.data
  if (data && typeof data === 'object') {
    const text = typeof data.detail === 'string' ? data.detail : typeof data.message === 'string' ? data.message : ''
    if (text && !FRAMEWORK_DEFAULTS.has(text.trim())) return text
  }
  if (response?.status && BY_STATUS[response.status]) return BY_STATUS[response.status]
  if (response?.status >= 500) return 'Der Server hat einen Fehler gemeldet. Bitte später erneut versuchen.'
  if (error && !response && (error.message === 'Network Error' || error.code === 'ERR_NETWORK' || error.code === 'ECONNABORTED')) {
    return 'Keine Verbindung zum Server. Bitte die Verbindung prüfen und erneut versuchen.'
  }
  return fallback
}
