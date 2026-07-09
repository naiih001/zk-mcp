import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from './generated/prisma/client.js';
import { logError, serializeError } from './observability.js';
import type { ChecklistItem, Note, NoteWithRelations, SearchResult, Todo, TodoWithRelations, TodoSearchResult } from './schema.js';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is required');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

type ExpectedPrismaCode = 'P2002' | 'P2003' | 'P2004' | 'P2025';

export class DatabaseOperationError extends Error {
  constructor(operation: string, cause: unknown) {
    super(`Database operation failed: ${operation}`, { cause });
    this.name = 'DatabaseOperationError';
  }
}

export function isExpectedPrismaError(err: unknown, codes: readonly ExpectedPrismaCode[]): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && codes.includes(err.code as ExpectedPrismaCode);
}

export function handleDatabaseError<T>(
  operation: string,
  err: unknown,
  expectedCodes: readonly ExpectedPrismaCode[],
  fallback: T,
): T {
  if (isExpectedPrismaError(err, expectedCodes)) {
    return fallback;
  }

  logError('db_error', {
    operation,
    ...serializeError(err),
  });
  throw new DatabaseOperationError(operation, err);
}

type PrismaNote = {
  id: string;
  title: string;
  body: string;
  createdAt: Date;
  updatedAt: Date;
};

type PrismaChecklistItem = {
  id: string;
  noteId: string;
  text: string;
  checked: boolean;
  position: number;
  createdAt: Date;
  updatedAt: Date;
};

function toNote(note: PrismaNote): Note {
  return {
    id: note.id,
    title: note.title,
    body: note.body,
    created_at: note.createdAt.toISOString(),
    updated_at: note.updatedAt.toISOString(),
  };
}

export async function createNote(title: string, body: string, tagNames?: string[]): Promise<Note> {
  try {
    const note = await prisma.$transaction(async tx => {
      const created = await tx.note.create({
        data: { title, body },
      });

      if (tagNames?.length) {
        for (const name of tagNames) {
          const tag = await tx.tag.upsert({
            where: { name },
            update: {},
            create: { name },
          });
          await tx.noteTag.createMany({
            data: [{ noteId: created.id, tagId: tag.id }],
            skipDuplicates: true,
          });
        }
      }

      return created;
    });

    return toNote(note);
  } catch (err) {
    return handleDatabaseError('createNote', err, [], undefined as never);
  }
}

export async function getNote(id: string): Promise<NoteWithRelations | null> {
  try {
    const note = await prisma.note.findUnique({
      where: { id },
      include: {
        tags: {
          include: { tag: true },
          orderBy: { tag: { name: 'asc' } },
        },
        links: {
          include: { target: { select: { id: true, title: true } } },
          orderBy: { target: { title: 'asc' } },
        },
        backlinks: {
          include: { source: { select: { id: true, title: true } } },
          orderBy: { source: { title: 'asc' } },
        },
        todoLinks: {
          include: { todo: { select: { id: true, title: true } } },
          orderBy: { todo: { title: 'asc' } },
        },
        checklistItems: {
          orderBy: { position: 'asc' },
        },
      },
    });
    if (!note) return null;

    return {
      ...toNote(note),
      tags: note.tags.map(noteTag => noteTag.tag.name),
      links: note.links.map(link => link.target),
      backlinks: note.backlinks.map(link => link.source),
      todos: note.todoLinks.map(tl => tl.todo),
      checklistItems: note.checklistItems.map(toChecklistItem),
    };
  } catch (err) {
    return handleDatabaseError('getNote', err, [], null);
  }
}

function toChecklistItem(item: PrismaChecklistItem): ChecklistItem {
  return {
    id: item.id,
    note_id: item.noteId,
    text: item.text,
    checked: item.checked,
    position: item.position,
    created_at: item.createdAt.toISOString(),
    updated_at: item.updatedAt.toISOString(),
  };
}

