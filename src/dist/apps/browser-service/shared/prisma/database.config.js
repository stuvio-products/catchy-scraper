"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IS_PRODUCTION_DB = exports.ACTUAL_REPLICA_DATABASE_URL = exports.ACTUAL_DATABASE_URL = void 0;
require("dotenv/config");
const isProductionEnv = process.env.NODE_ENV === 'production';
const useProductionDb = !isProductionEnv &&
    (process.env.USE_PRODUCTION_DB === 'true' ||
        process.env.USE_PRODUCTION_DB === '1');
const databaseUrl = useProductionDb
    ? process.env.PRODUCTION_DATABASE_URL || process.env.DATABASE_URL
    : process.env.DATABASE_URL;
const replicaUrl = useProductionDb
    ? process.env.PRODUCTION_DATABASE_REPLICA_URL ||
        process.env.DATABASE_REPLICA_URL
    : process.env.DATABASE_REPLICA_URL;
if (!databaseUrl) {
    throw new Error(`DATABASE_URL is not set. Please configure it in docker-compose.prod.yml or .env file.${useProductionDb
        ? ' For production, set PRODUCTION_DATABASE_URL or DATABASE_URL.'
        : ''}`);
}
if (!replicaUrl) {
    throw new Error(`DATABASE_REPLICA_URL is not set. Please configure it in docker-compose.prod.yml or .env file.${useProductionDb
        ? ' For production, set PRODUCTION_DATABASE_REPLICA_URL or DATABASE_REPLICA_URL.'
        : ''}`);
}
exports.ACTUAL_DATABASE_URL = databaseUrl;
exports.ACTUAL_REPLICA_DATABASE_URL = replicaUrl;
exports.IS_PRODUCTION_DB = useProductionDb;
//# sourceMappingURL=database.config.js.map