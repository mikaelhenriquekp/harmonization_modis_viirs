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
