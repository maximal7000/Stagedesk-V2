"""
Keycloak JWT-Validierung für Django Ninja

ENTWICKLUNG: Token wird ohne Signatur-Verifizierung akzeptiert
PRODUKTION: Public Key vom Keycloak-Server holen und verifizieren

Siehe Kommentare unten für Produktions-Implementierung
"""
import os
from typing import Optional
from jose import jwt, JWTError
from django.http import HttpRequest
from dotenv import load_dotenv
import time

load_dotenv()


class KeycloakAuth:
    """
    Basis-Klasse für Keycloak JWT-Validierung
    
    Umgebungsvariablen:
    - KEYCLOAK_SERVER_URL: URL des Keycloak-Servers (z.B. http://localhost:8080)
    - KEYCLOAK_REALM: Name des Keycloak-Realms
    - KEYCLOAK_CLIENT_ID: Client-ID der Anwendung
    """
    
    def __init__(self):
        self.server_url = os.getenv('KEYCLOAK_SERVER_URL', 'http://localhost:8080')
        self.realm = os.getenv('KEYCLOAK_REALM', 'master')
        self.client_id = os.getenv('KEYCLOAK_CLIENT_ID', 'stagedesk')
        
    def get_token_from_request(self, request: HttpRequest) -> Optional[str]:
        """
        Extrahiert das JWT-Token aus dem Authorization-Header
        """
        auth_header = request.headers.get('Authorization', '')
        
        if not auth_header.startswith('Bearer '):
            return None
            
        return auth_header.replace('Bearer ', '')
    
    def verify_token(self, token: str) -> Optional[dict]:
        """
        Verifiziert das JWT-Token und gibt die Payload zurück
        
        ENTWICKLUNG: Signatur und Expiration werden NICHT geprüft
        """
        try:
            # Für die Entwicklung: Token komplett ohne Verifizierung dekodieren
            payload = jwt.decode(
                token,
                key='',
                options={
                    'verify_signature': False,
                    'verify_aud': False,
                    'verify_exp': False,  # AUCH Expiration nicht prüfen (Dev-Modus)
                }
            )
            
            # Optional: Manuell Expiration prüfen mit Toleranz (5 Minuten)
            exp = payload.get('exp', 0)
            now = time.time()
            if exp > 0 and now > exp + 300:  # 5 Minuten Toleranz
                print(f"Token stark abgelaufen: {int(now - exp)} Sekunden")
                # Trotzdem akzeptieren für Entwicklung
            
            return payload
            
        except JWTError as e:
            print(f"JWT-Validierung fehlgeschlagen: {e}")
            return None
        except Exception as e:
            print(f"Unerwarteter Auth-Fehler: {e}")
            return None
    
    def __call__(self, request: HttpRequest) -> Optional[dict]:
        """
        Authentifizierungs-Handler für Django Ninja
        """
        token = self.get_token_from_request(request)
        
        if not token:
            print("Kein Token im Request gefunden")
            return None
        
        result = self.verify_token(token)
        if result:
            print(f"Auth OK für: {result.get('preferred_username', 'unknown')}")
        return result


# Instanz für die Verwendung in Django Ninja
keycloak_auth = KeycloakAuth()


"""
PRODUKTION: Public Key Validierung implementieren
================================================

1. Public Key vom Keycloak-Server holen:
   
   import requests
   
   def get_keycloak_public_key(server_url: str, realm: str) -> str:
       url = f"{server_url}/realms/{realm}"
       response = requests.get(url)
       data = response.json()
       return data['public_key']

2. In verify_token() verwenden:
   
   public_key = get_keycloak_public_key(self.server_url, self.realm)
   
   # Public Key formatieren
   formatted_key = f"-----BEGIN PUBLIC KEY-----\n{public_key}\n-----END PUBLIC KEY-----"
   
   payload = jwt.decode(
       token,
       key=formatted_key,
       algorithms=['RS256'],
       audience=self.client_id,
       options={
           'verify_signature': True,
           'verify_aud': True,
           'verify_exp': True,
       }
   )

3. Public Key cachen (nicht bei jedem Request neu holen):
   
   from django.core.cache import cache
   
   cache_key = f'keycloak_public_key_{self.realm}'
   public_key = cache.get(cache_key)
   
   if not public_key:
       public_key = get_keycloak_public_key(self.server_url, self.realm)
       cache.set(cache_key, public_key, 3600)  # 1 Stunde
"""
