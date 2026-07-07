import type { Note, NoteWithRelations, SearchResult } from './schema.js';

export function formatNoteDetail(note: NoteWithRelations): string {
  return [
    `# ${note.title}`,
    ``,
    note.body,
    ``,
    `Tags: ${note.tags.join(', ') || '(none)'}`,
    `Links: ${note.links.map(l => l.title).join(', ') || '(none)'}`,
    `Backlinks: ${note.backlinks.map(l => l.title).join(', ') || '(none)'}`,
    `Created: ${note.created_at}`,
    `Updated: ${note.updated_at}`,
  ].join('\n');
}

export function formatNoteMarkdown(note: NoteWithRelations): string {
  return [
    `# ${note.title}`,
    ``,
    note.body,
    ``,
    `---`,
    `Tags: ${note.tags.join(', ') || '(none)'}`,
    ``,
    `## Links`,
    ...note.links.map(l => `- [[${l.title}]] (zk://notes/${l.id})`),
    ``,
    `## Backlinks`,
    ...note.backlinks.map(l => `- [[${l.title}]] (zk://notes/${l.id})`),
    ``,
    `_Created: ${note.created_at}_`,
    `_Updated: ${note.updated_at}_`,
  ].join('\n');
}

export function formatSearchResults(results: SearchResult[]): string {
  if (results.length === 0) {
    return 'No results found';
  }
  return results.map((r, i) => {
    const updatedAt = new Date(r.updated_at).toISOString().slice(0, 10);
    return [
      `${i + 1}. ${r.id.slice(0, 8)}... | ${r.title} | score: ${r.rank.toFixed(2)} | updated: ${updatedAt}`,
      `   Tags: ${r.tags.join(', ') || '(none)'}`,
      `   Snippet: ${r.snippet || '(none)'}`,
    ].join('\n');
  }).join('\n');
}

export function formatNoteList(notes: Note[]): string {
  if (notes.length === 0) {
    return 'No notes found';
  }
  return notes.map(n => {
    const updatedAt = new Date(n.updated_at).toISOString().slice(0, 10);
    return `${n.id} | ${n.title} | ${updatedAt}`;
  }).join('\n');
}

export function formatBacklinks(backlinks: { id: string; title: string }[]): string {
  if (backlinks.length === 0) {
    return 'No backlinks found';
  }
  return backlinks.map(b => `${b.id.slice(0, 8)}... | ${b.title}`).join('\n');
}
