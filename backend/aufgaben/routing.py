from django.urls import re_path
from .consumers import AufgabenConsumer

websocket_urlpatterns = [
    re_path(r"^ws/aufgaben/$", AufgabenConsumer.as_asgi()),
]
