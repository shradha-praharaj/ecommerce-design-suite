import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { conversationMemoryAgent } from './conversation-memory-agent.js';
import { db, usersTable, chatConversationsTable } from '@workspace/db';
import { eq } from 'drizzle-orm';

describe('ConversationMemoryAgent', () => {
  let testUserId: number;
  let testOtherUserId: number;

  before(async () => {
    // Create temporary test users
    const [user1] = await db
      .insert(usersTable)
      .values({
        name: 'Memory Test User 1',
        email: `memtest1_${Date.now()}@example.com`,
        passwordHash: 'testhash',
        salt: 'testsalt',
      })
      .returning();
    testUserId = user1.id;

    const [user2] = await db
      .insert(usersTable)
      .values({
        name: 'Memory Test User 2',
        email: `memtest2_${Date.now()}@example.com`,
        passwordHash: 'testhash',
        salt: 'testsalt',
      })
      .returning();
    testOtherUserId = user2.id;
  });

  after(async () => {
    // Clean up test users (cascades to chat tables)
    if (testUserId) {
      await db.delete(usersTable).where(eq(usersTable.id, testUserId));
    }
    if (testOtherUserId) {
      await db.delete(usersTable).where(eq(usersTable.id, testOtherUserId));
    }
  });

  it('loads and creates a new conversation when none provided', async () => {
    const memory = await conversationMemoryAgent.load(testUserId, undefined, true);
    assert.ok(memory.conversationId > 0);
    assert.strictEqual(memory.personalizationEnabled, true);
    assert.deepStrictEqual(memory.history, []);
    assert.strictEqual(memory.checkpoint, undefined);
  });

  it('appends user & assistant turns with versioned checkpoint', async () => {
    const memory = await conversationMemoryAgent.load(testUserId, undefined, true);
    const clientMessageId = `msg_${Date.now()}_1`;

    await conversationMemoryAgent.appendTurn({
      userId: testUserId,
      conversationId: memory.conversationId,
      clientMessageId,
      userMessage: 'Help me pick a gaming PC for my son',
      assistantResponse: {
        reply: 'What will your son primarily do on this PC?',
        products: [],
        orders: [],
      },
      checkpoint: {
        version: 1,
        activeAgent: 'gaming_build',
        recipient: 'son',
        answers: { workload: 'gaming' },
        personalizationEnabled: true,
      },
    });

    const reloaded = await conversationMemoryAgent.load(testUserId, memory.conversationId);
    assert.strictEqual(reloaded.history.length, 2);
    assert.strictEqual(reloaded.history[0].role, 'user');
    assert.strictEqual(reloaded.history[0].content, 'Help me pick a gaming PC for my son');
    assert.strictEqual(reloaded.history[1].role, 'assistant');
    assert.ok(reloaded.history[1].content.includes('What will your son primarily do'));

    assert.ok(reloaded.checkpoint);
    assert.strictEqual(reloaded.checkpoint.activeAgent, 'gaming_build');
    assert.strictEqual(reloaded.checkpoint.recipient, 'son');
  });

  it('replays response idempotently for duplicate clientMessageId', async () => {
    const memory = await conversationMemoryAgent.load(testUserId, undefined, true);
    const clientMessageId = `msg_dedup_${Date.now()}`;

    await conversationMemoryAgent.appendTurn({
      userId: testUserId,
      conversationId: memory.conversationId,
      clientMessageId,
      userMessage: 'Show me mobile phones',
      assistantResponse: {
        reply: 'Here are the best mobile phones',
        products: [{ id: 1, name: 'Phone X' }],
      },
    });

    const completed = await conversationMemoryAgent.findCompletedTurn({
      userId: testUserId,
      conversationId: memory.conversationId,
      clientMessageId,
    });

    assert.ok(completed);
    assert.strictEqual((completed as any).reply, 'Here are the best mobile phones');

    // Also test finding turn by user + clientMessageId across conversations
    const userMatch = await conversationMemoryAgent.findCompletedTurnForUser(
      testUserId,
      clientMessageId,
    );
    assert.ok(userMatch);
    assert.strictEqual(userMatch.conversationId, memory.conversationId);
  });

  it('enforces ownership isolation: user cannot load another user conversation', async () => {
    const memory = await conversationMemoryAgent.load(testUserId, undefined, true);

    await assert.rejects(
      async () => {
        await conversationMemoryAgent.load(testOtherUserId, memory.conversationId);
      },
      {
        message: 'Conversation not found',
      },
    );
  });

  it('lists and deletes conversations with cascading cleanup', async () => {
    const memory = await conversationMemoryAgent.load(testUserId, undefined, true);
    await conversationMemoryAgent.appendTurn({
      userId: testUserId,
      conversationId: memory.conversationId,
      userMessage: 'Temporary turn',
      assistantResponse: 'Temporary reply',
    });

    const list = await conversationMemoryAgent.list(testUserId);
    assert.ok(list.some((c) => c.id === memory.conversationId));

    const deleted = await conversationMemoryAgent.delete(testUserId, memory.conversationId);
    assert.strictEqual(deleted, true);

    const listAfter = await conversationMemoryAgent.list(testUserId);
    assert.ok(!listAfter.some((c) => c.id === memory.conversationId));
  });
});