export async function addChecklistItem(noteId: string, text: string, checked = false, position = 0): Promise<ChecklistItem | null> {
  try {
    const item = await prisma.checklistItem.create({
      data: { noteId, text, checked, position },
    });
    return toChecklistItem(item);
  } catch (err) {
    return handleDatabaseError('addChecklistItem', err, ['P2003'], null);
  }
}

export async function toggleChecklistItem(id: string, checked?: boolean): Promise<ChecklistItem | null> {
  try {
    const existing = await prisma.checklistItem.findUnique({ where: { id } });
    if (!existing) return null;
    const item = await prisma.checklistItem.update({
      where: { id },
      data: { checked: checked ?? !existing.checked },
    });
    return toChecklistItem(item);
  } catch (err) {
    return handleDatabaseError('toggleChecklistItem', err, ['P2025'], null);
  }
}

export async function deleteChecklistItem(id: string): Promise<boolean> {
  try {
    await prisma.checklistItem.delete({ where: { id } });
    return true;
  } catch (err) {
    return handleDatabaseError('deleteChecklistItem', err, ['P2025'], false);
  }
}

export async function reorderChecklistItems(noteId: string, itemIds: string[]): Promise<ChecklistItem[] | null> {
  try {
    const existing = await prisma.checklistItem.findMany({
      where: { noteId },
      select: { id: true },
    });
    const existingIds = new Set(existing.map(item => item.id));
    if (itemIds.length !== existingIds.size || itemIds.some(id => !existingIds.has(id))) {
      return null;
    }

    const updated = await prisma.$transaction(
      itemIds.map((id, position) => prisma.checklistItem.update({
        where: { id },
        data: { position },
      })),
    );

    return updated.map(toChecklistItem);
  } catch (err) {
    return handleDatabaseError('reorderChecklistItems', err, ['P2025'], null);
  }
}

export async function updateNote(id: string, title?: string, body?: string): Promise<Note | null> {
  const data: Prisma.NoteUpdateInput = {};
  if (title !== undefined) data.title = title;
  if (body !== undefined) data.body = body;
  if (Object.keys(data).length === 0) return null;

  try {
    const note = await prisma.note.update({
      where: { id },
      data,
    });
    return toNote(note);
  } catch (err) {
    return handleDatabaseError('updateNote', err, ['P2025'], null);
  }
}

export async function deleteNote(id: string): Promise<boolean> {
  try {
    await prisma.note.delete({ where: { id } });
    return true;
  } catch (err) {
    return handleDatabaseError('deleteNote', err, ['P2025'], false);
  }
}

export async function searchNotes(queryStr: string, limit = 50, offset = 0): Promise<SearchResult[]> {
  try {
    const rows = await prisma.$queryRaw<{
      id: string;
      title: string;
      snippet: string;
      tags: string[];
      rank: number;
      updated_at: Date;
    }[]>`
      SELECT n.id,
             n.title,
             ts_headline(
               'english',
               n.body,
               plainto_tsquery('english', ${queryStr}),
               'MaxWords=35, MinWords=12, ShortWord=3, HighlightAll=false'
             ) as snippet,
             COALESCE(
               array_agg(t.name ORDER BY t.name) FILTER (WHERE t.name IS NOT NULL),
               ARRAY[]::text[]
             ) as tags,
             ts_rank(n.search, plainto_tsquery('english', ${queryStr})) as rank,
             n.updated_at
      FROM notes n
      LEFT JOIN note_tags nt ON nt.note_id = n.id
      LEFT JOIN tags t ON t.id = nt.tag_id
      WHERE n.search @@ plainto_tsquery('english', ${queryStr})
      GROUP BY n.id, n.title, n.body, n.search, n.updated_at
      ORDER BY rank DESC, n.updated_at DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `;

    return rows.map(row => ({
      id: row.id,
      title: row.title,
      snippet: row.snippet,
      tags: row.tags,
      rank: row.rank,
      updated_at: row.updated_at.toISOString(),
    }));
  } catch (err) {
    return handleDatabaseError('searchNotes', err, [], []);
  }
}

