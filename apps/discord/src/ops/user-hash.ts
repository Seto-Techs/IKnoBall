import { createHmac, randomBytes } from 'node:crypto';

/**
 * The user id a log line may carry: a short, salted, one-way digest of the Discord
 * id, never the id itself.
 *
 * Why not a plain SHA-256 prefix. A Discord id is a snowflake — timestamp | worker
 * | increment — so the space of ids issued on a known day is small enough to
 * enumerate (roughly 10^9 for a day of traffic). An unkeyed hash of that space is
 * a dictionary attack on a GPU in minutes, which would turn "hashed" into
 * "trivially reversible" for exactly the ids a log is most likely to contain.
 *
 * So the digest is an HMAC keyed with 32 random bytes generated when the process
 * starts and never written anywhere — not to the log, not to an env file, not to
 * the database. Without the key there is nothing to enumerate against; with the
 * key, one guess still costs one HMAC per candidate, per process.
 *
 * What that costs, stated plainly: the same user has a different hash after a
 * restart, so a hash cannot be followed across deploys. Correlate across restarts
 * by the other fields on the line (guild, custom id, outcome) or by the Discord
 * audit log, not by the hash. Ten hex characters is 40 bits: two users colliding
 * inside one process's logs is not a practical concern, and the field stays short
 * enough to read.
 */
const SALT = randomBytes(32);

/** Hex characters kept: 40 bits, enough to keep the field short and still unique. */
const PREFIX_LENGTH = 10;

export function hashUserId(discordUserId: string): string {
  return createHmac('sha256', SALT).update(discordUserId).digest('hex').slice(0, PREFIX_LENGTH);
}
