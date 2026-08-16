import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useMutation } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles,
  X,
  Send,
  ShoppingCart,
  Loader2,
  Package,
  MapPin,
  Star,
  Trash2,
  Clock,
  ChevronRight,
  IndianRupee,
  Maximize2,
  Minimize2,
  GitCompareArrows,
  Check,
  Mic,
  MicOff,
  ShieldCheck,
  ShieldOff,
} from 'lucide-react';
import { useAddToCart, getGetCartQueryKey } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { useUser } from '../context/UserContext';
import { Link, useLocation } from 'wouter';
import { MarkdownMessage } from './MarkdownMessage';
import {
  onProductImageError,
  resolveProductImageSrc,
} from '../lib/product-image';

interface OrderInfo {
  id: number;
  totalAmount: string;
  status: string;
  createdAt: string;
  products: string[];
}

interface CompareFeature {
  label: string;
  icon: string;
  values: string[];
  winner?: number;
  higherIsBetter?: boolean;
}

interface CompareData {
  products: any[];
  summary: string;
  features: CompareFeature[];
  followUpQuestions: string[];
  recommendation?: {
    bestProductIndex: number;
    reason: string;
    alternativeNote?: string;
  };
}

interface Message {
  role: 'user' | 'ai';
  text: string;
  products?: any[];
  orders?: OrderInfo[];
  requiresLogin?: boolean;
  requiresHumanReview?: boolean;
  manualSearchMode?: boolean;
  followUp?: string[];
  compareData?: CompareData;
  explanation?: {
    why: string[];
    tradeoffs?: string[];
  };
}

const QUICK_ACTIONS = [
  { icon: Package, label: 'My Orders', query: 'Show my recent orders' },
  { icon: MapPin, label: 'My Address', query: "What's my delivery address?" },
  {
    icon: Star,
    label: 'Top Picks',
    query: 'Show me top picks based on my interests',
  },
  {
    icon: ShoppingCart,
    label: 'Deals Today',
    query: 'Show me the best deals today',
  },
];

const CHAT_STORAGE_KEY = 'shopnow_ai_chat';
const CHAT_CONVERSATION_KEY = 'shopnow_ai_conversation_id';
const PRODUCT_MARKDOWN_LINK =
  /\[!\[[^\]]*]\([^)]+\)]\([^)]*\/product\/\d+\)\s*\[[\s\S]*?]\([^)]*\/product\/\d+\)\s*/g;

function removeProductMarkdownLinks(content: string): string {
  return content.replace(PRODUCT_MARKDOWN_LINK, '').trim();
}

function getProductSpecSummary(product: any): string {
  if (!product.specs) return product.brand ? `Brand: ${product.brand}` : '';
  try {
    const parsed =
      typeof product.specs === 'string'
        ? JSON.parse(product.specs)
        : product.specs;
    if (typeof parsed === 'object' && parsed !== null) {
      const keys = [
        'processor',
        'cpu',
        'ram',
        'memory',
        'storage',
        'graphics',
        'gpu',
        'display',
        'screen',
        'camera',
        'battery',
      ];
      const found: string[] = [];
      for (const k of keys) {
        const matchingKey = Object.keys(parsed).find((pk) =>
          pk.toLowerCase().includes(k),
        );
        if (matchingKey && parsed[matchingKey]) {
          found.push(String(parsed[matchingKey]));
          if (found.length >= 2) break;
        }
      }
      if (found.length > 0) return found.join(' • ');
      const entries = Object.entries(parsed)
        .slice(0, 2)
        .map(([, v]) => String(v));
      return entries.join(' • ');
    }
  } catch {}
  return product.brand ? `Brand: ${product.brand}` : '';
}