export async function listNotes(tag?: string, limit = 50, offset = 0): Promise<Note[]> {
  try {
    const notes = await prisma.note.findMany({
      where: tag ? { tags: { some: { tag: { name: tag } } } } : undefined,
      orderBy: { updatedAt: 'desc' },
      take: limit,
      skip: offset,
    });
    return notes.map(toNote);
  } catch (err) {
    return handleDatabaseError('listNotes', err, [], []);
  }
}

export async function linkNotes(sourceId: string, targetId: string): Promise<boolean> {
  try {
    await prisma.link.create({
      data: {
        sourceNoteId: sourceId,
        targetNoteId: targetId,
      },
    });
    return true;
  } catch (err) {
    return handleDatabaseError('linkNotes', err, ['P2002', 'P2003', 'P2004'], false);
  }
}

export async function getBacklinks(noteId: string): Promise<{ id: string; title: string }[]> {
  try {
    const links = await prisma.link.findMany({
      where: { targetNoteId: noteId },
      include: { source: { select: { id: true, title: true } } },
      orderBy: { source: { title: 'asc' } },
    });
    return links.map(link => link.source);
  } catch (err) {
    return handleDatabaseError('getBacklinks', err, [], []);
  }
}

export async function addTag(noteId: string, tagName: string): Promise<boolean> {
  try {
    const tag = await prisma.tag.upsert({
      where: { name: tagName },
      update: {},
      create: { name: tagName },
    });
    await prisma.noteTag.create({
      data: {
        noteId,
        tagId: tag.id,
      },
    });
    return true;
  } catch (err) {
    return handleDatabaseError('addTag', err, ['P2002', 'P2003'], false);
  }
}

export async function removeTag(noteId: string, tagName: string): Promise<boolean> {
  try {
    const tag = await prisma.tag.findUnique({
      where: { name: tagName },
      select: { id: true },
    });
    if (!tag) return false;

    await prisma.noteTag.delete({
      where: {
        noteId_tagId: {
          noteId,
          tagId: tag.id,
        },
      },
    });
    return true;
  } catch (err) {
    return handleDatabaseError('removeTag', err, ['P2025'], false);
  }
}

