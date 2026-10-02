-- The four tables Auth.js needs, and nothing else yet.
--
-- Column names are not ours to choose: @auth/pg-adapter issues raw SQL against
-- these exact names, including the quoted camelCase ones ("userId",
-- "sessionToken", "emailVerified"). Renaming any of them to match the snake
-- case elsewhere in this file would break the adapter, so they are left as the
-- library writes them and the deviation is documented rather than fixed.
--
-- Two deliberate departures from the schema published at authjs.dev:
--
--   * ids are uuid rather than serial. A user id is about to become the key a
--     synced word bank hangs off, and a sequential integer in a URL or a token
--     tells anyone holding it how many users exist and what the neighbouring
--     ids are.
--   * foreign keys cascade. The adapter deletes sessions and accounts by hand
--     when a user goes, which works until something else deletes a user; the
--     constraint means an orphaned session is not representable.
--
-- Idempotent throughout: this file is the migration, run on deploy and re-run
-- safely.

CREATE TABLE IF NOT EXISTS users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text,
  email         text UNIQUE,
  "emailVerified" timestamptz,
  image         text
);

-- Third-party sign-ins. Empty today — magic links create a user with no
-- account row — and present because adding a provider later should be a config
-- change rather than a migration.
CREATE TABLE IF NOT EXISTS accounts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId"            uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type                text NOT NULL,
  provider            text NOT NULL,
  "providerAccountId" text NOT NULL,
  refresh_token       text,
  access_token        text,
  expires_at          bigint,
  id_token            text,
  scope               text,
  session_state       text,
  token_type          text,
  UNIQUE (provider, "providerAccountId")
);

CREATE TABLE IF NOT EXISTS sessions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId"       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires        timestamptz NOT NULL,
  "sessionToken" text NOT NULL UNIQUE
);

-- One row per unused magic link. The adapter deletes the row as it is redeemed,
-- which is what makes a link single-use.
CREATE TABLE IF NOT EXISTS verification_token (
  identifier text NOT NULL,
  token      text NOT NULL,
  expires    timestamptz NOT NULL,
  PRIMARY KEY (identifier, token)
);

-- ─── The word bank ───────────────────────────────────────────────────────────
--
-- The first table here that is ours rather than a library's, so it is named and
-- cased the way the rest of this repository writes SQL.
--
-- Note what is absent: there is no source_sentence column. The sentence a word
-- was met in is the writer's own draft, it is the memory hook the recall drill
-- is built on, and it stays in the browser that recorded it. Cards can be
-- rebuilt and review can be scheduled without it. If it is ever wanted here,
-- that is a new decision and a new migration — not an omission to quietly fix.
--
-- `id` is the client's own key, `lemma:senseId`, so the same word in two senses
-- is two rows and banking a word twice on two devices reconciles rather than
-- duplicating. Keyed by (user_id, id) rather than a surrogate: there is no
-- question this table answers that does not start with "for this person".
CREATE TABLE IF NOT EXISTS bank_entries (
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id              text NOT NULL,
  word            text NOT NULL,
  lemma           text NOT NULL,
  part_of_speech  text NOT NULL,
  sense_id        text NOT NULL,
  definition      text NOT NULL,
  -- The shapes of these two are pinned by Zod at the boundary and are read back
  -- as a unit, never queried into, so jsonb rather than two more tables.
  synonyms        jsonb NOT NULL DEFAULT '[]'::jsonb,
  use_cases       jsonb NOT NULL DEFAULT '[]'::jsonb,
  register        text NOT NULL,
  added_via       text NOT NULL,
  added_at        timestamptz NOT NULL,
  times_reused    integer NOT NULL DEFAULT 0,
  last_reused_at  timestamptz,
  -- Ours, not the client's: when the server last accepted a write for this row.
  synced_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, id)
);

-- Every read is "this person's bank, oldest first".
CREATE INDEX IF NOT EXISTS bank_entries_user_added_idx
  ON bank_entries (user_id, added_at);

CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions ("userId");
CREATE INDEX IF NOT EXISTS accounts_user_id_idx ON accounts ("userId");

-- Expired rows are never read, and nothing in the adapter removes them: a
-- redeemed link deletes its own row, but an abandoned one and a lapsed session
-- both sit there forever. Swept on migrate, which is often enough for rows
-- this small and keeps a scheduler out of the deploy.
DELETE FROM verification_token WHERE expires < now();
DELETE FROM sessions WHERE expires < now();
