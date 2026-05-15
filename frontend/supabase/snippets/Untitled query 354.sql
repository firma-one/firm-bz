SELECT u.email, f.id as firmId, f.slug
FROM auth.users u
JOIN platform.firm_members fm ON u.id = fm."userId"
JOIN platform.firms f ON f.id = fm."firmId"
WHERE f."slug" IN (
  'pockett-23fg'
)



SELECT
ed."id", ed."externalId", ed."parentId", ed."engagementId", ed."firmId", ed."settings"
FROM platform."engagement_documents" as ed
WHERE ed."fileName" = 'pockettcalculator.com-Coverage-Valid-2025-11-23';

-- 