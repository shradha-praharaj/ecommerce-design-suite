import { useState } from 'react';
import { useLocation } from 'wouter';
import {
  getGetCartQueryKey,
  useGetCart,
  useProcessCheckout,
} from '@workspace/api-client-react';
import {
  ShoppingCart,
  MapPin,
  CreditCard,
  CheckCircle,
  ChevronRight,
  ArrowLeft,
  Lock,
  Package,
  ShieldCheck,
  Zap,
  Banknote,
  Loader2,
} from 'lucide-react';
import { useUser } from '../context/UserContext';
import { AppLayout } from '../components/AppLayout';
import {
  onProductImageError,
  resolveProductImageSrc,
} from '../lib/product-image';
import { CouponBox } from '../components/CouponBox';
import { openRazorpayCheckout } from '../lib/razorpay';
import { useBehaviorTracking } from '../hooks/useBehaviorTracking';
import { GoogleAddressAutocomplete } from '../components/GoogleAddressAutocomplete';
import type { ParsedAddress } from '../lib/google-maps';

const LS_KEY = 'shopnow_saved_address';

function loadSavedAddress(userName: string) {
  try {
    const stored = localStorage.getItem(LS_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed.street) return parsed;
    }
  } catch {}
  return {
    name: userName || '',
    street: '',
    city: '',
    state: '',
    zip: '',
    phone: '',
  };
}

