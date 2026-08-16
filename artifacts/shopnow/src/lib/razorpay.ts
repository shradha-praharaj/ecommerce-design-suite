/**
 * Dynamically loads the official Razorpay Checkout.js SDK
 */
let scriptLoadingPromise: Promise<boolean> | null = null;

export function loadRazorpayScript(): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false);
  if ((window as any).Razorpay) return Promise.resolve(true);

  if (scriptLoadingPromise) return scriptLoadingPromise;

  scriptLoadingPromise = new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => {
      console.error('Failed to load Razorpay Checkout SDK');
      resolve(false);
    };
    document.body.appendChild(script);
  });

  return scriptLoadingPromise;
}

export interface RazorpayPaymentSuccessResponse {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

export interface RazorpayCheckoutOptions {
  key: string;
  amount: number; // in paise
  currency: string;
  name?: string;
  description?: string;
  image?: string;
  order_id: string;
  prefill?: {
    name?: string;
    email?: string;
    contact?: string;
  };
  notes?: Record<string, string>;
  theme?: {
    color?: string;
  };
  handler: (response: RazorpayPaymentSuccessResponse) => void;
  modal?: {
    ondismiss?: () => void;
    escape?: boolean;
    backdropclose?: boolean;
  };
}

export async function openRazorpayCheckout(
  options: RazorpayCheckoutOptions,
): Promise<void> {
  const loaded = await loadRazorpayScript();
  if (!loaded) {
    throw new Error('Could not load Razorpay payment gateway SDK');
  }

  const RazorpayConstructor = (window as any).Razorpay;
  if (!RazorpayConstructor) {
    throw new Error('Razorpay SDK constructor unavailable');
  }

  const rzp = new RazorpayConstructor(options);
  rzp.open();
}
