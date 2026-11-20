CREATE TABLE debates (
  id text PRIMARY KEY CHECK (id ~ '^d_[A-Za-z0-9_-]{22}$'),
  room_id text NOT NULL,
  theme text NOT NULL CHECK (theme IN ('courtroom', 'jungle', 'detective', 'superhero')),
  topic text NOT NULL CHECK (length(topic) BETWEEN 1 AND 240),
  duration_sec integer NOT NULL CHECK (duration_sec IN (120,240,360,600)),
  position_a text NOT NULL, position_b text NOT NULL,
  name_a text NOT NULL, name_b text NOT NULL,
  transcript jsonb NOT NULL CHECK (jsonb_typeof(transcript) = 'array'),
  summaries jsonb NOT NULL CHECK (jsonb_typeof(summaries) = 'array'),
  verdict jsonb NOT NULL CHECK (jsonb_typeof(verdict) = 'object'),
  created_at timestamptz NOT NULL, completed_at timestamptz NOT NULL CHECK (completed_at >= created_at)
);
CREATE TABLE debate_participants (
  debate_id text NOT NULL REFERENCES debates(id), player_id text NOT NULL,
  slot text NOT NULL CHECK (slot IN ('A', 'B')),
  completed_at timestamptz NOT NULL,
  acknowledged_at timestamptz,
  PRIMARY KEY (debate_id, player_id), UNIQUE (debate_id, slot)
);
CREATE INDEX debate_participants_player_completed ON debate_participants (player_id, completed_at DESC, debate_id);
