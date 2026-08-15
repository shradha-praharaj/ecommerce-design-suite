import { Router } from 'express';
import {
  checkAIAvailability,
  checkLLMQuotaStatus,
  SupervisorAgent,
  loadUserContext,
  conversationMemoryAgent,
} from '../agents/index.js';
import type { ConversationCheckpoint } from '../agents/types.js';
import { compareProducts, recommendProduct } from '../agents/compare-agent.js';

import { getAuthUserId } from '../lib/crypto.js';

export const aiRouter = Router();

const supervisorAgent = new SupervisorAgent();

/**
 * Basic AI availability check
 */
aiRouter.get('/status', async (_req, res) => {
  const status = await checkAIAvailability();
  return res.status(status.available ? 200 : 503).json(status);
});

/**
 * Detailed LLM quota & rate limit diagnostic endpoint
 * Returns:
 * - canUseModel: boolean (whether you can use LLM right now)
 * - isLimitExhausted: boolean (whether free limits are exhausted)
 * - activeProvider / activeModel
 * - detailed status for both Google Gemini and OpenCode
 */
aiRouter.get('/quota-status', async (_req, res) => {
  try {
    const quotaInfo = await checkLLMQuotaStatus();
    return res.status(quotaInfo.canUseModel ? 200 : 429).json(quotaInfo);
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      canUseModel: false,
      isLimitExhausted: true,
      error: error instanceof Error ? error.message : 'Failed to query quota status',
    });
  }
});

aiRouter.post('/chat', async (req, res) => {
  const {
    message,
    history,
    conversationId: requestedConversationId,
    clientMessageId,
    personalizationEnabled = false,
  } = req.body;
  if (typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ message: 'Message is required' });
  }

  const userId = getAuthUserId(req);
  if (
    userId &&
    (typeof clientMessageId !== 'string' || !clientMessageId.trim())
  ) {
    return res
      .status(400)
      .json({ message: 'clientMessageId is required for authenticated chat' });
  }

  try {
    if (userId && !requestedConversationId && clientMessageId) {
      const completedTurn =
        await conversationMemoryAgent.findCompletedTurnForUser(
          userId,
          clientMessageId,
        );
      if (completedTurn) {
        return res.status(200).json({
          ...completedTurn.response,
          conversationId: completedTurn.conversationId,
        });
      }
    }
    const memory = userId
      ? await conversationMemoryAgent.load(
          userId,
          typeof requestedConversationId === 'number'
            ? requestedConversationId
            : undefined,
          personalizationEnabled === true,
        )
      : null;
    if (memory && userId && clientMessageId) {
      const completedResponse = await conversationMemoryAgent.findCompletedTurn(
        {
          userId,
          conversationId: memory.conversationId,
          clientMessageId,
        },
      );
      if (completedResponse) {
        return res.status(200).json({
          ...completedResponse,
          conversationId: memory.conversationId,
        });
      }
    }
    const userContext = userId
      ? await loadUserContext(
          userId,
          memory?.personalizationEnabled ?? personalizationEnabled === true,
        )
      : {};

    const response = await supervisorAgent.execute({
      message,
      userId,
      userContext,
      history:
        memory?.history ?? (Array.isArray(history) ? history.slice(-8) : []),
      checkpoint: memory?.checkpoint,
    });

    if (memory && userId) {
      const checkpoint: ConversationCheckpoint = {
        ...(response.checkpoint ?? memory.checkpoint ?? { version: 1 }),
        personalizationEnabled: memory.personalizationEnabled,
        answers: {
          ...(memory.checkpoint?.answers ?? {}),
          lastUserMessage: message,
        },
        nextQuestion: response.reply,
        correctionRevision:
          (memory.checkpoint?.correctionRevision ?? 0) +
          (/correct|wrong|misunderstood/i.test(message) ? 1 : 0),
      };
      await conversationMemoryAgent.appendTurn({
        userId,
        conversationId: memory.conversationId,
        clientMessageId,
        userMessage: message,
        assistantResponse: response,
        checkpoint,
      });
      response.conversationId = memory.conversationId;
      response.checkpoint = checkpoint;
    }

    return res.status(200).json(response);
  } catch (error) {
    if (error instanceof Error && error.message === 'Conversation not found') {
      return res.status(404).json({ message: 'Conversation not found' });
    }
    console.error('AI Chat Error:', error);
    return res.status(500).json({ message: 'Failed to process chat' });
  }
});

aiRouter.get('/conversations', async (req, res) => {
  const userId = getAuthUserId(req);
  if (!userId) return res.status(401).json({ message: 'Login required' });
  return res.status(200).json(await conversationMemoryAgent.list(userId));
});

aiRouter.get('/conversations/:conversationId', async (req, res) => {
  const userId = getAuthUserId(req);
  if (!userId) return res.status(401).json({ message: 'Login required' });
  const conversationId = Number(req.params.conversationId);
  if (!Number.isInteger(conversationId) || conversationId <= 0) {
    return res.status(400).json({ message: 'Invalid conversation ID' });
  }
  try {
    const memory = await conversationMemoryAgent.load(userId, conversationId);
    return res.status(200).json(memory);
  } catch {
    return res.status(404).json({ message: 'Conversation not found' });
  }
});

aiRouter.delete('/conversations/:conversationId', async (req, res) => {
  const userId = getAuthUserId(req);
  if (!userId) return res.status(401).json({ message: 'Login required' });
  const conversationId = Number(req.params.conversationId);
  if (!Number.isInteger(conversationId) || conversationId <= 0) {
    return res.status(400).json({ message: 'Invalid conversation ID' });
  }
  const deleted = await conversationMemoryAgent.delete(userId, conversationId);
  return deleted
    ? res.status(204).send()
    : res.status(404).json({ message: 'Conversation not found' });
});

aiRouter.post('/compare', async (req, res) => {
  const { products } = req.body;
  if (!Array.isArray(products) || products.length < 2) {
    return res.status(400).json({ message: 'At least 2 products required' });
  }
  if (products.length > 3) {
    return res.status(400).json({ message: 'Maximum 3 products' });
  }
  try {
    const result = await compareProducts(products);
    return res.status(200).json(result);
  } catch (error) {
    console.error('Compare Error:', error);
    return res.status(500).json({ message: 'Failed to compare products' });
  }
});

aiRouter.post('/recommend', async (req, res) => {
  const { products, userAnswers } = req.body;
  if (!Array.isArray(products) || products.length < 2) {
    return res.status(400).json({ message: 'Products required' });
  }
  if (!userAnswers) {
    return res.status(400).json({ message: 'User answers required' });
  }
  try {
    const result = await recommendProduct(products, userAnswers);
    return res.status(200).json(result);
  } catch (error) {
    console.error('Recommend Error:', error);
    return res.status(500).json({ message: 'Failed to recommend product' });
  }
});
