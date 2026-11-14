<p align="center">
  <img src="brand/mascot/mascot-256.png" alt="Paparajote Lunar mascot" width="160" />
</p>

# Paparajote Lunar

Our project for the [NASA Space Apps Challenge 2026](https://www.spaceappschallenge.org/2026/), challenge **[Harmonization of MODIS and VIIRS Hot Spots](https://www.spaceappschallenge.org/2026/challenges/modis-and-viirs-hot-spots/)**.

Live at **https://paparajotelunar.com**

## The challenge

Satellites have been detecting active fires for over 20 years, but that record is split between two sensors:

- **MODIS** (Terra and Aqua): data from 2000 onwards, but the satellites are reaching the end of their life.
- **VIIRS**: the replacement, with more detail, but only from 2012 onwards.

The two sensors differ in spatial resolution, sensitivity and observation times, so you can't put their hotspot counts side by side. Fire managers end up without a consistent history of when and where fires happened.

The challenge asks for a web app that:

1. **Harmonizes MODIS and VIIRS hotspots** into one time series, so it no longer matters which sensor saw a fire.
2. **Shows a burning activity calendar** for an area the user picks: hotspots per month from the early 2000s to today. It should make clear which months and years had the most fire and how the current month compares to the historical median.

Ideas the challenge suggests: draw the area on a map or enter coordinates, use accessible colour ramps, show anomalies against multi-year averages, and export the hotspots as CSV.

The target users are emergency responders, firefighters, land managers and scientists.

## Data

- [NASA FIRMS](https://www.earthdata.nasa.gov/data/tools/firms) (Fire Information for Resource Management System): active fire hotspots from MODIS and VIIRS, both historical and near real-time.

## How it works

1. **Ingest** (`backend/cmd/ingest`): downloads every FIRMS country file from the yearly archive (MODIS, Suomi NPP and NOAA-20, 2002 → last full year), keeps Aqua and VIIRS vegetation fires, and sums them per 0.25° cell and month. After the archive it fetches global VIIRS day by day from the FIRMS area API. It runs again every 6 hours and only downloads what changed.
2. **Harmonize** (`backend/internal/harmonize`): for each country it learns how many hotspots VIIRS sees for each one MODIS sees (2012–2017), grades seven models on 2018 to mid-2021 and keeps the best. It then rebuilds 2002–2012 on the VIIRS scale. Countries with too little fire use a model pooled with their neighbours. Before harmonizing, the step at the 2012 sensor change is 4–6×; after, it matches Aqua alone.
3. **API** (`backend/cmd/api`): the calendar of any area (bbox or point and radius) with medians, anomalies, years ranked and the current month against history, plus CSV exports, a map grid, the raw sensor comparison and raw hotspot downloads. See [`backend/api/openapi.yaml`](backend/api/openapi.yaml), also served at `/api/openapi.yaml`.

The method follows the study by Alexis and Basma, ported from their Python proof of concept to Go and checked against it value by value.

## Team

**Paparajote Lunar**

- Alexis Daniel Rodriguez Zambrano
- Maia Prieto
- Pablo Ruiz Inglés
- Basma Barhel Aousser
- Mikael Henrique Krüppel Pinto

## Stack

- Frontend: React, TypeScript, Vite, Tailwind
- Backend: Go, PostgreSQL

Conventions and repo layout are in [CLAUDE.md](CLAUDE.md).

## Running it locally

You need Docker and Node 24+.

```bash
cd backend && docker compose up             # terminal 1: API on http://localhost:8080
cd frontend && npm install && npm run dev  # terminal 2: app on http://localhost:5173
```

To fill the local database, get a FIRMS map key (https://firms.modaps.eosdis.nasa.gov/api/map_key/) and run the ingest. By default it only fetches the sample countries (Spain, Portugal, Greece, Chile, Malaysia):

```bash
cd backend && FIRMS_MAP_KEY=... docker compose --profile ingest up ingest
```
