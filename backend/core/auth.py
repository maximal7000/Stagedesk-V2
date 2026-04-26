"""
Keycloak JWT-Validierung für Django Ninja.

Token werden über JWKS vom Keycloak-Server signaturgeprüft. Public Keys
werden im Django-Cache gehalten (1h TTL) — bei einer Schlüssel-Rotation
einmal manuell `cache.delete('keycloak_jwks_<realm>')` oder warten.
"""
import os
import time
from typing import Optional

import requests
from jose import jwt
from jose.exceptions import JWTError, ExpiredSignatureError
from django.core.cache import cache
from django.http import HttpRequest


class KeycloakAuth:
    """Verifiziert Keycloak-RS256-Tokens gegen das Realm-JWKS."""

    JWKS_TTL = 3600         # Sekunden
    LEEWAY = 30             # Toleranz für Clock-Skew bei exp/iat

    def __init__(self):
        self.server_url = os.getenv('KEYCLOAK_SERVER_URL', 'http://localhost:8080').rstrip('/')
        self.realm = os.getenv('KEYCLOAK_REALM', 'master')
        self.client_id = os.getenv('KEYCLOAK_CLIENT_ID', 'stagedesk')
        # Im Notfall (Keycloak unerreichbar im Test) auf 'true' setzen — niemals
        # in Produktion! Wenn gesetzt, wird die Signatur NICHT geprüft.
        self._insecure = os.getenv('AUTH_INSECURE_SKIP_VERIFY', '').lower() in ('1', 'true', 'yes')

    # ── Helpers ────────────────────────────────────────────────────────

    @property
    def issuer(self) -> str:
        return f"{self.server_url}/realms/{self.realm}"

    def _jwks_url(self) -> str:
        return f"{self.issuer}/protocol/openid-connect/certs"

    def _get_jwks(self) -> Optional[dict]:
        cache_key = f'keycloak_jwks_{self.realm}'
        jwks = cache.get(cache_key)
        if jwks:
            return jwks
        try:
            resp = requests.get(self._jwks_url(), timeout=5)
            resp.raise_for_status()
            jwks = resp.json()
            cache.set(cache_key, jwks, self.JWKS_TTL)
            return jwks
        except Exception as e:
            print(f"JWKS-Abruf fehlgeschlagen: {e}")
            return None

    def _key_for_kid(self, kid: str) -> Optional[dict]:
        jwks = self._get_jwks()
        if not jwks:
            return None
        for k in jwks.get('keys', []):
            if k.get('kid') == kid and k.get('use') in (None, 'sig'):
                return k
        return None

    def get_token_from_request(self, request: HttpRequest) -> Optional[str]:
        auth_header = request.headers.get('Authorization', '')
        if not auth_header.startswith('Bearer '):
            return None
        return auth_header[len('Bearer '):].strip() or None

    # ── Verifikation ──────────────────────────────────────────────────

    def verify_token(self, token: str) -> Optional[dict]:
        if self._insecure:
            try:
                return jwt.decode(token, key='', options={
                    'verify_signature': False, 'verify_aud': False, 'verify_exp': False,
                })
            except Exception:
                return None

        try:
            unverified = jwt.get_unverified_header(token)
        except JWTError as e:
            print(f"Header-Decode fehlgeschlagen: {e}")
            return None

        kid = unverified.get('kid')
        alg = unverified.get('alg', 'RS256')
        if alg not in ('RS256', 'RS384', 'RS512'):
            print(f"Token-Algorithmus '{alg}' wird nicht akzeptiert")
            return None

        key = self._key_for_kid(kid) if kid else None
        if not key:
            # Cache invalidieren und einmal nachladen — Schlüssel könnten neu sein.
            cache.delete(f'keycloak_jwks_{self.realm}')
            key = self._key_for_kid(kid) if kid else None
        if not key:
            print(f"Kein passender Public Key für kid={kid}")
            return None

        try:
            payload = jwt.decode(
                token,
                key=key,
                algorithms=[alg],
                issuer=self.issuer,
                options={
                    'verify_signature': True,
                    'verify_exp': True,
                    'verify_iat': False,
                    'verify_iss': True,
                    # Keycloak gibt oft mehrere Audiences zurück; wir prüfen
                    # statt 'aud' lieber selbst gegen 'azp' (authorized party).
                    'verify_aud': False,
                },
            )
        except ExpiredSignatureError:
            print("Token abgelaufen")
            return None
        except JWTError as e:
            print(f"JWT-Validierung fehlgeschlagen: {e}")
            return None

        # Manuelles Audience-Handling: 'azp' (authorized party) muss zu unserer
        # Client-ID passen, oder client_id ist in der 'aud'-Liste enthalten.
        azp = payload.get('azp')
        aud = payload.get('aud')
        aud_list = aud if isinstance(aud, list) else ([aud] if aud else [])
        if azp != self.client_id and self.client_id not in aud_list:
            print(f"Token nicht für client_id={self.client_id} (azp={azp}, aud={aud})")
            return None

        # Zusätzliche exp-Toleranz (nb_skew)
        exp = payload.get('exp', 0)
        if exp and time.time() > exp + self.LEEWAY:
            print("Token abgelaufen (post-leeway)")
            return None

        return payload

    def __call__(self, request: HttpRequest) -> Optional[dict]:
        token = self.get_token_from_request(request)
        if not token:
            return None
        return self.verify_token(token)


# Instanz für die Verwendung in Django Ninja
keycloak_auth = KeycloakAuth()
