import pg from 'pg';
import type { Note, Tag, NoteWithRelations, SearchResult } from './schema.js';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
});

export async function query<T>(text: string, params?: unknown[]): Promise<T[]> {
  const result = await pool.query(text, params);
  return result.rows as T[];
}

export async function queryOne<T>(text: string, params?: unknown[]): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

export async function createNote(title: string, body: string, tagNames?: string[]): Promise<Note> {
  const note = await pool.query(
    'INSERT INTO notes (title, body) VALUES ($1, $2) RETURNING *',
    [title, body]
  );
  const n = note.rows[0];
  if (tagNames && tagNames.length > 0) {
    for (const name of tagNames) {
      await pool.query(
        `INSERT INTO tags (name) VALUES ($1)
         ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
         RETURNING *`,
        [name]
      );
      await pool.query(
        `INSERT INTO note_tags (note_id, tag_id)
         SELECT $1, id FROM tags WHERE name = $2
         ON CONFLICT DO NOTHING`,
        [n.id, name]
      );
    }
  }
  return n;
}

export async function getNote(id: string): Promise<NoteWithRelations | null> {
  const note = await queryOne<Note>('SELECT * FROM notes WHERE id = $1', [id]);
  if (!note) return null;

  const tags = await query<Tag>(
    `SELECT t.name FROM tags t
     JOIN note_tags nt ON nt.tag_id = t.id
     WHERE nt.note_id = $1
     ORDER BY t.name`,
    [id]
  );

  const links = await query<{ id: string; title: string }>(
    `SELECT n.id, n.title FROM notes n
     JOIN links l ON l.target_note_id = n.id
     WHERE l.source_note_id = $1
     ORDER BY n.title`,
    [id]
  );

  const backlinks = await query<{ id: string; title: string }>(
    `SELECT n.id, n.title FROM notes n
     JOIN links l ON l.source_note_id = n.id
     WHERE l.target_note_id = $1
     ORDER BY n.title`,
    [id]
  );

  return {
    ...note,
    tags: tags.map(t => t.name),
    links,
    backlinks,
  };
}

export async function updateNote(id: string, title?: string, body?: string): Promise<Note | null> {
  const sets: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (title !== undefined) { sets.push(`title = $${idx++}`); params.push(title); }
  if (body !== undefined) { sets.push(`body = $${idx++}`); params.push(body); }
  if (sets.length === 0) return null;

  sets.push(`updated_at = now()`);
  params.push(id);
  return queryOne<Note>(
    `UPDATE notes SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
    params
  );
}

export async function deleteNote(id: string): Promise<boolean> {
  const r = await pool.query('DELETE FROM notes WHERE id = $1', [id]);
  return (r.rowCount ?? 0) > 0;
}

export async function searchNotes(queryStr: string): Promise<SearchResult[]> {
  return query<SearchResult>(
    `SELECT id, title, body,
            ts_rank(search, plainto_tsquery('english', $1)) as rank,
            updated_at
     FROM notes
     WHERE search @@ plainto_tsquery('english', $1)
     ORDER BY rank DESC
     LIMIT 50`,
    [queryStr]
  );
}

export async function listNotes(tag?: string, limit = 50, offset = 0): Promise<Note[]> {
  if (tag) {
    return query<Note>(
      `SELECT n.* FROM notes n
       JOIN note_tags nt ON nt.note_id = n.id
       JOIN tags t ON t.id = nt.tag_id
       WHERE t.name = $1
       ORDER BY n.updated_at DESC
       LIMIT $2 OFFSET $3`,
      [tag, limit, offset]
    );
  }
  return query<Note>(
    'SELECT * FROM notes ORDER BY updated_at DESC LIMIT $1 OFFSET $2',
    [limit, offset]
  );
}

export async function linkNotes(sourceId: string, targetId: string): Promise<boolean> {
  try {
    await pool.query(
      'INSERT INTO links (source_note_id, target_note_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [sourceId, targetId]
    );
    return true;
  } catch {
    return false;
  }
}

export async function getBacklinks(noteId: string): Promise<{ id: string; title: string }[]> {
  return query<{ id: string; title: string }>(
    `SELECT n.id, n.title FROM notes n
     JOIN links l ON l.source_note_id = n.id
     WHERE l.target_note_id = $1
     ORDER BY n.title`,
    [noteId]
  );
}

export async function addTag(noteId: string, tagName: string): Promise<boolean> {
  await pool.query(
    `INSERT INTO tags (name) VALUES ($1) ON CONFLICT (name) DO NOTHING`,
    [tagName]
  );
  const r = await pool.query(
    `INSERT INTO note_tags (note_id, tag_id)
     SELECT $1, id FROM tags WHERE name = $2
     ON CONFLICT DO NOTHING`,
    [noteId, tagName]
  );
  return (r.rowCount ?? 0) > 0;
}

export async function removeTag(noteId: string, tagName: string): Promise<boolean> {
  const r = await pool.query(
    `DELETE FROM note_tags WHERE note_id = $1 AND tag_id IN (SELECT id FROM tags WHERE name = $2)`,
    [noteId, tagName]
  );
  return (r.rowCount ?? 0) > 0;
}

export async function getAllTags(): Promise<string[]> {
  const rows = await query<{ name: string }>('SELECT name FROM tags ORDER BY name');
  return rows.map(r => r.name);
}
