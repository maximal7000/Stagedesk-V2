# Keycloak-Konfiguration für Stagedesk V2

Server: **https://auth.t410.de**  
Realm: **master**

## 📋 Schritt-für-Schritt-Anleitung

### 1. Client erstellen

1. Öffne die Keycloak Admin Console: `https://auth.t410.de/admin`
2. Melde dich als Admin an
3. Wähle den Realm **"master"** aus
4. Gehe zu **Clients** → **Create client**

#### Client-Einstellungen:

**General Settings:**
- **Client type:** `OpenID Connect`
- **Client ID:** `stagedesk`
- Klicke auf **Next**

**Capability config:**
- **Client authentication:** `OFF` (für Public Client)
- **Authorization:** `OFF`
- **Authentication flow:** 
  - ✅ Standard flow (Authorization Code Flow)
  - ✅ Direct access grants (optional, für Username/Password Login)
- Klicke auf **Next**

**Login settings:**
- **Root URL:** `http://localhost:5173`
- **Home URL:** `http://localhost:5173`
- **Valid redirect URIs:** 
  - `http://localhost:5173/*`
  - `http://localhost:5173`
- **Valid post logout redirect URIs:**
  - ` `
  - `http://localhost:5173`
- **Web origins:** 
  - `http://localhost:5173`
  - `+` (erlaubt alle Valid Redirect URIs)
- Klicke auf **Save**

---

### 2. Realm-Einstellungen für E-Mail & Username Login

#### Realm Settings → Login Tab

1. Gehe zu **Realm settings** (linke Sidebar)
2. Tab **Login**
3. Aktiviere folgende Optionen:

**User authentication:**
- ✅ **User registration** (optional - erlaubt Selbstregistrierung)
- ✅ **Email as username** (Benutzer können sich mit E-Mail anmelden)
- ✅ **Login with email** (E-Mail als Login-Option)

**Alternative: Username UND E-Mail erlauben**

Wenn Sie wollen, dass Benutzer sich ENTWEDER mit Username ODER E-Mail anmelden können:
- ❌ **Email as username** (ausgeschaltet lassen)
- ✅ **Login with email** (aktiviert)

Dann können sich Benutzer mit beidem anmelden!

4. Klicke auf **Save**

---

### 3. Client Scopes überprüfen

1. Gehe zu **Clients** → **stagedesk**
2. Tab **Client scopes**
3. Stelle sicher, dass folgende Scopes als "Default" zugewiesen sind:
   - `email`
   - `profile`
   - `roles`

Falls nicht:
- Klicke auf **Add client scope**
- Wähle die fehlenden Scopes aus
- Setze sie auf **Default**

---

### 4. Test-Benutzer erstellen

1. Gehe zu **Users** (linke Sidebar)
2. Klicke auf **Add user**

**User Details:**
- **Username:** `testuser` (erforderlich, wenn "Email as username" deaktiviert)
- **Email:** `test@example.com`
- **Email verified:** ✅ Aktivieren
- **First name:** `Test`
- **Last name:** `User`
- Klicke auf **Create**

**Passwort setzen:**
1. Tab **Credentials**
2. Klicke auf **Set password**
3. **Password:** `test123` (oder ein sicheres Passwort)
4. **Temporary:** `OFF` (sonst muss der User das Passwort beim ersten Login ändern)
5. Klicke auf **Save**

---

### 5. CORS-Einstellungen überprüfen (wichtig!)

1. Gehe zurück zu **Clients** → **stagedesk**
2. Überprüfe unter **Settings**:
   - **Web origins:** `http://localhost:5173` oder `+`

Das `+` bedeutet, dass alle "Valid redirect URIs" automatisch als Web Origins erlaubt sind.

---

### 6. Produktions-URLs hinzufügen (später)

Wenn die App in Produktion geht:

1. **Client** → **stagedesk** → **Settings**
2. Füge hinzu:
   - **Valid redirect URIs:** `https://ihre-domain.de/*`
   - **Valid post logout redirect URIs:** `https://ihre-domain.de/*`
   - **Web origins:** `https://ihre-domain.de`

3. **Frontend** `authConfig.js`:
```javascript
redirect_uri: window.location.origin,
post_logout_redirect_uri: window.location.origin,
```

---

## ✅ Checkliste

- [ ] Client "stagedesk" erstellt
- [ ] Client Type: OpenID Connect
- [ ] Client authentication: OFF (Public Client)
- [ ] Standard flow aktiviert
- [ ] Valid redirect URIs konfiguriert: `http://localhost:5173/*`
- [ ] Web origins konfiguriert: `http://localhost:5173`
- [ ] Realm Login Settings: "Login with email" aktiviert
- [ ] Client Scopes: email, profile, roles als Default
- [ ] Test-Benutzer erstellt mit Passwort
- [ ] E-Mail als verifiziert markiert

---

## 🧪 Test

Nach der Konfiguration:

1. Frontend starten: `npm run dev`
2. App im Browser öffnen: `http://localhost:5173`
3. Login-Button klicken
4. Anmelden mit:
   - **Username:** `testuser` ODER
   - **E-Mail:** `test@example.com`
   - **Passwort:** `test123`

---

## 🔍 Troubleshooting

### Problem: "Invalid redirect_uri"
**Lösung:** Überprüfe, dass `http://localhost:5173/*` in den "Valid redirect URIs" eingetragen ist.

### Problem: CORS-Fehler
**Lösung:** Stelle sicher, dass "Web origins" auf `http://localhost:5173` oder `+` gesetzt ist.

### Problem: "Client not found"
**Lösung:** Überprüfe, dass die Client ID in `authConfig.js` mit der in Keycloak übereinstimmt.

### Problem: "User not found" bei E-Mail-Login
**Lösung:** 
1. Überprüfe, dass "Login with email" im Realm aktiviert ist
2. Stelle sicher, dass der User eine E-Mail-Adresse hat
3. E-Mail sollte als "verified" markiert sein

---

## 📝 Backend .env anpassen

Vergiss nicht, auch das Backend zu aktualisieren:

`backend/.env`:
```env
KEYCLOAK_SERVER_URL=https://auth.t410.de
KEYCLOAK_REALM=master
KEYCLOAK_CLIENT_ID=stagedesk
```
