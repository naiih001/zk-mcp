import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const migration = readFileSync(join(process.cwd(), 'migrations', '001_initial.sql'), 'utf-8');

test('initial migration enables UUID generation', () => {
  assert.match(migration, /CREATE EXTENSION IF NOT EXISTS pgcrypto;/);
  assert.match(migration, /id UUID PRIMARY KEY DEFAULT gen_random_uuid\(\)/);
});

test('initial migration cascades note relationship cleanup', () => {
  assert.match(migration, /note_id UUID NOT NULL REFERENCES notes\(id\) ON DELETE CASCADE/);
  assert.match(migration, /source_note_id UUID NOT NULL REFERENCES notes\(id\) ON DELETE CASCADE/);
  assert.match(migration, /target_note_id UUID NOT NULL REFERENCES notes\(id\) ON DELETE CASCADE/);
});

test('initial migration prevents self-links', () => {
  assert.match(migration, /CHECK \(source_note_id <> target_note_id\)/);
});

test('initial migration defines generated full-text search column', () => {
  assert.match(
    migration,
    /ALTER TABLE notes ADD COLUMN search tsvector\s+GENERATED ALWAYS AS \(to_tsvector\('english', coalesce\(title, ''\) \|\| ' ' \|\| coalesce\(body, ''\)\)\) STORED;/,
  );
});

test('initial migration creates lookup indexes for common queries', () => {
  assert.match(migration, /CREATE INDEX idx_notes_search ON notes USING GIN \(search\);/);
  assert.match(migration, /CREATE INDEX idx_notes_updated_at ON notes \(updated_at DESC\);/);
  assert.match(migration, /CREATE INDEX idx_note_tags_tag ON note_tags \(tag_id\);/);
  assert.match(migration, /CREATE INDEX idx_links_target ON links \(target_note_id\);/);
});
