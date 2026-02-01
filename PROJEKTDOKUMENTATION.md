# Stagedesk V2 - Haushalts- & Budget-Management

Vollständige Haushalts- und Budget-Management-Anwendung mit Django Backend, React Frontend und Keycloak-Authentifizierung.

## 🎯 Features

### ✅ Implementiert

#### Authentifizierung
- ✅ Keycloak OIDC-Integration
- ✅ Login/Logout-Funktionalität
- ✅ Protected Routes (nur für authentifizierte Benutzer)
- ✅ Automatisches Token-Refresh
- ✅ JWT-Validierung im Backend

#### Dashboard
- ✅ Modernes Dark-Mode-Design mit Tailwind CSS
- ✅ Responsive Sidebar-Navigation
- ✅ Übersichtsdashboard mit Statistiken
- ✅ Budget-Tracking (Konsumitiv/Investitiv)

#### Haushalts-Verwaltung
- ✅ Mehrere Haushalte pro Benutzer (z.B. Privat, WG, Firma)
- ✅ Budget-Zuweisung pro Haushalt
- ✅ Echtzeit-Budget-Tracking
- ✅ Automatische Berechnung (Konsumitiv/Investitiv)

#### Artikel-Verwaltung
- ✅ Artikel mit Name, Preis, Anzahl
- ✅ **Automatische Kategorisierung:**
  - Gesamtpreis ≥ € 250 → Investitiv
  - Gesamtpreis < € 250 → Konsumitiv
- ✅ Produkt-Link-Eingabe
- ✅ Link-Parser-Service (Basis-Implementierung)
- ✅ Kategorien-System mit Tags
- ✅ Optionale Beschreibung und Kaufdatum

#### API
- ✅ RESTful API mit Django Ninja
- ✅ Automatische Swagger-Dokumentation
- ✅ CRUD-Endpoints für Haushalte & Artikel
- ✅ Keycloak JWT-Authentifizierung
- ✅ Benutzer-spezifische Daten-Isolation

### 🚀 Zukünftige Features (Vorschläge)

1. **Budget-Tracking**
   - Monatliche/Jährliche Budgets
   - Budget-Warnungen bei Überschreitung
   - Historische Datenanalyse

2. **Erweiterte Kategorisierung**
   - Benutzerdefinierte Kategorien (Lebensmittel, Elektronik, etc.)
   - Farbcodierung und Icons
   - Statistiken pro Kategorie

3. **Produktdaten-Extraktion**
   - Erweiterte Link-Parser (BeautifulSoup4)
   - Shop-spezifische Parser (Amazon, eBay, Idealo)
   - Automatische Preis-Updates
   - Produktbilder

4. **Kollaboration**
   - Mehrere Benutzer pro Haushalt (z.B. WG)
   - Berechtigungen (Admin, Mitglied, Viewer)
   - Aktivitäts-Feed

5. **Export & Berichte**
   - PDF-Export für Steuern
   - Excel/CSV-Export
   - Monats-/Jahresberichte
   - Diagramme und Visualisierungen

6. **Suche & Filter**
   - Volltextsuche
   - Filter nach Datum, Kategorie, Preis
   - Sortierung

7. **Benachrichtigungen**
   - E-Mail-Benachrichtigungen
   - Budget-Warnungen
   - Monatliche Zusammenfassungen

## 🏗️ Architektur

### Backend (Django)

```
backend/
├── core/                   # Django-Projekt
│   ├── settings.py        # Konfiguration (CORS, Apps)
│   ├── urls.py            # API-Routing
│   └── auth.py            # Keycloak JWT-Validierung
│
├── haushalte/             # Django-App
│   ├── models.py          # Datenmodelle (Haushalt, Artikel, Kategorie)
│   ├── schemas.py         # Pydantic-Schemas für API
│   ├── api.py             # Django Ninja API-Endpoints
│   ├── services.py        # Link-Parser-Service
│   └── admin.py           # Django Admin-Konfiguration
│
├── manage.py
└── requirements.txt
```

#### Datenmodelle

**Haushalt:**
- name, beschreibung, budget
- benutzer_id (Keycloak User ID)
- Berechnete Felder: gesamt_konsumitiv, gesamt_investiv, verbleibendes_budget

