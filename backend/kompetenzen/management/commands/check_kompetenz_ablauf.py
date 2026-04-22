"""
Check-Command: Findet User-Kompetenzen, die in N Tagen ablaufen oder bereits abgelaufen sind.
Schreibt Historie für neu abgelaufene und schickt Discord-DM.

Aufruf (z.B. per Cron täglich):
    python manage.py check_kompetenz_ablauf
    python manage.py check_kompetenz_ablauf --warntage 7
"""
import logging
import requests
from datetime import timedelta
from django.conf import settings
from django.core.management.base import BaseCommand
from django.utils import timezone
from kompetenzen.models import UserKompetenz, UserKompetenzHistorie
from users.models import UserProfile

logger = logging.getLogger(__name__)

DISCORD_API = 'https://discord.com/api/v10'


def _bot_token():
    return getattr(settings, 'DISCORD_BOT_TOKEN', '')


def _send_dm(discord_user_id: str, content: str) -> bool:
    token = _bot_token()
    if not token or not discord_user_id:
        return False
    try:
        r = requests.post(
            f'{DISCORD_API}/users/@me/channels',
            headers={'Authorization': f'Bot {token}', 'Content-Type': 'application/json'},
            json={'recipient_id': discord_user_id},
            timeout=10,
        )
        r.raise_for_status()
        channel_id = r.json().get('id')
        if not channel_id:
            return False
        r2 = requests.post(
            f'{DISCORD_API}/channels/{channel_id}/messages',
            headers={'Authorization': f'Bot {token}', 'Content-Type': 'application/json'},
            json={'content': content[:1900]},
            timeout=10,
        )
        r2.raise_for_status()
        return True
    except Exception as e:
        logger.error(f'Discord DM fehlgeschlagen: {e}')
        return False


class Command(BaseCommand):
    help = "Prüft Kompetenz-Abläufe und benachrichtigt per Discord"

    def add_arguments(self, parser):
        parser.add_argument('--warntage', type=int, default=7,
                            help='Warnung schicken, wenn Kompetenz in so vielen Tagen abläuft')
        parser.add_argument('--no-discord', action='store_true',
                            help='Nur loggen, keine Discord-DMs senden')

    def handle(self, *args, **opts):
        warntage = opts['warntage']
        skip_discord = opts['no_discord']
        now = timezone.now()
        warn_grenze = now + timedelta(days=warntage)

        # 1) Bereits abgelaufene, aber hat_kompetenz noch True → Historie schreiben
        abgelaufene = UserKompetenz.objects.filter(
            hat_kompetenz=True,
            ablauf_am__lt=now,
        ).select_related('kompetenz')

        count_abgelaufen = 0
        user_msgs = {}
        for uk in abgelaufene:
            # Historie einmalig schreiben (Prüfung: letzter Eintrag war nicht 'abgelaufen')
            letzte = UserKompetenzHistorie.objects.filter(
                user_kompetenz=uk,
            ).order_by('-erstellt_am').first()
            if letzte and letzte.aktion == 'abgelaufen':
                continue
            UserKompetenzHistorie.objects.create(
                user_kompetenz=uk,
                user_keycloak_id=uk.user_keycloak_id,
                aktion='abgelaufen',
                stufe_vorher=uk.stufe,
                stufe_nachher=uk.stufe,
                geaendert_von_username='system',
            )
            user_msgs.setdefault(uk.user_keycloak_id, {"abgelaufen": [], "warnung": []})
            user_msgs[uk.user_keycloak_id]["abgelaufen"].append(uk.kompetenz.name)
            count_abgelaufen += 1

        # 2) Bald ablaufende
        bald = UserKompetenz.objects.filter(
            hat_kompetenz=True,
            ablauf_am__gte=now,
            ablauf_am__lte=warn_grenze,
        ).select_related('kompetenz')

        count_bald = 0
        for uk in bald:
            user_msgs.setdefault(uk.user_keycloak_id, {"abgelaufen": [], "warnung": []})
            tage = (uk.ablauf_am - now).days
            user_msgs[uk.user_keycloak_id]["warnung"].append(
                f"{uk.kompetenz.name} (noch {tage} Tage)"
            )
            count_bald += 1

        # 3) Discord-DMs
        sent = 0
        if not skip_discord and user_msgs:
            for kid, msgs in user_msgs.items():
                try:
                    profile = UserProfile.objects.get(keycloak_id=kid)
                except UserProfile.DoesNotExist:
                    continue
                if not profile.discord_id:
                    continue
                text_parts = ["**Kompetenz-Update**"]
                if msgs["abgelaufen"]:
                    text_parts.append("\n**Abgelaufen (Bestätigung nötig):**")
                    text_parts.extend(f"• {n}" for n in msgs["abgelaufen"])
                if msgs["warnung"]:
                    text_parts.append("\n**Läuft bald ab:**")
                    text_parts.extend(f"• {n}" for n in msgs["warnung"])
                if _send_dm(profile.discord_id, "\n".join(text_parts)):
                    sent += 1

        self.stdout.write(self.style.SUCCESS(
            f"Abgelaufen: {count_abgelaufen}, Warnungen: {count_bald}, DMs gesendet: {sent}"
        ))
