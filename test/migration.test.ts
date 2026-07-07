import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const initialMigration = readFileSync(
  join(process.cwd(), 'prisma', 'migrations', '20260706000000_initial', 'migration.sql'),
  'utf-8',
);

const todosMigration = readFileSync(
  join(process.cwd(), 'prisma', 'migrations', '20260707000000_add_todos', 'migration.sql'),
  'utf-8',
);

test('initial migration enables UUID generation', () => {
  assert.match(initialMigration, /CREATE EXTENSION IF NOT EXISTS pgcrypto;/);
  assert.match(initialMigration, /id UUID PRIMARY KEY DEFAULT gen_random_uuid\(\)/);
});

test('initial migration cascades note relationship cleanup', () => {
  assert.match(initialMigration, /note_id UUID NOT NULL REFERENCES notes\(id\) ON DELETE CASCADE/);
  assert.match(initialMigration, /source_note_id UUID NOT NULL REFERENCES notes\(id\) ON DELETE CASCADE/);
  assert.match(initialMigration, /target_note_id UUID NOT NULL REFERENCES notes\(id\) ON DELETE CASCADE/);
});

test('initial migration prevents self-links', () => {
  assert.match(initialMigration, /CHECK \(source_note_id <> target_note_id\)/);
});

test('initial migration defines generated full-text search column', () => {
  assert.match(
    initialMigration,
    /ALTER TABLE notes ADD COLUMN search tsvector\s+GENERATED ALWAYS AS \(to_tsvector\('english', coalesce\(title, ''\) \|\| ' ' \|\| coalesce\(body, ''\)\)\) STORED;/,
  );
});

test('initial migration creates lookup indexes for common queries', () => {
  assert.match(initialMigration, /CREATE INDEX idx_notes_search ON notes USING GIN \(search\);/);
  assert.match(initialMigration, /CREATE INDEX idx_notes_updated_at ON notes \(updated_at DESC\);/);
  assert.match(initialMigration, /CREATE INDEX idx_note_tags_tag ON note_tags \(tag_id\);/);
  assert.match(initialMigration, /CREATE INDEX idx_links_target ON links \(target_note_id\);/);
});

test('todos migration creates todos table with all columns', () => {
  assert.match(todosMigration, /CREATE TABLE todos \(/);
  assert.match(todosMigration, /id UUID PRIMARY KEY DEFAULT gen_random_uuid\(\)/);
  assert.match(todosMigration, /title TEXT NOT NULL/);
  assert.match(todosMigration, /description TEXT NOT NULL DEFAULT ''/);
  assert.match(todosMigration, /status TEXT NOT NULL DEFAULT 'pending'/);
  assert.match(todosMigration, /priority INTEGER NOT NULL DEFAULT 0/);
  assert.match(todosMigration, /due_date TIMESTAMPTZ/);
  assert.match(todosMigration, /completed_at TIMESTAMPTZ/);
  assert.match(todosMigration, /created_at TIMESTAMPTZ NOT NULL DEFAULT now\(\)/);
  assert.match(todosMigration, /updated_at TIMESTAMPTZ NOT NULL DEFAULT now\(\)/);
});

test('todos migration creates todo_notes junction table', () => {
  assert.match(todosMigration, /CREATE TABLE todo_notes \(/);
  assert.match(todosMigration, /todo_id UUID NOT NULL REFERENCES todos\(id\) ON DELETE CASCADE/);
  assert.match(todosMigration, /note_id UUID NOT NULL REFERENCES notes\(id\) ON DELETE CASCADE/);
  assert.match(todosMigration, /PRIMARY KEY \(todo_id, note_id\)/);
});

test('todos migration defines generated full-text search column on todos', () => {
  assert.match(
    todosMigration,
    /ALTER TABLE todos ADD COLUMN search tsvector\s+GENERATED ALWAYS AS \(\s+to_tsvector\('english', coalesce\(title, ''\) \|\| ' ' \|\| coalesce\(description, ''\)\)\s+\) STORED;/,
  );
});

test('todos migration creates lookup indexes', () => {
  assert.match(todosMigration, /CREATE INDEX idx_todos_search ON todos USING GIN \(search\);/);
  assert.match(todosMigration, /CREATE INDEX idx_todos_status ON todos \(status\);/);
  assert.match(todosMigration, /CREATE INDEX idx_todos_updated_at ON todos \(updated_at DESC\);/);
  assert.match(todosMigration, /CREATE INDEX idx_todo_notes_note ON todo_notes \(note_id\);/);
});
