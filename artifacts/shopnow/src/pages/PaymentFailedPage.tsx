import React from 'react';
import { Link, useLocation } from 'wouter';
import {
  AlertTriangle,
  RotateCcw,
  ShoppingCart,
  ShieldAlert,
  ArrowRight,
  Headphones,
  Truck,
  CheckCircle2,
} from 'lucide-react';
import { AppLayout } from '../components/AppLayout';

export default function PaymentFailedPage() {
  const searchParams = new URLSearchParams(window.location.search);
  const rawReason = searchParams.get('reason') || '';
  const orderId = searchParams.get('orderId') || '';

  const getReasonDetails = (reason: string) => {
    switch (reason.toLowerCase()) {
      case 'cancelled':
      case 'user_cancelled':
        return {
          title: 'Payment Cancelled',
          description:
            'The payment window was closed before the transaction could be completed.',
        };
      case 'bank_declined':
        return {
          title: 'Transaction Declined by Bank',
          description:
            'Your bank or card issuer declined the payment. Please check your card limits or try UPI / another card.',
        };
      case 'timeout':
        return {
          title: 'Payment Timed Out',
          description:
            'The session timed out while awaiting OTP or authentication from your bank.',
        };
      default:
        return {
          title: 'Payment Could Not Be Completed',
          description:
            'We were unable to process your payment. Don’t worry, your cart is safe and no amount was debited.',
        };
    }
  };

  const reasonInfo = getReasonDetails(rawReason);

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto py-12 sm:py-16 px-4 sm:px-6 lg:px-8 text-neutral-900 dark:text-neutral-100">
        {/* Failure Card */}
        <div className="relative bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-3xl p-6 sm:p-10 shadow-xl overflow-hidden text-center">
          {/* Subtle ambient red gradient */}
          <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-64 h-64 bg-red-500/10 dark:bg-red-500/20 rounded-full blur-3xl pointer-events-none" />

          {/* Icon Badge */}
          <div className="relative inline-flex items-center justify-center w-20 h-20 bg-red-100 dark:bg-red-950/50 border border-red-200 dark:border-red-800/80 rounded-full mb-6 text-red-600 dark:text-red-400 shadow-sm animate-pulse">
            <AlertTriangle size={36} />
          </div>

          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight mb-2">
            {reasonInfo.title}
          </h1>

          <p className="text-sm sm:text-base text-neutral-600 dark:text-neutral-400 max-w-md mx-auto mb-6">
            {reasonInfo.description}
          </p>

          {orderId && (
            <div className="inline-block bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 px-3.5 py-1.5 rounded-full text-xs font-mono text-neutral-600 dark:text-neutral-300 mb-6">
              Reference: <span className="font-bold">#{orderId}</span>
            </div>
          )}

          {/* Reassurance Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-left bg-neutral-50 dark:bg-neutral-800/60 p-4 rounded-2xl border border-neutral-100 dark:border-neutral-800 mb-8">
            <div className="flex items-start gap-2.5">
              <CheckCircle2 size={16} className="text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
              <div className="text-xs">
                <span className="font-semibold text-neutral-800 dark:text-neutral-200">
                  Cart Preserved
                </span>
                <p className="text-neutral-500 dark:text-neutral-400">
                  All your selected items are still saved in your shopping bag.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <ShieldAlert size={16} className="text-indigo-600 dark:text-indigo-400 mt-0.5 shrink-0" />
              <div className="text-xs">
                <span className="font-semibold text-neutral-800 dark:text-neutral-200">
                  Auto-Refund Protection
                </span>
                <p className="text-neutral-500 dark:text-neutral-400">
                  If deducted, funds revert automatically within 3–5 bank working days.
                </p>
              </div>
            </div>
          </div>

          {/* Action CTAs */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/checkout"
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3.5 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-bold text-sm rounded-xl shadow-lg shadow-indigo-600/25 active:scale-95 transition-all"
            >
              <RotateCcw size={16} />
              <span>Retry Payment</span>
            </Link>

            <Link
              href="/cart"
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3.5 bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-neutral-800 dark:text-neutral-200 font-semibold text-sm rounded-xl transition-all"
            >
              <ShoppingCart size={16} />
              <span>Return to Cart</span>
            </Link>
          </div>

          {/* Help link */}
          <div className="mt-8 pt-6 border-t border-neutral-100 dark:border-neutral-800 flex items-center justify-center gap-2 text-xs text-neutral-500">
            <Headphones size={14} />
            <span>Need help with payment?</span>
            <Link href="/" className="text-indigo-600 dark:text-indigo-400 font-medium hover:underline">
              Ask ShopNow AI Assistant
            </Link>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
