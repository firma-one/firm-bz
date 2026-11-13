-- Assign the subdomains that predate custom domains to their workspaces, as approved.
-- They used to be a hard-coded list in proxy.ts (CLIENT_SUBDOMAINS). app.firma.bz stays a neutral
-- alias and is not assigned. See docs/mvp/hld-custom-dns.md.
--
-- Each host goes to the Group whose GROUP_ADMIN has the given email, matched by the SHA-256 of the
-- lowercased email so no customer address is kept in git. Confirmed by Deepak, 2026-11-13.
--
-- Safe everywhere and safe to re-run: a host is skipped when no such admin exists (local and preview
-- databases), when that admin runs more than one Group (ambiguous), or when the Group or the host
-- already has a live domain. lastCheckedAt stays NULL; the daily re-check confirms reachability.

WITH wanted(host, email_sha256) AS (
    VALUES
        ('datasentry.firma.bz', 'bf00c38b382f7302c82bd507ed5f7358c93804f169285684a71df431b9718b5a'),
        ('keithmeyer.firma.bz', '413c5af10c2f9c2b535ba0c468726da0c492f9e54dd8fed55e0aaf8da0a5e3c1'),
        ('scarbluu.firma.bz',   'd33c0a2dfd7e3e75768aea692fb9c05ed63eaed6d2b3f97cd017bab6feee1296')
),
admins AS (
    SELECT w.host, gm."groupId", gm."userId",
           count(*) OVER (PARTITION BY w.host) AS groups_for_admin
      FROM wanted w
      JOIN auth.users u
        ON encode(sha256(convert_to(lower(u.email), 'UTF8')), 'hex') = w.email_sha256
      JOIN platform.group_members gm
        ON gm."userId" = u.id AND gm.role = 'GROUP_ADMIN'
)
INSERT INTO platform.group_domains
    ("groupId", host, kind, status, reachable, "requestedBy", "requestedAt", "reviewedAt", "reviewNote", "updatedAt")
SELECT a."groupId", a.host, 'SUBDOMAIN', 'APPROVED', true, a."userId", now(), now(),
       'Moved from the hard-coded subdomain list', now()
  FROM admins a
 WHERE a.groups_for_admin = 1
   AND NOT EXISTS (
        SELECT 1 FROM platform.group_domains d
         WHERE d.status IN ('REQUESTED', 'APPROVED')
           AND (d."groupId" = a."groupId" OR d.host = a.host)
   );
