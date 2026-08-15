export interface UserContext {
  name?: string;
  recentOrders?: Array<{
    id: number;
    totalAmount: string;
    status: string;
    createdAt: string;
    address: any;
    products: string[];
  }>;
  lastAddress?: any;
  interests?: string[];
  purchasedProductIds?: number[];
  purchasedBrands?: string[];
}

export interface AgentContext {
  message: string;
  userId: number | null;
  userContext: UserContext;
  history?: Array<{ role: string; content: string }>;
  checkpoint?: ConversationCheckpoint;
}

export interface ConversationCheckpoint {
  version: number;
  activeAgent?: string | null;
  category?: string | null;
  goal?: string | null;
  recipient?: string | null;
  persona?:
    | 'parent'
    | 'student'
    | 'gamer'
    | 'professional'
    | 'gift_buyer'
    | string
    | null;
  usageIntensity?: string | null;
  budgetMin?: number | null;
  budgetMax?: number | null;
  answers?: Record<string, string | number | boolean | null>;
  nextQuestion?: string | null;
  personalizationEnabled?: boolean;
  correctionRevision?: number;
}

export interface AgentResponse {
  reply: string;
  products: any[];
  orders: any[];
  requiresLogin?: boolean;
  requiresHumanReview?: boolean;
  manualSearchMode?: boolean;
  accessibleDescription?: string;
  isAIGenerated?: boolean;
  followUp?: string[];
  userContext: {
    name?: string;
    recentOrderCount: number;
    interests?: string[];
  } | null;
  conversationId?: number;
  checkpoint?: ConversationCheckpoint;
  explanation?: {
    why: string[];
    tradeoffs?: string[];
    source: 'catalog' | 'user_preferences' | 'order_history';
  };
}

export interface ParsedIntent {
  isGreeting?: boolean;
  intent?: string;
  category?: string | null;
  maxPrice?: number | null;
  minPrice?: number | null;
  keyword?: string | null;
  brands?: string[] | null;
  sortByPrice?: 'asc' | 'desc' | null;
  sortByRating?: boolean;
  reply?: string;
}

export interface Agent {
  name: string;
  execute(ctx: AgentContext, parsed: ParsedIntent): Promise<AgentResponse>;
}
