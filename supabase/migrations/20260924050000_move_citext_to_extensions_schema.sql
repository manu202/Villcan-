-- extension_in_public advisor finding (WARN, LOW): the citext extension
-- lives in the public schema; Supabase recommends a dedicated schema.
-- supabase/config.toml's api.extra_search_path already lists "extensions"
-- (present since the baseline), anticipating exactly this move.
--
-- Checked every reference first -- this is exactly the risk that blocked
-- it before. citext is used only as a column type (profiles.email,
-- branches.slug); no function body or query anywhere calls citext(...) or
-- casts ::citext by name (grep confirmed across all migrations). A
-- column's type is resolved to a fixed type OID at DDL time, so moving the
-- extension's schema does not require touching those columns.

create schema if not exists extensions;
alter extension citext set schema extensions;

-- DOWN (manual): alter extension citext set schema public;
