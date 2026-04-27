"""
Sendet Erinnerungen für Checklisten-Items mit Deadline:
- 1 Tag vorher: einmalig (erinnerung_gesendet wird gesetzt)
- Bei Überfälligkeit: einmalig (separater Eintrag)
"""
from datetime import timedelta
from django.core.management.base import BaseCommand
from django.utils import timezone


class Command(BaseCommand):
    help = "Erinnerungen für Veranstaltungs-Checklist-Deadlines."

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true')

    def handle(self, *args, **opts):
        from veranstaltung.models import VeranstaltungChecklisteItem
        from core.notify import notify

        dry_run = opts.get('dry_run', False)
        now = timezone.now()
        in_24h = now + timedelta(hours=24)
        sent = 0

        # Items deren Deadline in den nächsten 24h liegt, noch offen, noch keine Erinnerung
        qs = VeranstaltungChecklisteItem.objects.filter(
            erledigt=False,
            erinnerung_gesendet=False,
            deadline__isnull=False,
            deadline__lte=in_24h,
        ).select_related('veranstaltung')

        for item in qs:
            v = item.veranstaltung
            ueberfaellig = item.deadline < now
            kind = 'deadline' if ueberfaellig else 'erinnerung'
            title = (f'Überfällig: {item.titel}' if ueberfaellig
                     else f'Frist morgen: {item.titel}')
            body = f'In Veranstaltung "{v.titel}" — bis {item.deadline.strftime("%d.%m.%Y %H:%M")}'
            link = f'/veranstaltung/{v.id}'

            # An alle Zugewiesenen schicken
            empfaenger = list(v.zuweisungen.values_list('user_keycloak_id', flat=True))
            if v.erstellt_von and v.erstellt_von not in empfaenger:
                empfaenger.append(v.erstellt_von)

            if dry_run:
                self.stdout.write(f'  [DRY] {len(empfaenger)} × "{title}"')
                continue

            for kid in empfaenger:
                if notify(kid, kind, title, body, link=link):
                    sent += 1

            item.erinnerung_gesendet = True
            item.save(update_fields=['erinnerung_gesendet'])

        self.stdout.write(self.style.SUCCESS(f'✓ {sent} Deadline-Notifications versendet'))
