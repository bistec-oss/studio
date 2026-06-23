// Provision the disposable E2E test database: create it (idempotent), apply all
// migrations, and seed the baseline (admin + Bistec kit + Hearts Talk kit + the
// keyless 'cli' COPY provider the brief flow validates against).
//
// Usage: npm run test:e2e:db
// Requires: the Postgres container running and .env.test present.
// Override the container name with POSTGRES_CONTAINER if it differs.
import { execSync } from 'node:child_process'

const TEST_DB_URL = 'postgresql://bistec:bistec@localhost:5432/bistec_studio_test'
const CONTAINER = process.env.POSTGRES_CONTAINER ?? 'designer-postgres-1'

function run(cmd, env) {
  console.log(`\n$ ${cmd}`)
  execSync(cmd, { stdio: 'inherit', env: { ...process.env, ...env } })
}

// 1. Create the database (ignore "already exists").
try {
  run(`docker exec ${CONTAINER} psql -U bistec -d postgres -c "CREATE DATABASE bistec_studio_test;"`)
} catch {
  console.log('(test database already exists — continuing)')
}

// 2. Apply migrations against the test DB.
run('npx prisma migrate deploy', { DATABASE_URL: TEST_DB_URL })

// 3. Seed the baseline (each script reads DATABASE_URL etc. from .env.test).
for (const script of ['seed-admin', 'seed-brandkit', 'seed-hearts-talk', 'seed-cli-provider']) {
  run(`node --env-file=.env.test scripts/${script}.mjs`)
}

console.log('\n✅ Test database ready.')
