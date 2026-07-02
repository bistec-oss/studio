// Provision the disposable E2E test database: create it (idempotent), apply all
// migrations, and seed the baseline (admin + Bistec kit + Hearts Talk kit + the
// keyless 'cli' COPY provider the brief flow validates against).
//
// Usage: npm run test:e2e:db
// Requires: the Postgres container running and .env.test present.
//
// Configuration:
//   - The test DB URL is derived from DATABASE_URL in .env.test (simple line
//     parse — no dotenv dependency). When .env.test is missing or has no
//     DATABASE_URL, the historical default below is used as a fallback.
//   - Override the Postgres container name with POSTGRES_CONTAINER if it
//     differs from the docker-compose default (designer-postgres-1).
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const FALLBACK_DB_URL = 'postgresql://bistec:bistec@localhost:5432/bistec_studio_test'

// Minimal .env line parser: first `DATABASE_URL=...` line wins. Tolerates
// optional surrounding single/double quotes on the value.
function readEnvTestDatabaseUrl() {
  try {
    const lines = readFileSync(new URL('../.env.test', import.meta.url), 'utf8').split(/\r?\n/)
    for (const line of lines) {
      const match = line.match(/^\s*DATABASE_URL\s*=\s*(.*)\s*$/)
      if (match) {
        const value = match[1].trim().replace(/^(['"])(.*)\1$/, '$2')
        if (value) return value
      }
    }
  } catch {
    // .env.test absent/unreadable — fall through to the historical default.
  }
  return null
}

const ENV_DB_URL = readEnvTestDatabaseUrl()
const TEST_DB_URL = ENV_DB_URL ?? FALLBACK_DB_URL
const TEST_DB_NAME = new URL(TEST_DB_URL).pathname.replace(/^\//, '') || 'bistec_studio_test'
const CONTAINER = process.env.POSTGRES_CONTAINER ?? 'designer-postgres-1'

console.log(`Test DB: ${TEST_DB_NAME} (from ${ENV_DB_URL ? '.env.test DATABASE_URL' : 'built-in fallback'})`)

function run(cmd, env) {
  console.log(`\n$ ${cmd}`)
  execSync(cmd, { stdio: 'inherit', env: { ...process.env, ...env } })
}

// 1. Create the database (ignore "already exists").
try {
  run(`docker exec ${CONTAINER} psql -U bistec -d postgres -c "CREATE DATABASE ${TEST_DB_NAME};"`)
} catch {
  console.log('(test database already exists — continuing)')
}

// 2. Apply migrations against the test DB.
run('npx prisma migrate deploy', { DATABASE_URL: TEST_DB_URL })

// 3. Seed the baseline (each script reads DATABASE_URL etc. from .env.test).
//    seed-editor adds the non-admin account the RBAC/IDOR E2E tests log in as.
//    SEED_FIXED_CREDENTIALS=true keeps seed-admin's fixed test password (the
//    E2E helpers log in with it) instead of generating a random one.
for (const script of ['seed-admin', 'seed-editor', 'seed-brandkit', 'seed-hearts-talk', 'seed-cli-provider']) {
  run(`node --env-file=.env.test scripts/${script}.mjs`, { SEED_FIXED_CREDENTIALS: 'true' })
}

console.log('\n✅ Test database ready.')
