# Changelog - Stagedesk V2

## [Update] - Getrennte Budgets & Manuelle Kategorisierung

### ✅ Änderungen

#### Backend

**1. Models (`haushalte/models.py`)**
- ✅ `Haushalt` Model angepasst:
  - ❌ ~~`budget`~~ (einzelnes Budget-Feld entfernt)
  - ✅ `budget_konsumitiv` - Separates Budget für alltägliche Ausgaben
  - ✅ `budget_investiv` - Separates Budget für langfristige Anschaffungen
  - ✅ Neue Properties:
    - `gesamt_budget` - Summe beider Budgets
    - `verbleibendes_budget_konsumitiv`
    - `verbleibendes_budget_investiv`

- ✅ `Artikel` Model angepasst:
  - ❌ Automatische Kategorisierung entfernt (keine 250€-Regel mehr)
  - ✅ Benutzer wählt Kategorie (konsumitiv/investiv) manuell

**2. Schemas (`haushalte/schemas.py`)**
- ✅ `HaushaltCreateSchema`: Erfordert beide Budget-Felder
- ✅ `HaushaltSchema`: Gibt alle Budget-Details zurück
- ✅ `ArtikelCreateSchema`: Kategorie ist jetzt erforderlich

**3. API (`haushalte/api.py`)**
- ✅ Create/Update Endpoints angepasst für getrennte Budgets
- ✅ Artikel-Erstellung: Kategorie wird vom Benutzer übergeben

**4. Admin (`haushalte/admin.py`)**
- ✅ Admin-Interface zeigt beide Budgets an
- ✅ Alle Budget-Statistiken sichtbar

**5. Migrationen**
- ✅ Migration erstellt: `0002_remove_haushalt_budget_haushalt_budget_investiv_and_more.py`
- ✅ Datenbank erfolgreich migriert

---

#### Frontend

**1. Haushalt-Erstellung (`CreateHaushaltModal.jsx`)**
- ✅ Zwei separate Budget-Eingabefelder:
  - "Budget Konsumitiv" (mit Hinweis: "Für alltägliche Ausgaben")
  - "Budget Investitiv" (mit Hinweis: "Für langfristige Anschaffungen")

**2. Haushalts-Übersicht (`HaushaltePage.jsx`)**
- ✅ Anzeige beider Budgets in Cards
- ✅ Separate Fortschrittsbalken:
  - Konsumitiv: € X von € Y
  - Investitiv: € X von € Y
- ✅ Gesamt-Budget-Bar mit Summe beider Kategorien

**3. Artikel-Erfassung (`ArtikelModal.jsx`)**
- ❌ Automatische Kategorisierung entfernt
- ✅ Manuelle Auswahl per Button:
  - 🔻 **Konsumitiv** - Alltägliche Ausgaben (Orange)
  - 🔺 **Investitiv** - Langfristige Anschaffungen (Grün)
- ✅ Visuelles Feedback bei Auswahl (farbige Borders)
- ✅ Gesamtpreis-Anzeige unabhängig von Kategorie

**4. Dashboard (`DashboardPage.jsx`)**
- ✅ Haushalts-Statistiken entfernt
- ✅ Vereinfachte Willkommens-Seite
- ✅ Fokus auf Quick Actions

---

### 📝 Funktionale Änderungen

#### Vorher:
```
Haushalt:
  - Budget: € 2500 (ein Feld)
  
Artikel:
  - Preis: € 300
  - Automatisch → Investitiv (weil ≥ 250€)
```

#### Nachher:
```
Haushalt:
  - Budget Konsumitiv: € 1500
  - Budget Investiv: € 1000
  - Gesamt: € 2500

Artikel:
  - Preis: € 300
  - Benutzer wählt: Konsumitiv ODER Investitiv
  - Wird vom gewählten Budget abgezogen
```

---

### 🎯 Vorteile

1. **Flexibilität**: Keine starre 250€-Regel mehr
2. **Budgetkontrolle**: Separate Kontrolle über beide Bereiche
3. **Transparenz**: Benutzer sieht genau, welches Budget noch verfügbar ist
4. **Realitätsnäher**: Manche teure Dinge sind konsumitiv, manche billige investitiv

---

### 🚀 Testen

**Backend starten:**
```bash
cd backend
source venv/bin/activate
python manage.py runserver
```

**Frontend starten:**
```bash
cd frontend
npm run dev
```

**Testen:**
1. Neuen Haushalt erstellen → Beide Budget-Felder ausfüllen
2. Artikel hinzufügen → Kategorie manuell wählen
3. Haushalts-Übersicht → Beide Budgets werden getrennt angezeigt

---

### 📊 API-Änderungen

**Haushalt erstellen:**
```json
POST /api/haushalte/
{
  "name": "Privat",
  "budget_konsumitiv": 1500,
  "budget_investiv": 1000,
  "beschreibung": "..."
}
```

**Response:**
```json
{
  "id": 1,
  "name": "Privat",
  "budget_konsumitiv": 1500,
  "budget_investiv": 1000,
  "gesamt_budget": 2500,
  "gesamt_konsumitiv": 0,
  "gesamt_investiv": 0,
  "verbleibendes_budget_konsumitiv": 1500,
  "verbleibendes_budget_investiv": 1000,
  ...
}
```

**Artikel erstellen:**
```json
POST /api/haushalte/1/artikel
{
  "name": "Laptop",
  "preis": 899.99,
  "anzahl": 1,
  "kategorie": "investiv",  // ← MUSS angegeben werden!
  ...
}
```

---

## Link-Parser ✅ FUNKTIONAL!

Der Link-Parser ist jetzt **voll funktional** mit BeautifulSoup4!

### Installiert:
- ✅ `beautifulsoup4==4.12.3`
- ✅ `requests==2.31.0`
- ✅ `lxml==5.3.0`

### Unterstützte Shops:
- ✅ **Amazon** - Name, Preis, Bild, Beschreibung
- ✅ **eBay** - Name, Preis, Bild
- ✅ **Idealo** - Name, Bester Preis, Bild
- ✅ **MediaMarkt/Saturn** - Name, Preis
- ✅ **Generischer Parser** - Für alle anderen Shops

### API:
```http
POST /api/haushalte/parse-link/
{
  "url": "https://www.amazon.de/dp/B08N5WRWNW"
}

Response:
{
  "name": "Logitech MX Master 3",
  "preis": 89.99,
  "beschreibung": "Ergonomisches Design...",
  "bild_url": "https://..."
}
```

**Details:** Siehe `backend/LINK_PARSER.md`

---

## Nächste Schritte

- [ ] Link-Parser mit BeautifulSoup4 erweitern
- [ ] API-Calls im Frontend verbinden (aktuell Dummy-Daten)
- [ ] Budget-Warnungen bei Überschreitung
- [ ] Artikel-Liste pro Haushalt anzeigen
- [ ] Filter & Suche
