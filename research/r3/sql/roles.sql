-- SPDX-License-Identifier: AGPL-3.0-or-later
--
-- R2/R3 proposal: two narrow Postgres roles for the bridge, in case it should
-- touch Pol.is's database directly instead of (or besides) the HTTP API.
-- Pol.is stable 30367002. Run as a superuser in the Pol.is database. Set real
-- passwords on the host only (never in the repo); the placeholders below are
-- replaced by the operator.
--
-- 1. bridge_admit: may add xids to a conversation's allow-list and nothing else.
--    Needs to read zinvites (conversation_id -> zid) and conversations (owner).
--    INSERT ... ON CONFLICT DO NOTHING needs only INSERT on the listed columns.
--    It cannot delete or update allow-list rows, read votes or read xids.
CREATE ROLE bridge_admit LOGIN PASSWORD :'admit_password';
GRANT CONNECT ON DATABASE :"dbname" TO bridge_admit;
GRANT USAGE ON SCHEMA public TO bridge_admit;
GRANT SELECT (zid, zinvite) ON zinvites TO bridge_admit;
GRANT SELECT (zid, owner) ON conversations TO bridge_admit;
GRANT INSERT (xid, zid, owner) ON xid_whitelist TO bridge_admit;

-- 2. bridge_audit: read-only, exactly the columns research/r3/sql/audit.sql reads.
--    No access to users (emails), participants_extended (referrers), comments' text.
CREATE ROLE bridge_audit LOGIN PASSWORD :'audit_password';
GRANT CONNECT ON DATABASE :"dbname" TO bridge_audit;
GRANT USAGE ON SCHEMA public TO bridge_audit;
GRANT SELECT (zid, zinvite) ON zinvites TO bridge_audit;
GRANT SELECT (zid, owner) ON conversations TO bridge_audit;
GRANT SELECT (zid, pid, vote) ON votes TO bridge_audit;
GRANT SELECT (zid, pid) ON comments TO bridge_audit;
GRANT SELECT (zid, pid, uid) ON participants TO bridge_audit;
GRANT SELECT (owner, uid, xid) ON xids TO bridge_audit;
ALTER ROLE bridge_audit SET default_transaction_read_only = on;
