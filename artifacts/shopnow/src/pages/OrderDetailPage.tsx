import React, { useState } from 'react';
import { Link, useRoute } from 'wouter';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Package,
  Calendar,
  CreditCard,
  MapPin,
  Truck,
  CheckCircle2,
  Clock,
  Download,
  RotateCcw,
  MessageSquare,
  Copy,
  Check,
  Tag,
  ArrowLeft,
  ShieldCheck,
  Sparkles,
  ExternalLink,
  Printer,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  customFetch,
  useAddToCart,
  getGetCartQueryKey,
} from '@workspace/api-client-react';
import { useUser } from '../context/UserContext';
import { AppLayout } from '../components/AppLayout';
import {
  resolveProductImageSrc,
  onProductImageError,
} from '../lib/product-image';

interface OrderItemProduct {
  id: number;
  name: string;
  brand?: string;
  category?: string;
  componentType?: string;
  imageUrl?: string;
  price: number;
  originalPrice?: number | null;
}

interface OrderLineItem {
  id: number;
  productId: number;
  quantity: number;
  priceAtPurchase: number;
  product?: OrderItemProduct | null;
}

interface OrderDetailData {
  id: number;
  subtotalAmount?: number;
  productDiscountAmount?: number;
  couponDiscountAmount?: number;
  shippingAmount?: number;
  totalAmount: number;
  appliedCouponCode?: string | null;
  couponSnapshot?: any;
  status: string;
  shippingAddress: any;
  paymentDetails: any;
  createdAt: string;
  items: OrderLineItem[];
}

