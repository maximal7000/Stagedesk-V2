"""
Pydantic Schemas fuer Anwesenheits-API
"""
from typing import List, Optional
from datetime import date, time, datetime
from ninja import Schema


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
        teilnehmer = obj.teilnehmer.all()
        total = teilnehmer.count()
        if total == 0:
            return {'gesamt': 0, 'anwesend': 0, 'abwesend': 0, 'krank': 0, 'ausstehend': 0, 'quote': 0}
        anwesend = teilnehmer.filter(status='anwesend').count()
        abwesend = teilnehmer.filter(status='abwesend').count()
        krank = teilnehmer.filter(status='krank').count()
        ausstehend = teilnehmer.filter(status='ausstehend').count()
        return {
            'gesamt': total,
            'anwesend': anwesend,
            'abwesend': abwesend,
            'krank': krank,
            'ausstehend': ausstehend,
            'quote': round(anwesend / total * 100) if total > 0 else 0,
        }


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
        teilnehmer = obj.teilnehmer.all()
        total = teilnehmer.count()
        if total == 0:
            return {'gesamt': 0, 'anwesend': 0, 'abwesend': 0, 'krank': 0, 'ausstehend': 0, 'quote': 0}
        anwesend = teilnehmer.filter(status='anwesend').count()
        return {
            'gesamt': total,
            'anwesend': anwesend,
            'abwesend': teilnehmer.filter(status='abwesend').count(),
            'krank': teilnehmer.filter(status='krank').count(),
            'ausstehend': teilnehmer.filter(status='ausstehend').count(),
            'quote': round(anwesend / total * 100) if total > 0 else 0,
        }


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


class BulkStatusUpdateSchema(Schema):
    updates: List[StatusUpdateSchema]


class KlonSchema(Schema):
    titel: str = ''
    termine_uebernehmen: bool = True
