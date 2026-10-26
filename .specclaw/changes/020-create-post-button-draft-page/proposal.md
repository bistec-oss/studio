# Proposal: Hide the floating Create post button on the draft page

**Created:** 2026-10-13
**Status:** 🟡 Draft

## Problem

The floating **Create post** button (`src/components/layout/CreatePostButton.tsx:27-28`, `fixed bottom-7 right-7 z-30`) covers whatever sits in the bottom-right corner of the viewport until the page is scrolled.

The 014 captures show it over the refine **Send** button on the draft page at 1440 px, and over body text at 375 px. The bottom padding on `main` (`pb-[140px]`) only clears the end of the page, not the corner while the user is mid-scroll.

## Proposed Solution

**Hide the button on `/drafts/[id]`** (user decision, 2026-10-13). The draft page has its own primary actions, and it is where the overlap hurts most, over the refine input. The button stays on every other page except `/brief`, where it is already hidden.

This amends **011 AC-01**, which required the button on the draft page:

- `tests/e2e/create-post-button.test.ts:105-126` changes from "present on /drafts/[id]" to "absent on /drafts/[id]";
- a new viewport check (not full-page) asserts that the refine Send button is not covered at 1440×900.

**Docs:**

- `DESIGN_SYSTEM.md`: the button's placement rule;
- the 011 spec note;
- `docs/e2e-test-plan.md`.

## Scope

### In Scope

The draft-page exclusion, its tests and its docs.

### Out of Scope

The hide-on-scroll and icon-only variants, which were not chosen.

## Impact

- **Size:** bounded
- **Files affected:** about 5
- **Complexity:** small
- **Risk:** low

## Open Questions

None.
