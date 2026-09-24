-- Found by the RDD review of 20260923040000: that migration's "idempotent,
-- safe to run against production regardless of prior state" claim was
-- wrong on two counts.
--
-- 1. Not actually idempotent: plain `add constraint` fails on a second run
--    ("constraint already exists"). Fixed here with drop-then-add.
-- 2. The CHECK constraints validated every existing row (no NOT VALID),
--    so if any historical client_errors row already exceeded a new limit,
--    the deploy would have failed outright instead of just bounding future
--    writes. It happened to succeed in production only because no existing
--    row was that large -- pure luck, not something the migration itself
--    guaranteed. Re-added with NOT VALID: new/updated rows are still fully
--    enforced immediately, only the one-time backfill validation of
--    pre-existing rows is skipped.

alter table public.client_errors drop constraint if exists client_errors_message_length;
alter table public.client_errors drop constraint if exists client_errors_stack_length;
alter table public.client_errors drop constraint if exists client_errors_url_length;
alter table public.client_errors drop constraint if exists client_errors_user_agent_length;

alter table public.client_errors
  add constraint client_errors_message_length check (char_length(message) <= 2000) not valid,
  add constraint client_errors_stack_length check (stack is null or char_length(stack) <= 10000) not valid,
  add constraint client_errors_url_length check (url is null or char_length(url) <= 2000) not valid,
  add constraint client_errors_user_agent_length check (user_agent is null or char_length(user_agent) <= 500) not valid;
