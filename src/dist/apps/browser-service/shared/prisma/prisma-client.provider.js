"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.prisma = void 0;
const pg_1 = require("pg");
const client_1 = require("@prisma/client");
const adapter_pg_1 = require("@prisma/adapter-pg");
const extension_read_replicas_1 = require("@prisma/extension-read-replicas");
const database_config_1 = require("./database.config");
function createPrisma() {
    console.log('PrismaProvider: Creating Prisma Client...');
    if (database_config_1.IS_PRODUCTION_DB) {
        console.log('🔴 Using PRODUCTION database (USE_PRODUCTION_DB is enabled)');
    }
    else {
        console.log('🟢 Using LOCAL database (default)');
    }
    const mainPool = new pg_1.Pool({ connectionString: database_config_1.ACTUAL_DATABASE_URL });
    const replicaPool = new pg_1.Pool({ connectionString: database_config_1.ACTUAL_REPLICA_DATABASE_URL });
    const mainAdapter = new adapter_pg_1.PrismaPg(mainPool);
    const replicaAdapter = new adapter_pg_1.PrismaPg(replicaPool);
    const main = new client_1.PrismaClient({ adapter: mainAdapter });
    const replica = new client_1.PrismaClient({ adapter: replicaAdapter });
    return main.$extends((0, extension_read_replicas_1.readReplicas)({
        replicas: [replica],
    }));
}
exports.prisma = global.prisma ?? createPrisma();
if (process.env.NODE_ENV !== 'production') {
    global.prisma = exports.prisma;
}
//# sourceMappingURL=prisma-client.provider.js.map