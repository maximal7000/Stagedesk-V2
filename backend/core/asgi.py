"""
ASGI config für Stagedesk — mit Django Channels WebSocket-Support
"""

import os
from django.core.asgi import get_asgi_application
from channels.routing import ProtocolTypeRouter, URLRouter
from channels.security.websocket import AllowedHostsOriginValidator

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "core.settings")

# Django ASGI-App initialisieren (Models etc. sind dann verfügbar)
django_asgi_app = get_asgi_application()

from monitor.routing import websocket_urlpatterns as monitor_ws  # noqa: E402
from anwesenheit.routing import websocket_urlpatterns as anwesenheit_ws  # noqa: E402

application = ProtocolTypeRouter({
    "http": django_asgi_app,
    "websocket": AllowedHostsOriginValidator(
        URLRouter(monitor_ws + anwesenheit_ws)
    ),
})
