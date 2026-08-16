import { AddToCartAgent } from '../../add-to-cart-agent.js';
import { AddressAgent } from '../../address-agent.js';
import { BundleAdvisorAgent } from '../../bundle-advisor-agent.js';
import { GamingBuildAdvisorAgent } from '../../gaming-build-advisor-agent.js';
import { GuidedProductAdvisorAgent } from '../../guided-product-advisor-agent.js';
import { GreetingAgent } from '../../greeting-agent.js';
import { OrdersAgent } from '../../orders-agent.js';
import { PopularProductsAgent } from '../../popular-products-agent.js';
import { ProductSearchAgent } from '../../product-search-agent.js';
import { TopPicksAgent } from '../../top-picks-agent.js';
import { UnknownAgent } from '../../unknown-agent.js';
import { RecommendationExplanationAgent } from '../../recommendation-explanation-agent.js';
import type { Agent } from '../../types.js';
import type { ChatbotStateType, ChatbotStateUpdate } from '../state.js';

const agents: Record<string, Agent> = {
  greeting: new GreetingAgent(),
  product_search: new ProductSearchAgent(),
  orders: new OrdersAgent(),
  order: new OrdersAgent(),
  order_history: new OrdersAgent(),
  order_status: new OrdersAgent(),
  address: new AddressAgent(),
  top_picks: new TopPicksAgent(),
  popular_products: new PopularProductsAgent(),
  add_to_cart: new AddToCartAgent(),
  bundle_advisor: new BundleAdvisorAgent(),
  gaming_build: new GamingBuildAdvisorAgent(),
  guided_advisor: new GuidedProductAdvisorAgent(),
  recommendation_explanation: new RecommendationExplanationAgent(),
  unknown: new UnknownAgent(),
};


export async function specialistNode(
  state: ChatbotStateType,
): Promise<ChatbotStateUpdate> {
  const agentKey = state.currentAgent || 'unknown';
  const agent = agents[agentKey] ?? agents.unknown;
  const ctx = {
    message: state.message,
    userId: state.userId,
    userContext: state.userContext,
    history: state.history,
    checkpoint: state.checkpoint ?? undefined,
  };
  const parsed = state.parsedIntent ?? { intent: 'unknown' };

  console.log(
    `[LangGraph:SpecialistNode] Intent: "${agentKey}" → Executing ${agent.name}`,
  );

  const response = await agent.execute(ctx, parsed);

  return {
    agentResponse: response,
  };
}
