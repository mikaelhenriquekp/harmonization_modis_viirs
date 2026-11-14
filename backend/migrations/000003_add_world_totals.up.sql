-- Whole-world totals, refreshed by the ingest, so world-wide questions do not
-- have to sum every cell of every country.
CREATE TABLE world_months (
    month    DATE PRIMARY KEY,
    hotspots REAL NOT NULL,
    frp      REAL NOT NULL,
    source   TEXT NOT NULL
);

CREATE TABLE world_sensor_months (
    sensor   TEXT NOT NULL,
    month    DATE NOT NULL,
    hotspots REAL NOT NULL,
    PRIMARY KEY (sensor, month)
);