function createClientMessageId(): string {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function loadPersistedChat(): { messages: Message[]; hasOpened: boolean } {
  try {
    const raw = sessionStorage.getItem(CHAT_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { messages: [], hasOpened: false };
}

function persistChat(messages: Message[], hasOpened: boolean) {
  try {
    sessionStorage.setItem(
      CHAT_STORAGE_KEY,
      JSON.stringify({ messages, hasOpened }),
    );
  } catch {}
}

function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  const token = localStorage.getItem('shopnow_auth_token');
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

interface AIChatbotProps {
  variant?: 'header' | 'floating';
}

export function AIChatbot({ variant = 'header' }: AIChatbotProps) {
  const { isLoggedIn, userName, isLoading: isAuthLoading } = useUser();
  const queryClient = useQueryClient();
  const addToCart = useAddToCart();
  const [, setLocation] = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const persisted = useRef(loadPersistedChat());
  const [messages, setMessages] = useState<Message[]>(
    persisted.current.messages,
  );
  const [conversationId, setConversationId] = useState<number | null>(() => {
    const stored = localStorage.getItem(CHAT_CONVERSATION_KEY);
    const parsed = stored ? Number(stored) : NaN;
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  });
  const [isHydrating, setIsHydrating] = useState(false);
  const [personalizationEnabled, setPersonalizationEnabled] = useState(false);
  const [manualSearchMode, setManualSearchMode] = useState(false);
  const [input, setInput] = useState('');
  const [hasOpened, setHasOpened] = useState(persisted.current.hasOpened);
  const [selectedCartProducts, setSelectedCartProducts] = useState<any[]>([]);
  const [compareProducts, setCompareProducts] = useState<any[]>([]);
  const [showCompare, setShowCompare] = useState(false);
  const [compareLoading, setCompareLoading] = useState(false);
  // When set, the next user message is routed to the recommend endpoint
  const [pendingRecommendContext, setPendingRecommendContext] =
    useState<CompareData | null>(null);
  // Context-switch guard: holds a deferred message when user has unsaved cart items
  const [pendingContextSwitch, setPendingContextSwitch] = useState<string | null>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Speech-to-Text (Voice Input) State & Web Speech API
  const [isListening, setIsListening] = useState(false);
  const [isSpeechSupported, setIsSpeechSupported] = useState(false);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    if (SpeechRecognition) {
      setIsSpeechSupported(true);
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = 'en-IN'; // Native support for Indian English dialect & tech numbers

      recognition.onresult = (event: any) => {
        let currentTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          currentTranscript += event.results[i][0].transcript;
        }
        setInput(currentTranscript);
      };

      recognition.onerror = (event: any) => {
        console.warn('[AIChatbot] Speech recognition error:', event.error);
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
    }
  }, []);

  const toggleListening = () => {
    if (!recognitionRef.current) return;

    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      try {
        recognitionRef.current.start();
        setIsListening(true);
      } catch (err) {
        console.error('[AIChatbot] Failed to start speech recognition:', err);
      }
    }
  };

  // Anonymous chat stays in the browser session; authenticated transcripts live on the server.
  useEffect(() => {
    if (!isLoggedIn) persistChat(messages, hasOpened);
  }, [messages, hasOpened, isLoggedIn]);

  useEffect(() => {
    if (!isLoggedIn) return;
    let cancelled = false;

    const hydrateConversation = async () => {
      setIsHydrating(true);
      try {
        let activeId = conversationId;
        if (!activeId) {
          const listResponse = await fetch('/api/ai/conversations', {
            headers: getAuthHeaders(),
            credentials: 'include',
          });
          if (listResponse.ok) {
            const conversations = await listResponse.json();
            activeId = conversations[0]?.id ?? null;
          }
        }

        if (!activeId) {
          if (!cancelled) setMessages([]);
          return;
        }

        const response = await fetch(`/api/ai/conversations/${activeId}`, {
          headers: getAuthHeaders(),
          credentials: 'include',
        });
        if (!response.ok) {
          localStorage.removeItem(CHAT_CONVERSATION_KEY);
          if (!cancelled) setConversationId(null);
          return;
        }
        const memory = await response.json();
        if (!cancelled) {
          setConversationId(activeId);
          localStorage.setItem(CHAT_CONVERSATION_KEY, String(activeId));
          setMessages(
            (memory.history || []).map(
              (item: { role: string; content: string }) => ({
                role: item.role === 'user' ? 'user' : 'ai',
                text: item.content,
              }),
            ),
          );
          setHasOpened((memory.history || []).length > 0);
          setPersonalizationEnabled(memory.personalizationEnabled !== false);
        }
      } finally {
        if (!cancelled) setIsHydrating(false);
      }
    };

    void hydrateConversation();
    return () => {
      cancelled = true;
    };
  }, [isLoggedIn]);

  // Anonymous session messages must not remain visible after login.
  useEffect(() => {
    if (!isLoggedIn) return;
    setMessages([]);
    setHasOpened(false);
    setCompareProducts([]);
    setShowCompare(false);
    setPendingRecommendContext(null);
    try {
      sessionStorage.removeItem(CHAT_STORAGE_KEY);
    } catch {}
  }, [isLoggedIn]);

  // Automatically clear AI chat cache when user logs out
  const prevIsLoggedInRef = useRef(isLoggedIn);
  useEffect(() => {
    if (prevIsLoggedInRef.current && !isLoggedIn) {
      setMessages([]);
      setConversationId(null);
      setPersonalizationEnabled(false);
      setHasOpened(false);
      setCompareProducts([]);
      setShowCompare(false);
      setPendingRecommendContext(null);
      try {
        sessionStorage.removeItem(CHAT_STORAGE_KEY);
        localStorage.removeItem(CHAT_CONVERSATION_KEY);
      } catch {}
    }
    prevIsLoggedInRef.current = isLoggedIn;
  }, [isLoggedIn]);

  const chatMutation = useMutation({
    mutationFn: async (message: string) => {
      const clientMessageId = createClientMessageId();
      const history = messages.slice(-6).map((m) => ({
        role: m.role === 'ai' ? 'assistant' : 'user',
        content: m.text,
      }));
      const res = await fetch(`/api/ai/chat`, {
        method: 'POST',
        headers: getAuthHeaders(),
        credentials: 'include',
        body: JSON.stringify({
          message,
          history,
          conversationId: isLoggedIn ? conversationId : undefined,
          clientMessageId: isLoggedIn ? clientMessageId : undefined,
          personalizationEnabled: isLoggedIn && personalizationEnabled,
        }),
      });
      if (!res.ok) throw new Error('Failed to chat');
      return res.json();
    },
    onSuccess: (data) => {
      if (data.conversationId) {
        setConversationId(data.conversationId);
        localStorage.setItem(
          CHAT_CONVERSATION_KEY,
          String(data.conversationId),
        );
      }
      // Invalidate and refetch cart cache immediately so UI header badge, cart drawer & cart page update in real-time
      queryClient.invalidateQueries({ queryKey: getGetCartQueryKey() });
      queryClient.refetchQueries({ queryKey: getGetCartQueryKey() });
      if (typeof data.manualSearchMode === 'boolean') {
        setManualSearchMode(data.manualSearchMode);
      }

      // Ensure orders are included even if backend intent detection missed
      let orders = data.orders;
      if ((!orders || orders.length === 0) && data.reply) {
        // Parse order lines from text reply as fallback
        const orderLines = data.reply.match(
          /Order #(\d+):?\s*(.+?)—\s*₹([\d,.]+)\s*\((\w+)\)/g,
        );
        if (orderLines && orderLines.length > 0) {
          orders = orderLines
            .map((line: string) => {
              const match = line.match(
                /Order #(\d+):?\s*(.+?)—\s*₹([\d,.]+)\s*\((\w+)\)/,
              );
              if (match) {
                return {
                  id: parseInt(match[1]),
                  products: match[2].split(',').map((s: string) => s.trim()),
                  totalAmount: match[3].replace(/,/g, ''),
                  status: match[4],
                  createdAt: new Date().toISOString(),
                };
              }
              return null;
            })
            .filter(Boolean);
        }
      }
      setMessages((prev) => [
        ...prev,
        {
          role: 'ai',
          text: data.reply,
          products: data.products,
          orders,
          requiresLogin: data.requiresLogin,
          requiresHumanReview: data.requiresHumanReview,
          manualSearchMode: data.manualSearchMode,
          followUp: data.followUp,
          explanation: data.explanation,
        },
      ]);
    },
    onError: () => {
      setMessages((prev) => [
        ...prev,
        {
          role: 'ai',
          text: 'Sorry, I ran into an issue. Please try again in a moment.',
        },
      ]);
    },
  });

  // Scroll to bottom of chat container when messages update, without affecting page scroll
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTo({
        top: chatContainerRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [messages, chatMutation.isPending]);

  // Auto-send a greeting the first time the chatbot opens for a logged-in user
  useEffect(() => {
    if (
      isOpen &&
      isLoggedIn &&
      !isAuthLoading &&
      !hasOpened &&
      !isHydrating &&
      messages.length === 0
    ) {
      setHasOpened(true);
      chatMutation.mutate('hi');
    }
    // Focus input when opened
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [
    isOpen,
    isLoggedIn,
    isAuthLoading,
    isHydrating,
    hasOpened,
    messages.length,
  ]);

  // Escape key to close
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isExpanded) setIsExpanded(false);
        else if (isOpen) setIsOpen(false);
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, isExpanded]);

  const handleCompare = async () => {
    const productsToCompare = [...compareProducts];
    setMessages((prev) => [
      ...prev,
      {
        role: 'user',
        text: `Compare these ${productsToCompare.length} products: ${productsToCompare.map((p) => p.name).join(', ')}`,
      },
    ]);
    setCompareLoading(true);
    try {
      const res = await fetch('/api/ai/compare', {
        method: 'POST',
        headers: getAuthHeaders(),
        credentials: 'include',
        body: JSON.stringify({ products: productsToCompare }),
      });
      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        {
          role: 'ai',
          text: data.summary || 'Here is the comparison:',
          compareData: {
            products: productsToCompare,
            summary: data.summary,
            features: data.features || [],
            followUpQuestions: data.followUpQuestions || [],
          },
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: 'ai',
          text: 'Sorry, I could not compare those products right now.',
        },
      ]);
    } finally {
      setCompareLoading(false);
      setCompareProducts([]);
      setShowCompare(false);
    }
  };

  const handleRecommend = async (
    compareData: CompareData,
    userAnswer: string,
  ) => {
    setMessages((prev) => [...prev, { role: 'user', text: userAnswer }]);
    setPendingRecommendContext(null);
    setCompareLoading(true);
    try {
      const res = await fetch('/api/ai/recommend', {
        method: 'POST',
        headers: getAuthHeaders(),
        credentials: 'include',
        body: JSON.stringify({
          products: compareData.products,
          userAnswers: userAnswer,
        }),
      });
      const rec = await res.json();
      const bestProduct =
        compareData.products[rec.bestProductIndex] || compareData.products[0];
      setMessages((prev) => [
        ...prev,
        {
          role: 'ai',
          text: `🏆 My recommendation: **${bestProduct.name}**\n\n${rec.reason}${rec.alternativeNote ? `\n\n💡 ${rec.alternativeNote}` : ''}`,
          products: [bestProduct],
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: 'ai',
          text: 'Sorry, I could not generate a recommendation right now.',
        },
      ]);
    } finally {
      setCompareLoading(false);
      setCompareProducts([]);
      setShowCompare(false);
    }
  };

  // Proceeds with context-switch: discards selected cart items and sends the deferred message
  const handleConfirmContextSwitch = (proceed: boolean) => {
    const deferredMsg = pendingContextSwitch;
    setPendingContextSwitch(null);

    if (!proceed || !deferredMsg) {
      // User chose to stay — keep current selection intact, nothing changes
      return;
    }

    // Discard pending cart selection, then proceed with the new query
    setSelectedCartProducts([]);
    setMessages((prev) => [...prev, { role: 'user', text: deferredMsg }]);
    chatMutation.mutate(deferredMsg);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Handle compare action if products are selected and no input text
    if (compareProducts.length > 0 && !input.trim()) {
      handleCompare();
      return;
    }

    if (!input.trim()) return;
    const userMsg = input.trim();
    setInput('');

    if (manualSearchMode) {
      setIsOpen(false);
      setIsExpanded(false);
      setLocation(`/search?q=${encodeURIComponent(userMsg)}`);
      return;
    }

    // If we're in recommendation flow, route to recommend endpoint
    if (pendingRecommendContext) {
      handleRecommend(pendingRecommendContext, userMsg);
      return;
    }

    // ── Context-switch guard ───────────────────────────────────────────────
    // If the user has pending cart items (e.g. a PC build), and they type a
    // completely new unrelated request — pause and ask a friendly confirmation.
    if (selectedCartProducts.length > 0) {
      // Detect if the new message is a clearly different topic (not a cart/checkout action)
      const lower = userMsg.toLowerCase();
      const isCartAction =
        lower.includes('add to cart') ||
        lower.includes('checkout') ||
        lower.includes('yes') ||
        lower.includes('yeah') ||
        lower.includes('sure') ||
        lower.includes('okay') ||
        lower.includes('ok') ||
        lower.includes('proceed') ||
        lower.includes('confirm') ||
        lower.includes('buy') ||
        lower.includes('purchase') ||
        lower.includes('no') ||
        lower.includes('nope') ||
        lower.includes('skip') ||
        lower.includes('cancel');

      if (!isCartAction) {
        // Hold the new message and show a friendly confirmation prompt
        setPendingContextSwitch(userMsg);
        return;
      }
    }

    setMessages((prev) => [...prev, { role: 'user', text: userMsg }]);
    chatMutation.mutate(userMsg);
  };

  const handleQuickAction = (query: string) => {
    const lower = query.toLowerCase().trim();

    if (manualSearchMode && !lower.includes('turn on ai suggestions')) {
      setIsOpen(false);
      setIsExpanded(false);
      setLocation(`/search?q=${encodeURIComponent(query)}`);
      return;
    }

    // Instant client-side navigation for action chips
    if (
      lower.includes('go to cart') ||
      lower.includes('view cart') ||
      lower === 'cart' ||
      lower === 'open cart'
    ) {
      queryClient.invalidateQueries({ queryKey: getGetCartQueryKey() });
      queryClient.refetchQueries({ queryKey: getGetCartQueryKey() });
      setIsOpen(false);
      setIsExpanded(false);
      setLocation('/cart');
      return;
    }

    if (
      lower.includes('view all orders') ||
      lower.includes('my orders') ||
      lower.includes('view orders')
    ) {
      setIsOpen(false);
      setIsExpanded(false);
      setLocation('/orders');
      return;
    }

    if (lower.includes('go to checkout') || lower.includes('checkout')) {
      queryClient.invalidateQueries({ queryKey: getGetCartQueryKey() });
      setIsOpen(false);
      setIsExpanded(false);
      setLocation('/checkout');
      return;
    }

    setMessages((prev) => [...prev, { role: 'user', text: query }]);
    chatMutation.mutate(query);
  };

  const clearConversationAfterCart = async () => {
    if (isLoggedIn && conversationId) {
      try {
        await fetch(`/api/ai/conversations/${conversationId}`, {
          method: 'DELETE',
          headers: getAuthHeaders(),
          credentials: 'include',
        });
      } catch {}
      localStorage.removeItem(CHAT_CONVERSATION_KEY);
    } else {
      sessionStorage.removeItem(CHAT_STORAGE_KEY);
    }
    setConversationId(null);
    setPendingRecommendContext(null);
    setCompareProducts([]);
    setShowCompare(false);
  };

  const handleAddSelectedToCart = async () => {
    if (selectedCartProducts.length === 0) return;
    try {
      await Promise.all(
        selectedCartProducts.map((product) =>
          addToCart.mutateAsync({
            data: { productId: product.id, quantity: 1 },
          }),
        ),
      );
      queryClient.invalidateQueries({ queryKey: getGetCartQueryKey() });
      await clearConversationAfterCart();
      setSelectedCartProducts([]);
      setIsOpen(false);
      setIsExpanded(false);
      setLocation('/cart');
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'ai', text: 'Please log in to add items to your cart.' },
      ]);
    }
  };

  const handleClearChat = () => {
    const oldConversationId = conversationId;
    if (isLoggedIn && oldConversationId) {
      void fetch(`/api/ai/conversations/${oldConversationId}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
        credentials: 'include',
      });
      localStorage.removeItem(CHAT_CONVERSATION_KEY);
      setConversationId(null);
    }
    setMessages([]);
    setHasOpened(false);
    setCompareProducts([]);
    setShowCompare(false);
    setPendingRecommendContext(null);
    setSelectedCartProducts([]);
    if (!isLoggedIn) sessionStorage.removeItem(CHAT_STORAGE_KEY);
  };

  const handleOpen = () => setIsOpen((v) => !v);

  const handleToggleCompare = (product: any) => {
    setCompareProducts((prev) => {
      const exists = prev.find((p) => p.id === product.id);
      if (exists) return prev.filter((p) => p.id !== product.id);
      if (prev.length >= 3) return prev; // max 3
      return [...prev, product];
    });
  };

  const handleToggleCartSelection = (product: any) => {
    setSelectedCartProducts((current) =>
      current.some((item) => item.id === product.id)
        ? current.filter((item) => item.id !== product.id)
        : [...current, product],
    );
  };

  const displayName = userName?.split(' ')[0] || '';

  return (
    <>
      {/* Glowing AI trigger button */}
      <button
        onClick={handleOpen}
        className={`${variant === 'floating' ? 'fixed bottom-5 right-4 z-40' : 'relative'} group flex items-center justify-center w-14 h-14 sm:w-11 sm:h-11 rounded-full bg-gradient-to-br from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 transition-all shadow-[0_0_18px_rgba(79,70,229,0.5)] hover:shadow-[0_0_28px_rgba(79,70,229,0.8)] active:scale-95`}
        title="AI Assistant"
        aria-label="Open AI Assistant Chat"
      >
        <Sparkles size={16} className="text-white" />
        <span className="absolute -top-1 -right-1 flex h-3 w-3 sm:h-4 sm:w-4">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-full w-full bg-violet-500" />
        </span>
      </button>

      {/* Chat Popover / Fullscreen */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop for expanded mode */}
            {isExpanded && (
              <motion.div
                className="fixed inset-0 bg-black/50 z-99"
                onClick={() => setIsExpanded(false)}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              />
            )}
            <motion.div
              className={`${
                isExpanded
                  ? 'fixed inset-2 sm:inset-4 md:inset-8 lg:inset-12 2xl:inset-20 z-100 rounded-2xl'
                  : variant === 'floating'
                    ? 'fixed bottom-22 right-3 z-50 w-[calc(100vw-1.5rem)] max-w-105 rounded-2xl'
                    : 'absolute top-16 right-0 w-[min(calc(100vw-0.75rem),42rem)] sm:w-[min(calc(100vw-1rem),42rem)] max-w-90 sm:max-w-105 md:max-w-120 lg:max-w-130 2xl:max-w-150 rounded-2xl'
              } bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-2xl overflow-hidden z-50 flex flex-col`}
              style={isExpanded ? undefined : { height: 'min(75vh, 640px)' }}
              initial={
                isExpanded
                  ? { opacity: 0, scale: 0.9 }
                  : { opacity: 0, y: -12, scale: 0.95 }
              }
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 380, damping: 28 }}
              layout
            >
              {/* Header */}
              <div className="bg-gradient-to-r from-indigo-600 to-violet-600 px-3 sm:px-4 lg:px-5 py-2.5 sm:py-3 lg:py-3.5 flex justify-between items-center text-white shrink-0">
                <div className="flex items-center gap-2">
                  <Sparkles size={18} />
                  <div>
                    <div className="font-bold text-[14px]">ShopNow AI</div>
                    {isLoggedIn && displayName && (
                      <div className="text-[11px] text-indigo-200">
                        Personalised for {displayName}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {isLoggedIn && (
                    <button
                      onClick={() =>
                        setPersonalizationEnabled((value) => !value)
                      }
                      className="hover:bg-white/20 min-h-9 min-w-9 px-2 rounded-md transition-colors flex items-center justify-center"
                      title={
                        personalizationEnabled
                          ? 'Personalization on: using your account context'
                          : 'Personalization off: using neutral recommendations'
                      }
                      aria-label={
                        personalizationEnabled
                          ? 'Turn personalization off'
                          : 'Turn personalization on'
                      }
                    >
                      {personalizationEnabled ? (
                        <ShieldCheck size={14} />
                      ) : (
                        <ShieldOff size={14} />
                      )}
                    </button>
                  )}
                  {compareProducts.length > 0 && (
                    <button
                      onClick={() => setShowCompare((v) => !v)}
                      className="hover:bg-white/20 min-h-9 min-w-9 px-2 rounded-md transition-colors flex items-center justify-center gap-1"
                      title={`Compare ${compareProducts.length} products`}
                    >
                      <GitCompareArrows size={14} />
                      <span className="text-[11px] font-bold">
                        {compareProducts.length}
                      </span>
                    </button>
                  )}
                  {messages.length > 0 && (
                    <button
                      onClick={handleClearChat}
                      className="hover:bg-white/20 min-h-9 min-w-9 px-2 rounded-md transition-colors flex items-center justify-center"
                      title="Clear chat"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                  <button
                    onClick={() => setIsExpanded((v) => !v)}
                    className="hover:bg-white/20 min-h-9 min-w-9 px-2 rounded-md transition-colors flex items-center justify-center"
                    title={isExpanded ? 'Minimize' : 'Expand'}
                  >
                    {isExpanded ? (
                      <Minimize2 size={14} />
                    ) : (
                      <Maximize2 size={14} />
                    )}
                  </button>
                  <button
                    onClick={() => {
                      setIsOpen(false);
                      setIsExpanded(false);
                    }}
                    className="hover:bg-white/20 min-h-9 min-w-9 px-2 rounded-md transition-colors flex items-center justify-center"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>

              {/* Messages */}
              <div
                ref={chatContainerRef}
                aria-live="polite"
                aria-relevant="additions text"
                className="flex-1 overflow-y-auto p-3 sm:p-4 lg:p-5 2xl:p-6 space-y-3 sm:space-y-4 bg-neutral-50 dark:bg-neutral-950 scrollbar-none [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none]"
              >
                {/* Empty state: guest */}
                {messages.length === 0 && !isLoggedIn && (
                  <div className="text-center py-6">
                    <div className="w-14 h-14 bg-indigo-100 dark:bg-indigo-900/30 rounded-full flex items-center justify-center mx-auto mb-3">
                      <Sparkles
                        size={24}
                        className="text-indigo-600 dark:text-indigo-400"
                      />
                    </div>
                    <p className="text-neutral-500 dark:text-neutral-400 text-sm mb-1 font-medium">
                      Hi there! 👋
                    </p>
                    <p className="text-neutral-400 dark:text-neutral-500 text-xs">
                      Try: "Show me laptops under ₹50,000"
                    </p>
                  </div>
                )}

                {/* Loading welcome for logged-in user */}
                {messages.length === 0 &&
                  isLoggedIn &&
                  chatMutation.isPending && (
                    <div className="flex items-start gap-2">
                      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center shrink-0">
                        <Sparkles size={12} className="text-white" />
                      </div>
                      <div className="bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 px-3 py-2.5 rounded-2xl rounded-tl-sm flex items-center gap-2">
                        <Loader2
                          size={13}
                          className="animate-spin text-indigo-600"
                        />
                        <span className="text-sm text-neutral-500">
                          Preparing your experience…
                        </span>
                      </div>
                    </div>
                  )}

                {/* Messages */}
                <AnimatePresence initial={false}>
                  {messages.map((msg, i) => {
                    const messageContent =
                      msg.role === 'ai' && msg.products?.length
                        ? removeProductMarkdownLinks(msg.text)
                        : msg.text;
                    const hasMessageBubble =
                      msg.role === 'user' ||
                      Boolean(messageContent) ||
                      Boolean(msg.explanation) ||
                      Boolean(msg.requiresLogin);

                    return (
                      <motion.div
                        key={i}
                        className={`flex flex-col gap-2 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
                        initial={{ opacity: 0, y: 10, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        transition={{
                          type: 'spring',
                          stiffness: 400,
                          damping: 30,
                        }}
                      >
                        {hasMessageBubble && (
                          <div
                            className={`flex items-end gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
                          >
                            {msg.role === 'user' && (
                              <div className="mb-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-indigo-200 bg-indigo-100 text-[11px] font-bold text-indigo-700 dark:border-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-200">
                                {displayName.slice(0, 1).toUpperCase() || 'Y'}
                              </div>
                            )}
                            {msg.role === 'ai' && (
                              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center shrink-0 mb-1">
                                <Sparkles size={12} className="text-white" />
                              </div>
                            )}
                            <div className="max-w-[90%] sm:max-w-[85%] lg:max-w-[80%] 2xl:max-w-[75%]">
                              {msg.role === 'user' ? (
                                <div className="mb-1 pr-1 text-right text-[10px] font-semibold uppercase tracking-wide text-neutral-400 dark:text-neutral-500">
                                  You
                                </div>
                              ) : (
                                <div className="mb-1 pl-1 text-left text-[10px] font-medium text-neutral-400 dark:text-neutral-500 flex items-center gap-1.5">
                                  <span>ShopNow AI</span>
                                  <span className="text-neutral-300 dark:text-neutral-600">
                                    •
                                  </span>
                                  <span className="inline-flex items-center text-[9px] font-semibold px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                                    Catalog Grounded
                                  </span>
                                </div>
                              )}
                              <div
                                className={`px-3 sm:px-3.5 py-2 sm:py-2.5 rounded-2xl text-sm leading-relaxed ${
                                  msg.role === 'user'
                                    ? 'border border-indigo-500/30 bg-gradient-to-br from-indigo-600 to-blue-600 text-white shadow-sm rounded-br-sm whitespace-pre-wrap'
                                    : 'bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 border border-neutral-200 dark:border-neutral-700 rounded-tl-sm'
                                }`}
                              >
                                {msg.role === 'ai' ? (
                                  <MarkdownMessage
                                    content={messageContent}
                                    onLinkClick={() => {
                                      setIsOpen(false);
                                      setIsExpanded(false);
                                    }}
                                  />
                                ) : (
                                  messageContent
                                )}
                                {msg.role === 'ai' && msg.explanation && (
                                  <div className="mt-3 border-t border-neutral-200 pt-2 text-xs text-neutral-600 dark:border-neutral-700 dark:text-neutral-300">
                                    <div className="font-semibold">
                                      Why this was shown
                                    </div>
                                    <ul className="mt-1 list-disc space-y-0.5 pl-4">
                                      {msg.explanation.why.map(
                                        (reason, reasonIndex) => (
                                          <li key={reasonIndex}>{reason}</li>
                                        ),
                                      )}
                                    </ul>
                                    {msg.explanation.tradeoffs &&
                                      msg.explanation.tradeoffs.length > 0 && (
                                        <div className="mt-1">
                                          Trade-off:{' '}
                                          {msg.explanation.tradeoffs.join(' ')}
                                        </div>
                                      )}
                                  </div>
                                )}
                                {msg.requiresLogin && (
                                  <Link
                                    href="/login"
                                    onClick={() => setIsOpen(false)}
                                    className="mt-2 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg transition-colors"
                                  >
                                    Log In <ChevronRight size={12} />
                                  </Link>
                                )}
                                {msg.requiresHumanReview && (
                                  <div
                                    role="status"
                                    className="mt-2 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-2 text-xs font-medium text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200"
                                  >
                                    Human review requested. Do not submit
                                    payment until it is complete.
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Visual Compare Table */}
                        {msg.compareData && (
                          <div className="ml-9 w-[calc(100%-2.25rem)] space-y-3">
                            {/* Product name headers */}
                            <div
                              className={`grid gap-2 ${msg.compareData.products.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}
                            >
                              {msg.compareData.products.map(
                                (p: any, pi: number) => (
                                  <div
                                    key={pi}
                                    className="bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl p-2 text-center"
                                  >
                                    <img
                                      src={resolveProductImageSrc(
                                        p.imageUrl,
                                        p.name,
                                      )}
                                      alt={p.name}
                                      className="w-10 h-10 object-cover rounded-lg mx-auto mb-1.5"
                                      onError={(e) =>
                                        onProductImageError(e, p.name)
                                      }
                                    />
                                    <div className="text-[10px] font-semibold text-neutral-800 dark:text-neutral-200 line-clamp-2">
                                      {p.name}
                                    </div>
                                    <div className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 mt-0.5">
                                      ₹
                                      {Math.round(
                                        parseFloat(p.price),
                                      ).toLocaleString()}
                                    </div>
                                  </div>
                                ),
                              )}
                            </div>

                            {/* Feature rows */}
                            <div className="bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl overflow-hidden">
                              {msg.compareData.features.map(
                                (feat: CompareFeature, fi: number) => (
                                  <div
                                    key={fi}
                                    className={`${fi > 0 ? 'border-t border-neutral-100 dark:border-neutral-700' : ''}`}
                                  >
                                    <div className="px-3 py-1.5 bg-neutral-50 dark:bg-neutral-900 flex items-center gap-1.5">
                                      <span className="text-sm">
                                        {feat.icon}
                                      </span>
                                      <span className="text-[11px] font-semibold text-neutral-600 dark:text-neutral-400">
                                        {feat.label}
                                      </span>
                                    </div>
                                    <div
                                      className={`grid divide-x divide-neutral-100 dark:divide-neutral-700 ${msg.compareData!.products.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}
                                    >
                                      {feat.values.map(
                                        (val: string, vi: number) => {
                                          const isWinner = feat.winner === vi;
                                          const isTie = feat.winner === -1;
                                          return (
                                            <div
                                              key={vi}
                                              className={`px-2 py-2 text-center ${isWinner ? 'bg-green-50 dark:bg-green-900/20' : ''}`}
                                            >
                                              <div
                                                className={`text-[11px] font-medium ${isWinner ? 'text-green-700 dark:text-green-400' : 'text-neutral-700 dark:text-neutral-300'}`}
                                              >
                                                {val}
                                              </div>
                                              {isWinner && (
                                                <div className="text-[9px] text-green-600 dark:text-green-400 font-semibold mt-0.5">
                                                  ✓ Best
                                                </div>
                                              )}
                                              {isTie && vi === 0 && (
                                                <div className="text-[9px] text-neutral-400 mt-0.5">
                                                  — tie
                                                </div>
                                              )}
                                            </div>
                                          );
                                        },
                                      )}
                                    </div>
                                  </div>
                                ),
                              )}
                            </div>

                            {/* Follow-up questions */}
                            {msg.compareData.followUpQuestions.length > 0 &&
                              !msg.compareData.recommendation &&
                              !pendingRecommendContext && (
                                <div className="space-y-1.5">
                                  <p className="text-[11px] font-semibold text-neutral-500 dark:text-neutral-400 px-1">
                                    🤔 Help me find the best one for you — tap a
                                    question:
                                  </p>
                                  {msg.compareData.followUpQuestions.map(
                                    (q: string, qi: number) => (
                                      <button
                                        key={qi}
                                        onClick={() => {
                                          // Post the question as an AI message, then await user's typed answer
                                          setMessages((prev) => [
                                            ...prev,
                                            { role: 'ai', text: q },
                                          ]);
                                          setPendingRecommendContext(
                                            msg.compareData!,
                                          );
                                          setTimeout(
                                            () => inputRef.current?.focus(),
                                            80,
                                          );
                                        }}
                                        disabled={compareLoading}
                                        className="w-full text-left px-3 py-2 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 text-indigo-800 dark:text-indigo-200 text-[11px] border border-indigo-100 dark:border-indigo-800/50 hover:bg-indigo-100 dark:hover:bg-indigo-800/40 transition-colors disabled:opacity-50 flex items-center gap-2"
                                      >
                                        <span className="text-indigo-400">
                                          →
                                        </span>
                                        {q}
                                      </button>
                                    ),
                                  )}
                                </div>
                              )}

                            {/* Pending recommendation prompt */}
                            {pendingRecommendContext === msg.compareData && (
                              <div className="flex items-center gap-2 px-1">
                                <span className="text-[10px] text-indigo-500 dark:text-indigo-400 animate-pulse">
                                  ✏️ Type your answer below…
                                </span>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Product Suggestions */}
                        {/* Order Cards */}
                        {msg.orders && msg.orders.length > 0 && (
                          <div className="ml-9 w-[calc(100%-2.25rem)] space-y-2">
                            {msg.orders.map((order) => {
                              const status = order.status.toLowerCase();
                              const statusColor =
                                status === 'delivered' || status === 'completed'
                                  ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                                  : status === 'shipped'
                                    ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                                    : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400';
                              return (
                                <Link
                                  key={order.id}
                                  href="/orders"
                                  onClick={() => setIsOpen(false)}
                                  className="block bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 p-3 rounded-xl shadow-sm hover:shadow-md hover:border-indigo-300 dark:hover:border-indigo-700 transition-all cursor-pointer"
                                >
                                  <div className="flex items-center justify-between mb-1.5">
                                    <span className="text-xs font-bold text-neutral-900 dark:text-neutral-100">
                                      Order #{order.id}
                                    </span>
                                    <span
                                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize ${statusColor}`}
                                    >
                                      {order.status}
                                    </span>
                                  </div>
                                  <p className="text-xs text-neutral-500 dark:text-neutral-400 truncate mb-1.5">
                                    {order.products.join(', ')}
                                  </p>
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-1 text-xs text-neutral-400 dark:text-neutral-500">
                                      <Clock size={10} />
                                      {new Date(
                                        order.createdAt,
                                      ).toLocaleDateString('en-IN', {
                                        day: 'numeric',
                                        month: 'short',
                                        year: 'numeric',
                                      })}
                                    </div>
                                    <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 flex items-center gap-0.5">
                                      <IndianRupee size={10} />
                                      {parseInt(
                                        order.totalAmount,
                                      ).toLocaleString('en-IN')}
                                    </span>
                                  </div>
                                </Link>
                              );
                            })}
                            <Link
                              href="/orders"
                              onClick={() => setIsOpen(false)}
                              className="flex items-center justify-center gap-1.5 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 py-2 transition-colors"
                            >
                              View All Orders <ChevronRight size={12} />
                            </Link>
                          </div>
                        )}

                        {msg.products && msg.products.length > 0 && (
                          <div className="ml-9 w-[calc(100%-2.25rem)] space-y-3 my-2">
                            {msg.products.map((p: any) => {
                              const isInCompare = compareProducts.some(
                                (cp) => cp.id === p.id,
                              );
                              const canAdd = compareProducts.length < 3;
                              const isSelected = selectedCartProducts.some(
                                (item) => item.id === p.id,
                              );
                              const ratingNum = parseFloat(p.rating || '4.2');
                              const specsSummary = getProductSpecSummary(p);
                              const origPrice = p.originalPrice ? parseFloat(p.originalPrice) : null;
                              const currPrice = parseFloat(p.price || '0');

                              return (
                                <div
                                  key={p.id}
                                  className="group bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 hover:border-indigo-400 dark:hover:border-indigo-600 p-3 rounded-2xl shadow-sm hover:shadow-md transition-all duration-200"
                                >
                                  <div className="flex gap-3">
                                    {/* Product Image */}
                                    <Link
                                      href={`/product/${p.id}`}
                                      onClick={() => setIsOpen(false)}
                                      className="relative w-20 h-20 sm:w-24 sm:h-24 bg-neutral-100 dark:bg-neutral-900 rounded-xl overflow-hidden shrink-0 border border-neutral-100 dark:border-neutral-700/60 group-hover:ring-2 group-hover:ring-indigo-500/20 transition-all flex items-center justify-center"
                                    >
                                      <img
                                        src={resolveProductImageSrc(
                                          p.imageUrl,
                                          p.name,
                                        )}
                                        alt={p.name}
                                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                        onError={(e) =>
                                          onProductImageError(e, p.name)
                                        }
                                      />
                                      {p.discountPct > 0 && (
                                        <span className="absolute top-1 left-1 bg-emerald-600 text-white text-[9px] font-extrabold px-1.5 py-0.5 rounded-md shadow-sm">
                                          {p.discountPct}% OFF
                                        </span>
                                      )}
                                    </Link>

                                    {/* Product Details */}
                                    <div className="flex-1 min-w-0 flex flex-col justify-between">
                                      <div>
                                        <div className="flex items-center justify-between gap-1 mb-0.5">
                                          {p.brand && (
                                            <span className="text-[10px] font-bold tracking-wider uppercase text-indigo-600 dark:text-indigo-400">
                                              {p.brand}
                                            </span>
                                          )}
                                          <div className="flex items-center gap-1 text-[11px] font-semibold text-amber-500 bg-amber-50 dark:bg-amber-950/40 px-1.5 py-0.5 rounded">
                                            <Star size={11} className="fill-amber-400 text-amber-400" />
                                            <span>{ratingNum.toFixed(1)}</span>
                                            {p.reviewCount > 0 && (
                                              <span className="text-[10px] text-neutral-400 font-normal">
                                                ({p.reviewCount})
                                              </span>
                                            )}
                                          </div>
                                        </div>

                                        <Link
                                          href={`/product/${p.id}`}
                                          onClick={() => setIsOpen(false)}
                                          className="text-xs font-semibold text-neutral-900 dark:text-neutral-100 line-clamp-2 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors leading-snug"
                                        >
                                          {p.name}
                                        </Link>

                                        {specsSummary && (
                                          <p className="text-[11px] text-neutral-500 dark:text-neutral-400 line-clamp-1 mt-1 font-normal">
                                            {specsSummary}
                                          </p>
                                        )}
                                      </div>
                                    </div>
                                  </div>

                                  {/* Price & Action Row (Right-aligned buttons) */}
                                  <div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-neutral-100 dark:border-neutral-700/60">
                                    {/* Price on Left */}
                                    <div className="flex items-baseline gap-1.5 shrink-0">
                                      <span className="text-sm font-extrabold text-neutral-900 dark:text-neutral-50 flex items-center">
                                        <IndianRupee size={12} />
                                        {Math.round(currPrice).toLocaleString('en-IN')}
                                      </span>
                                      {origPrice && origPrice > currPrice && (
                                        <span className="text-[10px] text-neutral-400 line-through">
                                          ₹{Math.round(origPrice).toLocaleString('en-IN')}
                                        </span>
                                      )}
                                    </div>

                                    {/* Action Buttons on Right */}
                                    <div className="flex items-center gap-1.5 shrink-0 ml-auto">
                                      <button
                                        onClick={() => handleToggleCompare(p)}
                                        disabled={!isInCompare && !canAdd}
                                        className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all ${
                                          isInCompare
                                            ? 'bg-indigo-600 text-white shadow-sm'
                                            : canAdd
                                              ? 'bg-neutral-100 dark:bg-neutral-700/60 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700'
                                              : 'opacity-40 cursor-not-allowed bg-neutral-100 dark:bg-neutral-800 text-neutral-400'
                                        }`}
                                        title={
                                          isInCompare
                                            ? 'Remove from compare'
                                            : canAdd
                                              ? 'Add to compare'
                                              : 'Max 3 products reached'
                                        }
                                      >
                                        <GitCompareArrows size={12} />
                                        <span>{isInCompare ? 'Comparing' : 'Compare'}</span>
                                      </button>

                                      <button
                                        onClick={() => handleToggleCartSelection(p)}
                                        disabled={addToCart.isPending}
                                        className={`flex items-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-semibold shadow-sm transition-all active:scale-95 ${
                                          isSelected
                                            ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                                            : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-600/20'
                                        }`}
                                      >
                                        {isSelected ? (
                                          <>
                                            <Check size={13} />
                                            <span>Added</span>
                                          </>
                                        ) : (
                                          <>
                                            <ShoppingCart size={13} />
                                            <span>Add to Cart</span>
                                          </>
                                        )}
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}

                          </div>
                        )}

                        {selectedCartProducts.length > 0 &&
                          i === messages.length - 1 && (
                            <div className="ml-9 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-800/60 dark:bg-emerald-950/40 shadow-sm">
                              <span className="min-w-0 flex-1 text-xs font-medium text-emerald-900 dark:text-emerald-200">
                                ✨ {selectedCartProducts.length} product
                                {selectedCartProducts.length === 1 ? '' : 's'}{' '}
                                selected.
                              </span>
                              <button
                                onClick={handleAddSelectedToCart}
                                disabled={addToCart.isPending}
                                className="h-8 rounded-lg bg-emerald-600 px-3 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50 shadow-sm transition-all"
                              >
                                {addToCart.isPending
                                  ? 'Adding…'
                                  : 'Add & View Cart'}
                              </button>
                              <button
                                onClick={() => setSelectedCartProducts([])}
                                className="h-8 px-2 text-xs font-medium text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200"
                              >
                                Clear
                              </button>
                            </div>
                          )}

                        {/* Follow-up suggestion chips */}
                        {msg.followUp &&
                          msg.followUp.length > 0 &&
                          i === messages.length - 1 && (
                            <div className="ml-9 flex flex-wrap gap-2 mt-2">
                              {msg.followUp.map((suggestion, idx) => {
                                const isContinueChip =
                                  suggestion.toLowerCase().includes('continue') ||
                                  suggestion.toLowerCase().includes('left off');
                                return (
                                  <button
                                    key={idx}
                                    onClick={() => handleQuickAction(suggestion)}
                                    disabled={chatMutation.isPending}
                                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-150 disabled:opacity-50 ${
                                      isContinueChip
                                        ? 'bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white shadow-md shadow-indigo-600/30 border border-indigo-400/40 scale-105 animate-pulse'
                                        : 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 border border-indigo-200 dark:border-indigo-800/60'
                                    }`}
                                  >
                                    {suggestion}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                      </motion.div>
                    );
                  })}
                </AnimatePresence>

                {/* Context-switch guard: friendly confirmation when user has unsaved cart items */}
                <AnimatePresence>
                  {pendingContextSwitch && (
                    <motion.div
                      className="mx-4 my-2 p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-700/60 shadow-sm"
                      initial={{ opacity: 0, y: 8, scale: 0.97 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -4, scale: 0.97 }}
                      transition={{ duration: 0.2 }}
                    >
                      <div className="flex items-start gap-2.5">
                        <span className="text-lg leading-none mt-0.5">🛒</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-amber-900 dark:text-amber-200 leading-snug">
                            You have {selectedCartProducts.length} item{selectedCartProducts.length > 1 ? 's' : ''} ready to add to cart!
                          </p>
                          <p className="text-[11px] text-amber-700 dark:text-amber-300 mt-1 leading-snug">
                            Would you like to add them before moving on to{' '}
                            <span className="font-semibold italic">"{pendingContextSwitch}"</span>?
                          </p>
                          <div className="flex items-center gap-2 mt-2.5">
                            <button
                              onClick={handleAddSelectedToCart}
                              disabled={addToCart.isPending}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition-all active:scale-95 shadow-sm"
                            >
                              <ShoppingCart size={12} />
                              {addToCart.isPending ? 'Adding…' : 'Yes, add to cart first'}
                            </button>
                            <button
                              onClick={() => handleConfirmContextSwitch(true)}
                              className="px-3 py-1.5 rounded-lg bg-neutral-200 dark:bg-neutral-700 hover:bg-neutral-300 dark:hover:bg-neutral-600 text-neutral-700 dark:text-neutral-200 text-xs font-medium transition-all active:scale-95"
                            >
                              No, skip & continue
                            </button>
                            <button
                              onClick={() => handleConfirmContextSwitch(false)}
                              className="text-[11px] text-neutral-400 hover:text-neutral-600 dark:text-neutral-500 dark:hover:text-neutral-300 transition-colors px-1"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Thinking indicator */}
                <AnimatePresence>
                  {(chatMutation.isPending || compareLoading) &&
                    messages.length > 0 && (

                      <motion.div
                        className="flex items-start gap-2"
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        transition={{ duration: 0.25 }}
                      >
                        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center shrink-0">
                          <Sparkles size={12} className="text-white" />
                        </div>
                        <div className="bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 px-3 py-2.5 rounded-2xl rounded-tl-sm flex items-center gap-2">
                          <div className="flex gap-1">
                            <span
                              className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce"
                              style={{ animationDelay: '0ms' }}
                            />
                            <span
                              className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce"
                              style={{ animationDelay: '150ms' }}
                            />
                            <span
                              className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce"
                              style={{ animationDelay: '300ms' }}
                            />
                          </div>
                        </div>
                      </motion.div>
                    )}
                </AnimatePresence>
              </div>

              {/* Compare Panel */}
              <AnimatePresence>
                {showCompare && compareProducts.length > 0 && (
                  <motion.div
                    className="border-t border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-3 shrink-0 max-h-[50%] overflow-y-auto scrollbar-none [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none]"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-bold text-neutral-900 dark:text-neutral-100 flex items-center gap-1.5">
                        <GitCompareArrows
                          size={14}
                          className="text-indigo-600"
                        />{' '}
                        Compare ({compareProducts.length}/3)
                      </h3>
                      <button
                        onClick={() => {
                          setCompareProducts([]);
                          setShowCompare(false);
                        }}
                        className="text-[11px] min-h-9 px-2 text-neutral-400 hover:text-red-500 transition-colors"
                      >
                        Clear all
                      </button>
                    </div>
                    <div
                      className={`grid gap-3 ${compareProducts.length === 1 ? 'grid-cols-1' : compareProducts.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}
                    >
                      {compareProducts.map((p) => (
                        <div
                          key={p.id}
                          className="bg-neutral-50 dark:bg-neutral-800 rounded-xl p-3 border border-neutral-200 dark:border-neutral-700 text-left relative"
                        >
                          <button
                            onClick={() => handleToggleCompare(p)}
                            className="absolute top-1 right-1 w-8 h-8 rounded-full bg-red-100 dark:bg-red-900/30 text-red-500 flex items-center justify-center hover:bg-red-200 transition-colors"
                          >
                            <X size={10} />
                          </button>
                          <img
                            src={resolveProductImageSrc(p.imageUrl, p.name)}
                            alt={p.name}
                            className="w-full h-20 object-cover rounded-lg mb-2"
                            onError={(e) => onProductImageError(e, p.name)}
                          />
                          <div className="text-[11px] font-semibold text-neutral-900 dark:text-neutral-100 line-clamp-2 mb-1">
                            {p.name}
                          </div>
                          <div className="text-xs font-bold text-indigo-600 dark:text-indigo-400 mb-1.5">
                            ₹{Math.round(parseFloat(p.price)).toLocaleString()}
                          </div>
                          <div className="space-y-1 text-[10px]">
                            {p.rating && (
                              <div className="flex items-center gap-1">
                                <Star
                                  size={9}
                                  className="text-amber-400 fill-amber-400"
                                />
                                <span className="text-neutral-600 dark:text-neutral-400">
                                  {p.rating} Rating
                                </span>
                              </div>
                            )}
                            {p.brand && (
                              <div className="text-neutral-600 dark:text-neutral-400">
                                🏷️ {p.brand}
                              </div>
                            )}
                            {p.discountPct > 0 && (
                              <div className="text-green-600 dark:text-green-400 font-medium">
                                💰 {p.discountPct}% off
                              </div>
                            )}
                            {p.specs && (
                              <div className="text-neutral-500 dark:text-neutral-400 line-clamp-3 pt-1 border-t border-neutral-200 dark:border-neutral-700">
                                {p.specs}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Quick Actions (shown when logged in and no messages yet, or always below input) */}
              {isLoggedIn &&
                messages.length <= 1 &&
                !chatMutation.isPending && (
                  <div className="px-3 py-2 bg-white dark:bg-neutral-900 border-t border-neutral-100 dark:border-neutral-800 flex gap-1.5 overflow-x-auto shrink-0 scrollbar-none">
                    {QUICK_ACTIONS.map(({ icon: Icon, label, query }) => (
                      <button
                        key={label}
                        onClick={() => handleQuickAction(query)}
                        className="flex items-center gap-1.5 px-2.5 py-2 min-h-9 rounded-full bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 text-[11px] font-medium whitespace-nowrap hover:bg-indigo-100 dark:hover:bg-indigo-800/40 transition-colors border border-indigo-100 dark:border-indigo-800/50 shrink-0"
                      >
                        <Icon size={11} />
                        {label}
                      </button>
                    ))}
                  </div>
                )}

              {/* Input Area */}
              <form
                onSubmit={handleSubmit}
                className="p-2.5 sm:p-3 lg:p-4 bg-white dark:bg-neutral-900 border-t border-neutral-200 dark:border-neutral-800 shrink-0"
              >
                <div className="relative flex items-center gap-2">
                  <input
                    ref={inputRef}
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder={
                      isListening
                        ? '🎤 Listening... Speak now!'
                        : pendingRecommendContext
                          ? 'Type your answer…'
                          : compareProducts.length > 0
                            ? `Compare ${compareProducts.length} product${compareProducts.length !== 1 ? 's' : ''}…`
                            : isLoggedIn
                              ? `Ask anything, ${displayName}…`
                              : 'Ask for recommendations…'
                    }
                    className={`w-full bg-neutral-100 dark:bg-neutral-950 border rounded-full py-2 sm:py-2.5 lg:py-3 pl-3 sm:pl-4 ${
                      isSpeechSupported ? 'pr-20' : 'pr-12'
                    } text-sm sm:text-sm lg:text-base text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-500 dark:placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all ${
                      isListening
                        ? 'border-red-400 dark:border-red-600 ring-2 ring-red-400/50 dark:ring-red-600/50'
                        : 'border-neutral-200 dark:border-neutral-800'
                    }`}
                    disabled={chatMutation.isPending || compareLoading}
                  />

                  {/* Actions (Mic + Send) */}
                  <div className="absolute right-1 top-1 bottom-1 flex items-center gap-1">
                    {isSpeechSupported && (
                      <button
                        type="button"
                        onClick={toggleListening}
                        aria-label={
                          isListening
                            ? 'Stop listening'
                            : 'Start voice speech-to-text'
                        }
                        className={`h-full aspect-square flex items-center justify-center rounded-full transition-all ${
                          isListening
                            ? 'bg-red-500 text-white animate-pulse shadow-md shadow-red-500/40'
                            : 'text-neutral-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-neutral-200 dark:hover:bg-neutral-800'
                        }`}
                        title={
                          isListening
                            ? 'Listening... Click to stop'
                            : 'Speech to text voice input'
                        }
                      >
                        {isListening ? <MicOff size={16} /> : <Mic size={16} />}
                      </button>
                    )}

                    <button
                      type="submit"
                      disabled={
                        (!input.trim() && compareProducts.length === 0) ||
                        chatMutation.isPending ||
                        compareLoading
                      }
                      className="h-full aspect-square flex items-center justify-center bg-indigo-600 hover:bg-indigo-700 text-white rounded-full transition-colors disabled:opacity-40 group"
                      title={
                        compareProducts.length > 0
                          ? `Compare these ${compareProducts.length} products`
                          : 'Send message'
                      }
                    >
                      {compareProducts.length > 0 ? (
                        <span className="flex items-center gap-1 text-xs font-semibold">
                          <GitCompareArrows size={16} />
                          <span className="group-hover:block hidden text-[10px]">
                            {compareProducts.length}
                          </span>
                        </span>
                      ) : (
                        <Send size={16} />
                      )}
                    </button>
                  </div>
                </div>
              </form>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
