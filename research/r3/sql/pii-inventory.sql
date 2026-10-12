-- SPDX-License-Identifier: AGPL-3.0-or-later
--
-- R3: how many rows hold each personal-data column in a Pol.is database
-- (Pol.is stable 30367002). Counts only, no values. Read-only.
-- Column list: every public column whose name suggests personal data, kept
-- where Pol.is server code at this SHA still writes or reads it (see
-- docs/research/R3-polis-data.md for the column-by-column notes).

SELECT 'users' AS tbl, 'email' AS col, count(email) AS non_null, count(*) AS total_rows FROM users
UNION ALL SELECT 'users', 'hname', count(hname), count(*) FROM users
UNION ALL SELECT 'users', 'username', count(username), count(*) FROM users
UNION ALL SELECT 'users', 'is_owner=true', count(*) FILTER (WHERE is_owner), count(*) FROM users
UNION ALL SELECT 'oidc_user_mappings', 'oidc_sub', count(oidc_sub), count(*) FROM oidc_user_mappings
UNION ALL SELECT 'xids', 'xid', count(xid), count(*) FROM xids
UNION ALL SELECT 'xids', 'x_name', count(x_name), count(*) FROM xids
UNION ALL SELECT 'xids', 'x_email', count(x_email), count(*) FROM xids
UNION ALL SELECT 'xids', 'x_profile_image_url', count(x_profile_image_url), count(*) FROM xids
UNION ALL SELECT 'xid_whitelist', 'xid', count(xid), count(*) FROM xid_whitelist
UNION ALL SELECT 'participants_extended', 'referrer', count(referrer), count(*) FROM participants_extended
UNION ALL SELECT 'participants_extended', 'referrer containing xid=', count(*) FILTER (WHERE referrer LIKE '%xid=%'), count(*) FROM participants_extended
UNION ALL SELECT 'participants_extended', 'parent_url', count(parent_url), count(*) FROM participants_extended
UNION ALL SELECT 'participants_extended', 'origin', count(origin), count(*) FROM participants_extended
UNION ALL SELECT 'participants_extended', 'subscribe_email', count(subscribe_email), count(*) FROM participants_extended
UNION ALL SELECT 'participants_extended', 'permanent_cookie', count(permanent_cookie), count(*) FROM participants_extended
UNION ALL SELECT 'participants', 'subscribed<>0', count(*) FILTER (WHERE subscribed <> 0), count(*) FROM participants
UNION ALL SELECT 'comments', 'txt (free text)', count(txt), count(*) FROM comments
UNION ALL SELECT 'einvites', 'email', count(email), count(*) FROM einvites
UNION ALL SELECT 'email_validations', 'email', count(email), count(*) FROM email_validations
UNION ALL SELECT 'inviters', 'invited_email', count(invited_email), count(*) FROM inviters
UNION ALL SELECT 'metrics', 'uid', count(uid), count(*) FROM metrics
UNION ALL SELECT 'facebook_users', '(any row)', count(*), count(*) FROM facebook_users
UNION ALL SELECT 'twitter_users', '(any row)', count(*), count(*) FROM twitter_users
UNION ALL SELECT 'participant_locations', '(any row)', count(*), count(*) FROM participant_locations
UNION ALL SELECT 'demographic_data', '(any row)', count(*), count(*) FROM demographic_data
UNION ALL SELECT 'conversations', 'parent_url', count(parent_url), count(*) FROM conversations
UNION ALL SELECT 'site_domain_whitelist', 'domain_whitelist', count(domain_whitelist), count(*) FROM site_domain_whitelist;
