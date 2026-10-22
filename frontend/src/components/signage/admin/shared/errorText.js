// The English axios texts ("Network Error" …) never appear.
const BY_STATUS = {
  401: 'Anmeldung abgelaufen.',
  403: 'Keine Berechtigung.',
  404: 'Eintrag nicht gefunden.',
}

// English default texts of Django Ninja/Django (HTTP status names); never shown
const FRAMEWORK_DEFAULTS = new Set([
  'Unauthorized', 'Forbidden', 'Not Found', 'Method Not Allowed', 'Bad Request', 'Unprocessable Entity',
  'Internal Server Error', 'Service Unavailable', 'Bad Gateway', 'Gateway Timeout', 'Not Acceptable',
  'Conflict', 'Too Many Requests', 'Request Entity Too Large', 'Payload Too Large', 'Unsupported Media Type',
  'Not Implemented', 'Cannot parse request body',
])

export function errorText(error, fallback = 'Aktion fehlgeschlagen.') {
  const response = error?.response
  const data = response?.data
  if (data && typeof data === 'object') {
    const text = typeof data.detail === 'string' ? data.detail : typeof data.message === 'string' ? data.message : ''
    if (text && !FRAMEWORK_DEFAULTS.has(text.trim())) return text
  }
  if (response?.status && BY_STATUS[response.status]) return BY_STATUS[response.status]
  if (response?.status >= 500) return 'Serverfehler.'
  if (error && !response && (error.message === 'Network Error' || error.code === 'ERR_NETWORK' || error.code === 'ECONNABORTED')) {
    return 'Server nicht erreichbar.'
  }
  return fallback
}
