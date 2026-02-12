#!/bin/bash
# =============================================================================
# PostgreSQL Replica Init Script
# =============================================================================
# This runs once when the replica DB container is first initialized.
# It configures streaming replication from the primary server.
# The replica will be a hot standby (read-only).

set -e

echo "🔧 [Replica Init] Starting replica database initialization..."

# ─── Wait for Primary ───────────────────────────────────────────────────────
PRIMARY_HOST="${PRIMARY_HOST:-db}"
echo "⏳ [Replica Init] Waiting for primary at ${PRIMARY_HOST}:5432..."

MAX_RETRIES=30
RETRY=0
until PGPASSWORD="${POSTGRES_PASSWORD}" pg_isready -h "${PRIMARY_HOST}" -p 5432 -U "${POSTGRES_USER}" 2>/dev/null; do
    RETRY=$((RETRY + 1))
    if [ "$RETRY" -ge "$MAX_RETRIES" ]; then
        echo "❌ [Replica Init] Primary not available after ${MAX_RETRIES} attempts. Exiting."
        exit 1
    fi
    echo "   Attempt ${RETRY}/${MAX_RETRIES} - Primary not ready, retrying in 2s..."
    sleep 2
done

echo "✅ [Replica Init] Primary is ready."

# ─── Check if Already a Replica ─────────────────────────────────────────────
if [ -f "$PGDATA/standby.signal" ]; then
    echo "ℹ️  [Replica Init] Already configured as a replica. Skipping base backup."
    exit 0
fi

# ─── Stop PostgreSQL to Reconfigure ─────────────────────────────────────────
echo "🛑 [Replica Init] Stopping PostgreSQL for base backup..."
pg_ctl -D "$PGDATA" -m fast -w stop || true

# ─── Clean Data Directory ───────────────────────────────────────────────────
echo "🧹 [Replica Init] Cleaning data directory..."
rm -rf "$PGDATA"/*

# ─── Take Base Backup from Primary ──────────────────────────────────────────
echo "📥 [Replica Init] Taking base backup from primary..."

PGPASSWORD="${REPLICATOR_PASSWORD}" pg_basebackup \
    -h "${PRIMARY_HOST}" \
    -p 5432 \
    -U "${REPLICATOR_USER}" \
    -D "$PGDATA" \
    -Fp \
    -Xs \
    -P \
    -R

echo "✅ [Replica Init] Base backup complete."

# ─── Configure Replica ──────────────────────────────────────────────────────
echo "⚙️  [Replica Init] Configuring replica settings..."

# Create standby signal
touch "$PGDATA/standby.signal"

# Ensure primary_conninfo is set in postgresql.auto.conf
cat >> "$PGDATA/postgresql.auto.conf" <<EOF
primary_conninfo = 'host=${PRIMARY_HOST} port=5432 user=${REPLICATOR_USER} password=${REPLICATOR_PASSWORD}'
hot_standby = on
EOF

echo "✅ [Replica Init] Replica configured."

# ─── Start PostgreSQL in Replica Mode ────────────────────────────────────────
echo "🚀 [Replica Init] Starting PostgreSQL in replica mode..."
pg_ctl -D "$PGDATA" -w start

echo "🎉 [Replica Init] Replica initialization complete! Hot standby is active."
