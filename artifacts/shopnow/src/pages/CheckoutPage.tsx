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
} from 'lucide-react';
import { useUser } from '../context/UserContext';
import { AppLayout } from '../components/AppLayout';
import {
  onProductImageError,
  resolveProductImageSrc,
} from '../lib/product-image';
import { CouponBox } from '../components/CouponBox';

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

/** Format card number as 1234-5678-9012-3456 */
function formatCardNumber(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 16);
  const groups = digits.match(/.{1,4}/g);
  return groups ? groups.join('-') : '';
}

/** Format expiry as MM/YY */
function formatExpiry(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 4);
  if (digits.length > 2) return digits.slice(0, 2) + '/' + digits.slice(2);
  return digits;
}

/** Validate MM is 01-12 and YY is current or future */
function isValidExpiry(value: string): boolean {
  const match = value.match(/^(\d{2})\/(\d{2})$/);
  if (!match) return false;
  const month = parseInt(match[1], 10);
  if (month < 1 || month > 12) return false;
  const year = parseInt(match[2], 10) + 2000;
  const now = new Date();
  const expDate = new Date(year, month); // first of month after expiry
  return expDate > now;
}

/** CVV: 3 or 4 digits only */
function formatCvv(value: string): string {
  return value.replace(/\D/g, '').slice(0, 4);
}

function isValidCvv(value: string): boolean {
  return /^\d{3,4}$/.test(value);
}

function isValidCardNumber(value: string): boolean {
  const digits = value.replace(/\D/g, '');
  return digits.length >= 13 && digits.length <= 16;
}

type Step = 'review' | 'payment';

