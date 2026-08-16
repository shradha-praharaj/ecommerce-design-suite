import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { GamingBuildAdvisorAgent } from './gaming-build-advisor-agent.js';
import type { AgentContext } from './types.js';

const agent = new GamingBuildAdvisorAgent();

const run = (
  message: string,
  history: Array<{ role: string; content: string }> = [],
) =>
  agent.execute(
    { message, userId: null, userContext: {}, history } as AgentContext,
    { intent: 'gaming_build' },
  );

// A finished build conversation that must not leak into the next request.
const completedBuild = [
  { role: 'user', content: 'build me a gaming pc' },
  { role: 'assistant', content: 'What will they primarily do on this PC?' },
  { role: 'user', content: 'Pure Gaming & Esports' },
  {
    role: 'assistant',
    content: 'How much time will they typically spend using it?',
  },
  { role: 'user', content: 'Long hours / intensive use' },
  { role: 'assistant', content: 'what is your total target budget in INR?' },
  { role: 'user', content: '150000' },
  { role: 'assistant', content: 'Component Breakdown ready to add components' },
];

describe('GamingBuildAdvisorAgent new build requests', () => {
  it('asks about usage instead of building immediately (the reported bug)', async () => {
    const res = await run('I want to build pc for my son', completedBuild);

    assert.strictEqual(res.products.length, 0, 'must not build without asking');
    assert.match(res.reply, /what will they primarily do/i);
  });

  it('does not inherit the previous budget or workload', async () => {
    const res = await run('help me build a pc for my son', completedBuild);

    assert.strictEqual(res.products.length, 0);
    assert.doesNotMatch(res.reply, /1,50,000|150000/);
    assert.doesNotMatch(res.reply, /heavy/i);
  });

  it('still collects answers across turns of the same build', async () => {
    const history = [...completedBuild];
    const initiation = 'I want to build pc for my son';

    const first = await run(initiation, history);
    history.push(
      { role: 'user', content: initiation },
      { role: 'assistant', content: first.reply },
    );

    const second = await run('Pure Gaming & Esports', history);
    assert.strictEqual(second.products.length, 0);
    assert.match(second.reply, /how much time/i);
    history.push(
      { role: 'user', content: 'Pure Gaming & Esports' },
      { role: 'assistant', content: second.reply },
    );

    const third = await run('Daily school or home use', history);
    assert.strictEqual(third.products.length, 0);
    assert.match(third.reply, /budget/i);
    history.push(
      { role: 'user', content: 'Daily school or home use' },
      { role: 'assistant', content: third.reply },
    );

    const built = await run('80000', history);
    assert.ok(built.products.length > 0, 'should build once budget is given');
  });

  it('treats build tweaks as continuations, not new builds', async () => {
    const history = [
      { role: 'user', content: 'build me a gaming pc' },
      { role: 'assistant', content: 'What will they primarily do on this PC?' },
      { role: 'user', content: 'Pure Gaming & Esports' },
      {
        role: 'assistant',
        content: 'How much time will they typically spend using it?',
      },
      { role: 'user', content: 'Long hours / intensive use' },
      {
        role: 'assistant',
        content: 'what is your total target budget in INR?',
      },
      { role: 'user', content: '150000' },
      {
        role: 'assistant',
        content: 'Component Breakdown ready to add components',
      },
    ];

    const res = await run('Show cheaper build', history);
    assert.ok(res.products.length > 0, 'tweak should keep the existing brief');
  });
});