const formatPrice = (price: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(price);

type Step = 'review' | 'payment';

export default function CheckoutPage() {
  const [, setLocation] = useLocation();
  const { user, isLoggedIn } = useUser();
  const { trackAddToCart } = useBehaviorTracking();
  const checkoutMutation = useProcessCheckout();
  const { data: cart, isLoading: isCartLoading } = useGetCart({
    query: { queryKey: getGetCartQueryKey() },
  });

  // Redirect to login if not signed in
  if (!isLoggedIn) {
    setLocation('/login');
    return null;
  }

  const prefilled = loadSavedAddress(user?.name || '');
  const [address, setAddress] = useState(prefilled);
  const [addressConfirmed, setAddressConfirmed] = useState(!!prefilled.street);

  const [paymentMethod, setPaymentMethod] = useState<'razorpay' | 'cod'>('razorpay');
  const [isProcessingRazorpay, setIsProcessingRazorpay] = useState(false);
  const [step, setStep] = useState<Step>('review');

  const handleProceedToPayment = (e: React.FormEvent) => {
    e.preventDefault();
    setStep('payment');
  };

  const handleRazorpayPayment = async () => {
    if (!cart || cart.items.length === 0) return;
    setIsProcessingRazorpay(true);

    try {
      const token = localStorage.getItem('shopnow_auth_token');
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      // 1. Initiate order creation on server
      const initRes = await fetch('/api/payments/create-order', {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({
          couponCode: (cart as any).coupon?.code,
        }),
      });

      if (!initRes.ok) {
        const errData = await initRes.json().catch(() => ({}));
        throw new Error(errData.message || 'Failed to initialize payment gateway');
      }

      const orderData = await initRes.json();

      // Save address locally
      try {
        localStorage.setItem(LS_KEY, JSON.stringify(address));
      } catch {}

      // 2. Open Razorpay secure modal
      await openRazorpayCheckout({
        key: orderData.keyId,
        amount: orderData.amount,
        currency: orderData.currency || 'INR',
        name: 'ShopNow Electronics',
        description: `Order Checkout (${cart.items.length} items)`,
        order_id: orderData.razorpayOrderId,
        prefill: {
          name: address.name || user?.name || '',
          email: user?.email || '',
          contact: address.phone || '',
        },
        theme: {
          color: '#4f46e5', // ShopNow Indigo brand color
        },
        handler: async (response) => {
          try {
            // 3. Verify signature on server
            const verifyRes = await fetch('/api/payments/verify', {
              method: 'POST',
              headers,
              credentials: 'include',
              body: JSON.stringify({
                razorpayOrderId: response.razorpay_order_id,
                razorpayPaymentId: response.razorpay_payment_id,
                razorpaySignature: response.razorpay_signature,
                address,
                couponCode: (cart as any).coupon?.code,
              }),
            });

            const verifyData = await verifyRes.json();
            if (verifyRes.ok && verifyData.success) {
              setLocation(`/order-success?id=${verifyData.orderId}&method=Razorpay`);
            } else {
              setLocation(
                `/payment-failed?orderId=${orderData.razorpayOrderId}&reason=verification_failed`,
              );
            }
          } catch (err) {
            console.error('Verification error:', err);
            setLocation(
              `/payment-failed?orderId=${orderData.razorpayOrderId}&reason=network_error`,
            );
          } finally {
            setIsProcessingRazorpay(false);
          }
        },
        modal: {
          ondismiss: () => {
            setIsProcessingRazorpay(false);
            setLocation(
              `/payment-failed?orderId=${orderData.razorpayOrderId}&reason=cancelled`,
            );
          },
        },
      });
    } catch (error) {
      console.error('Payment checkout error:', error);
      setIsProcessingRazorpay(false);
      alert(
        error instanceof Error
          ? error.message
          : 'Could not connect to payment gateway. Please try again or choose Cash on Delivery.',
      );
    }
  };

  const handleCodPlaceOrder = async () => {
    try {
      const result = await checkoutMutation.mutateAsync({
        data: {
          address,
          payment: {
            cardNumber: '0000',
            expiry: '00/00',
            cvv: '000',
          },
        },
      });
      try {
        localStorage.setItem(LS_KEY, JSON.stringify(address));
      } catch {}
      setLocation(`/order-success?id=${result.orderId}&method=COD`);
    } catch (error) {
      console.error('COD Checkout failed:', error);
      alert(
        'Checkout failed. Please ensure your cart is not empty and try again.',
      );
    }
  };

  const inputClass =
    'w-full px-4 py-2.5 bg-neutral-50 dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none';

  return (
    <AppLayout>
      <div className="max-w-3xl mx-auto py-8 sm:py-12 px-4 sm:px-6 lg:px-8 text-neutral-900 dark:text-neutral-100">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6 sm:mb-8">
          <ShoppingCart className="w-8 h-8 text-indigo-600 dark:text-indigo-400" />
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
            Checkout
          </h1>
        </div>

        {/* Step indicator */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-8">
          <div
            className={`flex items-center gap-2 px-3 sm:px-4 py-2 min-h-11 rounded-full text-xs sm:text-sm font-semibold transition-colors ${step === 'review' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20' : 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:bg-indigo-300'}`}
          >
            <Package size={16} /> 1. Review Order
          </div>
          <ChevronRight size={16} className="text-neutral-400" />
          <div
            className={`flex items-center gap-2 px-3 sm:px-4 py-2 min-h-11 rounded-full text-xs sm:text-sm font-semibold transition-colors ${step === 'payment' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20' : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-400 dark:text-neutral-500'}`}
          >
            <CreditCard size={16} /> 2. Payment Gateway
          </div>
        </div>

        {/* ─── STEP 1: Review Order ─── */}
        {step === 'review' && (
          <form onSubmit={handleProceedToPayment} className="space-y-6">
            {/* Order Summary */}
            <div className="bg-white dark:bg-neutral-800 p-6 rounded-2xl shadow-sm border border-neutral-200 dark:border-neutral-700">
              <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <ShoppingCart size={18} className="text-indigo-500" /> Order
                Summary
              </h2>

              {isCartLoading ? (
                <div className="animate-pulse space-y-3">
                  {[1, 2].map((i) => (
                    <div
                      key={i}
                      className="h-16 bg-neutral-100 dark:bg-neutral-700 rounded-lg"
                    />
                  ))}
                </div>
              ) : cart && cart.items.length > 0 ? (
                <>
                  <div className="divide-y divide-neutral-100 dark:divide-neutral-700">
                    {cart.items.map((item) => (
                      <div
                        key={item.product.id}
                        className="flex items-center gap-4 py-3"
                      >
                        <div className="w-16 h-16 bg-neutral-50 dark:bg-neutral-900 rounded-lg flex items-center justify-center p-2 border border-neutral-100 dark:border-neutral-700 shrink-0">
                          <img
                            src={resolveProductImageSrc(
                              item.product.imageUrl,
                              item.product.name,
                            )}
                            alt={item.product.name}
                            className="w-full h-full object-contain"
                            onError={(e) =>
                              onProductImageError(e, item.product.name)
                            }
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-medium text-sm truncate">
                            {item.product.name}
                          </h3>
                          <p className="text-xs text-neutral-500 dark:text-neutral-400">
                            Qty: {item.quantity} ×{' '}
                            {formatPrice(Number(item.product.price))}
                          </p>
                        </div>
                        <span className="font-semibold text-sm">
                          {formatPrice(
                            Number(item.product.price) * item.quantity,
                          )}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Coupon Box */}
                  <div className="mt-4 pt-4 border-t border-neutral-100 dark:border-neutral-700">
                    <CouponBox
                      couponApplied={
                        (cart as any).couponApplied ??
                        (cart as any).coupon?.code ??
                        null
                      }
                      couponInfo={
                        (cart as any).couponInfo ??
                        (cart as any).coupon ??
                        null
                      }
                      discount={
                        (cart as any).couponDiscountAmount ??
                        (cart as any).discount ??
                        0
                      }
                    />
                  </div>

                  {/* Price breakdown */}
                  <div className="mt-4 pt-4 border-t border-neutral-100 dark:border-neutral-700 space-y-2 text-sm">
                    <div className="flex justify-between text-neutral-600 dark:text-neutral-400">
                      <span>Subtotal</span>
                      <span>{formatPrice(cart.subtotal)}</span>
                    </div>

                    {(cart as any).productDiscountAmount > 0 && (
                      <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
                        <span>Product Savings</span>
                        <span>
                          -{formatPrice((cart as any).productDiscountAmount)}
                        </span>
                      </div>
                    )}

                    {(cart as any).couponDiscountAmount > 0 && (
                      <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
                        <span>Coupon Savings ({(cart as any).coupon?.code})</span>
                        <span>
                          -{formatPrice((cart as any).couponDiscountAmount)}
                        </span>
                      </div>
                    )}

                    <div className="flex justify-between text-neutral-600 dark:text-neutral-400">
                      <span>Shipping</span>
                      <span>
                        {(cart as any).shippingAmount === 0 ? (
                          <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                            FREE
                          </span>
                        ) : (
                          formatPrice((cart as any).shippingAmount)
                        )}
                      </span>
                    </div>

                    <div className="flex justify-between font-bold text-lg pt-2 border-t border-neutral-200 dark:border-neutral-700">
                      <span>Total to Pay</span>
                      <span className="text-indigo-600 dark:text-indigo-400">
                        {formatPrice(cart.total)}
                      </span>
                    </div>
                  </div>
                </>
              ) : (
                <p className="text-neutral-500 py-4">Your cart is empty.</p>
              )}
            </div>

            {/* Shipping Address */}
            <div className="bg-white dark:bg-neutral-800 p-6 rounded-2xl shadow-sm border border-neutral-200 dark:border-neutral-700">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <MapPin size={18} className="text-indigo-500" /> Shipping
                  Address
                </h2>
                {addressConfirmed && (
                  <div className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950/40 px-2 py-0.5 rounded-full font-medium">
                    <CheckCircle size={12} /> Pre-filled
                  </div>
                )}
              </div>

              {/* Google Maps / GPS Auto-fill Search */}
              <div className="mb-5 pb-5 border-b border-neutral-100 dark:border-neutral-700">
                <GoogleAddressAutocomplete
                  currentStreet={address.street}
                  onAddressSelected={(parsed: ParsedAddress) => {
                    setAddress((prev: any) => ({
                      ...prev,
                      street: parsed.street || prev.street,
                      city: parsed.city || prev.city,
                      state: parsed.state || prev.state || '',
                      zip: parsed.zip || prev.zip,
                    }));
                  }}
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium mb-1">
                    Full Name
                  </label>
                  <input
                    required
                    type="text"
                    value={address.name}
                    onChange={(e) =>
                      setAddress({ ...address, name: e.target.value })
                    }
                    className={inputClass}
                    placeholder="Full Name"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium mb-1">
                    Street Address
                  </label>
                  <input
                    required
                    type="text"
                    value={address.street}
                    onChange={(e) =>
                      setAddress({ ...address, street: e.target.value })
                    }
                    className={inputClass}
                    placeholder="House / Flat / Building, Street"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">City</label>
                  <input
                    required
                    type="text"
                    value={address.city}
                    onChange={(e) =>
                      setAddress({ ...address, city: e.target.value })
                    }
                    className={inputClass}
                    placeholder="City"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">
                    State
                  </label>
                  <input
                    type="text"
                    value={(address as any).state || ''}
                    onChange={(e) =>
                      setAddress({ ...address, state: e.target.value })
                    }
                    className={inputClass}
                    placeholder="State"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">
                    PIN Code
                  </label>
                  <input
                    required
                    type="text"
                    value={address.zip}
                    onChange={(e) =>
                      setAddress({ ...address, zip: e.target.value })
                    }
                    className={inputClass}
                    placeholder="PIN Code"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Phone
                  </label>
                  <input
                    type="text"
                    value={(address as any).phone || ''}
                    onChange={(e) =>
                      setAddress({ ...address, phone: e.target.value })
                    }
                    className={inputClass}
                    placeholder="Mobile Number"
                  />
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={!cart || cart.items.length === 0}
              className="w-full py-4 min-h-12 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/20 active:scale-[0.99]"
            >
              Proceed to Payment Gateway <ChevronRight size={18} />
            </button>
          </form>
        )}

        {/* ─── STEP 2: Payment Gateway ─── */}
        {step === 'payment' && (
          <div className="space-y-6">
            {/* Mini order total */}
            {cart && (
              <div className="bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900/50 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
                <div>
                  <p className="text-xs sm:text-sm text-indigo-700 dark:text-indigo-300 font-semibold">
                    {cart.items.length} item{cart.items.length !== 1 ? 's' : ''} in cart
                  </p>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                    Delivering to: <span className="font-medium text-neutral-700 dark:text-neutral-300">{address.street}, {address.city}</span>
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-xs text-neutral-400 block font-medium">Grand Total</span>
                  <span className="text-xl sm:text-2xl font-black text-indigo-600 dark:text-indigo-400">
                    {formatPrice(cart.total)}
                  </span>
                </div>
              </div>
            )}

            {/* Payment Method Selector */}
            <div className="bg-white dark:bg-neutral-800 p-6 rounded-2xl shadow-sm border border-neutral-200 dark:border-neutral-700 space-y-4">
              <h2 className="text-xl font-bold mb-1 flex items-center gap-2">
                <CreditCard size={20} className="text-indigo-500" /> Select Payment Method
              </h2>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-4">
                Choose your preferred payment method. Online payments are secured with 256-bit encryption.
              </p>

              {/* Option 1: Razorpay Online */}
              <div
                onClick={() => setPaymentMethod('razorpay')}
                className={`relative border rounded-2xl p-4 sm:p-5 cursor-pointer transition-all duration-200 ${
                  paymentMethod === 'razorpay'
                    ? 'border-indigo-600 bg-indigo-50/40 dark:bg-indigo-950/30 ring-2 ring-indigo-500/20'
                    : 'border-neutral-200 dark:border-neutral-700 hover:border-indigo-300'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="w-5 h-5 rounded-full border border-indigo-600 flex items-center justify-center mt-0.5 shrink-0">
                      {paymentMethod === 'razorpay' && (
                        <div className="w-2.5 h-2.5 rounded-full bg-indigo-600" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm sm:text-base text-neutral-900 dark:text-neutral-100">
                          ⚡ Pay Online with Razorpay
                        </span>
                        <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-full shadow-sm">
                          Fast & Secure
                        </span>
                      </div>
                      <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                        UPI (GPay, PhonePe, Paytm), Credit/Debit Cards, NetBanking & Wallets
                      </p>

                      <div className="flex flex-wrap items-center gap-2 mt-3 text-[11px] text-neutral-400 dark:text-neutral-500 font-medium">
                        <span className="bg-white dark:bg-neutral-900 px-2 py-1 rounded border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300">
                          UPI
                        </span>
                        <span className="bg-white dark:bg-neutral-900 px-2 py-1 rounded border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300">
                          Google Pay
                        </span>
                        <span className="bg-white dark:bg-neutral-900 px-2 py-1 rounded border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300">
                          PhonePe
                        </span>
                        <span className="bg-white dark:bg-neutral-900 px-2 py-1 rounded border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300">
                          Visa / Mastercard / RuPay
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Option 2: Cash on Delivery */}
              <div
                onClick={() => setPaymentMethod('cod')}
                className={`relative border rounded-2xl p-4 sm:p-5 cursor-pointer transition-all duration-200 ${
                  paymentMethod === 'cod'
                    ? 'border-indigo-600 bg-indigo-50/40 dark:bg-indigo-950/30 ring-2 ring-indigo-500/20'
                    : 'border-neutral-200 dark:border-neutral-700 hover:border-indigo-300'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="w-5 h-5 rounded-full border border-indigo-600 flex items-center justify-center mt-0.5 shrink-0">
                      {paymentMethod === 'cod' && (
                        <div className="w-2.5 h-2.5 rounded-full bg-indigo-600" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm sm:text-base text-neutral-900 dark:text-neutral-100 flex items-center gap-1.5">
                          <Banknote size={16} className="text-emerald-600" /> Cash on Delivery (COD)
                        </span>
                      </div>
                      <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                        Pay with cash or digital UPI upon package arrival at your doorstep.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-2 flex items-center gap-2 text-xs text-neutral-400 dark:text-neutral-500">
                <ShieldCheck size={14} className="text-emerald-600" />
                <span>PCI-DSS Compliant Gateway · 100% Buyer Protection Guarantee</span>
              </div>
            </div>

            {/* Navigation & Action buttons */}
            <div className="flex flex-col-reverse sm:flex-row gap-3">
              <button
                type="button"
                onClick={() => setStep('review')}
                disabled={isProcessingRazorpay || checkoutMutation.isPending}
                className="shrink-0 px-6 py-4 min-h-12 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-300 font-semibold rounded-xl transition-colors flex items-center justify-center gap-2 border border-neutral-200 dark:border-neutral-700"
              >
                <ArrowLeft size={16} /> Back to Review
              </button>

              {paymentMethod === 'razorpay' ? (
                <button
                  type="button"
                  onClick={handleRazorpayPayment}
                  disabled={isProcessingRazorpay}
                  className="flex-1 py-4 min-h-12 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-bold rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/30 active:scale-[0.99]"
                >
                  {isProcessingRazorpay ? (
                    <>
                      <Loader2 size={18} className="animate-spin" />
                      <span>Connecting to Razorpay...</span>
                    </>
                  ) : (
                    <>
                      <Zap size={18} />
                      <span>Pay {cart ? formatPrice(cart.total) : ''} via Razorpay</span>
                    </>
                  )}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleCodPlaceOrder}
                  disabled={checkoutMutation.isPending}
                  className="flex-1 py-4 min-h-12 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20 active:scale-[0.99]"
                >
                  {checkoutMutation.isPending ? (
                    <>
                      <Loader2 size={18} className="animate-spin" />
                      <span>Placing COD Order...</span>
                    </>
                  ) : (
                    <>
                      <Lock size={18} />
                      <span>Place Cash on Delivery Order</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
