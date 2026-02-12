#!/bin/bash
# =============================================================================
# PostgreSQL Primary Init Script
# =============================================================================
# This runs once when the primary DB container is first initialized.
# It sets up:
#   - pgvector extension (for vector similarity search)
#   - pg_trgm extension (for trigram-based text search)
#   - Replication user for read replicas
#   - WAL-level configuration for streaming replication

set -e

echo "🔧 [Primary Init] Starting primary database initialization..."

# ─── Enable Extensions ──────────────────────────────────────────────────────
echo "📦 [Primary Init] Enabling extensions..."

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    -- Vector similarity search (pgvector)
    CREATE EXTENSION IF NOT EXISTS vector;

    -- Trigram text search (pg_trgm) — for GIN trigram indexes
    CREATE EXTENSION IF NOT EXISTS pg_trgm;

    -- UUID generation
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

    SELECT 'Extensions enabled: vector, pg_trgm, uuid-ossp' AS status;
EOSQL

echo "✅ [Primary Init] Extensions enabled."

# ─── Create Replication User ────────────────────────────────────────────────
echo "👤 [Primary Init] Creating replication user..."

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    -- Create replication user if it doesn't exist
    DO \$\$
    BEGIN
        IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '${REPLICATOR_USER}') THEN
            CREATE USER ${REPLICATOR_USER} WITH REPLICATION ENCRYPTED PASSWORD '${REPLICATOR_PASSWORD}';
            RAISE NOTICE 'Replication user "%" created', '${REPLICATOR_USER}';
        ELSE
            -- Update password in case it changed
            ALTER USER ${REPLICATOR_USER} WITH ENCRYPTED PASSWORD '${REPLICATOR_PASSWORD}';
            RAISE NOTICE 'Replication user "%" already exists, password updated', '${REPLICATOR_USER}';
        END IF;
    END
    \$\$;
EOSQL

echo "✅ [Primary Init] Replication user configured."

# ─── Configure pg_hba.conf for Replication ───────────────────────────────────
echo "🔐 [Primary Init] Configuring pg_hba.conf for replication..."

# Allow replication connections from any host in the Docker network
echo "host replication ${REPLICATOR_USER} 0.0.0.0/0 md5" >> "$PGDATA/pg_hba.conf"
echo "host all all 0.0.0.0/0 md5" >> "$PGDATA/pg_hba.conf"

echo "✅ [Primary Init] pg_hba.conf configured."

# ─── Configure postgresql.conf for Replication ──────────────────────────────
echo "⚙️  [Primary Init] Configuring postgresql.conf for replication..."

cat >> "$PGDATA/postgresql.conf" <<EOF

# ── Replication Settings ──
wal_level = replica
max_wal_senders = 5
wal_keep_size = 64
hot_standby = on
EOF

echo "✅ [Primary Init] postgresql.conf configured."
echo "🎉 [Primary Init] Primary database initialization complete!"
