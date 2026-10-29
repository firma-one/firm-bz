-- A deliverable's stage now follows its documents (.claude/plans/deliverable-stages-blocked.md,
-- section 2), worked out again whenever one of them moves (lib/deliverable-derivation.ts). This
-- brings the stored stages into line once, for the deliverables that are still open.
--
-- Over a deliverable's documents on the Board (To do and beyond; Not started ones are left out):
-- none → To do; any In progress → In progress; all Approved → Approved; all In review → In review;
-- all To do → To do; any other mix → In progress. A document with no stored stage is Not started.
--
-- Only moves a deliverable back (to the same or an earlier stage), which needs none of a forward
-- move's side effects: client access is never taken back on a backward move, and nothing is
-- finalized. A deliverable behind its documents catches up at its next document change, which
-- asks before showing it to the client. Approved (finalized) deliverables are left alone.
--
-- Data only, no schema change. Written by hand, as the other recent migrations are.

WITH RECURSIVE deliverables AS (
  SELECT id, "externalId", "engagementId", settings
  FROM "platform"."engagement_documents"
  WHERE "isFolder" = true
    AND settings->'share'->>'createdAt' IS NOT NULL
    AND settings->'share'->>'finalizedAt' IS NULL
    AND settings ? 'activity'
),
tree AS (
  SELECT d.id AS deliverable_id, c."externalId", c."engagementId", c."isFolder", c.settings, 1 AS depth
  FROM deliverables d
  JOIN "platform"."engagement_documents" c
    ON c."parentId" = d."externalId" AND c."engagementId" = d."engagementId"
  UNION ALL
  SELECT t.deliverable_id, c."externalId", c."engagementId", c."isFolder", c.settings, t.depth + 1
  FROM tree t
  JOIN "platform"."engagement_documents" c
    ON c."parentId" = t."externalId" AND c."engagementId" = t."engagementId"
  -- Bounded: a cycle in provider data must not run forever.
  WHERE t.depth < 50
),
on_board AS (
  SELECT deliverable_id,
         CASE settings->'activity'->>'status'
           WHEN 'done' THEN 'approved'
           ELSE settings->'activity'->>'status'
         END AS stage
  FROM tree
  WHERE "isFolder" = false
    AND settings->'activity'->>'status' IN ('to_do', 'in_progress', 'in_review', 'approved', 'done')
),
derived AS (
  SELECT d.id,
         CASE
           WHEN COUNT(o.stage) = 0 THEN 'to_do'
           WHEN bool_or(o.stage = 'in_progress') THEN 'in_progress'
           WHEN bool_and(o.stage = 'approved') THEN 'approved'
           WHEN bool_and(o.stage = 'in_review') THEN 'in_review'
           WHEN bool_and(o.stage = 'to_do') THEN 'to_do'
           ELSE 'in_progress'
         END AS stage
  FROM deliverables d
  LEFT JOIN on_board o ON o.deliverable_id = d.id
  GROUP BY d.id
),
stage_order(stage, ord) AS (
  VALUES ('to_do', 1), ('in_progress', 2), ('in_review', 3), ('approved', 4), ('done', 4)
)
UPDATE "platform"."engagement_documents" e
SET settings = jsonb_set(e.settings, '{activity,status}', to_jsonb(dv.stage))
FROM derived dv, stage_order now_at, stage_order derived_at
WHERE e.id = dv.id
  AND now_at.stage = e.settings->'activity'->>'status'
  AND derived_at.stage = dv.stage
  AND derived_at.ord < now_at.ord;