**Artikel:**
- name, beschreibung, preis, anzahl
- kategorie (automatisch: konsumitiv/investiv)
- link, bild_url
- tag_kategorie (optional)
- Automatische Kategorisierung beim Speichern

**Kategorie:**
- name, beschreibung, icon, farbe

### Frontend (React)

```
frontend/
├── src/
│   ├── lib/
│   │   └── api.js         # Axios-Client mit Interceptors
│   │
│   ├── components/
│   │   ├── ProtectedRoute.jsx        # Auth-Guard
│   │   ├── DashboardLayout.jsx       # Layout mit Sidebar
│   │   ├── CreateHaushaltModal.jsx   # Haushalt erstellen
│   │   └── ArtikelModal.jsx          # Artikel hinzufügen
│   │
│   ├── pages/
│   │   ├── LoginPage.jsx             # Login-Seite
│   │   ├── DashboardPage.jsx         # Dashboard
│   │   └── HaushaltePage.jsx         # Haushalte-Übersicht
│   │
│   ├── App.jsx            # Router-Konfiguration
│   ├── main.jsx           # AuthProvider + Entry Point
│   └── authConfig.js      # Keycloak OIDC-Config
│
├── tailwind.config.js
└── package.json
```

## 🚀 Installation & Start

### Voraussetzungen
- Python 3.13+
- Node.js 25+
- Keycloak Server (siehe KEYCLOAK_SETUP.md)

### Backend starten

```bash
cd backend

# Virtual Environment aktivieren
source venv/bin/activate

# Datenbank migrieren (bereits erledigt)
python manage.py migrate

# Server starten
python manage.py runserver
```

**Backend läuft auf:** `http://localhost:8000`  
**API-Dokumentation:** `http://localhost:8000/api/docs`

### Frontend starten

```bash
cd frontend

# Environment-Datei erstellen
cp .env.example .env

# Development-Server starten
npm run dev
```

**Frontend läuft auf:** `http://localhost:5173`

### Keycloak konfigurieren

Siehe detaillierte Anleitung in: **`KEYCLOAK_SETUP.md`**

Kurzfassung:
1. Client "stagedesk" in Keycloak erstellen
2. Valid Redirect URIs: `http://localhost:5173/*`
3. "Login with email" aktivieren
4. Test-Benutzer erstellen

## 📡 API-Endpunkte

### Authentifizierung
Alle Endpunkte (außer `/kategorien/`) benötigen ein Bearer Token:
```
Authorization: Bearer <keycloak_access_token>
```

### Haushalte

```http
GET    /api/haushalte/                    # Alle Haushalte auflisten
GET    /api/haushalte/{id}                # Einzelnen Haushalt abrufen
POST   /api/haushalte/                    # Neuen Haushalt erstellen
PUT    /api/haushalte/{id}                # Haushalt aktualisieren
DELETE /api/haushalte/{id}                # Haushalt löschen
```

**Beispiel: Haushalt erstellen**
```json
POST /api/haushalte/
{
  "name": "Privat",
  "beschreibung": "Mein privater Haushalt",
  "budget": 2500.00
}
```

### Artikel

```http
GET    /api/haushalte/{id}/artikel        # Alle Artikel eines Haushalts
POST   /api/haushalte/{id}/artikel        # Neuen Artikel hinzufügen
PUT    /api/haushalte/{id}/artikel/{a_id} # Artikel aktualisieren
DELETE /api/haushalte/{id}/artikel/{a_id} # Artikel löschen
```

**Beispiel: Artikel hinzufügen**
```json
POST /api/haushalte/1/artikel
{
  "name": "Laptop",
  "preis": 899.99,
  "anzahl": 1,
  "link": "https://amazon.de/...",
  "beschreibung": "Neuer Arbeits-Laptop"
}
```

**Response:**
```json
{
  "id": 1,
  "name": "Laptop",
  "preis": 899.99,
  "anzahl": 1,
  "kategorie": "investiv",    // Automatisch (≥ 250€)
  "gesamtpreis": 899.99,
  ...
}
```

### Kategorien

```http
GET    /api/kategorien/                   # Alle Kategorien auflisten (öffentlich)
POST   /api/kategorien/                   # Neue Kategorie erstellen (auth)
```

