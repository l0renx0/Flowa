# Flowa — istruzioni per Claude

App personale per spese ed entrate (PWA statica, nessun build) pubblicata su GitHub Pages: https://l0renx0.github.io/Flowa/ (repository `l0renx0/Flowa`, ramo `main`). L'utente non è uno sviluppatore: spiega sempre in italiano semplice, passo per passo.

**Nessun costo** e **privacy**: questo repository è pubblico, quindi qui NON vanno mai dati personali (spese, entrate, nomi, importi). I dati stanno solo nel repository **privato** `l0renx0/Flowa-dati`, file `data.json`, che l'app legge e scrive da sola con un codice di accesso (fine-grained token, permesso Contents read/write solo su `Flowa-dati`) salvato nel browser dell'utente.

## File
- `index.html`, `assets/css/app.css`, `assets/js/app.js`, `sw.js`, `manifest.webmanifest`, `assets/icons/`: l'app.
- `version.json`: se la versione pubblicata è diversa da `APP_VERSION` in `app.js`, l'app mostra il banner "Nuova versione di Flowa · Aggiorna".
- `.github/workflows/pubblica.yml`: pubblica il sito a ogni push su `main`.

## Quando modifichi l'app
Aumenta **insieme** questi tre valori (es. `flowa-1` → `flowa-2`): `APP_VERSION` in `assets/js/app.js`, `VERSION` in `sw.js`, `version` in `version.json`. Così sul telefono compare il banner per aggiornare e i dati restano dove sono.
Prova in locale (`python3 -m http.server`, aggiungi `?oggi=AAAA-MM-GG` per simulare un giorno) prima del push. Mantieni il design: Geist, accento viola (`--accent`), schede bianche su grigio chiaro, modalità scura tramite i token in `:root`.

## Formato dei dati (`Flowa-dati/data.json`)
```json
{
  "app": "flowa", "version": 1, "updatedAt": "ISO",
  "transactions": [{
    "id": "univoco", "type": "expense | income", "amount": 12.5, "date": "AAAA-MM-GG",
    "category": "id categoria", "merchant": "Aldi o null", "note": "testo o null",
    "method": "carta | contanti | bonifico | null", "updatedAt": "ISO",
    "split": {"person": "Marco", "mine": 6.25, "mode": "half|custom", "paidBy": "me|them", "settled": false},
    "recurring": "id regola (se creata da una ricorrente)", "approx": true, "deleted": true
  }],
  "settings": { "updatedAt": "ISO", "categories": [{"id","name","type","icon","color"}],
                "budgets": {"idCategoria": 250}, "recurring": [{"id","type","amount","category","merchant","note","method","freq":"monthly|weekly","day":"-1=ultimo giorno | 1-28 | 0-6 giorno settimana","start","active"}], "people": [] }
}
```
- Le eliminazioni sono "lapidi" (`deleted: true`) per far funzionare la sincronizzazione tra dispositivi: non cancellare fisicamente.
- Se modifichi i dati a mano: aggiorna `updatedAt` del movimento (e `settings.updatedAt` se tocchi le impostazioni), altrimenti la copia nel telefono vince.
- Le ricorrenti creano movimenti con id `r-<idRegola>-<data>`.

## Origine dei dati
Importati dal foglio Google "Spese Settimanali" (225 spese dal 30/11/2025 al 29/09/2026, 43 entrate). Scelte fatte con l'utente: le entrate del foglio non avevano data → date stimate (`approx: true`): stipendi/straordinari/APM all'ultimo giorno del mese indicato, mance ogni domenica a partire dal 10/05/2026 ("1 settimana"); corrette due date (Aldi 3,23 € → 14/03/2026, "Cena coi bro" → 28/07/2026); le spese "Extra" sono state divise in categorie leggendo le note; il corso di spagnolo (210 €, senza data) è al 30/09/2026 e c'è una ricorrente da 15 € ogni mercoledì.
