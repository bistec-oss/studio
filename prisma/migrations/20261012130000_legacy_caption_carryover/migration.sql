-- 022 FR-01: carry legacy single captions over to per-channel captions, so a
-- database coming from `main` survives 016's drop.
--
-- WHY IT IS BACK-DATED. This file was written after 016, but its timestamp
-- sorts it after 20261012120000_model_selection and BEFORE
-- 20261013120000_drop_legacy_captions. On a database coming from `main`
-- (company prod: migration head 20260728120000, every caption still in
-- Draft."copyText", no DraftCaption rows) it therefore runs inside the same
-- `migrate deploy`, before 016's guard looks for unconverted drafts. The 012
-- boot backfill that used to convert them was removed by 016, so without this
-- file that guard fails the boot.
--
-- WHY IT IS CONDITIONAL. Databases that already applied 016 (the fork-era dev,
-- test and CI databases) have no "copyText" column left. On those it is an
-- out-of-order no-op: it creates the empty archive table and nothing else.
--
-- PROD IS CONVERTED BY COPY, NOT BY THE 012 SPLIT (022 ruling 1). Every
-- unconverted draft gets the whole "copyText", verbatim and untrimmed, on
-- Instagram and LinkedIn (the two channels a `main` publish sends it to, as
-- the 012 planner's fallback did) and '' on WhatsApp. A blank caption (empty
-- or whitespace only) becomes '' on every channel (012's EMPTY outcome). Users
-- edit each channel afterwards.
--
-- THE ARCHIVE. "LegacyCaptionArchive" keeps every non-null "copyText" that 016
-- is about to drop, including drafts that already have caption rows, so a
-- better split can be applied later as its own change. It has no foreign key
-- to "Draft" on purpose: a recovery record must survive a draft delete and
-- must never block one. Nothing ever drops it.
--
-- THE GUARD. After writing, a content guard re-reads the result and raises
-- '022 legacy_caption_carryover: …' unless the archive matches the source and
-- every converted draft has exactly the three expected rows. The whole file is
-- ONE statement (a single DO block, table creation included), so a raised
-- guard leaves no table, no archive rows and no caption rows behind, and 016
-- never runs. Recovery after a failure: fix the cause, then
-- `prisma migrate resolve --rolled-back 20261012130000_legacy_caption_carryover`
-- and redeploy.
--
-- Uses only md5() and plpgsql: no extension, no Postgres-version dependency.

DO $$
DECLARE
  converted TEXT[];
  problem   TEXT;
BEGIN
  -- Created on every run, whatever the database's state (FR-01). Names match
  -- what Prisma generates for model LegacyCaptionArchive, so a later
  -- `prisma migrate diff` is clean.
  CREATE TABLE "LegacyCaptionArchive" (
    "draftId" TEXT NOT NULL,
    "copyText" TEXT NOT NULL,
    "archivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LegacyCaptionArchive_pkey" PRIMARY KEY ("draftId")
  );

  -- Conditional: nothing more to do once "copyText" is gone.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'Draft'
      AND column_name = 'copyText'
  ) THEN
    RETURN;
  END IF;

  -- Archive: all the text 016 is about to drop.
  INSERT INTO "LegacyCaptionArchive" ("draftId", "copyText")
  SELECT d."id", d."copyText"
  FROM "Draft" d
  WHERE d."copyText" IS NOT NULL;

  -- Selection: exactly 016's guard predicate, so its guard cannot trip after
  -- this. Captured before any row is written.
  converted := ARRAY(
    SELECT d."id"
    FROM "Draft" d
    WHERE d."copyText" IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM "DraftCaption" c WHERE c."draftId" = d."id")
  );

  -- One READY row per channel. model/modelSubstitutedFrom stay NULL
  -- ("unknown", the pre-008 rule); needsReview and "captionMigration" keep
  -- their defaults, because 016 drops both next. The id is deterministic and
  -- unique under (draftId, channel).
  INSERT INTO "DraftCaption" ("id", "draftId", "channel", "text", "status")
  SELECT
    md5('022:' || l."id" || ':' || ch."channel"::TEXT),
    l."id",
    ch."channel",
    CASE
      WHEN l."copyText" ~ '^\s*$' THEN ''
      WHEN ch."channel" = 'WHATSAPP' THEN ''
      ELSE l."copyText"
    END,
    'READY'
  FROM "Draft" l
  CROSS JOIN (VALUES
    ('INSTAGRAM'::"Channel"),
    ('LINKEDIN'::"Channel"),
    ('WHATSAPP'::"Channel")
  ) AS ch("channel")
  WHERE l."id" = ANY (converted);

  -- Content guard. Expected text is derived from the ARCHIVED copy, not from
  -- the expression above, so a wrong write cannot also fool the check.
  IF (SELECT count(*) FROM "LegacyCaptionArchive")
     <> (SELECT count(*) FROM "Draft" WHERE "copyText" IS NOT NULL) THEN
    problem := 'the archive row count differs from the number of non-null captions';
  ELSIF EXISTS (
    SELECT 1 FROM "Draft" d
    WHERE d."copyText" IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM "LegacyCaptionArchive" a
        WHERE a."draftId" = d."id" AND a."copyText" = d."copyText"
      )
  ) THEN
    problem := 'an archived caption is missing or differs from its source';
  ELSIF EXISTS (
    SELECT 1 FROM unnest(converted) AS cv("draftId")
    WHERE (SELECT count(*) FROM "DraftCaption" c WHERE c."draftId" = cv."draftId") <> 3
  ) THEN
    problem := 'a converted draft does not have exactly 3 caption rows';
  ELSIF EXISTS (
    SELECT 1
    FROM "DraftCaption" c
    JOIN "LegacyCaptionArchive" a ON a."draftId" = c."draftId"
    WHERE c."draftId" = ANY (converted)
      AND (
        c."status" <> 'READY'
        OR c."text" IS DISTINCT FROM (
          CASE
            WHEN a."copyText" ~ '^\s*$' OR c."channel" = 'WHATSAPP' THEN ''
            ELSE a."copyText"
          END
        )
      )
  ) THEN
    problem := 'a converted caption row does not hold the expected text';
  ELSIF EXISTS (
    SELECT 1 FROM "Draft" d
    WHERE d."copyText" IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM "DraftCaption" c WHERE c."draftId" = d."id")
  ) THEN
    problem := 'a draft with a legacy caption is still unconverted';
  END IF;

  IF problem IS NOT NULL THEN
    RAISE EXCEPTION '022 legacy_caption_carryover: content guard failed (%); nothing was written. % draft(s) were selected for conversion.',
      problem, coalesce(array_length(converted, 1), 0);
  END IF;
END $$;
