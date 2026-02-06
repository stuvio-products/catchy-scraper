"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.validationSchema = void 0;
const Joi = __importStar(require("joi"));
exports.validationSchema = Joi.object({
    NODE_ENV: Joi.string()
        .valid('development', 'production', 'test')
        .default('development'),
    REDIS_HOST: Joi.string().default('localhost'),
    REDIS_PORT: Joi.number().default(6379),
    API_PORT: Joi.number().default(3000),
    API_KEY: Joi.string().required(),
    WORKER_CONCURRENCY: Joi.number().min(1).max(20).default(4),
    BROWSER_SERVICE_PORT: Joi.number().default(3001),
    BROWSER_SERVICE_API_KEY: Joi.string().required(),
    BROWSER_COUNT: Joi.number().min(1).max(10).default(4),
    BROWSER_HEADLESS: Joi.boolean().default(true),
    BROWSER_TIMEOUT_MS: Joi.number().min(5000).max(60000).default(30000),
    PROXY_PROVIDER: Joi.string().valid('fake').default('fake'),
    FAKE_PROXY_COST_PER_MB: Joi.number().min(0).default(0.001),
    FAKE_PROXY_FAILURE_RATE: Joi.number().min(0).max(1).default(0.05),
});
//# sourceMappingURL=env.validation.js.map