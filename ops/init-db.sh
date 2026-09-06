#!/bin/sh
set -eu
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres --set=relayer_password="$RELAYER_DB_PASSWORD" --set=indexer_password="$INDEXER_DB_PASSWORD" <<'SQL'
CREATE ROLE pong_relayer LOGIN PASSWORD :'relayer_password';
CREATE ROLE pong_indexer LOGIN PASSWORD :'indexer_password';
CREATE DATABASE pong_relayer OWNER pong_relayer;
CREATE DATABASE pong_indexer OWNER pong_indexer;
REVOKE CONNECT ON DATABASE pong_relayer FROM PUBLIC;
REVOKE CONNECT ON DATABASE pong_indexer FROM PUBLIC;
GRANT CONNECT ON DATABASE pong_relayer TO pong_relayer;
GRANT CONNECT ON DATABASE pong_indexer TO pong_indexer;
SQL
