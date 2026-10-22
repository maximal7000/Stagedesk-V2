from django.urls import re_path
from . import consumers

# ws/signage/ is current; ws/monitor/ stays for installed Pis and open kiosk pages.
websocket_urlpatterns = [
    re_path(r"^ws/(?:signage|monitor)/pi/(?P<slug>[\w-]+)/$", consumers.ScreenPiConsumer.as_asgi()),
    re_path(r"^ws/(?:signage|monitor)/display/(?P<slug>[\w-]+)/$", consumers.DisplayConsumer.as_asgi()),
]