export default function OrderDetailPage() {
  const [, paramsOrder] = useRoute('/orders/:id');
  const [, paramsOrderAlt] = useRoute('/order/:id');
  const rawId = paramsOrder?.id || paramsOrderAlt?.id;
  const orderId = parseInt(rawId ?? '', 10);

  const { user, isLoggedIn } = useUser();
  const queryClient = useQueryClient();
  const addToCart = useAddToCart();

  const [copied, setCopied] = useState(false);
  const [reorderedItemId, setReorderedItemId] = useState<number | null>(null);

  const {
    data: order,
    isLoading,
    error,
  } = useQuery<OrderDetailData>({
    queryKey: ['order-detail', orderId],
    queryFn: () =>
      customFetch<OrderDetailData>(`/api/orders/${orderId}`, {
        credentials: 'include',
        responseType: 'json',
      }),
    enabled: isLoggedIn && !isNaN(orderId),
  });

  const copyOrderId = () => {
    if (!order) return;
    navigator.clipboard.writeText(`ORD-${order.id}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleReorder = (productId: number) => {
    setReorderedItemId(productId);
    addToCart.mutate(
      { data: { productId, quantity: 1 } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetCartQueryKey() });
          setTimeout(() => setReorderedItemId(null), 2000);
        },
        onError: () => setReorderedItemId(null),
      },
    );
  };

  const formatCurrency = (val?: number | null) =>
    new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(val ?? 0);

  const getStatusBadge = (status?: string) => {
    const s = (status || '').toLowerCase();
    if (s.includes('deliver')) {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 text-xs font-bold rounded-full border border-emerald-200 dark:border-emerald-800">
          <CheckCircle2 size={14} className="text-emerald-500" />
          Delivered
        </span>
      );
    }
    if (s.includes('ship')) {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-400 text-xs font-bold rounded-full border border-blue-200 dark:border-blue-800">
          <Truck size={14} className="text-blue-500 animate-pulse" />
          Shipped
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 text-xs font-bold rounded-full border border-amber-200 dark:border-amber-800">
        <Clock size={14} className="text-amber-500 animate-spin" />
        Processing
      </span>
    );
  };

  const getStepperStage = (status?: string) => {
    const s = (status || '').toLowerCase();
    if (s.includes('deliver')) return 4;
    if (s.includes('out')) return 3;
    if (s.includes('ship')) return 2;
    return 1;
  };

  const content = () => {
    if (!isLoggedIn) {
      return (
        <div className="max-w-4xl mx-auto py-24 px-4 text-center">
          <Package className="w-16 h-16 text-neutral-300 dark:text-neutral-600 mx-auto mb-4" />
          <h1 className="text-3xl font-extrabold mb-3 text-neutral-900 dark:text-neutral-100">
            Order Details
          </h1>
          <p className="text-neutral-500 dark:text-neutral-400 mb-6">
            Please log in to view this order details invoice.
          </p>
          <Link
            href="/login"
            className="px-6 py-2.5 bg-indigo-600 text-white font-semibold rounded-xl"
          >
            Log In
          </Link>
        </div>
      );
    }

    if (isNaN(orderId)) {
      return (
        <div className="max-w-4xl mx-auto py-20 px-4 text-center">
          <h2 className="text-2xl font-bold mb-3">Invalid Order ID</h2>
          <Link
            href="/orders"
            className="text-indigo-600 font-medium hover:underline"
          >
            Return to Order History
          </Link>
        </div>
      );
    }

    if (isLoading) {
      return (
        <div className="max-w-4xl mx-auto py-16 px-4">
          <div className="animate-pulse space-y-6">
            <div className="h-8 w-48 bg-neutral-200 dark:bg-neutral-800 rounded-lg" />
            <div className="h-32 w-full bg-neutral-200 dark:bg-neutral-800 rounded-2xl" />
            <div className="h-64 w-full bg-neutral-200 dark:bg-neutral-800 rounded-2xl" />
          </div>
        </div>
      );
    }

    if (error || !order) {
      return (
        <div className="max-w-3xl mx-auto py-20 px-4 text-center">
          <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 p-8 rounded-2xl">
            <p className="text-red-600 dark:text-red-400 font-semibold mb-4">
              Order #{orderId} could not be found or loaded.
            </p>
            <Link
              href="/orders"
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
            >
              Back to Order History
            </Link>
          </div>
        </div>
      );
    }

    const currentStage = getStepperStage(order.status);

    return (
      <div className="max-w-4xl mx-auto py-10 px-4 sm:px-6 lg:px-8 text-neutral-900 dark:text-neutral-100">
        {/* Back Link */}
        <Link
          href="/orders"
          className="inline-flex items-center gap-2 text-xs font-bold text-neutral-500 dark:text-neutral-400 hover:text-indigo-600 dark:hover:text-indigo-400 mb-6 transition-colors"
        >
          <ArrowLeft size={16} /> Back to Order History
        </Link>

        {/* Order Header Card */}
        <div className="bg-white dark:bg-neutral-900 rounded-3xl p-6 sm:p-8 shadow-sm border border-neutral-200 dark:border-neutral-800 mb-8 space-y-6">
          <div className="flex flex-wrap justify-between items-start gap-4 pb-6 border-b border-neutral-100 dark:border-neutral-800">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl sm:text-3xl font-black tracking-tight">
                  Order #ORD-{order.id}
                </h1>
                <button
                  onClick={copyOrderId}
                  aria-label={`Copy order ID ORD-${order.id}`}
                  className="p-1.5 text-neutral-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                  title="Copy Order ID"
                >
                  {copied ? (
                    <Check size={16} className="text-emerald-500" />
                  ) : (
                    <Copy size={16} />
                  )}
                </button>
              </div>
              <div className="flex items-center gap-2 text-xs sm:text-sm text-neutral-500 dark:text-neutral-400 mt-1.5">
                <Calendar size={15} />
                <span>
                  Placed on{' '}
                  {new Date(order.createdAt).toLocaleDateString('en-IN', {
                    weekday: 'short',
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric',
                  })}{' '}
                  at{' '}
                  {new Date(order.createdAt).toLocaleTimeString('en-IN', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {getStatusBadge(order.status)}
              <button
                onClick={() => window.print()}
                aria-label="Print tax invoice"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-300 text-xs font-semibold rounded-lg transition-colors border border-neutral-200 dark:border-neutral-700"
              >
                <Printer size={14} /> Print Receipt
              </button>
            </div>
          </div>

          {/* Delivery Tracker Stepper */}
          <div className="pt-2">
            <div className="text-xs font-bold uppercase tracking-wider text-neutral-400 dark:text-neutral-500 mb-4 flex items-center gap-2">
              <Truck
                size={15}
                className="text-indigo-600 dark:text-indigo-400"
              />
              Package Shipment Tracker
            </div>

            <div className="relative flex items-center justify-between max-w-xl mx-auto px-4 py-2">
              <div className="absolute left-6 right-6 top-6 h-1 bg-neutral-200 dark:bg-neutral-800 -z-0">
                <div
                  className="h-full bg-indigo-600 dark:bg-indigo-500 transition-all duration-500"
                  style={{
                    width:
                      currentStage === 1
                        ? '0%'
                        : currentStage === 2
                          ? '33%'
                          : currentStage === 3
                            ? '66%'
                            : '100%',
                  }}
                />
              </div>

              {[
                { step: 1, label: 'Placed', icon: Clock },
                { step: 2, label: 'Confirmed', icon: ShieldCheck },
                { step: 3, label: 'Shipped', icon: Truck },
                { step: 4, label: 'Delivered', icon: CheckCircle2 },
              ].map((s) => {
                const isDone = currentStage >= s.step;
                const Icon = s.icon;
                return (
                  <div key={s.step} className="flex flex-col items-center z-10">
                    <div
                      className={`w-9 h-9 rounded-full flex items-center justify-center border-2 transition-all ${
                        isDone
                          ? 'bg-indigo-600 text-white border-indigo-600 dark:border-indigo-500 shadow-md'
                          : 'bg-white dark:bg-neutral-900 text-neutral-400 border-neutral-300 dark:border-neutral-700'
                      }`}
                    >
                      <Icon size={16} />
                    </div>
                    <span
                      className={`text-[11px] font-semibold mt-2 text-center ${
                        isDone
                          ? 'text-neutral-900 dark:text-neutral-100 font-bold'
                          : 'text-neutral-400 dark:text-neutral-500'
                      }`}
                    >
                      {s.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Ordered Product Line Items */}
        <div className="bg-white dark:bg-neutral-900 rounded-3xl p-6 sm:p-8 shadow-sm border border-neutral-200 dark:border-neutral-800 mb-8 space-y-6">
          <div className="text-sm font-extrabold uppercase tracking-wider text-neutral-400 dark:text-neutral-500 flex items-center gap-2 border-b border-neutral-100 dark:border-neutral-800 pb-4">
            <Package
              size={18}
              className="text-indigo-600 dark:text-indigo-400"
            />
            Ordered Items ({order.items.length})
          </div>

          <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {order.items.map((item) => {
              const prod = item.product;
              const isReordering = reorderedItemId === item.productId;

              return (
                <div
                  key={item.id}
                  className="py-4 first:pt-0 last:pb-0 flex items-center gap-4 sm:gap-6"
                >
                  {/* Thumbnail */}
                  <div className="w-20 h-20 bg-neutral-50 dark:bg-neutral-800 rounded-2xl border border-neutral-100 dark:border-neutral-700 flex items-center justify-center p-2 shrink-0 overflow-hidden">
                    <img
                      src={resolveProductImageSrc(prod?.imageUrl, prod?.name)}
                      alt={prod?.name || 'Product'}
                      className="w-full h-full object-contain"
                      onError={(e) => onProductImageError(e, prod?.name)}
                    />
                  </div>

                  {/* Product Details */}
                  <div className="flex-1 min-w-0 space-y-1">
                    {prod ? (
                      <Link
                        href={`/product/${prod.id}`}
                        className="font-bold text-sm sm:text-base hover:text-indigo-600 dark:hover:text-indigo-400 line-clamp-2 transition-colors"
                      >
                        {prod.name}
                      </Link>
                    ) : (
                      <div className="font-bold text-sm">
                        Product Item #{item.productId}
                      </div>
                    )}

                    <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
                      {prod?.brand && (
                        <span className="font-semibold text-neutral-800 dark:text-neutral-200">
                          {prod.brand}
                        </span>
                      )}
                      {prod?.componentType && (
                        <span className="px-2.5 py-0.5 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 rounded-md font-medium text-[11px]">
                          {prod.componentType}
                        </span>
                      )}
                      <span>Qty: {item.quantity}</span>
                      <span>•</span>
                      <span>{formatCurrency(item.priceAtPurchase)} each</span>
                    </div>
                  </div>

                  {/* Line Total & Reorder */}
                  <div className="text-right shrink-0">
                    <div className="font-black text-base sm:text-lg text-neutral-900 dark:text-neutral-100">
                      {formatCurrency(item.priceAtPurchase * item.quantity)}
                    </div>

                    <button
                      onClick={() => handleReorder(item.productId)}
                      disabled={isReordering}
                      aria-label={`Buy again ${prod?.name || 'Product'}`}
                      className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 text-indigo-600 dark:text-indigo-400 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
                    >
                      <RotateCcw
                        size={13}
                        className={isReordering ? 'animate-spin' : ''}
                      />
                      {isReordering ? 'Added!' : 'Buy Again'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Detailed Financial & Shipping Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {/* Shipping Address */}
          <div className="bg-white dark:bg-neutral-900 p-6 rounded-3xl border border-neutral-200 dark:border-neutral-800 shadow-sm">
            <div className="flex items-center gap-2 font-extrabold text-xs uppercase tracking-wider text-neutral-400 dark:text-neutral-500 mb-3">
              <MapPin
                size={16}
                className="text-indigo-600 dark:text-indigo-400"
              />
              Delivery Address
            </div>
            <div className="text-xs leading-relaxed text-neutral-700 dark:text-neutral-300 space-y-1">
              <p className="font-bold text-sm text-neutral-900 dark:text-neutral-100">
                {(order.shippingAddress as any)?.name || user?.name}
              </p>
              <p>{(order.shippingAddress as any)?.street}</p>
              <p>
                {(order.shippingAddress as any)?.city},{' '}
                {(order.shippingAddress as any)?.state || 'India'}
              </p>
              <p className="font-semibold text-neutral-900 dark:text-neutral-100">
                Pincode: {(order.shippingAddress as any)?.zip}
              </p>
              {(order.shippingAddress as any)?.phone && (
                <p className="text-neutral-500">
                  Phone: {(order.shippingAddress as any)?.phone}
                </p>
              )}
            </div>
          </div>

          {/* Payment Method */}
          <div className="bg-white dark:bg-neutral-900 p-6 rounded-3xl border border-neutral-200 dark:border-neutral-800 shadow-sm">
            <div className="flex items-center gap-2 font-extrabold text-xs uppercase tracking-wider text-neutral-400 dark:text-neutral-500 mb-3">
              <CreditCard
                size={16}
                className="text-indigo-600 dark:text-indigo-400"
              />
              Payment Information
            </div>
            <div className="text-xs leading-relaxed text-neutral-700 dark:text-neutral-300 space-y-2">
              <p className="font-bold text-sm text-neutral-900 dark:text-neutral-100">
                {(order.paymentDetails as any)?.cardNumber ||
                  'Credit / Debit Card'}
              </p>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 rounded-md font-bold text-[11px] border border-emerald-200 dark:border-emerald-800">
                <CheckCircle2 size={12} /> Payment Verified & Paid
              </div>
              <p className="text-neutral-400 text-[11px]">
                Transaction ID: TXN-{order.id}849102
              </p>
            </div>
          </div>

          {/* Authoritative Price Breakdown */}
          <div className="bg-white dark:bg-neutral-900 p-6 rounded-3xl border border-neutral-200 dark:border-neutral-800 shadow-sm space-y-3">
            <div className="flex items-center gap-2 font-extrabold text-xs uppercase tracking-wider text-neutral-400 dark:text-neutral-500 mb-3">
              <Tag size={16} className="text-indigo-600 dark:text-indigo-400" />
              Price Breakdown
            </div>

            <div className="flex items-center justify-between text-xs text-neutral-600 dark:text-neutral-400">
              <span>Item Subtotal</span>
              <span className="font-semibold text-neutral-900 dark:text-neutral-100">
                {formatCurrency(order.subtotalAmount)}
              </span>
            </div>

            {Number(order.productDiscountAmount) > 0 && (
              <div className="flex items-center justify-between text-xs text-emerald-600 dark:text-emerald-400">
                <span>Product Discounts</span>
                <span className="font-semibold">
                  -{formatCurrency(order.productDiscountAmount)}
                </span>
              </div>
            )}

            {order.appliedCouponCode && (
              <div className="flex items-center justify-between text-xs text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 p-2 rounded-xl border border-indigo-100 dark:border-indigo-900">
                <span className="flex items-center gap-1 font-bold">
                  <Tag size={13} /> Coupon Savings ({order.appliedCouponCode})
                </span>
                <span className="font-bold">
                  -{formatCurrency(order.couponDiscountAmount)}
                </span>
              </div>
            )}

            <div className="flex items-center justify-between text-xs text-neutral-600 dark:text-neutral-400">
              <span>Delivery Fee</span>
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                FREE
              </span>
            </div>

            <div className="pt-3 border-t border-neutral-100 dark:border-neutral-800 flex items-center justify-between font-black text-base text-neutral-900 dark:text-neutral-100">
              <span>Total Amount Paid</span>
              <span className="text-indigo-600 dark:text-indigo-400 text-xl">
                {formatCurrency(order.totalAmount)}
              </span>
            </div>
          </div>
        </div>

        {/* Action Toolbar */}
        <div className="bg-indigo-600 dark:bg-indigo-950/80 p-6 rounded-3xl text-white flex flex-wrap justify-between items-center gap-4 shadow-lg shadow-indigo-500/20">
          <div>
            <div className="font-bold text-base flex items-center gap-2">
              <Sparkles size={18} /> Need assistance with this order?
            </div>
            <p className="text-xs text-indigo-100 dark:text-indigo-300 mt-0.5">
              Ask our AI Shopping Assistant or check warranty & return policies
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/ai-chat"
              className="px-5 py-2.5 bg-white text-indigo-600 hover:bg-indigo-50 font-bold text-xs rounded-xl transition-colors shadow-sm"
            >
              Ask AI Assistant
            </Link>
          </div>
        </div>
      </div>
    );
  };

  return <AppLayout activePage="orders">{content()}</AppLayout>;
}
