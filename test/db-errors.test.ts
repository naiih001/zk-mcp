import assert from 'node:assert/strict';
import test from 'node:test';

process.env.DATABASE_URL ??= 'postgresql://user:pass@localhost:5432/zk';

const db = await import('../src/db.js');
const { Prisma } = await import('../src/generated/prisma/client.js');

function prismaKnownError(code: string) {
  return new Prisma.PrismaClientKnownRequestError('Prisma failure', {
    code,
    clientVersion: 'test',
  });
}

test('isExpectedPrismaError matches only configured Prisma codes', () => {
  assert.equal(db.isExpectedPrismaError(prismaKnownError('P2025'), ['P2025']), true);
  assert.equal(db.isExpectedPrismaError(prismaKnownError('P2002'), ['P2025']), false);
  assert.equal(db.isExpectedPrismaError(new Error('plain failure'), ['P2025']), false);
});

test('handleDatabaseError returns fallback for expected Prisma errors', () => {
  assert.equal(
    db.handleDatabaseError('deleteNote', prismaKnownError('P2025'), ['P2025'], false),
    false,
  );
});

test('handleDatabaseError wraps unexpected errors with operation context', () => {
  const cause = new Error('connection closed');

  assert.throws(
    () => db.handleDatabaseError('searchNotes', cause, ['P2025'], []),
    (err) => {
      assert.equal(err instanceof db.DatabaseOperationError, true);
      assert.equal((err as Error).message, 'Database operation failed: searchNotes');
      assert.equal((err as Error & { cause?: unknown }).cause, cause);
      return true;
    },
  );
});
