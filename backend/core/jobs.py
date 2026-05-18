"""
Tracking von Background-Jobs (Management-Commands, Cron-Tasks).
Schreibt Start + Abschluss als AuditLog mit entity_type='job_run'.

Einsatz:
    from core.jobs import track_job

    with track_job('erinnerungen_deadlines') as job:
        ... arbeite ...
        job.message = f"{sent} Erinnerungen verschickt"
"""
from contextlib import contextmanager
from time import perf_counter


class _JobContext:
    def __init__(self):
        self.message = ''
        self.error = ''


@contextmanager
def track_job(name: str):
    """Context-Manager — schreibt einen AuditLog-Eintrag pro Job-Run.
    Status ist 'erfolg' oder 'fehler' (siehe entity_name)."""
    ctx = _JobContext()
    start = perf_counter()
    try:
        yield ctx
        duration = perf_counter() - start
        _write_log(name, 'erfolg', ctx.message, duration)
    except Exception as e:
        duration = perf_counter() - start
        _write_log(name, 'fehler', f"{type(e).__name__}: {e}", duration)
        raise


def _write_log(name: str, status: str, message: str, duration_s: float):
    try:
        from inventar.models import AuditLog
        AuditLog.objects.create(
            aktion='erstellt',
            entity_type='job_run',
            entity_id=0,
            entity_name=name,
            details={
                'status': status,
                'message': message[:1000],
                'duration_ms': int(duration_s * 1000),
            },
            user_keycloak_id='',
            user_username='system',
        )
    except Exception:
        pass
