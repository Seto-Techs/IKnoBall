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
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.betterAuthSchema = void 0;
exports.createDatabase = createDatabase;
const node_postgres_1 = require("drizzle-orm/node-postgres");
const pg_1 = require("pg");
const schema = __importStar(require("./schema.js"));
__exportStar(require("./schema.js"), exports);
const schema_js_1 = require("./schema.js");
/**
 * Schema object keyed by BetterAuth internal model names.
 *
 * BetterAuth models: `user`, `session`, `account`, `verification`
 * Our Drizzle table is named `users` (plural), so we alias it as `user`.
 */
exports.betterAuthSchema = {
    user: schema_js_1.users,
    session: schema_js_1.session,
    account: schema_js_1.account,
    verification: schema_js_1.verification,
};
function createDatabase(connectionString = process.env.DATABASE_URL) {
    if (!connectionString)
        throw new Error('DATABASE_URL is required');
    const pool = new pg_1.Pool({ connectionString });
    return { db: (0, node_postgres_1.drizzle)({ client: pool, schema }), pool };
}
