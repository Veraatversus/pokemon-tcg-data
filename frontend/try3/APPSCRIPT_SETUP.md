# Apps Script Setup für Web-App Integration

## Problem: CORS / 401 Unauthorized Fehler

Wenn du Fehler wie diese siehst:
- `Access to fetch ... has been blocked by CORS policy`
- `401 (Unauthorized)`
- `403 (Forbidden)`

...dann ist die Web-App nicht korrekt deployed.

## Lösung: Richtiges Deployment

### Schritt 1: Apps Script Code vorbereiten

Im Apps Script muss ein `doPost()` Handler existieren:

```javascript
/**
 * Handle POST requests from the frontend
 */
function doPost(e) {
  try {
    // Parse incoming request
    const request = JSON.parse(e.postData.contents);
    const functionName = request.function;
    const params = request.parameters || [];
    
    // Execute the requested function
    let result;
    if (functionName === 'promptAndPopulateCardsForSet') {
      result = promptAndPopulateCardsForSet(params[0]);
    } else if (functionName === 'getAllSetsData') {
      result = getAllSetsData();
    } else if (functionName === 'getCardData') {
      result = getCardData(params[0]);
    } else {
      throw new Error('Unknown function: ' + functionName);
    }
    
    // Return JSON response
    return ContentService
      .createTextOutput(JSON.stringify({ response: result }))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    // Return error
    return ContentService
      .createTextOutput(JSON.stringify({ 
        error: error.message || error.toString() 
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
```

### Schritt 2: Web-App deployen

1. **Apps Script öffnen**
   - Google Sheet öffnen
   - Extensions → Apps Script

2. **Deployment erstellen**
   - Klick auf "Deploy" (oben rechts)
   - "New deployment"

3. **Deployment konfigurieren**
   - **Type:** Web app
   - **Execute as:** Me (dein Google Account)
   - **Who has access:** Anyone (wichtig für CORS!)
   
4. **Deployment bestätigen**
   - "Deploy" klicken
   - Authorization durchführen
   - **Web-App URL kopieren** (Format: `https://script.google.com/macros/s/.../exec`)

5. **Im Frontend verwenden**
   - Bei der Script-Auswahl diese Web-App URL eingeben
   - Cookies löschen und neu auswählen, wenn alte URL verwendet wurde

## Wichtige Hinweise

### CORS Problem
- Web-Apps erlauben nur Requests von erlaubten Origins
- "Who has access: Anyone" ist erforderlich für externe Requests
- Localhost wird erlaubt, wenn "Anyone" gesetzt ist

### Authorization
- Das Frontend sendet automatisch den OAuth Token im `Authorization` Header
- Die Web-App muss mit "Execute as: Me" deployed sein
- Der Benutzer muss sich im Frontend eingeloggt haben

### Fehlersuche

**401 Unauthorized:**
- Web-App ist nicht mit "Who has access: Anyone" deployed
- Token ist abgelaufen → Neu einloggen im Frontend

**403 Forbidden:**
- Web-App existiert nicht oder wurde gelöscht
- Falsche URL verwendet

**404 Not Found:**
- URL ist falsch
- Web-App wurde nicht deployed

**CORS Fehler:**
- "Who has access" ist nicht auf "Anyone" gesetzt
- Kein `doPost()` Handler im Script

## Testing

Nach dem Deployment teste mit:

```bash
curl -X POST "https://script.google.com/macros/s/.../exec" \
  -H "Content-Type: application/json" \
  -d '{"function":"getAllSetsData","parameters":[]}'
```

Sollte JSON zurückgeben, keine HTML Error-Page.

## Weitere Hilfe

Siehe Google Apps Script Dokumentation:
https://developers.google.com/apps-script/guides/web
