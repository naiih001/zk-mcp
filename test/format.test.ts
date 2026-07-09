import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatBacklinks,
  formatNoteDetail,
  formatNoteList,
  formatNoteMarkdown,
  formatSearchResults,
  formatTodoDetail,
  formatTodoList,
  formatTodoSearchResults,
} from '../src/format.js';
import type { Note, NoteWithRelations, SearchResult, Todo, TodoWithRelations, TodoSearchResult } from '../src/schema.js';

const note: NoteWithRelations = {
  id: '11111111-1111-4111-8111-111111111111',
  title: 'Atomic notes',
  body: 'Each note should capture one idea.',
  created_at: '2026-07-01T10:00:00.000Z',
  updated_at: '2026-07-02T10:00:00.000Z',
  tags: ['zettelkasten', 'writing'],
  links: [{ id: '22222222-2222-4222-8222-222222222222', title: 'Permanent notes' }],
  backlinks: [{ id: '33333333-3333-4333-8333-333333333333', title: 'Knowledge work' }],
  todos: [{ id: '44444444-4444-4444-8444-444444444444', title: 'Review technique' }],
  checklistItems: [
    {
      id: '77777777-7777-4777-8777-777777777777',
      note_id: '11111111-1111-4111-8111-111111111111',
      text: 'Draft the atomic note',
      checked: true,
      position: 0,
      created_at: '2026-07-01T10:05:00.000Z',
      updated_at: '2026-07-01T10:10:00.000Z',
    },
    {
      id: '88888888-8888-4888-8888-888888888888',
      note_id: '11111111-1111-4111-8111-111111111111',
      text: 'Link related notes',
      checked: false,
      position: 1,
      created_at: '2026-07-01T10:06:00.000Z',
      updated_at: '2026-07-01T10:06:00.000Z',
    },
  ],
};

test('formatNoteDetail includes note body and relationship summaries', () => {
  assert.equal(formatNoteDetail(note), [
    '# Atomic notes',
    '',
    'Each note should capture one idea.',
    '',
    'Tags: zettelkasten, writing',
    'Links: Permanent notes',
    'Backlinks: Knowledge work',
    'Todos: Review technique',
    'Checklist:',
    '- [x] Draft the atomic note',
    '- [ ] Link related notes',
    'Created: 2026-07-01T10:00:00.000Z',
    'Updated: 2026-07-02T10:00:00.000Z',
  ].join('\n'));
});

test('formatNoteDetail prints explicit empty states for missing relations', () => {
  assert.match(formatNoteDetail({ ...note, tags: [], links: [], backlinks: [], todos: [], checklistItems: [] }), /Tags: \(none\)\nLinks: \(none\)\nBacklinks: \(none\)\nTodos: \(none\)\nChecklist: \(none\)/);
});

