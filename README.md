# TripAI — Správa výletů

Express API a webové rozhraní pro správu cílů výletů a destinací.

## Struktura projektu

| Část | Složka | Popis |
|------|--------|--------|
| **Backend** | `src/` | REST API (Express, SQLite) |
| **Frontend** | `public/` | Statické webové UI (HTML, CSS, JS) |

Frontend se servíruje ze stejného serveru jako API — po spuštění otevři kořenovou adresu v prohlížeči.

## Spuštění

```bash
npm install
npm start
```

Aplikace běží na [http://localhost:8766](http://localhost:8766) (port lze změnit přes `PORT` v `.env`).

Vývoj s automatickým restartem:

```bash
npm run dev
```

## API

Základní endpointy pod prefixem `/v1`:

- `GET/POST /trip-goals` — seznam a vytvoření cílů
- `GET/PUT/DELETE /trip-goals/:id` — detail, úprava, smazání
- `POST /trip-goals/:id/destinations` — přidání destinace
- `GET/PUT/DELETE /destinations/:id` — správa destinací

Kontrola serveru: `GET /health`

## Frontend

Složka `public/` obsahuje kompletní klientskou aplikaci:

- seznam a filtr cílů výletů
- detail záznamu včetně destinací a souhrnných metrik
- formuláře pro vytváření a úpravu dat

Nepotřebuje samostatný build — stačí spustit backend.
