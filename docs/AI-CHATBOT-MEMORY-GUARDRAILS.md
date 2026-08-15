# AI Chatbot Memory, Guardrails, and Cart Handoff

## Current behavior

The ShopNow AI chatbot supports short-lived anonymous conversations and durable authenticated conversations.

- Anonymous messages remain in browser `sessionStorage` only.
- Authenticated messages are stored in `chat_conversations` and `chat_messages`.
- Authenticated conversation state is checkpointed in `chat_checkpoints`.
- Conversation reads, writes, and deletes are scoped to the authenticated owner.
- Authenticated chat requests require a `clientMessageId` for retry-safe persistence.
- Duplicate requests replay the stored assistant response instead of running the agent again.
- Personalization is disabled by default and can be enabled explicitly by the user.
- Anonymous users do not receive account or order-history personalization.

## Conversation recovery

The API hydrates a bounded recent transcript and the latest typed checkpoint before routing a message. The checkpoint records the active advisor (`guided_advisor` or `gaming_build`), consultation answers, budget fields, next question, personalization state, and correction revision.

The supervisor uses the checkpoint active agent when the router returns an uncertain intent. This preserves guided PC and category consultations across refreshes and provider fallback events.

Failed turns do not replace the last valid checkpoint. Authenticated conversation deletion removes the conversation and its cascading messages/checkpoints.

## Responsible AI controls

- Recommendations are grounded in current catalog data and in-stock inventory.
- Product responses expose why items were shown, including category, budget, availability, or explicit popularity criteria.
- Popularity is only used when requested and is labeled as popularity rather than personal fit.
- The assistant avoids exposing account data to anonymous users.
- Login-gated actions include orders, addresses, and cart operations.
- Invalid messages, invalid tokens, unauthorized conversations, and invalid ownership requests fail safely.
- JWT validation rejects bare numeric IDs and invalid signatures.
- Product suggestions use a user-controlled confirmation before cart mutation.

## Goal-first PC consultation

For requests such as “build a PC for my son,” the assistant asks in this order:

1. What the recipient will do on the PC.
2. Typical usage time or intensity.
3. Total budget.
4. Technical details only when explicitly requested.

CPU and GPU choices are selected from compatible, in-stock inventory when the shopper has not expressed a technical preference.

## Cart handoff

Product suggestion rows support multi-selection and do not add immediately. The flow is:

1. Shopper selects the cart icon on one or more suggested products.
2. Each selected row shows a checked state; selection is independent from product comparison.
3. Chatbot shows one compact confirmation row with the selected item count.
4. Shopper selects **Add selected & view cart**.
5. All selected products are added to the authenticated or session cart.
6. The active chatbot conversation is deleted for authenticated users, or cleared from `sessionStorage` for anonymous users.
7. Stored conversation state and cart-selection state are cleared, while the visible transcript remains available in the current chat UI.
8. The storefront redirects to `/cart`.

Clearing the selection or leaving the confirmation untouched leaves the products and conversation untouched.

## QA coverage completed

Validated against the local API and storefront builds:

- Parent-to-child PC consultation and multi-turn recovery.
- Mobile, laptop, audio, camera, TV, and tablet guided flows.
- Anonymous versus authenticated personalization.
- Conversation ownership, deletion, resume, and duplicate retry behavior.
- Invalid and forged authentication tokens.
- Missing authenticated idempotency keys.
- Popularity explanations and in-stock filtering.
- Product-specific recommendation explanations.
- Invalid/empty input recovery.
- Cart confirmation, memory clearing, and cart redirect behavior.

## Validation commands

```text
pnpm run typecheck
pnpm --filter @workspace/api-server run build
pnpm --filter @workspace/shopnow run build
pnpm --filter @workspace/shopnow exec tsc -p tsconfig.json --noEmit
```

The storefront build currently reports existing Vite sourcemap and bundle-size warnings, but completes successfully.
