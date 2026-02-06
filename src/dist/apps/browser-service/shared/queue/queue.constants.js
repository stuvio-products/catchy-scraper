"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.QUEUE_CONFIG = exports.QUEUE_NAMES = void 0;
exports.QUEUE_NAMES = {
    SCRAPE_QUEUE: 'scrape-queue',
};
exports.QUEUE_CONFIG = {
    attempts: 3,
    backoff: {
        type: 'exponential',
        delay: 2000,
    },
    removeOnComplete: false,
    removeOnFail: false,
};
//# sourceMappingURL=queue.constants.js.map