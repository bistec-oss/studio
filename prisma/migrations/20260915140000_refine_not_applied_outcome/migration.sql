-- FR-12/13/14 (design instruction fidelity): the "couldn't apply" outcome, and
-- retention of the render that was rejected.
--
-- A refine that runs cleanly but does not do what was asked is verified, retried
-- once, and — if it misses again — NOT applied: the revision chain and
-- Draft.currentRevisionNumber are left exactly as they were (FR-12).
--
-- 1. Draft.notAppliedReason carries that outcome. It is deliberately NOT
--    pendingActionError: "the model did not do what you asked" must read
--    differently from "the run crashed", and the poll surfaces it as its own
--    hard failure rather than as a soft warning on a committed revision (FR-14).
--
-- 2. The rejected render is retained out-of-chain as a DraftRevision row rather
--    than in a new table — DraftRevision already has the right shape (FR-13).
--    It is labelled with the instruction (existing column), its classes, and the
--    verifier's stated miss.
--
-- Numbering: a rejected row is numbered NEGATIVELY, in a space disjoint from the
-- chain's positive numbers. This is the load-bearing detail.
--   * It cannot collide with a chain number, and it cannot burn one: the chain
--     stays contiguous, so a twice-failed refine leaves no gap (FR-12).
--   * (draftId, revisionNumber) still identifies exactly ONE row, so a lookup by
--     number — the restore route's, for instance — can never resolve to a
--     rejected render by accident.
--   * withNextRevisionNumber keeps working unchanged: MAX(revisionNumber) over a
--     draft that has any chain revision is still that chain's last number.
--     Filtering rejected rows there is correct AND required (it fixes the
--     no-chain-revisions-yet edge case) — which means the rule for every
--     consumer is the same one, "exclude rejected", with no exception to
--     remember.
-- The CHECK constraint below makes that discipline a database invariant instead
-- of a convention: an insert that tries to file a rejected render inside the
-- chain's number space fails loudly. It constrains rejected rows only, so every
-- existing row satisfies it trivially and it needs no data migration.

ALTER TABLE "Draft" ADD COLUMN "notAppliedReason" TEXT;

ALTER TABLE "DraftRevision" ADD COLUMN "rejected" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "DraftRevision" ADD COLUMN "rejectionReason" TEXT;
ALTER TABLE "DraftRevision" ADD COLUMN "instructionClasses" TEXT[];

ALTER TABLE "DraftRevision"
  ADD CONSTRAINT "DraftRevision_rejected_offchain_check"
  CHECK ("rejected" = false OR "revisionNumber" < 0);
