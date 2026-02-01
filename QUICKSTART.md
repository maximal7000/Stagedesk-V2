# 🚀 Stagedesk V2 - Quick Start Guide

## In 5 Minuten starten!

### 1️⃣ Backend starten

```bash
cd backend
source venv/bin/activate
python manage.py runserver
```

✅ Backend läuft auf: http://localhost:8000  
✅ API-Dokumentation: http://localhost:8000/api/docs

---

### 2️⃣ Frontend starten

```bash
cd frontend

# Optional: Environment-Datei erstellen
echo "VITE_API_URL=http://localhost:8000/api" > .env

npm run dev
```

✅ Frontend läuft auf: http://localhost:5173

---

### 3️⃣ Keycloak konfigurieren

**Option A: Keycloak lokal (Docker)**
```bash
docker run -p 8080:8080 \
  -e KEYCLOAK_ADMIN=admin \
  -e KEYCLOAK_ADMIN_PASSWORD=admin \
  quay.io/keycloak/keycloak:latest start-dev
```

**Option B: Vorhandener Server**  
Server: https://auth.t410.de

#### Client erstellen:
1. Öffne Keycloak Admin Console
2. Realm: **master**
3. **Clients** → **Create client**
   - Client ID: `stagedesk`
   - Client authentication: **OFF**
   - Valid redirect URIs: `http://localhost:5173/*`
   - Web origins: `http://localhost:5173`

4. **Realm Settings** → **Login**
   - ✅ Login with email

5. **Users** → **Add user**
   - Username: `testuser`
   - Email: `test@example.com`
   - Email verified: ✅
   - **Credentials** → Passwort setzen

---

### 4️⃣ Testen!

1. Öffne http://localhost:5173
2. Klicke auf "Mit Keycloak anmelden"
3. Login mit `testuser` / `test@example.com`
4. 🎉 Fertig!

---

## ✨ Erste Schritte in der App

### Haushalt erstellen
1. Navigation → **Haushalte**
2. Button: **Neuer Haushalt**
3. Eingeben:
   - Name: "Privat"
   - Budget: 2500
   - Beschreibung: "Mein privater Haushalt"

### Artikel hinzufügen
1. Bei einem Haushalt: **Artikel hinzufügen**
2. Eingeben:
   - Name: "Laptop"
   - Preis: 899.99
   - Anzahl: 1
   - Optional: Link zum Produkt

3. **Automatische Kategorisierung:**
   - < 250€ → 🔻 Konsumitiv (orange)
   - ≥ 250€ → 🔺 Investitiv (grün)

---

## 📊 API testen (optional)

### Health Check
```bash
curl http://localhost:8000/api/health
```

### Mit Token (nach Login)
1. Im Browser: Developer Tools → Application → Local Storage
2. Token kopieren
3. API-Call:
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
     http://localhost:8000/api/haushalte/
```

---

## 🐛 Troubleshooting

### Backend startet nicht
```bash
# Migrationen prüfen
cd backend
source venv/bin/activate
python manage.py migrate
```

### Frontend-Fehler "Module not found"
```bash
cd frontend
npm install
```

### CORS-Fehler
- Backend: `settings.py` → `CORS_ALLOWED_ORIGINS`
- Prüfe: http://localhost:5173 ist erlaubt

### Keycloak-Fehler "Invalid redirect_uri"
- Keycloak Client → Valid Redirect URIs
- Muss enthalten: `http://localhost:5173/*`

### 401 Unauthorized
- Token abgelaufen → Logout + erneut einloggen
- Keycloak-URL in `authConfig.js` prüfen

---

## 📚 Weitere Dokumentation

- **PROJEKTDOKUMENTATION.md** - Vollständige Doku
- **KEYCLOAK_SETUP.md** - Detaillierte Keycloak-Anleitung
- **README.md** - Projekt-Übersicht

---

## 💡 Tipps

1. **API-Dokumentation nutzen:**  
   http://localhost:8000/api/docs  
   → Interaktive Swagger-Docs zum Testen

2. **Django Admin:**  
   http://localhost:8000/admin  
   (Superuser erstellen: `python manage.py createsuperuser`)

3. **Browser Developer Tools:**  
   - Network-Tab für API-Calls
   - Console für Fehler
   - Application für Token/LocalStorage

4. **Hot Reload:**  
   - Backend: Änderungen werden automatisch geladen
   - Frontend: Vite Hot Module Replacement (HMR)

---

Viel Erfolg! 🎉
