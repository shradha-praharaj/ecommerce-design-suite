import React, { useState } from 'react';
import { Link } from 'wouter';
import {
  CheckCircle,
  Package,
  ArrowRight,
  Copy,
  Check,
  Truck,
  Sparkles,
  ShieldCheck,
  Calendar,
  ShoppingBag,
} from 'lucide-react';
import { AppLayout } from '../components/AppLayout';

export default function OrderSuccessPage() {
  const searchParams = new URLSearchParams(window.location.search);
  const orderId = searchParams.get('id') || searchParams.get('orderId') || '101';
  const paymentMethod = searchParams.get('method') || 'Razorpay Online';
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (orderId) {
      navigator.clipboard.writeText(orderId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Estimate delivery: 4 days from today
  const deliveryDate = new Date();
  deliveryDate.setDate(deliveryDate.getDate() + 4);
  const formattedDelivery = deliveryDate.toLocaleDateString('en-IN', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <AppLayout>
      <div className="relative max-w-2xl mx-auto py-12 sm:py-16 px-4 sm:px-6 lg:px-8 text-center text-neutral-900 dark:text-neutral-100">
        {/* Glow backdrop */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-emerald-500/15 dark:bg-emerald-500/20 rounded-full blur-3xl pointer-events-none" />

        <div className="relative bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-3xl p-6 sm:p-10 shadow-2xl overflow-hidden">
          {/* Animated Success Badge */}
          <div className="relative inline-flex items-center justify-center w-20 h-20 bg-emerald-100 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-700 rounded-full mb-6 text-emerald-600 dark:text-emerald-400 shadow-lg shadow-emerald-500/20">
            <CheckCircle size={44} className="animate-bounce" />
            <span className="absolute -top-1 -right-1 flex h-4 w-4">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-4 w-4 bg-emerald-500" />
            </span>
          </div>

          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-2">
            Order Confirmed! 🎉
          </h1>
          <p className="text-sm sm:text-base text-neutral-600 dark:text-neutral-400 max-w-md mx-auto mb-6">
            Thank you for your purchase. We’ve received your order and our fulfillment team is preparing your package.
          </p>

          {/* Order Details Chip Box */}
          <div className="bg-neutral-50 dark:bg-neutral-800/80 border border-neutral-200/80 dark:border-neutral-700/80 rounded-2xl p-4 sm:p-5 max-w-lg mx-auto mb-8 text-left space-y-3">
            <div className="flex items-center justify-between border-b border-neutral-200/60 dark:border-neutral-700/60 pb-3">
              <span className="text-xs text-neutral-500 dark:text-neutral-400 font-medium">
                Order ID
              </span>
              <div className="flex items-center gap-1.5 font-mono text-sm font-bold text-neutral-900 dark:text-neutral-100">
                <span>#{orderId}</span>
                <button
                  onClick={handleCopy}
                  className="p-1 rounded hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-500 transition-colors"
                  title="Copy Order ID"
                >
                  {copied ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between border-b border-neutral-200/60 dark:border-neutral-700/60 pb-3 text-xs">
              <span className="text-neutral-500 dark:text-neutral-400 font-medium flex items-center gap-1">
                <ShieldCheck size={14} className="text-indigo-600 dark:text-indigo-400" />
                Payment Method
              </span>
              <span className="font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 px-2 py-0.5 rounded-md border border-emerald-200 dark:border-emerald-800/60">
                {paymentMethod.includes('Razorpay') ? '⚡ Razorpay Verified' : 'Cash on Delivery'}
              </span>
            </div>

            <div className="flex items-center justify-between text-xs pt-0.5">
              <span className="text-neutral-500 dark:text-neutral-400 font-medium flex items-center gap-1">
                <Calendar size={14} className="text-amber-500" />
                Estimated Delivery
              </span>
              <span className="font-bold text-neutral-800 dark:text-neutral-200">
                {formattedDelivery}
              </span>
            </div>
          </div>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href={`/orders/${orderId}`}
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3.5 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-bold text-sm rounded-xl shadow-lg shadow-indigo-600/30 active:scale-95 transition-all"
            >
              <Package size={16} />
              <span>Track Order Status</span>
            </Link>

            <Link
              href="/"
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3.5 bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-neutral-800 dark:text-neutral-200 font-semibold text-sm rounded-xl transition-all"
            >
              <ShoppingBag size={16} />
              <span>Continue Shopping</span>
            </Link>
          </div>

          {/* AI Helper Nudge */}
          <div className="mt-8 pt-6 border-t border-neutral-100 dark:border-neutral-800 text-xs text-neutral-500 flex items-center justify-center gap-1.5">
            <Sparkles size={14} className="text-indigo-500" />
            <span>Need order updates or invoices? Ask the <strong>ShopNow AI Assistant</strong> anytime!</span>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
