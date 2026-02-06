#!/bin/bash
set -e

# Enable pgvector extension
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    -- Enable pgvector extension
    CREATE EXTENSION IF NOT EXISTS vector;
EOSQL

# Create replication user
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    -- Create replication user
    CREATE USER replicator WITH REPLICATION ENCRYPTED PASSWORD 'replicator_password';
    
    -- Grant necessary permissions
    GRANT ALL PRIVILEGES ON DATABASE catchy_db TO replicator;
EOSQL

# Update pg_hba.conf for replication access
echo "host replication replicator 0.0.0.0/0 md5" >> "$PGDATA/pg_hba.conf"

# Reload PostgreSQL configuration
pg_ctl reload -D "$PGDATA"

echo "✅ PostgreSQL Primary initialized with replication user"
