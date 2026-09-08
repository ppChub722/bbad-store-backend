/**
 * Secrets and signing keys, read from the environment.
 *
 * About the fallback below: it is published in this repository on purpose, and
 * the public demo runs on it. Nothing is protected by it there. The three demo
 * accounts are listed in the README with a shared password and a button each on
 * the login page, the catalogue is generated sample data, there is no admin
 * role to escalate into, and writes are held in memory and dropped when the
 * process restarts. Forging a token buys an attacker exactly what clicking
 * "USER: Fizri" already gives them.
 *
 * It stops being harmless the moment MONGODB_URI points at a database with real
 * accounts in it. A forged token would then be a way into any of them, so the
 * warning below fires in that case and only in that case.
 */

const FALLBACK_JWT_SECRET = 'local-dev-secret-change-in-production';

const JWT_SECRET = process.env.JWT_SECRET || FALLBACK_JWT_SECRET;

if (JWT_SECRET === FALLBACK_JWT_SECRET && process.env.MONGODB_URI) {
  console.warn(
    '[secrets] JWT_SECRET is not set, so tokens are signed with the key ' +
      'published in this repository — but a real database is configured. ' +
      'Anyone can mint a token for any account. Set JWT_SECRET.'
  );
}

const TOKEN_EXPIRES_IN_SECONDS = Number(process.env.JWT_EXPIRES_IN || 3600);

module.exports = { JWT_SECRET, TOKEN_EXPIRES_IN_SECONDS };
