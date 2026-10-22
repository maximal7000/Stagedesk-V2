"""All sub-routers use the prefix "", so paths are unchanged. Old /api/monitor/ addresses
are rewritten by signage.legacy_paths."""
from ninja import Router

from . import devices, display, exams, legacy, media, screens, settings, setup, views

signage_router = Router(tags=["Monitor"])

for _router in (
    display.router,
    settings.router,
    views.router,
    media.router,
    exams.router,
    screens.router,
    legacy.router,
    setup.router,
    devices.router,
):
    signage_router.add_router("", _router)
