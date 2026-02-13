#!/bin/bash
set -e

# Wait for primary to be ready
until pg_isready -h db -p 5432 -U replicator; do
  echo "Waiting for primary database..."
  sleep 2
done

echo "Primary is ready. Starting replication setup..."

# Clean up data directory
rm -rf /var/lib/postgresql/data/*

# Take base backup
echo "Taking base backup from primary..."
PGPASSWORD=replicator_password pg_basebackup -h db -p 5432 -U replicator -D /var/lib/postgresql/data -Fp -Xs -P -R

echo "Backup complete. Configuring standby..."

# Create standby.signal (PostgreSQL 12+)
touch /var/lib/postgresql/data/standby.signal

# Start PostgreSQL
echo "Starting PostgreSQL in replica mode..."
exec docker-entrypoint.sh postgres