type PrismaTodo = {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: number;
  dueDate: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function toTodo(todo: PrismaTodo): Todo {
  return {
    id: todo.id,
    title: todo.title,
    description: todo.description,
    status: todo.status,
    priority: todo.priority,
    due_date: todo.dueDate?.toISOString() ?? null,
    completed_at: todo.completedAt?.toISOString() ?? null,
    created_at: todo.createdAt.toISOString(),
    updated_at: todo.updatedAt.toISOString(),
  };
}

export async function createTodo(
  title: string,
  description?: string,
  status?: string,
  priority?: number,
  dueDate?: string,
): Promise<Todo> {
  try {
    const todo = await prisma.todo.create({
      data: {
        title,
        description: description ?? '',
        status: status ?? 'pending',
        priority: priority ?? 0,
        dueDate: dueDate ? new Date(dueDate) : undefined,
      },
    });
    return toTodo(todo);
  } catch (err) {
    return handleDatabaseError('createTodo', err, [], undefined as never);
  }
}

export async function getTodo(id: string): Promise<TodoWithRelations | null> {
  try {
    const todo = await prisma.todo.findUnique({
      where: { id },
      include: {
        notes: {
          include: { note: { select: { id: true, title: true } } },
          orderBy: { note: { title: 'asc' } },
        },
      },
    });
    if (!todo) return null;

    return {
      ...toTodo(todo),
      notes: todo.notes.map(tn => tn.note),
    };
  } catch (err) {
    return handleDatabaseError('getTodo', err, [], null);
  }
}

export async function updateTodo(
  id: string,
  fields: {
    title?: string;
    description?: string;
    status?: string;
    priority?: number;
    dueDate?: string | null;
  },
): Promise<Todo | null> {
  const data: Record<string, unknown> = {};
  if (fields.title !== undefined) data.title = fields.title;
  if (fields.description !== undefined) data.description = fields.description;
  if (fields.status !== undefined) data.status = fields.status;
  if (fields.priority !== undefined) data.priority = fields.priority;
  if (fields.dueDate !== undefined) {
    data.dueDate = fields.dueDate ? new Date(fields.dueDate) : null;
  }
  if (fields.status === 'completed') {
    data.completedAt = new Date();
  } else if (fields.status !== undefined && fields.status !== 'completed') {
    data.completedAt = null;
  }
  if (Object.keys(data).length === 0) return null;

  try {
    const todo = await prisma.todo.update({
      where: { id },
      data,
    });
    return toTodo(todo);
  } catch (err) {
    return handleDatabaseError('updateTodo', err, ['P2025'], null);
  }
}

export async function deleteTodo(id: string): Promise<boolean> {
  try {
    await prisma.todo.delete({ where: { id } });
    return true;
  } catch (err) {
    return handleDatabaseError('deleteTodo', err, ['P2025'], false);
  }
}

export async function listTodos(status?: string, limit = 50, offset = 0): Promise<Todo[]> {
  try {
    const todos = await prisma.todo.findMany({
      where: status ? { status } : undefined,
      orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
      take: limit,
      skip: offset,
    });
    return todos.map(toTodo);
  } catch (err) {
    return handleDatabaseError('listTodos', err, [], []);
  }
}

export async function searchTodos(queryStr: string, limit = 50, offset = 0): Promise<TodoSearchResult[]> {
  try {
    const rows = await prisma.$queryRaw<{
      id: string;
      title: string;
      description: string;
      snippet: string;
      rank: number;
      status: string;
      priority: number;
      updated_at: Date;
    }[]>`
      SELECT t.id,
             t.title,
             t.description,
             ts_headline(
               'english',
               t.description,
               plainto_tsquery('english', ${queryStr}),
               'MaxWords=35, MinWords=12, ShortWord=3, HighlightAll=false'
             ) as snippet,
             ts_rank(t.search, plainto_tsquery('english', ${queryStr})) as rank,
             t.status,
             t.priority,
             t.updated_at
      FROM todos t
      WHERE t.search @@ plainto_tsquery('english', ${queryStr})
      ORDER BY rank DESC, t.updated_at DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `;

    return rows.map(row => ({
      id: row.id,
      title: row.title,
      description: row.description,
      snippet: row.snippet,
      rank: row.rank,
      status: row.status,
      priority: row.priority,
      updated_at: row.updated_at.toISOString(),
    }));
  } catch (err) {
    return handleDatabaseError('searchTodos', err, [], []);
  }
}

export async function linkTodoToNote(todoId: string, noteId: string): Promise<boolean> {
  try {
    await prisma.todoNote.create({
      data: { todoId, noteId },
    });
    return true;
  } catch (err) {
    return handleDatabaseError('linkTodoToNote', err, ['P2002', 'P2003', 'P2004'], false);
  }
}

export async function unlinkTodoFromNote(todoId: string, noteId: string): Promise<boolean> {
  try {
    await prisma.todoNote.delete({
      where: { todoId_noteId: { todoId, noteId } },
    });
    return true;
  } catch (err) {
    return handleDatabaseError('unlinkTodoFromNote', err, ['P2025'], false);
  }
}

export async function getTodoNotes(todoId: string): Promise<{ id: string; title: string }[]> {
  try {
    const links = await prisma.todoNote.findMany({
      where: { todoId },
      include: { note: { select: { id: true, title: true } } },
      orderBy: { note: { title: 'asc' } },
    });
    return links.map(link => link.note);
  } catch (err) {
    return handleDatabaseError('getTodoNotes', err, [], []);
  }
}

export async function getAllTags(): Promise<string[]> {
  try {
    const tags = await prisma.tag.findMany({
      orderBy: { name: 'asc' },
      select: { name: true },
    });
    return tags.map(tag => tag.name);
  } catch (err) {
    return handleDatabaseError('getAllTags', err, [], []);
  }
}
