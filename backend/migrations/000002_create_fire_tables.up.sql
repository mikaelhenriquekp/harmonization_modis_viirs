-- Regions are FIRMS countries. Each one is harmonized with its own model, or
-- pooled with its neighbors when it has too little fire.
CREATE TABLE regions (
    id              TEXT PRIMARY KEY,             -- FIRMS spelling, e.g. South_Africa
    name            TEXT NOT NULL,                -- display name, e.g. South Africa
    status          TEXT NOT NULL DEFAULT 'pending', -- pending | ok | insufficient_data | error
    reason          TEXT,
    needs_harmonize BOOLEAN NOT NULL DEFAULT false,
    scope           TEXT,                         -- own | regional
    pooled_with     TEXT[] NOT NULL DEFAULT '{}',
    model           TEXT,
    energy_model    TEXT,
    quality         TEXT,                         -- good | review
    warnings        TEXT[] NOT NULL DEFAULT '{}',
    train_hotspots  INTEGER,
    exam_hotspots   INTEGER,
    exam_bias_pct   DOUBLE PRECISION,
    exam_r2         DOUBLE PRECISION,
    exam            JSONB,
    energy_exam     JSONB,
    jumps           JSONB,
    handover        DOUBLE PRECISION,
    lat_min         DOUBLE PRECISION,
    lat_max         DOUBLE PRECISION,
    lon_min         DOUBLE PRECISION,
    lon_max         DOUBLE PRECISION,
    centroid_lat    DOUBLE PRECISION,
    centroid_lon    DOUBLE PRECISION,
    first_month     DATE,
    last_month      DATE,
    harmonized_at   TIMESTAMPTZ,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Yearly archive files already ingested, to skip them on the next run.
CREATE TABLE ingest_files (
    name        TEXT PRIMARY KEY,
    updated     TEXT NOT NULL,
    detections  INTEGER NOT NULL,
    ingested_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Per sensor counts by 0.25° cell and month, before harmonization.
-- cell_lat/cell_lon are floor(degrees / 0.25).
CREATE TABLE sensor_cell_months (
    region_id TEXT     NOT NULL REFERENCES regions (id) ON DELETE CASCADE,
    sensor    TEXT     NOT NULL, -- aqua | snpp | n20
    cell_lat  SMALLINT NOT NULL,
    cell_lon  SMALLINT NOT NULL,
    month     DATE     NOT NULL,
    hotspots  REAL     NOT NULL,
    day       REAL     NOT NULL,
    night     REAL     NOT NULL,
    frp       REAL     NOT NULL,
    PRIMARY KEY (region_id, sensor, month, cell_lat, cell_lon)
);
CREATE INDEX sensor_cell_months_cell_idx ON sensor_cell_months (sensor, cell_lat, cell_lon, month);

-- The harmonized series of the archive years: one source per month.
CREATE TABLE cell_months (
    region_id TEXT     NOT NULL REFERENCES regions (id) ON DELETE CASCADE,
    cell_lat  SMALLINT NOT NULL,
    cell_lon  SMALLINT NOT NULL,
    month     DATE     NOT NULL,
    hotspots  REAL     NOT NULL,
    frp       REAL     NOT NULL,
    source    TEXT     NOT NULL, -- aqua_harmonized | viirs_snpp
    PRIMARY KEY (region_id, month, cell_lat, cell_lon)
);
CREATE INDEX cell_months_cell_idx ON cell_months (cell_lat, cell_lon, month);
CREATE INDEX cell_months_month_idx ON cell_months (month);

-- Global VIIRS after the yearly archive, from the area API, by cell and day.
-- VIIRS is the reference sensor, so it needs no model.
CREATE TABLE recent_cell_days (
    day         DATE     NOT NULL,
    cell_lat    SMALLINT NOT NULL,
    cell_lon    SMALLINT NOT NULL,
    hotspots    REAL     NOT NULL,
    frp         REAL     NOT NULL,
    provisional BOOLEAN  NOT NULL,
    PRIMARY KEY (day, cell_lat, cell_lon)
);
CREATE INDEX recent_cell_days_cell_idx ON recent_cell_days (cell_lat, cell_lon, day);

-- Which source each recent day was fetched from. Standard (SP) days are
-- final; near real time (NRT) days are fetched again until SP replaces them.
CREATE TABLE recent_days (
    day        DATE PRIMARY KEY,
    source     TEXT        NOT NULL,
    final      BOOLEAN     NOT NULL,
    detections INTEGER     NOT NULL,
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Positions (in 0.01°) FIRMS classified as static sources (type 2) in recent
-- archive years, used to clean near real time data, which has no type yet.
CREATE TABLE fixed_sources (
    lat_c INTEGER NOT NULL,
    lon_c INTEGER NOT NULL,
    PRIMARY KEY (lat_c, lon_c)
);

-- Key-value state of the ingest (archive_end, last runs).
CREATE TABLE ingest_state (
    key        TEXT PRIMARY KEY,
    value      TEXT        NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
