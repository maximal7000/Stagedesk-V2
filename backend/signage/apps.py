import logging

from django.apps import AppConfig


class SignageConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'signage'

    def ready(self):
        # Read through the module attributes so tests can patch them.
        from .transit import db
        if not (db.DB_TT_CLIENT_ID and db.DB_TT_API_KEY):
            logging.getLogger('signage.transit').warning(
                "DB_TT_CLIENT_ID/DB_TT_API_KEY not set, DB departures disabled")
