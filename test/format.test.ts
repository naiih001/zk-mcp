import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatBacklinks,
  formatNoteDetail,
  formatNoteList,
  formatNoteMarkdown,
  formatSearchResults,
} from '../src/format.js';
import type { Note, NoteWithRelations, SearchResult } from '../src/schema.js';

const note: NoteWithRelations = {
  id: '11111111-1111-4111-8111-111111111111',
  title: 'Atomic notes',
  body: 'Each note should capture one idea.',
  created_at: '2026-07-01T10:00:00.000Z',
  updated_at: '2026-07-02T10:00:00.000Z',
  tags: ['zettelkasten', 'writing'],
  links: [{ id: '22222222-2222-4222-8222-222222222222', title: 'Permanent notes' }],
  backlinks: [{ id: '33333333-3333-4333-8333-333333333333', title: 'Knowledge work' }],
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
    'Created: 2026-07-01T10:00:00.000Z',
    'Updated: 2026-07-02T10:00:00.000Z',
  ].join('\n'));
});

test('formatNoteDetail prints explicit empty states for missing relations', () => {
  assert.match(formatNoteDetail({ ...note, tags: [], links: [], backlinks: [] }), /Tags: \(none\)\nLinks: \(none\)\nBacklinks: \(none\)/);
});

test('formatNoteMarkdown renders resource links as zk URIs', () => {
  const markdown = formatNoteMarkdown(note);

  assert.match(markdown, /# Atomic notes/);
  assert.match(markdown, /- \[\[Permanent notes\]\] \(zk:\/\/notes\/22222222-2222-4222-8222-222222222222\)/);
  assert.match(markdown, /- \[\[Knowledge work\]\] \(zk:\/\/notes\/33333333-3333-4333-8333-333333333333\)/);
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

test('formatNoteList renders short IDs and ISO dates', () => {
  const notes: Note[] = [
    {
      id: '11111111-1111-4111-8111-111111111111',
      title: 'Atomic notes',
      body: '',
      created_at: '2026-07-01T10:00:00.000Z',
      updated_at: '2026-07-02T10:00:00.000Z',
    },
  ];

  assert.equal(formatNoteList(notes), '11111111... | Atomic notes | 2026-07-02');
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
