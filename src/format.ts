import type { Note, NoteWithRelations, SearchResult, Todo, TodoWithRelations, TodoSearchResult } from './schema.js';

const PRIORITY_LABELS: Record<number, string> = {
  0: 'none',
  1: 'low',
  2: 'medium',
  3: 'high',
};

export function formatTodoDetail(todo: TodoWithRelations): string {
  const priority = PRIORITY_LABELS[todo.priority] ?? String(todo.priority);
  const due = todo.due_date ? new Date(todo.due_date).toISOString().slice(0, 10) : '(none)';
  const done = todo.completed_at ? new Date(todo.completed_at).toISOString().slice(0, 10) : '-';
  return [
    `# ${todo.title}`,
    ``,
    todo.description || '(no description)',
    ``,
    `Status: ${todo.status}`,
    `Priority: ${priority} (${todo.priority})`,
    `Due: ${due}`,
    `Completed: ${done}`,
    `Notes: ${todo.notes.map(n => n.title).join(', ') || '(none)'}`,
    `Created: ${todo.created_at}`,
    `Updated: ${todo.updated_at}`,
  ].join('\n');
}

export function formatTodoList(todos: Todo[]): string {
  if (todos.length === 0) {
    return 'No todos found';
  }
  return todos.map(t => {
    const updatedAt = new Date(t.updated_at).toISOString().slice(0, 10);
    const priority = PRIORITY_LABELS[t.priority] ?? String(t.priority);
    return `${t.id} | ${t.title} | ${t.status} | ${priority} | ${updatedAt}`;
  }).join('\n');
}

export function formatTodoSearchResults(results: TodoSearchResult[]): string {
  if (results.length === 0) {
    return 'No todos found';
  }
  return results.map((r, i) => {
    const updatedAt = new Date(r.updated_at).toISOString().slice(0, 10);
    const priority = PRIORITY_LABELS[r.priority] ?? String(r.priority);
    return [
      `${i + 1}. ${r.id.slice(0, 8)}... | ${r.title} | ${r.status} | ${priority} | score: ${r.rank.toFixed(2)} | updated: ${updatedAt}`,
      `   Snippet: ${r.snippet || '(none)'}`,
    ].join('\n');
  }).join('\n');
}

export function formatNoteDetail(note: NoteWithRelations): string {
  return [
    `# ${note.title}`,
    ``,
    note.body,
    ``,
    `Tags: ${note.tags.join(', ') || '(none)'}`,
    `Links: ${note.links.map(l => l.title).join(', ') || '(none)'}`,
    `Backlinks: ${note.backlinks.map(l => l.title).join(', ') || '(none)'}`,
    `Todos: ${note.todos.map(t => t.title).join(', ') || '(none)'}`,
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
    `## Todos`,
    ...note.todos.map(t => `- [ ] ${t.title} (zk://todos/${t.id})`),
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
