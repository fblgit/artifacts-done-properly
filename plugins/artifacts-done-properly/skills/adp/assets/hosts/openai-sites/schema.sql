-- Apply as a schema migration, never from a request handler.
CREATE TABLE adp_records (
  artifact TEXT NOT NULL,
  path TEXT NOT NULL,
  collection TEXT NOT NULL,
  data TEXT,
  revision INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (artifact, path)
);
CREATE INDEX adp_records_collection ON adp_records(artifact, collection);
