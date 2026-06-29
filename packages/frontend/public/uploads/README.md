# Projekt-Bilder (selbst gehostet)

Hier liegen **alle hochgeladenen Bilder** eines Projekts: das Titelbild und die
Bilder der Neuigkeiten. Es werden **keine externen URLs** verwendet – ein Nutzer
lädt nur eigene Bilder hoch, die hier landen.

## Wie es zusammenhängt

- Die Datenbank/Metadaten speichern nur einen **relativen Schlüssel**, z. B.
  `uploads/burger-restaurant/cover.jpg` – **kein** voller Link, kein Host.
- Das Frontend baut daraus die URL über `mediaUrl()`
  ([`src/utils/media.ts`](../../src/utils/media.ts)): `VITE_MEDIA_BASE_URL` +
  Schlüssel. Ohne gesetzte Variable wird die App-Basis genutzt → die Dateien hier
  unter `public/` werden vom Dev-Server/Build direkt unter `/uploads/...`
  ausgeliefert.
- **Produktion:** dieser Ordner liegt später auf dem Backend bzw. in einem
  Object-Store/CDN. Dann nur `VITE_MEDIA_BASE_URL` auf dessen Host setzen – die
  gespeicherten Schlüssel und das Frontend bleiben unverändert.

## Erwartete Dateien

Lege je Projekt genau diese Dateien an (Namen müssen mit `projectMetadata.json`
übereinstimmen). Empfohlene Größen: **Titelbild ~1200×750** (Querformat),
**Neuigkeiten-Bilder ~1200×675** (16:9). `.jpg`, sonst Pfad in der Mock-Datei
anpassen.

```
uploads/
  burger-restaurant/         cover.jpg, news-1.jpg, news-2.jpg, news-3.jpg, news-4.jpg
  mesh-netzwerk-festivals/   cover.jpg, news-1.jpg, news-2.jpg
  roguelike-aetherbound/     cover.jpg, news-1.jpg
  mobile-suppenkueche-berlin/cover.jpg
  wiederaufforstung-eifel/   cover.jpg, news-1.jpg, news-2.jpg
```

Fehlt eine Datei, zeigt der Browser nur ein kaputtes Bild – Layout & Slider
funktionieren trotzdem. Die `.gitkeep`-Dateien halten die leeren Ordner im Git.
