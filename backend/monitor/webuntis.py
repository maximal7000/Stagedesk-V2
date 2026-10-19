"""
WebUntis JSON-RPC-Client.

Wird für den Vertretungsplan gebraucht. Aktuell ohne Aufrufer.
"""
import json
import http.cookiejar
import urllib.parse
import urllib.request


class WebUntisSession:
    """Verbindung zu einem WebUntis-Server (Basis-URL plus Cookie-Jar)."""

    def __init__(self, server, school):
        self.base_url = f"https://{server}/WebUntis/jsonrpc.do?school={urllib.parse.quote(school)}"
        self.cookie_jar = http.cookiejar.CookieJar()


def _rpc(session, method, params=None):
    body = json.dumps({
        "id": "1", "method": method,
        "params": params or {}, "jsonrpc": "2.0"
    }).encode()
    req = urllib.request.Request(session.base_url, data=body,
        headers={"Content-Type": "application/json"})
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(session.cookie_jar))
    with opener.open(req, timeout=5) as resp:
        return json.loads(resp.read())


def authenticate(server, school, username, password):
    """Anmelden (anonym mit '#anonymous#'). Gibt die Session zurück, bei Fehler None."""
    session = WebUntisSession(server, school)
    resp = _rpc(session, "authenticate",
                {"user": username or "#anonymous#", "password": password or "", "client": "stagedesk"})
    if "error" in resp:
        return None
    return session


def get_timetable(session, element_type, element_id, date_from, date_to):
    """Stundenplan eines Elements (z.B. Typ 4 = Raum). Datumsangaben als int YYYYMMDD."""
    resp = _rpc(session, "getTimetable", {
        "options": {
            "element": {"id": element_id, "type": element_type},
            "startDate": date_from,
            "endDate": date_to,
            "showInfo": True,
            "showSubstText": True,
            "showLsText": True,
            "showStudentgroup": True,
        }
    })
    return resp.get("result", [])


def logout(session):
    _rpc(session, "logout")