export default function CheckoutPage() {
  const [, setLocation] = useLocation();
  const { user, isLoggedIn } = useUser();
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

  const [payment, setPayment] = useState({
    cardNumber: '',
    expiry: '',
    cvv: '',
  });
  const [paymentErrors, setPaymentErrors] = useState<Record<string, string>>(
    {},
  );
  const [step, setStep] = useState<Step>('review');

  const handleCardNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatCardNumber(e.target.value);
    setPayment({ ...payment, cardNumber: formatted });
    if (paymentErrors.cardNumber) {
      setPaymentErrors((prev) => ({ ...prev, cardNumber: '' }));
    }
  };

  const handleExpiryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatExpiry(e.target.value);
    setPayment({ ...payment, expiry: formatted });
    if (paymentErrors.expiry) {
      setPaymentErrors((prev) => ({ ...prev, expiry: '' }));
    }
  };

  const handleCvvChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatCvv(e.target.value);
    setPayment({ ...payment, cvv: formatted });
    if (paymentErrors.cvv) {
      setPaymentErrors((prev) => ({ ...prev, cvv: '' }));
    }
  };

  const validatePayment = (): boolean => {
    const errors: Record<string, string> = {};
    if (!isValidCardNumber(payment.cardNumber)) {
      errors.cardNumber = 'Enter a valid 13-16 digit card number';
    }
    if (!isValidExpiry(payment.expiry)) {
      errors.expiry = 'Enter a valid future date (MM/YY)';
    }
    if (!isValidCvv(payment.cvv)) {
      errors.cvv = 'Enter a valid 3 or 4 digit CVV';
    }
    setPaymentErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleProceedToPayment = (e: React.FormEvent) => {
    e.preventDefault();
    setStep('payment');
  };

  const handlePlaceOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validatePayment()) return;

    // Strip formatting characters before submitting
    const cleanPayment = {
      cardNumber: payment.cardNumber.replace(/\D/g, ''),
      expiry: payment.expiry.replace(/\//g, ''),
      cvv: payment.cvv,
    };

    try {
      const result = await checkoutMutation.mutateAsync({
        data: { address, payment: cleanPayment },
      });
      try {
        localStorage.setItem(LS_KEY, JSON.stringify(address));
      } catch {}
      setLocation(`/order-success?id=${result.orderId}`);
    } catch (error) {
      console.error('Checkout failed:', error);
      alert(
        'Checkout failed. Please ensure your cart is not empty and try again.',
      );
    }
  };

  const inputClass =
    'w-full px-4 py-2.5 bg-neutral-50 dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none';
  const errorInputClass =
    'w-full px-4 py-2.5 bg-red-50 dark:bg-red-950/20 border border-red-400 dark:border-red-600 rounded-lg focus:ring-2 focus:ring-red-500 outline-none';

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
            className={`flex items-center gap-2 px-3 sm:px-4 py-2 min-h-11 rounded-full text-xs sm:text-sm font-semibold transition-colors ${step === 'review' ? 'bg-indigo-600 text-white' : 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300'}`}
          >
            <Package size={16} /> 1. Review Order
          </div>
          <ChevronRight size={16} className="text-neutral-400" />
          <div
            className={`flex items-center gap-2 px-3 sm:px-4 py-2 min-h-11 rounded-full text-xs sm:text-sm font-semibold transition-colors ${step === 'payment' ? 'bg-indigo-600 text-white' : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-400 dark:text-neutral-500'}`}
          >
            <CreditCard size={16} /> 2. Payment
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
                          <p className="text-sm font-semibold truncate">
                            {item.product.name}
                          </p>
                          <p className="text-xs text-neutral-500 dark:text-neutral-400">
                            {item.product.brand} · Qty: {item.quantity}
                          </p>
                        </div>
                        <div className="text-sm font-bold text-right shrink-0">
                          {formatPrice(item.product.price * item.quantity)}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 pt-4 border-t border-neutral-200 dark:border-neutral-700 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-neutral-500 dark:text-neutral-400">
                        Subtotal
                      </span>
                      <span className="font-medium">
                        {formatPrice(cart.subtotal)}
                      </span>
                    </div>
                    {cart.discount > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-green-600 dark:text-green-400">
                          Discount
                        </span>
                        <span className="font-medium text-green-600 dark:text-green-400">
                          -{formatPrice(cart.discount)}
                        </span>
                      </div>
                    )}
                    <div className="pt-2">
                      <CouponBox
                        couponApplied={(cart as any).couponApplied}
                        couponInfo={(cart as any).couponInfo}
                        discount={(cart as any).discount || 0}
                      />
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-neutral-500 dark:text-neutral-400">
                        Delivery
                      </span>
                      <span className="font-medium">
                        {cart.deliveryFee === 0
                          ? 'FREE'
                          : formatPrice(cart.deliveryFee)}
                      </span>
                    </div>
                    <div className="flex justify-between text-lg font-bold pt-2 border-t border-neutral-200 dark:border-neutral-700">
                      <span>Total</span>
                      <span className="text-indigo-600 dark:text-indigo-400">
                        {formatPrice(cart.total)}
                      </span>
                    </div>
                  </div>
                </>
              ) : (
                <p className="text-neutral-500 dark:text-neutral-400 text-sm">
                  Your cart is empty.
                </p>
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
                  <div className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400 font-semibold bg-green-50 dark:bg-green-900/30 px-2.5 py-1 rounded-full border border-green-100 dark:border-green-800">
                    <CheckCircle size={12} /> Pre-filled
                  </div>
                )}
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
              className="w-full py-4 min-h-12 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-indigo-200 dark:shadow-none"
            >
              Proceed to Payment <ChevronRight size={18} />
            </button>
          </form>
        )}

        {/* ─── STEP 2: Payment ─── */}
        {step === 'payment' && (
          <form onSubmit={handlePlaceOrder} className="space-y-6">
            {/* Mini order total */}
            {cart && (
              <div className="bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900/50 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <p className="text-sm text-indigo-700 dark:text-indigo-300 font-medium">
                    {cart.items.length} item{cart.items.length !== 1 ? 's' : ''}{' '}
                    · Delivering to {address.city || 'your address'}
                  </p>
                </div>
                <p className="text-xl font-bold text-indigo-700 dark:text-indigo-300">
                  {formatPrice(cart.total)}
                </p>
              </div>
            )}

            {/* Payment Details */}
            <div className="bg-white dark:bg-neutral-800 p-6 rounded-2xl shadow-sm border border-neutral-200 dark:border-neutral-700">
              <h2 className="text-xl font-semibold mb-1 flex items-center gap-2">
                <CreditCard size={18} className="text-indigo-500" /> Payment
                Details
              </h2>
              <p className="text-xs text-neutral-400 dark:text-neutral-500 mb-5 flex items-center gap-1">
                <Lock size={11} /> Secure payment · demo mode
              </p>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium mb-1">
                    Card Number
                  </label>
                  <input
                    required
                    type="text"
                    inputMode="numeric"
                    placeholder="4111-1111-1111-1111"
                    value={payment.cardNumber}
                    onChange={handleCardNumberChange}
                    maxLength={19}
                    className={
                      paymentErrors.cardNumber ? errorInputClass : inputClass
                    }
                  />
                  {paymentErrors.cardNumber && (
                    <p className="text-xs text-red-500 mt-1">
                      {paymentErrors.cardNumber}
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Expiry (MM/YY)
                  </label>
                  <input
                    required
                    type="text"
                    inputMode="numeric"
                    placeholder="12/26"
                    value={payment.expiry}
                    onChange={handleExpiryChange}
                    maxLength={5}
                    className={
                      paymentErrors.expiry ? errorInputClass : inputClass
                    }
                  />
                  {paymentErrors.expiry && (
                    <p className="text-xs text-red-500 mt-1">
                      {paymentErrors.expiry}
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">CVV</label>
                  <input
                    required
                    type="password"
                    inputMode="numeric"
                    placeholder="•••"
                    value={payment.cvv}
                    onChange={handleCvvChange}
                    maxLength={4}
                    className={paymentErrors.cvv ? errorInputClass : inputClass}
                  />
                  {paymentErrors.cvv && (
                    <p className="text-xs text-red-500 mt-1">
                      {paymentErrors.cvv}
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-col-reverse sm:flex-row gap-3">
              <button
                type="button"
                onClick={() => setStep('review')}
                className="shrink-0 px-6 py-4 min-h-12 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-300 font-semibold rounded-xl transition-colors flex items-center justify-center gap-2 border border-neutral-200 dark:border-neutral-700"
              >
                <ArrowLeft size={16} /> Back
              </button>
              <button
                type="submit"
                disabled={checkoutMutation.isPending}
                className="flex-1 py-4 min-h-12 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-indigo-200 dark:shadow-none"
              >
                <Lock size={16} />
                {checkoutMutation.isPending ? 'Processing…' : 'Place Order'}
              </button>
            </div>
          </form>
        )}
      </div>
    </AppLayout>
  );
}
