import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from './generated/prisma/client.js';
import type { Note, NoteWithRelations, SearchResult } from './schema.js';

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

  throw new DatabaseOperationError(operation, err);
}

type PrismaNote = {
  id: string;
  title: string;
  body: string;
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
      },
    });
    if (!note) return null;

    return {
      ...toNote(note),
      tags: note.tags.map(noteTag => noteTag.tag.name),
      links: note.links.map(link => link.target),
      backlinks: note.backlinks.map(link => link.source),
    };
  } catch (err) {
    return handleDatabaseError('getNote', err, [], null);
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
