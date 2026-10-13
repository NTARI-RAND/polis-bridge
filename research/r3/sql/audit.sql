-- SPDX-License-Identifier: AGPL-3.0-or-later
--
-- polis-bridge close-of-round audit (R3 draft, Pol.is stable 30367002).
-- "Every participant who voted or wrote a statement in this conversation is
--  an xid the bridge admitted." Prints counts and PASS/FAIL only, no xids.
--
-- Inputs (psql variables):
--   :'conv'      the public conversation_id (zinvites.zinvite)
--   :'admitted'  the bridge's own admitted-xid set for the round, comma-separated
--                (from the bridge's store, NOT from Pol.is's xid_whitelist, which
--                any Pol.is moderator can change)
--
-- How Pol.is links a vote to an xid (verified at the pinned SHA):
--   votes(zid, pid) -> participants(zid, pid).uid -> xids(owner, uid).xid
--   with xids.owner = conversations.owner. Join on (owner, uid), NOT on
--   xids.zid: xids.zid only records the FIRST conversation an xid was seen in,
--   so an xid reused in a second round of the same owner has the old zid.
--
-- Rules:
--   ok                      acting participant whose xid is in the admitted set
--   fail_no_xid             acting participant with no xid (a signed-in Pol.is
--                           account, or an anonymous participant) - not the owner
--   fail_xid_not_admitted   acting participant whose xid is not in the set
--   owner_non_pass_votes    the owner account may only hold its automatic "pass"
--                           votes on seed statements; any other owner vote fails
-- Not detectable here (by design of Pol.is): two members merged into one
-- participant on a shared browser (R1 C5); see R2.

WITH conv AS (
  SELECT z.zid, c.owner
  FROM zinvites z
  JOIN conversations c ON c.zid = z.zid
  WHERE z.zinvite = :'conv'
),
admitted AS (
  SELECT DISTINCT a AS xid
  FROM unnest(string_to_array(:'admitted', ',')) AS a
  WHERE a <> ''
),
actors AS (
  SELECT v.pid FROM votes v JOIN conv ON v.zid = conv.zid
  UNION
  SELECT cm.pid FROM comments cm JOIN conv ON cm.zid = conv.zid
),
resolved AS (
  SELECT a.pid,
         (p.uid = conv.owner) AS is_owner,
         x.xid,
         (x.xid IS NOT NULL AND x.xid IN (SELECT xid FROM admitted)) AS admitted
  FROM actors a
  CROSS JOIN conv
  JOIN participants p ON p.zid = conv.zid AND p.pid = a.pid
  LEFT JOIN xids x ON x.owner = conv.owner AND x.uid = p.uid
),
counts AS (
  SELECT
    (SELECT count(*) FROM conv)                                                AS conversation_found,
    (SELECT count(*) FROM admitted)                                            AS admitted_xids,
    count(DISTINCT pid)                                                        AS acting_participants,
    count(*) - count(DISTINCT pid)                                             AS participants_with_several_xids,
    count(DISTINCT pid) FILTER (WHERE is_owner)                                AS owner_participants,
    count(DISTINCT pid) FILTER (WHERE admitted)                                AS ok_admitted,
    count(DISTINCT pid) FILTER (WHERE NOT is_owner AND xid IS NULL)            AS fail_no_xid,
    count(DISTINCT pid) FILTER (WHERE xid IS NOT NULL AND NOT admitted)        AS fail_xid_not_admitted,
    (SELECT count(*) FROM votes v JOIN conv ON v.zid = conv.zid
       JOIN participants p ON p.zid = v.zid AND p.pid = v.pid
      WHERE p.uid = conv.owner AND v.vote <> 0)                                AS owner_non_pass_votes,
    (SELECT count(*) FROM votes v JOIN conv ON v.zid = conv.zid)               AS vote_rows
  FROM resolved
)
SELECT counts.*,
       CASE WHEN conversation_found = 1
             AND fail_no_xid = 0
             AND fail_xid_not_admitted = 0
             AND owner_non_pass_votes = 0
             AND participants_with_several_xids = 0
            THEN 'PASS' ELSE 'FAIL' END AS result
FROM counts;