### Link-Parser

```http
POST   /api/haushalte/parse-link/         # Produkt-Link parsen
```

**Beispiel:**
```json
POST /api/haushalte/parse-link/
{
  "url": "https://amazon.de/produkt/..."
}
```

**Response:**
```json
{
  "name": "Produktname",
  "preis": 49.99,
  "beschreibung": "...",
  "bild_url": "https://..."
}
```

## 🎨 Design-System

### Farben (Dark Mode)
- **Background:** `bg-gray-950` (Haupthintergrund)
- **Cards:** `bg-gray-900` (Container)
- **Borders:** `border-gray-800`
- **Primary:** `bg-blue-600` (Buttons, Links)
- **Success:** `bg-green-500` (Investitiv)
- **Warning:** `bg-orange-500` (Konsumitiv)

### Icons
- **lucide-react** für alle Icons
- Konsistent in Größe und Farbe

### Komponenten
- Modals mit Backdrop-Blur
- Hover-Effekte auf Cards
- Smooth Transitions
- Responsive Grid-Layout

## 🔐 Sicherheit

### Backend
- JWT-Token-Validierung auf jeder geschützten Route
- Benutzer-spezifische Daten-Isolation (über `benutzer_id`)
- CORS-Konfiguration für localhost:5173
- Django CSRF-Protection

### Frontend
- Protected Routes nur für authentifizierte Benutzer
- Automatisches Token-Refresh
- 401-Fehlerbehandlung → Redirect zum Login
- Axios-Interceptors für Token-Handling

## 🧪 Testing

### Backend testen
```bash
cd backend
source venv/bin/activate

# Django Shell
python manage.py shell

# Test-Daten erstellen
from haushalte.models import Haushalt, Artikel
h = Haushalt.objects.create(name="Test", budget=1000, benutzer_id="testuser")
a = Artikel.objects.create(haushalt=h, name="Test-Artikel", preis=50, anzahl=2)
print(a.kategorie)  # 'konsumitiv' (100€ < 250€)
```

### API testen (mit curl)
```bash
# Health Check (ohne Auth)
curl http://localhost:8000/api/health

# Mit Bearer Token
curl -H "Authorization: Bearer YOUR_TOKEN" \
     http://localhost:8000/api/haushalte/
```

## 📦 Deployment (Zukünftig)

### Backend
- Gunicorn + Nginx
- PostgreSQL statt SQLite
- Environment Variables für Production
- Static Files mit WhiteNoise

### Frontend
- Build: `npm run build`
- Nginx oder Vercel
- Environment-spezifische Configs

### Keycloak
- Production-Realm
- HTTPS-URLs
- Token-Lebensdauer konfigurieren

## 📝 Entwickler-Hinweise

### Link-Parser erweitern
Um den Link-Parser zu verbessern:

1. **Dependencies installieren:**
```bash
pip install beautifulsoup4 requests lxml
```

2. **services.py erweitern** (siehe Kommentare in der Datei)

3. **Shop-spezifische Parser implementieren:**
   - Amazon: Produkttitel, Preis, Bilder
   - eBay: Auktions-/Sofortkauf-Preise
   - Idealo: Preis-Vergleiche

### Neue Features hinzufügen

**Backend:**
1. Modell in `haushalte/models.py` hinzufügen
2. Migration erstellen: `python manage.py makemigrations`
3. Schema in `haushalte/schemas.py` definieren
4. API-Endpoint in `haushalte/api.py` erstellen
5. In Admin registrieren: `haushalte/admin.py`

**Frontend:**
1. Komponente in `src/components/` erstellen
2. Page in `src/pages/` hinzufügen
3. Route in `App.jsx` registrieren
4. API-Calls mit `apiClient` aus `lib/api.js`

## 🤝 Beiträge

Weitere Feature-Ideen:
- **Dunkler/Heller Modus Switcher**
- **Mehrsprachigkeit (i18n)**
- **Mobile App (React Native)**
- **Preis-Alerts** bei Produkt-Links
- **Rezept-Integration** mit automatischer Zutatenliste
- **Kassenbons scannen** (OCR)

## 📄 Lizenz

Dieses Projekt ist für interne Entwicklung bestimmt.