test('formatNoteMarkdown renders resource links as zk URIs', () => {
  const markdown = formatNoteMarkdown(note);

  assert.match(markdown, /# Atomic notes/);
  assert.match(markdown, /- \[\[Permanent notes\]\] \(zk:\/\/notes\/22222222-2222-4222-8222-222222222222\)/);
  assert.match(markdown, /- \[\[Knowledge work\]\] \(zk:\/\/notes\/33333333-3333-4333-8333-333333333333\)/);
  assert.match(markdown, /- \[ \] Review technique \(zk:\/\/todos\/44444444-4444-4444-8444-444444444444\)/);
  assert.match(markdown, /## Checklist\n- \[x\] Draft the atomic note\n- \[ \] Link related notes/);
});

test('formatNoteMarkdown orders checklist items by position', () => {
  const markdown = formatNoteMarkdown({
    ...note,
    checklistItems: [
      { ...note.checklistItems[1], position: 1 },
      { ...note.checklistItems[0], position: 0 },
    ],
  });

  assert.match(markdown, /## Checklist\n- \[x\] Draft the atomic note\n- \[ \] Link related notes/);
});

test('formatSearchResults renders scores to two decimal places', () => {
  const results: SearchResult[] = [
    {
      id: '11111111-1111-4111-8111-111111111111',
      title: 'First result',
      snippet: 'A short matching excerpt from the note body.',
      tags: ['zettelkasten', 'writing'],
      rank: 0.9876,
      updated_at: '2026-07-02T10:00:00.000Z',
    },
  ];

  assert.equal(formatSearchResults(results), [
    '1. 11111111... | First result | score: 0.99 | updated: 2026-07-02',
    '   Tags: zettelkasten, writing',
    '   Snippet: A short matching excerpt from the note body.',
  ].join('\n'));
});

test('formatSearchResults reports missing tags and snippets clearly', () => {
  const results: SearchResult[] = [
    {
      id: '11111111-1111-4111-8111-111111111111',
      title: 'First result',
      snippet: '',
      tags: [],
      rank: 0.9876,
      updated_at: '2026-07-02T10:00:00.000Z',
    },
  ];

  assert.equal(formatSearchResults(results), [
    '1. 11111111... | First result | score: 0.99 | updated: 2026-07-02',
    '   Tags: (none)',
    '   Snippet: (none)',
  ].join('\n'));
});

test('formatSearchResults reports no matches clearly', () => {
  assert.equal(formatSearchResults([]), 'No results found');
});

test('formatNoteList renders full IDs and ISO dates', () => {
  const notes: Note[] = [
    {
      id: '11111111-1111-4111-8111-111111111111',
      title: 'Atomic notes',
      body: '',
      created_at: '2026-07-01T10:00:00.000Z',
      updated_at: '2026-07-02T10:00:00.000Z',
    },
  ];

  assert.equal(formatNoteList(notes), '11111111-1111-4111-8111-111111111111 | Atomic notes | 2026-07-02');
});

test('formatNoteList reports empty lists clearly', () => {
  assert.equal(formatNoteList([]), 'No notes found');
});

test('formatBacklinks renders short IDs and titles', () => {
  assert.equal(
    formatBacklinks([{ id: '33333333-3333-4333-8333-333333333333', title: 'Knowledge work' }]),
    '33333333... | Knowledge work',
  );
});

test('formatBacklinks reports empty backlinks clearly', () => {
  assert.equal(formatBacklinks([]), 'No backlinks found');
});

const todo: TodoWithRelations = {
  id: '55555555-5555-4555-8555-555555555555',
  title: 'Write tests',
  description: 'Add test coverage for todo formatters',
  status: 'in_progress',
  priority: 2,
  due_date: '2026-07-15T00:00:00.000Z',
  completed_at: null,
  created_at: '2026-07-06T10:00:00.000Z',
  updated_at: '2026-07-07T10:00:00.000Z',
  notes: [{ id: '11111111-1111-4111-8111-111111111111', title: 'Atomic notes' }],
};

const todoSimple: Todo = {
  id: '66666666-6666-4666-8666-666666666666',
  title: 'Simple todo',
  description: '',
  status: 'pending',
  priority: 0,
  due_date: null,
  completed_at: null,
  created_at: '2026-07-06T10:00:00.000Z',
  updated_at: '2026-07-06T10:00:00.000Z',
};

test('formatTodoDetail includes all fields and linked notes', () => {
  assert.equal(formatTodoDetail(todo), [
    '# Write tests',
    '',
    'Add test coverage for todo formatters',
    '',
    'Status: in_progress',
    'Priority: medium (2)',
    'Due: 2026-07-15',
    'Completed: -',
    'Notes: Atomic notes',
    'Created: 2026-07-06T10:00:00.000Z',
    'Updated: 2026-07-07T10:00:00.000Z',
  ].join('\n'));
});

test('formatTodoDetail shows placeholder for missing description and null dates', () => {
  const minimal: TodoWithRelations = { ...todo, description: '', due_date: null, notes: [] };
  assert.match(formatTodoDetail(minimal), /\(no description\)/);
  assert.match(formatTodoDetail(minimal), /Due: \(none\)/);
  assert.match(formatTodoDetail(minimal), /Notes: \(none\)/);
});

test('formatTodoList renders id status priority and date', () => {
  assert.equal(
    formatTodoList([todoSimple]),
    '66666666-6666-4666-8666-666666666666 | Simple todo | pending | none | 2026-07-06',
  );
});

test('formatTodoList reports empty lists clearly', () => {
  assert.equal(formatTodoList([]), 'No todos found');
});

test('formatTodoSearchResults renders scores to two decimal places', () => {
  const results: TodoSearchResult[] = [
    {
      id: '55555555-5555-4555-8555-555555555555',
      title: 'Write tests',
      description: 'Add test coverage for todo formatters',
      snippet: 'Add test coverage for <b>todo</b> formatters',
      rank: 0.9876,
      status: 'in_progress',
      priority: 2,
      updated_at: '2026-07-07T10:00:00.000Z',
    },
  ];

  assert.equal(formatTodoSearchResults(results), [
    '1. 55555555... | Write tests | in_progress | medium | score: 0.99 | updated: 2026-07-07',
    '   Snippet: Add test coverage for <b>todo</b> formatters',
  ].join('\n'));
});

test('formatTodoSearchResults reports no matches clearly', () => {
  assert.equal(formatTodoSearchResults([]), 'No todos found');
});
