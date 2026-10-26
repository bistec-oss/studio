# T4 gate: 019-draft-action-claim-token

HEAD: 7e86b96 (branch v2). Mechanical run, no source edits, no commits.

## 1. Prepare

- `taskkill //F //IM node.exe`: `SUCCESS: The process "node.exe" with PID 16472 has been terminated.` (earlier stray kill returned only the TASKKILL usage line, meaning no process matched)
- `rm -rf .next`: no output
- `DROP DATABASE IF EXISTS bistec_studio_test WITH (FORCE);` output: `DROP DATABASE`
- `npm run test:e2e:db` (`.env.test` DATABASE_URL confirmed as `.../bistec_studio_test`):
  ```
  Created brand kit "Hearts Talk" (cmvgtj79v0000kj9o3zfy4sal)
  CLI copy provider ready: Claude CLI (local, no API key) (key=cli, default=true)
  ✅ Test database ready.
  ```

## 2. Server

- `npm run test:e2e:serve` (log: `C:\Users\Damian\AppData\Local\Temp\claude\D--studio\48c504d6-5d29-43d8-bbec-6c3519f0da8a\scratchpad\e2e-serve.log`)
- `GET http://localhost:3001/login` answered `200` on the first poll.
  ```
  ✓ Ready in 343ms
  GET /login 200 in 2.0s
  ```

## 3. Full mock E2E (`npm run test:e2e:mock`, exit 0)

Log: `C:\Users\Damian\AppData\Local\Temp\claude\D--studio\48c504d6-5d29-43d8-bbec-6c3519f0da8a\scratchpad\e2e-mock.log`

```
  3 skipped
  397 passed (9.2m)
```

- passed 397, skipped 3, failed 0, flaky 0 (no `failed`/`flaky`/`✘` summary lines; the only "failed" matches are test titles that passed).
- Rerun of individual files: not needed.

## 4. Stop

- `pkill -f "next dev"` then `taskkill //F //IM node.exe`: `SUCCESS: The process "node.exe" with PID 16472 has been terminated.`

## 5. Gates

- `npx tsc --noEmit`: exit 0, no output.
- `npm run lint`: exit 0. `✖ 7 problems (0 errors, 7 warnings)`
- `npm run test:unit`: exit 0. `Tests  2681 passed (2681)`
- `npm run build`: exit 0. Route table printed (`○ (Static)` / `ƒ (Dynamic)`).
- `rm -rf .next` after build.
- `npm run test:upgrade`: exit 0. `ALL PASS in 44.4s` (scratch DB is `bistec_studio_upgrade`, dropped at the end; the script refuses any other DB name).
- `next-env.d.ts`: modified by the build, restored with `git checkout -- next-env.d.ts`.

## 6. Greps

1. `grep -rnE "pendingAction: (action|claimedAction)\b" src`: **empty** (expected).
2. `grep -rn "pendingAction: 'REGENERATE_COPY'" src/lib/captions/store.ts`: **empty** (expected).
3. `grep -rln pendingActionClaimId src`:
   ```
   src/app/api/drafts/[id]/route.ts
   src/lib/drafts/claim.ts
   ```
4. `grep -n claimId src/lib/api-types.ts`: **empty** (expected).
5. `git diff --name-only f8ebee2 | grep -E "^src/components/|^src/app/\(app\)/|^src/scheduler/|recovery\.ts|models/budget\.ts"`: **empty** (expected). Only git CRLF warnings on `.specclaw/...` files were printed to stderr.
6. `git diff --stat f8ebee2 -- tests/unit/draftRecovery.test.ts`: **empty** (no change to that file since f8ebee2).

## Result

All gates pass. E2E 397 passed / 3 skipped / 0 failed / 0 flaky, matching the baseline. No failures to report.

Git status after the gate: only the four pre-existing `.specclaw/changes/019-draft-action-claim-token/` files (state.json, status.md, tasks.md, timeline.jsonl) remain modified, plus this report file. No source, test or doc file was edited.
