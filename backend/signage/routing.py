from django.urls import re_path
from . import consumers

websocket_urlpatterns = [
    re_path(r"^ws/monitor/pi/(?P<slug>[\w-]+)/$", consumers.ScreenPiConsumer.as_asgi()),
    re_path(r"^ws/monitor/display/(?P<slug>[\w-]+)/$", consumers.DisplayConsumer.as_asgi()),
]
