# Seed assets

Binary/large assets read at runtime by the seed scripts in `../`.

## Hearts Talk (`seed-hearts-talk.mjs`)

| File | Required | Used for |
|---|---|---|
| `hearts-talk-1080x1080.html` | ✅ | The `BrandKitTemplate` (1080×1080, self-contained with embedded base64 imagery) |
| `hearts-academy-logo.png` | optional | `LOGO` artifact + set as `BrandKit.logoUrl` (primary) |
| `bistec-global-logo.png` | optional | `LOGO` artifact |

Logos are embedded as **`data:` URIs** in the DB (they never expire and need no MinIO).

### ⚠️ Action needed
- `bistec-global-logo.png` was copied from `Downloads/bistec-logo.png` as a **best-guess** — replace it with the official Bistec Global logo if that's not it.
- `hearts-academy-logo.png` is **not yet present** (it couldn't be retrieved from the chat attachment). Drop the official Hearts Academy heart logo here with that exact filename. The seed skips it with a warning until then; to attach it later, delete the seeded "Hearts Talk" kit and re-run.
