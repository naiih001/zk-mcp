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
}

export async function getNote(id: string): Promise<NoteWithRelations | null> {
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
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      return null;
    }
    throw err;
  }
}

export async function deleteNote(id: string): Promise<boolean> {
  try {
    await prisma.note.delete({ where: { id } });
    return true;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      return false;
    }
    throw err;
  }
}

export async function searchNotes(queryStr: string): Promise<SearchResult[]> {
  const rows = await prisma.$queryRaw<{
    id: string;
    title: string;
    body: string;
    rank: number;
    updated_at: Date;
  }[]>`
    SELECT id, title, body,
           ts_rank(search, plainto_tsquery('english', ${queryStr})) as rank,
           updated_at
    FROM notes
    WHERE search @@ plainto_tsquery('english', ${queryStr})
    ORDER BY rank DESC
    LIMIT 50
  `;

  return rows.map(row => ({
    id: row.id,
    title: row.title,
    body: row.body,
    rank: row.rank,
    updated_at: row.updated_at.toISOString(),
  }));
}

export async function listNotes(tag?: string, limit = 50, offset = 0): Promise<Note[]> {
  const notes = await prisma.note.findMany({
    where: tag ? { tags: { some: { tag: { name: tag } } } } : undefined,
    orderBy: { updatedAt: 'desc' },
    take: limit,
    skip: offset,
  });
  return notes.map(toNote);
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
    if (err instanceof Prisma.PrismaClientKnownRequestError && ['P2002', 'P2003', 'P2004'].includes(err.code)) {
      return false;
    }
    throw err;
  }
}

export async function getBacklinks(noteId: string): Promise<{ id: string; title: string }[]> {
  const links = await prisma.link.findMany({
    where: { targetNoteId: noteId },
    include: { source: { select: { id: true, title: true } } },
    orderBy: { source: { title: 'asc' } },
  });
  return links.map(link => link.source);
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
    if (err instanceof Prisma.PrismaClientKnownRequestError && ['P2002', 'P2003'].includes(err.code)) {
      return false;
    }
    throw err;
  }
}

export async function removeTag(noteId: string, tagName: string): Promise<boolean> {
  const tag = await prisma.tag.findUnique({
    where: { name: tagName },
    select: { id: true },
  });
  if (!tag) return false;

  try {
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
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      return false;
    }
    throw err;
  }
}

export async function getAllTags(): Promise<string[]> {
  const tags = await prisma.tag.findMany({
    orderBy: { name: 'asc' },
    select: { name: true },
  });
  return tags.map(tag => tag.name);
}
