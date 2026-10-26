-- 016 FR-08: no pre-made team on a fresh database. 20260721120000_team_tenancy_b
-- inserts the team 'team_bistec_default' ("Bistec") into every database it
-- runs on, to absorb pre-team rows. The system is fresh-start only (016): a
-- fresh database starts with no team, and the super admin creates the first
-- one at /admin/teams.
--
-- The team is deleted only while it is unused. A database whose default team
-- has a member, a Claude token, or any team-owned row keeps it. The list is
-- every table with a "teamId" column in schema.prisma, plus TeamMembership and
-- the model policy (TeamModelPolicy, and TeamModelDefault under it). Applied
-- migrations are never edited, so this runs after team_tenancy_b instead. The
-- rollback (prisma/rollback/016-fresh-start-cleanup.down.sql) does not restore
-- the team: seeds create "Bistec" by name when it is missing.

DELETE FROM "Team" t
WHERE t."id" = 'team_bistec_default'
  AND t."encryptedClaudeToken" IS NULL
  AND NOT EXISTS (SELECT 1 FROM "TeamMembership"      x WHERE x."teamId" = t."id")
  AND NOT EXISTS (SELECT 1 FROM "TeamModelPolicy"     x WHERE x."teamId" = t."id")
  AND NOT EXISTS (SELECT 1 FROM "TeamModelDefault"    x WHERE x."teamId" = t."id")
  AND NOT EXISTS (SELECT 1 FROM "ApiKey"              x WHERE x."teamId" = t."id")
  AND NOT EXISTS (SELECT 1 FROM "Project"             x WHERE x."teamId" = t."id")
  AND NOT EXISTS (SELECT 1 FROM "Campaign"            x WHERE x."teamId" = t."id")
  AND NOT EXISTS (SELECT 1 FROM "CampaignDocument"    x WHERE x."teamId" = t."id")
  AND NOT EXISTS (SELECT 1 FROM "ScheduledGeneration" x WHERE x."teamId" = t."id")
  AND NOT EXISTS (SELECT 1 FROM "Brief"               x WHERE x."teamId" = t."id")
  AND NOT EXISTS (SELECT 1 FROM "BriefDraft"          x WHERE x."teamId" = t."id")
  AND NOT EXISTS (SELECT 1 FROM "Draft"               x WHERE x."teamId" = t."id")
  AND NOT EXISTS (SELECT 1 FROM "Post"                x WHERE x."teamId" = t."id")
  AND NOT EXISTS (SELECT 1 FROM "BrandKit"            x WHERE x."teamId" = t."id")
  AND NOT EXISTS (SELECT 1 FROM "BrandKitDocument"    x WHERE x."teamId" = t."id")
  AND NOT EXISTS (SELECT 1 FROM "AvailableProvider"   x WHERE x."teamId" = t."id")
  AND NOT EXISTS (SELECT 1 FROM "ChannelToken"        x WHERE x."teamId" = t."id");
