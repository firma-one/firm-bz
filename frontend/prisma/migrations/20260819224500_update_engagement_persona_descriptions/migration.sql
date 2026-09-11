-- Align eng_member / eng_ext_collaborator persona descriptions with the actual
-- access-scope mechanism (default access to all engagement content vs.
-- limited to explicitly-shared content) rather than only describing employment type.

UPDATE "platform"."personas"
SET "description" = 'Internal team member contributing to engagement work. Gets default access to all engagement content alongside the rest of the internal team. Typically full-time employees or core engagement team members.'
WHERE "slug" = 'eng_member';

UPDATE "platform"."personas"
SET "description" = 'External collaborator invited to contribute to an engagement. Can edit content explicitly shared with them (e.g. a deliverable-in-progress status) but has limited access outside the engagement scope. Typically contractors, consultants, vendors, or agency partners.'
WHERE "slug" = 'eng_ext_collaborator';

-- The Members UI now labels eng_admin as "Owner" — surface "Engagement Lead" explicitly
-- in the description (shown via tooltip) so the underlying term isn't lost.
UPDATE "platform"."personas"
SET "description" = 'Also known as Engagement Lead. Responsible for managing a specific engagement. Can manage engagement members, update engagement content, and oversee collaboration within the engagement workspace. Usually a project manager, engagement lead, or team lead.'
WHERE "slug" = 'eng_admin';
