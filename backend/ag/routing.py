from django.urls import re_path
from .consumers import AgAufgabenConsumer

websocket_urlpatterns = [
    re_path(r"^ws/ag/aufgaben/$", AgAufgabenConsumer.as_asgi()),
]
