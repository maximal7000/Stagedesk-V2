# Stagedesk V2

Ein modernes Full-Stack-Projekt mit Django Backend, React Frontend und Keycloak-Authentifizierung.

## 🏗️ Projektstruktur

```
Stagedesk V2/
├── backend/              # Django Backend
│   ├── core/            # Django-Projekt
│   │   ├── settings.py  # Django-Einstellungen (CORS konfiguriert)
│   │   ├── urls.py      # API-Routen (Django Ninja)
│   │   └── auth.py      # Keycloak JWT-Validierung
│   ├── venv/            # Python Virtual Environment
│   ├── requirements.txt # Python-Abhängigkeiten
│   └── .env.example     # Beispiel-Umgebungsvariablen
│
└── frontend/            # React Frontend
    ├── src/
    │   ├── App.jsx      # Haupt-App-Komponente
    │   ├── authConfig.js # Keycloak OIDC-Konfiguration
    │   └── index.css    # Tailwind CSS
    ├── tailwind.config.js
    └── package.json
```

## 🚀 Schnellstart

### Voraussetzungen

- Python 3.13+
- Node.js 25+
- Keycloak Server

### Backend-Setup

```bash
cd backend

# Virtual Environment aktivieren
source venv/bin/activate

# Datenbank migrieren
python manage.py migrate

# Server starten
python manage.py runserver
```

Das Backend läuft auf: `http://localhost:8000`
API-Dokumentation: `http://localhost:8000/api/docs`

### Frontend-Setup

```bash
cd frontend

# Development-Server starten
npm run dev
```

Das Frontend läuft auf: `http://localhost:5173`

## 🔐 Keycloak-Konfiguration

### 1. Keycloak starten

```bash
docker run -p 8080:8080 -e KEYCLOAK_ADMIN=admin -e KEYCLOAK_ADMIN_PASSWORD=admin quay.io/keycloak/keycloak:latest start-dev
```

### 2. Realm und Client erstellen

1. Öffne Keycloak Admin Console: `http://localhost:8080`
2. Login: `admin` / `admin`
3. Erstelle einen neuen Realm oder nutze `master`
4. Erstelle einen neuen Client:
   - Client ID: `stagedesk`
   - Client Protocol: `openid-connect`
   - Access Type: `public`
   - Valid Redirect URIs: `http://localhost:5173/*`
   - Web Origins: `http://localhost:5173`

### 3. Umgebungsvariablen konfigurieren

Backend (`backend/.env`):
```env
KEYCLOAK_SERVER_URL=http://localhost:8080
KEYCLOAK_REALM=master
KEYCLOAK_CLIENT_ID=stagedesk
```

Frontend (`frontend/src/authConfig.js`):
- Bereits vorkonfiguriert, bei Bedarf anpassen

## 🛠️ Technologie-Stack

### Backend
- **Django 5.0** - Web Framework
- **Django Ninja** - Moderne REST API
- **django-cors-headers** - CORS-Unterstützung
- **python-jose** - JWT-Validierung
- **python-dotenv** - Umgebungsvariablen

### Frontend
- **React** - UI-Library
- **Vite** - Build Tool & Dev Server
- **Tailwind CSS** - Utility-First CSS
- **react-oidc-context** - Keycloak OIDC-Integration
- **oidc-client-ts** - OpenID Connect Client

## 📝 API-Endpunkte

### Health Check
```http
GET http://localhost:8000/api/health
```

Response:
```json
{
  "status": "ok"
}
```

### Geschützte Endpunkte (Beispiel)

Um geschützte Endpunkte zu erstellen, verwende die `keycloak_auth` Klasse:

```python
from core.auth import keycloak_auth
from ninja import Router

router = Router()

@router.get("/protected", auth=keycloak_auth)
def protected_endpoint(request):
    user_info = request.auth
    return {"message": "Erfolg", "user": user_info.get("preferred_username")}
```

## 🔒 Authentifizierung im Frontend

Um die OIDC-Authentifizierung zu nutzen, wrappe deine App mit dem `AuthProvider`:

```jsx
import { AuthProvider } from "react-oidc-context";
import { oidcConfig } from "./authConfig";

<AuthProvider {...oidcConfig}>
  <App />
</AuthProvider>
```

In Komponenten:

```jsx
import { useAuth } from "react-oidc-context";

function MyComponent() {
  const auth = useAuth();
  
  return (
    <div>
      {!auth.isAuthenticated ? (
        <button onClick={() => auth.signinRedirect()}>Login</button>
      ) : (
        <div>
          <p>Willkommen {auth.user?.profile.preferred_username}</p>
          <button onClick={() => auth.signoutRedirect()}>Logout</button>
        </div>
      )}
    </div>
  );
}
```

## 📚 Weitere Ressourcen

- [Django-Dokumentation](https://docs.djangoproject.com/)
- [Django Ninja](https://django-ninja.dev/)
- [React-Dokumentation](https://react.dev/)
- [Tailwind CSS](https://tailwindcss.com/)
- [Keycloak-Dokumentation](https://www.keycloak.org/documentation)
- [react-oidc-context](https://github.com/authts/react-oidc-context)

## 📄 Lizenz

Dieses Projekt ist für interne Entwicklung bestimmt.
