# Historical migration audit

Files in this directory are retained as non-executable evidence.

`20260807100220_assignment_mvp.preview.sql.txt` was originally a standalone
preview bootstrap. It duplicated the established schema, granted unrestricted
preview RLS access and inserted preview identities. Its migration version is
preserved as a documented no-op, while legitimate trigger/index deltas are
maintained by `20260901090000_repair_assignment_mvp_history.sql`.

Never move archived `.sql.txt` files back into `supabase/migrations`.