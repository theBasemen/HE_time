# Cache Clearing Guide for PWA Updates

Når appen er installeret på hjemmeskærmen (PWA), kan der være cache-problemer ved opdateringer.

## Metode 1: Force Refresh (Hurtigste)

1. **Åbn appen på iPhone**
2. **Tryk og hold på refresh-knappen** (hvis den er synlig)
3. Eller **tryk Cmd+Shift+R** (Mac) / **Ctrl+Shift+R** (Windows) hvis du åbner i browser først

## Metode 2: Slet og Geninstaller App

1. **Slet appen fra hjemmeskærmen** (langt tryk → Fjern App)
2. **Åbn appen i Safari**
3. **Tilføj til hjemmeskærm igen** (Del-knap → Tilføj til hjemmeskærm)

## Metode 3: Clear Safari Cache (iOS)

1. **Gå til Indstillinger** → **Safari**
2. **Ryd historik og websitedata**
3. **Genåbn appen**

## Metode 4: Service Worker Update (Automatisk)

Service Worker opdateres automatisk når:
- Du lukker og genåbner appen
- Du venter ~24 timer (service workers checker automatisk for opdateringer)

## Debug: Tjek om ny version er loaded

1. **Åbn appen i Safari** (ikke PWA)
2. **Tryk F12** eller **Cmd+Option+I** (Mac) for Developer Tools
3. Gå til **Application** → **Service Workers**
4. Tjek om der er en ny service worker der venter på aktivering
5. Klik **Update** eller **Unregister** → **Register** for at force update

## Verificer at klokkeikonet vises

Efter cache-clear, tjek:
1. Log ind i appen
2. Klokkeikonet (BellOff) skulle være synligt i header (øverst til højre)
3. Hvis ikke, tjek browser console for fejl (F12 → Console)

## Hvis klokkeikonet stadig ikke vises

1. Tjek browser console for fejl
2. Verificer at `VITE_VAPID_PUBLIC_KEY` er sat i Netlify environment variables
3. Tjek om appen kører den nyeste version (se i Netlify deploy logs)

