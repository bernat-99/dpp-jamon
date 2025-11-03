CREATE EXTENSION IF NOT EXISTS timescaledb;

CREATE TABLE gln_site(
  gln TEXT PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL
);
CREATE TABLE lot(
  lot_id TEXT PRIMARY KEY, lot_type TEXT NOT NULL, source_gln TEXT REFERENCES gln_site(gln)
);
CREATE TABLE animal(
  animal_id TEXT PRIMARY KEY, pedigree_id TEXT, birth_date DATE, birth_gln TEXT REFERENCES gln_site(gln),
  breed TEXT, diet TEXT
);
CREATE TABLE piece(
  piece_id TEXT PRIMARY KEY, gtin TEXT NOT NULL, kind TEXT NOT NULL,
  from_animal TEXT REFERENCES animal(animal_id), current_lot TEXT REFERENCES lot(lot_id)
);
CREATE TABLE epcis_event(
  event_id TEXT PRIMARY KEY, piece_id TEXT REFERENCES piece(piece_id),
  lot_id TEXT REFERENCES lot(lot_id), event_time TIMESTAMPTZ NOT NULL,
  event_type TEXT NOT NULL, payload JSONB NOT NULL
);
CREATE TABLE iot_reading(
  ts TIMESTAMPTZ NOT NULL, gln TEXT REFERENCES gln_site(gln), lot_id TEXT REFERENCES lot(lot_id),
  temperature_c NUMERIC, humidity_pct NUMERIC, co2_ppm NUMERIC,
  PRIMARY KEY(ts,gln,lot_id)
);
SELECT create_hypertable('iot_reading','ts', if_not_exists => TRUE);

-- Agregado diario (snapshot ambiental)
CREATE MATERIALIZED VIEW agg_room_daily
WITH (timescaledb.continuous) AS
SELECT time_bucket('1 day', ts) AS day, gln, lot_id,
       avg(temperature_c) t_avg, avg(humidity_pct) h_avg, avg(co2_ppm) co2_avg
FROM iot_reading GROUP BY 1,2,3;

-- Manifiestos publicados
CREATE TABLE manifest_publish(
  id SERIAL PRIMARY KEY, piece_id TEXT, lot_id TEXT, kind TEXT NOT NULL,
  seq INTEGER NOT NULL, cid TEXT NOT NULL, sha256 BYTEA NOT NULL,
  iota_object_id TEXT, created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE dpp_links(
  gtin CHAR(14) NOT NULL,
  lot TEXT NOT NULL,
  serial TEXT NOT NULL,
  dynamic_id TEXT NOT NULL,
  locked_id TEXT NOT NULL DEFAULT 'PENDING',
  PRIMARY KEY (gtin, lot, serial)
);
