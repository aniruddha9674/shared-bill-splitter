-- 0001_init.sql
-- Final schema: homes, members, bills, shares.
-- Money is always INTEGER cents. Member order = `position` (insertion order).

CREATE TABLE homes (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),

  CONSTRAINT homes_name_not_blank CHECK (length(trim(name)) > 0)
);

CREATE TABLE members (
  id         TEXT PRIMARY KEY,
  home_id    TEXT NOT NULL,
  name       TEXT NOT NULL,
  -- 1-based insertion order within a home. Assigned inside the INSERT:
  --   (SELECT COALESCE(MAX(position), 0) + 1 FROM members WHERE home_id = ?)
  position   INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),

  CONSTRAINT members_home_fk        FOREIGN KEY (home_id) REFERENCES homes (id) ON DELETE RESTRICT,
  CONSTRAINT members_name_not_blank CHECK (length(trim(name)) > 0),
  CONSTRAINT members_position_pos   CHECK (position > 0),
  CONSTRAINT members_home_pos_uniq  UNIQUE (home_id, position),
  CONSTRAINT members_id_home_uniq   UNIQUE (id, home_id)
);

CREATE TABLE bills (
  id          TEXT PRIMARY KEY,
  home_id     TEXT NOT NULL,
  title       TEXT NOT NULL,
  total_cents INTEGER NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),

  CONSTRAINT bills_home_fk         FOREIGN KEY (home_id) REFERENCES homes (id) ON DELETE RESTRICT,
  CONSTRAINT bills_title_not_blank CHECK (length(trim(title)) > 0),
  CONSTRAINT bills_total_int_pos   CHECK (typeof(total_cents) = 'integer' AND total_cents > 0),
  CONSTRAINT bills_id_home_uniq    UNIQUE (id, home_id)
);

CREATE TABLE shares (
  id              TEXT PRIMARY KEY,
  bill_id         TEXT NOT NULL,
  member_id       TEXT NOT NULL,
  home_id         TEXT NOT NULL,
  amount_cents    INTEGER NOT NULL,
  paid_at         TEXT,
  idempotency_key TEXT,

  CONSTRAINT shares_bill_fk   FOREIGN KEY (bill_id, home_id)   REFERENCES bills (id, home_id)   ON DELETE RESTRICT,
  CONSTRAINT shares_member_fk FOREIGN KEY (member_id, home_id) REFERENCES members (id, home_id) ON DELETE RESTRICT,

  CONSTRAINT shares_amount_int_nonneg     CHECK (typeof(amount_cents) = 'integer' AND amount_cents >= 0),
  CONSTRAINT shares_paid_state_consistent CHECK ((paid_at IS NULL) = (idempotency_key IS NULL)),
  CONSTRAINT shares_key_not_blank         CHECK (idempotency_key IS NULL OR length(idempotency_key) > 0),
  CONSTRAINT shares_bill_member_uniq      UNIQUE (bill_id, member_id)
);

CREATE INDEX idx_members_home_position ON members (home_id, position);
CREATE INDEX idx_bills_home            ON bills (home_id, created_at);
CREATE INDEX idx_shares_bill           ON shares (bill_id);
CREATE INDEX idx_shares_member_unpaid  ON shares (member_id) WHERE paid_at IS NULL;