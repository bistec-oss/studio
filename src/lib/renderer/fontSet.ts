// Font-set identifier (T8, change 004 Phase 1, FR-22): stamped on Draft
// alongside promptVersion so a render's glyph environment is attributable
// after the fact. The Dockerfile runner stage installs fonts (font-noto-sinhala,
// font-noto-symbols — see T7) OS-wide via Alpine's apk; Chromium's fontconfig
// fallback picks them up automatically with no per-render config, which is
// exactly why a change to the installed set can silently change how an
// already-approved draft renders (spec: unavoidable, not per-kit overridable —
// this makes it attributable, not preventable).
//
// Source of truth: Alpine's apk package database at /lib/apk/db/installed,
// a flat text format of blank-line-separated package records, each a set of
// "X:value" lines (P: name, V: version, among others we don't care about).
// We take every package whose name starts with "font-", pair it with its
// version, sort for order-independence, and sha256 the joined list.
//
// Dev machines here are Windows (no apk, no fc-list) and CI runs Ubuntu — the
// file legitimately doesn't exist off Alpine, so absence is the NORMAL case
// outside the built image, not an error: getFontSetId returns null and callers
// tolerate it (spec: "absent, not wrong").

import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

const APK_DB_PATH = '/lib/apk/db/installed'

// Pure — no I/O — so this is unit-testable without a filesystem or an Alpine
// image. Exported separately from getFontSetId for exactly that reason.
export function fontSetIdFromApkDb(text: string): string | null {
  const fontPackages: string[] = []
  let sawAnyPackage = false
  let currentName: string | null = null

  // Package records are separated by blank lines; within one, order of the
  // "X:" fields isn't guaranteed, so track name/version independently as we
  // scan and commit the pair when the record ends (blank line or EOF).
  let currentVersion: string | null = null
  const commit = () => {
    if (currentName) {
      sawAnyPackage = true
      if (currentName.startsWith('font-')) {
        fontPackages.push(`${currentName}@${currentVersion ?? ''}`)
      }
    }
    currentName = null
    currentVersion = null
  }

  for (const line of text.split('\n')) {
    if (line.trim() === '') {
      commit()
      continue
    }
    if (line.startsWith('P:')) currentName = line.slice(2).trim()
    else if (line.startsWith('V:')) currentVersion = line.slice(2).trim()
  }
  commit()

  // No package records at all — either an empty string or text that isn't an
  // apk db (garbage). Nothing meaningful to digest, so behave like "absent":
  // null, same as when the file itself doesn't exist.
  if (!sawAnyPackage) return null

  // Packages exist but none are fonts: a real, deterministic state (distinct
  // from "couldn't parse anything"), so it gets a real id rather than null —
  // a stable id for "no font packages installed" is more informative than
  // collapsing it into the same null as "unknown/unparseable".
  fontPackages.sort()
  const digest = createHash('sha256').update(fontPackages.join(',')).digest('hex')
  return `apk:${digest.slice(0, 12)}`
}

let cached: string | null | undefined // undefined = not yet computed

// Computed once per process and memoized — the installed font set doesn't
// change without a redeploy, so there's no reason to re-read the apk db on
// every render. Never throws: any read failure (including the expected
// ENOENT off Alpine) yields null, which is a valid, spec-sanctioned value.
export function getFontSetId(): string | null {
  if (cached !== undefined) return cached
  try {
    const text = readFileSync(APK_DB_PATH, 'utf8')
    cached = fontSetIdFromApkDb(text)
  } catch (err) {
    // ENOENT is the expected case everywhere except the built Alpine image
    // (Windows dev machines, Ubuntu CI) — not worth logging. Anything else
    // (e.g. a permissions error on a host that DOES have the file) is
    // unexpected and worth one log line, never more since we cache regardless.
    const code = (err as NodeJS.ErrnoException)?.code
    if (code !== 'ENOENT') {
      console.warn('[fontSet] failed to read apk database, proceeding without a font-set id:', err)
    }
    cached = null
  }
  return cached
}
