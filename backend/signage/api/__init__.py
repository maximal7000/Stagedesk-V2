"""
Signage-API: setzt `signage_router` aus den Teil-Routern der Bereiche zusammen.

Alle Teil-Router haben das Präfix "", die Pfade bleiben also unverändert. Eingebunden wird
`signage_router` in core/urls.py unter /signage (alte /api/monitor/-Adressen
leitet signage.legacy_paths dorthin um).
"""
from ninja import Router

from . import devices, display, exams, legacy, media, screens, settings, setup, views

signage_router = Router(tags=["Monitor"])

for _router in (
    display.router,    # /display, /clock
    settings.router,   # /settings, /on-air, /emergency, /webuntis-links
    views.router,      # /views, /config, /disruptions, /transit/search
    media.router,      # /files, /trash
    exams.router,      # /exams, /exam-templates, /events, /announcements
    screens.router,    # /screens, /screen/power, /screen/cec-status
    legacy.router,     # /onair, /notfall, /bildschirm/…
    setup.router,      # Ferien, Notfall-Vorlagen, "bis Tagesende aus", WebUntis-Test, Vorschau
    devices.router,    # Geräte-Kopplung und Token-Verwaltung
):
    signage_router.add_router("", _router)
