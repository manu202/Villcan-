-- A-14: client_errors_insert_any is intentionally anon-writable (a crash on
-- /login itself, before any session exists, still needs to be reportable) --
-- that part is correct, not a bug. But with zero length limits on any text
-- column, an anonymous caller could send arbitrarily large payloads
-- repeatedly, a cheap storage-exhaustion vector. Bound the columns instead
-- of restricting who can write.
--
-- Idempotent: safe to run against production regardless of prior state.

alter table public.client_errors
  add constraint client_errors_message_length check (char_length(message) <= 2000),
  add constraint client_errors_stack_length check (stack is null or char_length(stack) <= 10000),
  add constraint client_errors_url_length check (url is null or char_length(url) <= 2000),
  add constraint client_errors_user_agent_length check (user_agent is null or char_length(user_agent) <= 500);
