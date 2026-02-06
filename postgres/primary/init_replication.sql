CREATE USER replicator WITH REPLICATION ENCRYPTED PASSWORD 'replicator_password';
SELECT * FROM pg_create_physical_replication_slot('replication_slot');
