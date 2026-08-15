import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { RouterAgent } from './router-agent.js';
import { SupervisorAgent } from './supervisor-agent.js';
import { detectCorrection, formatSelfCorrectionPrefix } from './self-correction-engine.js';
import type { AgentContext } from './types.js';

describe('RouterAgent & Intent Classification', () => {
  const router = new RouterAgent();

  const createContext = (message: string, history: any[] = []): AgentContext => ({
    message,
    userId: null,
    userContext: {},
    history,
  });

  it('classifies greeting intent', async () => {
    const result = await router.classifyIntent(createContext('hello there!'));
    assert.strictEqual(result.isGreeting, true);
  });

  it('classifies guided advisor for mobile recommendation query', async () => {
    const result = await router.classifyIntent(createContext('help me pick a mobile phone'));
    assert.strictEqual(result.intent, 'guided_advisor');
  });

  it('classifies gaming PC build intent', async () => {
    const result = await router.classifyIntent(createContext('build me a gaming pc for 1.5 lakh'));
    assert.strictEqual(result.intent, 'gaming_build');
  });

  it('classifies return/refund requests to orders agent', async () => {
    const result = await router.classifyIntent(createContext('how do I return my recent order?'));
    assert.strictEqual(result.intent, 'orders');
  });

  it('classifies product comparison queries', async () => {
    const result = await router.classifyIntent(createContext('compare iPhone 15 vs Galaxy S24'));
    assert.ok(result.intent === 'compare' || result.intent === 'product_search');
  });

  it('keeps concrete catalog searches local without an LLM call', async () => {
    const result = await router.classifyIntent(
      createContext('show me laptops under ₹60,000'),
    );
    assert.strictEqual(result.intent, 'product_search');
    assert.strictEqual(result.category, 'Laptops');
    assert.strictEqual(result.maxPrice, 60000);
  });
});

describe('Self-Correction Engine', () => {
  it('detects explicit user correction patterns', () => {
    const correction1 = detectCorrection('no I meant laptops, not mobiles');
    assert.strictEqual(correction1.isCorrection, true);
    assert.strictEqual(correction1.correctionType, 'category');

    const correction2 = detectCorrection('wrong brand, I wanted Samsung');
    assert.strictEqual(correction2.isCorrection, true);
    assert.strictEqual(correction2.correctionType, 'brand');

    const correction3 = detectCorrection('that is too expensive, I said under 30000');
    assert.strictEqual(correction3.isCorrection, true);
    assert.strictEqual(correction3.correctionType, 'budget');
  });

  it('formats empathetic correction prefix', () => {
    const analysis = detectCorrection('no I meant laptops');
    const prefix = formatSelfCorrectionPrefix(analysis);
    assert.ok(prefix.startsWith('💡'));
    assert.ok(prefix.includes('category') || prefix.includes('Got it') || prefix.includes('Understood'));
  });

  it('does not trigger on standard shopping queries', () => {
    const normal1 = detectCorrection('show me laptops under 60000');
    assert.strictEqual(normal1.isCorrection, false);

    const normal2 = detectCorrection('help me choose a headset');
    assert.strictEqual(normal2.isCorrection, false);
  });
});

describe('SupervisorAgent Recovery & Guardrails', () => {
  const supervisor = new SupervisorAgent();

  it('recovers active agent from checkpoint when router intent is ambiguous', async () => {
    const ctx: AgentContext = {
      message: '₹30,000 - ₹60,000', // Ambiguous chip click
      userId: null,
      userContext: {},
      history: [
        { role: 'user', content: 'help me pick a mobile' },
        { role: 'assistant', content: 'What is your budget for Mobiles?' },
      ],
      checkpoint: {
        version: 1,
        activeAgent: 'guided_advisor',
        category: 'Mobiles',
      },
    };

    const response = await supervisor.execute(ctx);
    assert.ok(response.reply);
    assert.ok(response.checkpoint);
    assert.strictEqual(response.checkpoint.activeAgent, 'guided_advisor');
  });

  it('prepends self-correction prefix when user corrects previous turn', async () => {
    const ctx: AgentContext = {
      message: 'no I meant Samsung phones under 30000',
      userId: null,
      userContext: {},
      history: [
        { role: 'user', content: 'show me Apple phones' },
        { role: 'assistant', content: 'Here are Apple iPhones' },
      ],
    };

    const response = await supervisor.execute(ctx);
    assert.ok(response.reply.startsWith('💡'));
  });

  it('guarantees catalog grounding explanation on product results', async () => {
    const ctx: AgentContext = {
      message: 'show me headphones',
      userId: null,
      userContext: {},
    };

    const response = await supervisor.execute(ctx);
    assert.ok(response.explanation);
    assert.strictEqual(response.explanation.source, 'catalog');
    assert.ok(response.explanation.why.length > 0);
  });
});
