"""
Öffentlicher iCal-Feed pro User. Authentifizierung läuft über einen
geheimen Token im Query-String (?token=...), damit der Feed in Apple
Calendar / Google Calendar abonniert werden kann — die kennen keine
Bearer-Tokens.
"""
from datetime import datetime
from django.http import HttpResponse, HttpResponseNotFound
from django.utils import timezone

from users.models import UserProfile
from .models import Event


def _escape(text: str) -> str:
    """iCal-Escape: Komma, Semikolon, Backslash, Zeilenumbrüche."""
    if not text:
        return ''
    return (
        text.replace('\\', '\\\\')
            .replace(';', '\\;')
            .replace(',', '\\,')
            .replace('\r\n', '\\n')
            .replace('\n', '\\n')
            .replace('\r', '\\n')
    )


def _fold(line: str) -> str:
    """iCal-Zeilenumbruch alle 75 Bytes (RFC 5545)."""
    if len(line) <= 75:
        return line
    parts = [line[:75]]
    line = line[75:]
    while line:
        parts.append(' ' + line[:74])
        line = line[74:]
    return '\r\n'.join(parts)


def ical_feed(request):
    token = request.GET.get('token', '').strip()
    if not token:
        return HttpResponseNotFound('missing token')
    try:
        profile = UserProfile.objects.get(ical_token=token)
    except UserProfile.DoesNotExist:
        return HttpResponseNotFound('invalid token')

    # Letzte ~30 Tage + alle zukünftigen Events. Hält den Feed übersichtlich.
    cutoff = timezone.now() - timezone.timedelta(days=30)
    events = Event.objects.filter(ende__gte=cutoff).order_by('start')

    now_stamp = datetime.utcnow().strftime('%Y%m%dT%H%M%SZ')
    lines = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Stagedesk//Kalender//DE',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
        f'X-WR-CALNAME:Stagedesk ({profile.username or profile.email})',
        'X-WR-TIMEZONE:Europe/Berlin',
    ]
    for e in events:
        lines.append('BEGIN:VEVENT')
        lines.append(f'UID:event-{e.id}@stagedesk')
        lines.append(f'DTSTAMP:{now_stamp}')
        if e.start:
            lines.append(f"DTSTART:{e.start.astimezone(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}")
        if e.ende:
            lines.append(f"DTEND:{e.ende.astimezone(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}")
        lines.append(_fold(f'SUMMARY:{_escape(e.titel)}'))
        if e.ort:
            lines.append(_fold(f'LOCATION:{_escape(e.ort)}'))
        if e.beschreibung:
            lines.append(_fold(f'DESCRIPTION:{_escape(e.beschreibung)}'))
        if getattr(e, 'status', '') == 'abgesagt':
            lines.append('STATUS:CANCELLED')
        lines.append('END:VEVENT')
    lines.append('END:VCALENDAR')

    body = '\r\n'.join(lines) + '\r\n'
    response = HttpResponse(body, content_type='text/calendar; charset=utf-8')
    response['Content-Disposition'] = 'inline; filename="stagedesk.ics"'
    response['Cache-Control'] = 'private, max-age=300'  # 5 min Cache
    return response
