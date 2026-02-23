"""
Pydantic Schemas fuer Anwesenheits-API
"""
from typing import List, Optional
from datetime import date, time, datetime
from ninja import Schema


def _compute_statistik(obj):
    """Statistik über ALLE Termine aggregiert (nicht nur nächster Termin)."""
    termine = list(obj.termine.all())
    teilnehmer = list(obj.teilnehmer.all())
    gesamt = len(teilnehmer)

    if not termine:
        # Keine Termine → nutze den Teilnehmer-Generalstatus
        counts = {'anwesend': 0, 'teilweise': 0, 'abwesend': 0, 'krank': 0, 'ausstehend': 0}
        for tn in teilnehmer:
            s = tn.status or 'ausstehend'
            if s in counts:
                counts[s] += 1
        quote = (counts['anwesend'] + counts['teilweise']) / gesamt * 100 if gesamt else 0
        return {**counts, 'gesamt': gesamt, 'quote': round(quote, 1)}

    # Aggregation über alle Termine
    from anwesenheit.models import TerminAnwesenheit
    records = TerminAnwesenheit.objects.filter(
        termin__in=termine,
        teilnehmer__in=teilnehmer,
    ).values_list('status', flat=True)

    counts = {'anwesend': 0, 'teilweise': 0, 'abwesend': 0, 'krank': 0, 'ausstehend': 0}
    for s in records:
        if s in counts:
            counts[s] += 1

    # Fehlende Einträge = ausstehend
    total_slots = gesamt * len(termine)
    erfasst = sum(counts.values())
    counts['ausstehend'] += total_slots - erfasst

    quote = (counts['anwesend'] + counts['teilweise']) / total_slots * 100 if total_slots else 0
    return {**counts, 'gesamt': total_slots, 'quote': round(quote, 1)}


# ─── Response Schemas ─────────────────────────────────────────────

class TerminSchema(Schema):
    id: int
    titel: str
    datum: date
    beginn: Optional[time]
    ende: Optional[time]
    notizen: str
    ist_vergangen: bool


class TerminAnwesenheitSchema(Schema):
    id: int
    termin_id: int
    status: str
    markiert_am: Optional[datetime]
    markiert_von: str
    notizen: str


class TeilnehmerSchema(Schema):
    id: int
    keycloak_id: str
    name: str
    email: str
    aufgabe: str
    status: str
    markiert_am: Optional[datetime]
    markiert_von: str
    notizen: str
    termin_anwesenheiten: List[TerminAnwesenheitSchema]

    @staticmethod
    def resolve_termin_anwesenheiten(obj):
        return list(obj.termin_anwesenheiten.all())


class AnwesenheitsListeSchema(Schema):
    id: int
    titel: str
    beschreibung: str
    ort: str
    status: str
    erstellt_von_username: str
    erstellt_am: datetime
    teilnehmer: List[TeilnehmerSchema]
    termine: List[TerminSchema]
    statistik: dict

    @staticmethod
    def resolve_teilnehmer(obj):
        return list(obj.teilnehmer.all().prefetch_related('termin_anwesenheiten'))

    @staticmethod
    def resolve_termine(obj):
        return list(obj.termine.all())

    @staticmethod
    def resolve_statistik(obj):
        return _compute_statistik(obj)


class AnwesenheitsListeListSchema(Schema):
    id: int
    titel: str
    ort: str
    status: str
    erstellt_von_username: str
    erstellt_am: datetime
    anzahl_teilnehmer: int
    anzahl_termine: int
    naechster_termin: Optional[TerminSchema]
    statistik: dict

    @staticmethod
    def resolve_anzahl_teilnehmer(obj):
        return obj.teilnehmer.count()

    @staticmethod
    def resolve_anzahl_termine(obj):
        return obj.termine.count()

    @staticmethod
    def resolve_naechster_termin(obj):
        return obj.get_naechster_termin()

    @staticmethod
    def resolve_statistik(obj):
        return _compute_statistik(obj)


# ─── Create / Update Schemas ─────────────────────────────────────

class ListeCreateSchema(Schema):
    titel: str
    beschreibung: str = ''
    ort: str = ''


class ListeUpdateSchema(Schema):
    titel: Optional[str] = None
    beschreibung: Optional[str] = None
    ort: Optional[str] = None
    status: Optional[str] = None


class TerminCreateSchema(Schema):
    id: Optional[int] = None
    titel: str = ''
    datum: date
    beginn: Optional[time] = None
    ende: Optional[time] = None
    notizen: str = ''


class TermineSaveSchema(Schema):
    termine: List[TerminCreateSchema]


class TeilnehmerAddSchema(Schema):
    keycloak_id: str
    name: str
    email: str = ''


class TeilnehmerBulkAddSchema(Schema):
    teilnehmer: List[TeilnehmerAddSchema]


class StatusUpdateSchema(Schema):
    teilnehmer_id: int
    status: str
    notizen: str = ''


class TerminStatusUpdateSchema(Schema):
    teilnehmer_id: int
    termin_id: int
    status: str
    notizen: str = ''


class BulkStatusItemSchema(Schema):
    teilnehmer_id: int
    status: str
    notizen: str = ''
    termin_id: Optional[int] = None


class BulkStatusUpdateSchema(Schema):
    updates: List[BulkStatusItemSchema]


class SelfStatusUpdateSchema(Schema):
    termin_id: int
    status: str
    notizen: str = ''


class AufgabeUpdateSchema(Schema):
    teilnehmer_id: int
    aufgabe: str


class KlonSchema(Schema):
    titel: str = ''
    termine_uebernehmen: bool = True
