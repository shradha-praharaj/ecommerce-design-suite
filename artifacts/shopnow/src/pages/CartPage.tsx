import React, { useState } from 'react';
import { Link } from 'wouter';
import {
  Trash2,
  Heart,
  ShieldCheck,
  Truck,
  ChevronRight,
  Sparkles,
  Activity,
  TrendingUp,
  ShoppingBag,
  ShoppingCart,
  X,
  MapPin,
  Check,
} from 'lucide-react';
import { AppLayout } from '../components/AppLayout';
import { AnonymousRecommendationWidget } from '../components/AnonymousRecommendationWidget';
import { CouponBox } from '../components/CouponBox';
import {
  useGetCart,
  useUpdateCartItem,
  useRemoveFromCart,
  useGetCartRecommendations,
  useAddToCart,
  useListProducts,
  getGetCartQueryKey,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/skeleton';
import { useUser } from '../context/UserContext';
import {
  onProductImageError,
  resolveProductImageSrc,
} from '../lib/product-image';

interface ShippingAddress {
  name: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
}

export default function CartPage() {
  const queryClient = useQueryClient();
  const { isLoggedIn, userName } = useUser();
  const [isEmptyingCart, setIsEmptyingCart] = useState(false);
  const { data: cart, isLoading: isCartLoading } = useGetCart({
    query: { queryKey: getGetCartQueryKey() },
  });

  const handleEmptyCart = async () => {
    if (!cart?.items?.length) return;
    setIsEmptyingCart(true);
    try {
      const res = await fetch('/api/cart/items', {
        method: 'DELETE',
        credentials: 'include',
      });
      if (res.ok) {
        await queryClient.invalidateQueries({ queryKey: getGetCartQueryKey() });
        await queryClient.refetchQueries({ queryKey: getGetCartQueryKey() });
      }
    } catch (err) {
      console.error('Failed to empty cart:', err);
    } finally {
      setIsEmptyingCart(false);
    }
  };

  const LS_KEY = 'shopnow_saved_address';
  const [showAddressModal, setShowAddressModal] = useState(false);
  const [savedAddress, setSavedAddress] = useState<ShippingAddress>(() => {
    try {
      const stored = localStorage.getItem(LS_KEY);
      if (stored) return JSON.parse(stored) as ShippingAddress;
    } catch {}
    return {
      name: userName || '',
      street: '',
      city: '',
      state: '',
      zip: '',
      phone: '',
    };
  });
  const [draftAddress, setDraftAddress] = useState<ShippingAddress>({ ...savedAddress });
  const [addressSaved, setAddressSaved] = useState(false);

  const handleSaveAddress = () => {
    const next = { ...draftAddress };
    setSavedAddress(next);
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(next));
    } catch {}
    setShowAddressModal(false);
    setAddressSaved(true);
    setTimeout(() => setAddressSaved(false), 2000);
  };
  const { data: cartRecs } = useGetCartRecommendations();

  const updateCartItem = useUpdateCartItem();
  const removeFromCart = useRemoveFromCart();
  const addToCart = useAddToCart();

  // For anonymous cross-sell: chargers, headphones, accessories
  const { data: allProducts } = useListProducts();
  const crossSellProducts = (allProducts ?? [])
    .filter((p) => ['Accessories', 'Audio'].includes(p.category))
    .slice(0, 6);
  const popularAccessories = (allProducts ?? [])
    .filter((p) => p.category === 'Accessories')
    .slice(0, 4);

  const handleUpdateQuantity = (productId: number, quantity: number) => {
    if (quantity < 1) return;
    updateCartItem.mutate(
      { productId, data: { quantity } },
      {
        onSuccess: () =>
          queryClient.invalidateQueries({ queryKey: getGetCartQueryKey() }),
      },
    );
  };

  const handleRemove = (productId: number) => {
    removeFromCart.mutate(
      { productId },
      {
        onSuccess: () =>
          queryClient.invalidateQueries({ queryKey: getGetCartQueryKey() }),
      },
    );
  };

  const handleAddToCart = (productId: number) => {
    addToCart.mutate(
      { data: { productId, quantity: 1 } },
      {
        onSuccess: () =>
          queryClient.invalidateQueries({ queryKey: getGetCartQueryKey() }),
      },
    );
  };

  const formatPrice = (price: number) =>
    new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(price);

  if (isCartLoading) {
    return (
      <AppLayout activePage="cart">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
          <Skeleton className="w-full h-[300px]" />
        </div>
      </AppLayout>
    );
  }

  const hasItems = !!cart?.items?.length;

  return (
    <AppLayout activePage="cart">
      <div className="bg-[#f8f9fb] dark:bg-slate-950 text-slate-900 dark:text-slate-100 min-h-screen pb-24 transition-colors">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-slate-100">
                Shopping Cart
              </h1>
              {hasItems && (
                <span className="text-xs font-semibold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-100 dark:border-indigo-900/50 px-2.5 py-0.5 rounded-full">
                  {cart.items.length}{' '}
                  {cart.items.length === 1 ? 'item' : 'items'}
                </span>
              )}
            </div>

            {hasItems && (
              <button
                onClick={handleEmptyCart}
                disabled={isEmptyingCart}
                className="flex items-center gap-1.5 px-3.5 py-2.5 min-h-11 rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/60 hover:border-red-300 dark:hover:border-red-800 transition-all font-semibold text-xs shadow-xs hover:shadow active:scale-95 disabled:opacity-50 cursor-pointer"
                title="Remove all items from your cart"
                data-testid="btn-empty-cart"
              >
                <Trash2
                  size={14}
                  className={isEmptyingCart ? 'animate-bounce' : ''}
                />
                {isEmptyingCart ? 'Emptying Cart...' : 'Empty Cart'}
              </button>
            )}
          </div>

          {hasItems ? (
            <div className="flex flex-col lg:flex-row gap-8">
              {/* Left: Cart Items */}
              <div className="flex-1 flex flex-col gap-4">
                {cart.items.map((item) => (
                  <div
                    key={item.product.id}
                    className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 p-4 sm:p-5 flex flex-col sm:flex-row gap-4 sm:gap-5 shadow-sm"
                    data-testid={`cart-item-${item.product.id}`}
                  >
                    <div className="w-full sm:w-32 h-52 sm:h-32 bg-gray-50 dark:bg-slate-800/80 rounded-lg border border-gray-100 dark:border-slate-800 flex items-center justify-center p-2">
                      <img
                        src={resolveProductImageSrc(
                          item.product.imageUrl,
                          item.product.name,
                        )}
                        alt={item.product.name}
                        className="w-full h-full object-contain mix-blend-multiply dark:mix-blend-normal"
                        onError={(e) =>
                          onProductImageError(e, item.product.name)
                        }
                      />
                    </div>
                    <div className="flex-1 flex flex-col">
                      <div className="flex justify-between items-start mb-1">
                        <Link href={`/product/${item.product.id}`}>
                          <h3 className="font-semibold text-lg text-gray-900 dark:text-slate-100 leading-tight hover:text-indigo-600 dark:hover:text-indigo-400 cursor-pointer">
                            {item.product.name}
                          </h3>
                        </Link>
                        <div className="font-bold text-lg sm:text-xl text-gray-900 dark:text-indigo-400 text-right">
                          {formatPrice(item.product.price)}
                        </div>
                      </div>
                      <div className="text-sm text-gray-500 dark:text-slate-400 mb-2">
                        Category: {item.product.category}
                      </div>
                      <div className="text-xs text-green-700 dark:text-emerald-300 font-bold mb-4 bg-green-50 dark:bg-emerald-950/60 border border-green-100 dark:border-emerald-900/50 px-2 py-1 rounded inline-flex self-start">
                        In Stock
                      </div>

                      <div className="mt-auto flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-3 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg p-1 self-start">
                          <button
                            onClick={() =>
                              handleUpdateQuantity(
                                item.product.id,
                                item.quantity - 1,
                              )
                            }
                            aria-label={`Decrease quantity of ${item.product.name}`}
                            className="w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-100 hover:bg-gray-200 dark:hover:bg-slate-700 rounded-md transition-colors text-lg font-medium"
                            data-testid={`btn-decrease-${item.product.id}`}
                          >
                            -
                          </button>
                          <span className="font-semibold w-6 text-center text-sm text-gray-900 dark:text-slate-100">
                            {item.quantity}
                          </span>
                          <button
                            onClick={() =>
                              handleUpdateQuantity(
                                item.product.id,
                                item.quantity + 1,
                              )
                            }
                            aria-label={`Increase quantity of ${item.product.name}`}
                            className="w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-100 hover:bg-gray-200 dark:hover:bg-slate-700 rounded-md transition-colors text-lg font-medium"
                            data-testid={`btn-increase-${item.product.id}`}
                          >
                            +
                          </button>
                        </div>
                        <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-sm font-medium">
                          <button className="text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1">
                            <Heart size={14} /> Save for Later
                          </button>
                          <span className="text-gray-300 dark:text-slate-700">
                            |
                          </span>
                          <button
                            onClick={() => handleRemove(item.product.id)}
                            className="text-gray-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 transition-colors flex items-center gap-1"
                            data-testid={`btn-remove-${item.product.id}`}
                          >
                            <Trash2 size={14} /> Remove
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}

                <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 mt-2">
                  <div className="flex items-start sm:items-center gap-3">
                    <div className="w-10 h-10 bg-indigo-50 dark:bg-indigo-950/60 rounded-full flex items-center justify-center">
                      <Truck
                        size={18}
                        className="text-indigo-600 dark:text-indigo-400"
                      />
                    </div>
                    <div>
                      {savedAddress.street ? (
                        <>
                          <div className="text-sm font-semibold text-gray-900 dark:text-slate-100">
                            {savedAddress.name} — {savedAddress.street},{' '}
                            {savedAddress.city}
                          </div>
                          <div className="text-xs text-green-600 dark:text-emerald-400 font-medium">
                            {savedAddress.state} {savedAddress.zip} · 📞{' '}
                            {savedAddress.phone}
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="text-sm font-semibold text-gray-900 dark:text-slate-100">
                            No delivery address set
                          </div>
                          <div className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                            Add an address to continue checkout
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setDraftAddress({ ...savedAddress });
                      setShowAddressModal(true);
                    }}
                    className="text-sm font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 min-h-11"
                  >
                    <MapPin size={13} />{' '}
                    {savedAddress.street ? 'Change' : 'Add Address'}
                  </button>
                </div>

                {/* Address Modal */}
                {showAddressModal && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md border border-gray-200 dark:border-slate-700 overflow-hidden">
                      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-slate-800">
                        <div className="flex items-center gap-2 font-bold text-gray-900 dark:text-white text-[15px]">
                          <MapPin size={16} className="text-indigo-600" />{' '}
                          Delivery Address
                        </div>
                        <button
                          onClick={() => setShowAddressModal(false)}
                          className="text-gray-400 hover:text-gray-600 dark:hover:text-slate-200 p-1 rounded-md hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
                        >
                          <X size={18} />
                        </button>
                      </div>
                      <div className="p-5 space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                          <div className="col-span-2">
                            <label className="text-xs font-semibold text-gray-600 dark:text-slate-400 mb-1 block">
                              Full Name
                            </label>
                            <input
                              value={draftAddress.name}
                              onChange={(e) =>
                                setDraftAddress((d) => ({
                                  ...d,
                                  name: e.target.value,
                                }))
                              }
                              className="w-full rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 text-gray-900 dark:text-white"
                              placeholder="Full name"
                            />
                          </div>
                          <div className="col-span-2">
                            <label className="text-xs font-semibold text-gray-600 dark:text-slate-400 mb-1 block">
                              Street Address
                            </label>
                            <input
                              value={draftAddress.street}
                              onChange={(e) =>
                                setDraftAddress((d) => ({
                                  ...d,
                                  street: e.target.value,
                                }))
                              }
                              className="w-full rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 text-gray-900 dark:text-white"
                              placeholder="House / Flat / Building, Street"
                            />
                          </div>
                          <div>
                            <label className="text-xs font-semibold text-gray-600 dark:text-slate-400 mb-1 block">
                              City
                            </label>
                            <input
                              value={draftAddress.city}
                              onChange={(e) =>
                                setDraftAddress((d) => ({
                                  ...d,
                                  city: e.target.value,
                                }))
                              }
                              className="w-full rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 text-gray-900 dark:text-white"
                              placeholder="City"
                            />
                          </div>
                          <div>
                            <label className="text-xs font-semibold text-gray-600 dark:text-slate-400 mb-1 block">
                              State
                            </label>
                            <input
                              value={draftAddress.state}
                              onChange={(e) =>
                                setDraftAddress((d) => ({
                                  ...d,
                                  state: e.target.value,
                                }))
                              }
                              className="w-full rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 text-gray-900 dark:text-white"
                              placeholder="State"
                            />
                          </div>
                          <div>
                            <label className="text-xs font-semibold text-gray-600 dark:text-slate-400 mb-1 block">
                              PIN Code
                            </label>
                            <input
                              value={draftAddress.zip}
                              onChange={(e) =>
                                setDraftAddress((d) => ({
                                  ...d,
                                  zip: e.target.value,
                                }))
                              }
                              className="w-full rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 text-gray-900 dark:text-white"
                              placeholder="PIN Code"
                            />
                          </div>
                          <div>
                            <label className="text-xs font-semibold text-gray-600 dark:text-slate-400 mb-1 block">
                              Phone
                            </label>
                            <input
                              value={draftAddress.phone}
                              onChange={(e) =>
                                setDraftAddress((d) => ({
                                  ...d,
                                  phone: e.target.value,
                                }))
                              }
                              className="w-full rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 text-gray-900 dark:text-white"
                              placeholder="Mobile Number"
                            />
                          </div>
                        </div>
                      </div>
                      <div className="px-5 pb-5 flex gap-3">
                        <button
                          onClick={() => setShowAddressModal(false)}
                          className="flex-1 py-2.5 rounded-lg border border-gray-200 dark:border-slate-700 text-sm font-semibold text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleSaveAddress}
                          disabled={
                            !draftAddress.street ||
                            !draftAddress.city ||
                            !draftAddress.zip
                          }
                          className="flex-1 py-2.5 min-h-11 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <Check size={15} /> Save Address
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Right: Order Summary */}
              <div className="w-full lg:w-95">
                <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 shadow-sm overflow-hidden sticky top-24">
                  <div className="p-5 border-b border-gray-100 dark:border-slate-800">
                    <h2 className="font-bold text-lg text-gray-900 dark:text-slate-100 mb-4">
                      Order Summary
                    </h2>

                    <div className="space-y-3 text-sm text-gray-600 dark:text-slate-300 mb-4">
                      <div className="flex justify-between">
                        <span>Subtotal ({cart.items.length} items)</span>
                        <span className="font-medium text-gray-900 dark:text-slate-100">
                          {formatPrice(cart.subtotal)}
                        </span>
                      </div>
                      {cart.discount > 0 && (
                        <div className="flex justify-between">
                          <span>
                            Coupon discount{' '}
                            {cart.couponApplied
                              ? `(${cart.couponApplied})`
                              : ''}
                          </span>
                          <span className="font-medium text-green-600 dark:text-emerald-400">
                            −{formatPrice(cart.discount)}
                          </span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span>Delivery</span>
                        <span className="font-medium text-green-600 dark:text-emerald-400">
                          {cart.deliveryFee === 0
                            ? 'FREE'
                            : formatPrice(cart.deliveryFee)}
                        </span>
                      </div>
                    </div>

                    {/* Coupon entry */}
                    <CouponBox
                      couponApplied={cart.couponApplied ?? null}
                      couponInfo={(cart as any).couponInfo}
                      discount={cart.discount}
                    />

                    <div className="border-t border-gray-100 dark:border-slate-800 pt-3 pb-1 mb-2">
                      <div className="flex justify-between items-center">
                        <span className="font-bold text-gray-900 dark:text-slate-100">
                          Total Amount
                        </span>
                        <span className="font-bold text-2xl text-gray-900 dark:text-indigo-400">
                          {formatPrice(cart.total)}
                        </span>
                      </div>
                    </div>
                    {cart.discount > 0 && (
                      <div className="text-xs font-bold text-green-700 dark:text-emerald-300 bg-green-50 dark:bg-emerald-950/60 p-2 rounded-lg text-center mb-6 border border-green-100 dark:border-emerald-900/50">
                        You're saving {formatPrice(cart.discount)} on this
                        order!
                      </div>
                    )}

                    <Link href="/checkout">
                      <button
                        className="w-full min-h-11 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3.5 px-4 rounded-lg transition-colors flex items-center justify-center gap-2 shadow-md shadow-indigo-200 dark:shadow-none cursor-pointer"
                        data-testid="btn-checkout"
                      >
                        Proceed to Checkout <ChevronRight size={18} />
                      </button>
                    </Link>
                  </div>

                  <div className="bg-gray-50 dark:bg-slate-950/50 p-4">
                    <div className="text-xs text-gray-500 dark:text-slate-400 font-medium mb-3 text-center">
                      Accepted Payment Methods
                    </div>
                    <div className="flex justify-center gap-2 mb-4">
                      {['EMI', 'UPI', 'Cards', 'NetBanking'].map((method) => (
                        <div
                          key={method}
                          className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-[10px] font-bold text-gray-600 dark:text-slate-300 px-2 py-1 rounded"
                        >
                          {method}
                        </div>
                      ))}
                    </div>

                    <div className="flex flex-col gap-2 mt-4 border-t border-gray-200 dark:border-slate-800 pt-4">
                      <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-slate-300 font-medium">
                        <ShieldCheck
                          size={14}
                          className="text-green-600 dark:text-emerald-400"
                        />{' '}
                        Secure Checkout
                      </div>
                      <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-slate-300 font-medium">
                        <Truck
                          size={14}
                          className="text-indigo-600 dark:text-indigo-400"
                        />{' '}
                        Free Returns within 7 days
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-20 bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800">
              <ShoppingCart
                size={48}
                className="mx-auto text-gray-300 dark:text-slate-600 mb-4"
              />
              <h2 className="text-xl font-bold text-gray-900 dark:text-slate-100 mb-2">
                Your cart is empty
              </h2>
              <p className="text-gray-500 dark:text-slate-400 mb-6">
                Looks like you haven't added anything to your cart yet.
              </p>
              <Link href="/">
                <button className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-6 min-h-11 rounded-lg transition-colors">
                  Continue Shopping
                </button>
              </Link>
            </div>
          )}

          {/* ─── LOGGED-IN: Personalised AI recommendations ─── */}
          {cartRecs && isLoggedIn && (
            <div className="mt-16 space-y-12">
              {/* Hybrid AI Picks */}
              <div className="bg-gradient-to-r from-indigo-900 to-violet-900 rounded-2xl p-6 relative overflow-hidden shadow-xl">
                <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full blur-3xl"></div>

                <div className="flex items-center gap-3 mb-6 relative z-10">
                  <h2 className="text-xl font-bold text-white">
                    {cartRecs.hybrid.title.replace(
                      /Rahul's|Rahul/g,
                      userName ? userName.split(' ')[0] : 'Your',
                    )}
                  </h2>
                  <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-purple-200 bg-purple-500/30 px-2.5 py-1 rounded-full border border-purple-400/30">
                    <Sparkles size={12} /> Hybrid AI • Personalized
                  </div>
                </div>
                <p className="text-indigo-200 text-sm mb-6 relative z-10 max-w-2xl">
                  {cartRecs.hybrid.subtitle.replace(
                    /Rahul's|Rahul/g,
                    userName ? userName.split(' ')[0] : 'your',
                  )}
                </p>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-5 relative z-10">
                  {cartRecs.hybrid.products.map((rec) => (
                    <div
                      key={rec.product.id}
                      className="bg-white/10 backdrop-blur-md border border-white/20 rounded-xl p-4 hover:bg-white/15 transition-colors cursor-pointer group flex items-center gap-4"
                    >
                      <div className="w-20 h-20 bg-white rounded-lg p-2 flex-shrink-0 flex items-center justify-center">
                        <img
                          src={resolveProductImageSrc(rec.product.imageUrl)}
                          className="w-full h-full object-contain mix-blend-multiply"
                          onError={onProductImageError}
                        />
                      </div>
                      <div className="flex-1">
                        <div className="text-[10px] text-purple-200 bg-purple-900/50 px-2 py-0.5 rounded inline-block mb-1 border border-purple-400/20 truncate max-w-full">
                          {rec.reason}
                        </div>
                        <h3 className="font-semibold text-white text-sm leading-tight mb-1 group-hover:text-purple-200 transition-colors line-clamp-2">
                          {rec.product.name}
                        </h3>
                        <div className="font-bold text-white">
                          {formatPrice(rec.product.price)}
                        </div>
                      </div>
                      <button
                        onClick={() => handleAddToCart(rec.product.id)}
                        className="w-8 h-8 rounded-full bg-white text-indigo-900 flex items-center justify-center shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
                        data-testid={`btn-add-hybrid-${rec.product.id}`}
                      >
                        <ShoppingBag size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                {/* Complete Your Setup (Content-Based / Cross-sell) */}
                <div>
                  <div className="flex items-center gap-3 mb-4">
                    <h2 className="text-lg font-bold text-gray-900 dark:text-slate-100">
                      {cartRecs.crossSell.title}
                    </h2>
                    <div className="inline-flex items-center gap-1.5 text-[10px] font-medium text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/60 px-2 py-0.5 rounded border border-blue-100 dark:border-blue-900/50">
                      <Activity size={10} /> Content-Based
                    </div>
                  </div>
                  <div className="text-xs text-gray-500 dark:text-slate-400 mb-4">
                    {cartRecs.crossSell.subtitle}
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    {cartRecs.crossSell.products.map((rec) => (
                      <div
                        key={rec.product.id}
                        className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-xl p-3 flex gap-3 hover:shadow-md transition-shadow cursor-pointer"
                      >
                        <div className="w-16 h-16 bg-gray-50 dark:bg-slate-800/80 rounded flex items-center justify-center p-1">
                          <img
                            src={resolveProductImageSrc(rec.product.imageUrl)}
                            className="w-full h-full object-contain mix-blend-multiply dark:mix-blend-normal"
                            onError={onProductImageError}
                          />
                        </div>
                        <div className="flex-1 flex flex-col justify-center">
                          <h3 className="font-semibold text-gray-900 dark:text-slate-100 text-xs leading-tight mb-1 line-clamp-2">
                            {rec.product.name}
                          </h3>
                          <div className="font-bold text-sm text-gray-900 dark:text-indigo-400 mb-2">
                            {formatPrice(rec.product.price)}
                          </div>
                          <button
                            onClick={() => handleAddToCart(rec.product.id)}
                            className="text-xs text-indigo-600 dark:text-indigo-400 font-semibold border border-indigo-200 dark:border-indigo-900/50 rounded py-1 hover:bg-indigo-50 dark:hover:bg-indigo-950/60 transition-colors w-full"
                            data-testid={`btn-crosssell-${rec.product.id}`}
                          >
                            Add
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Frequently Bought Together (Collaborative) */}
                <div>
                  <div className="flex items-center gap-3 mb-4">
                    <h2 className="text-lg font-bold text-gray-900 dark:text-slate-100">
                      {cartRecs.collaborative.title}
                    </h2>
                    <div className="inline-flex items-center gap-1.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-100 dark:border-emerald-900/50">
                      <TrendingUp size={10} /> Collaborative
                    </div>
                  </div>
                  <div className="text-xs text-gray-500 dark:text-slate-400 mb-4">
                    {cartRecs.collaborative.subtitle}
                  </div>

                  <div className="flex flex-col gap-3">
                    {cartRecs.collaborative.products.map((rec) => (
                      <div
                        key={rec.product.id}
                        className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-xl p-3 flex items-center gap-4 hover:shadow-md transition-shadow cursor-pointer"
                      >
                        <div className="w-16 h-16 bg-gray-50 dark:bg-slate-800/80 rounded flex items-center justify-center p-1">
                          <img
                            src={resolveProductImageSrc(rec.product.imageUrl)}
                            className="w-full h-full object-contain mix-blend-multiply dark:mix-blend-normal"
                            onError={onProductImageError}
                          />
                        </div>
                        <div className="flex-1">
                          <h3 className="font-semibold text-gray-900 dark:text-slate-100 text-sm mb-1 line-clamp-1">
                            {rec.product.name}
                          </h3>
                          <div className="flex items-center gap-3">
                            <span className="font-bold text-gray-900 dark:text-indigo-400">
                              {formatPrice(rec.product.price)}
                            </span>
                            {rec.reason && (
                              <span className="text-[10px] font-bold text-orange-600 dark:text-orange-300 bg-orange-50 dark:bg-orange-950/60 border border-orange-100 dark:border-orange-900/50 px-1.5 py-0.5 rounded max-w-[120px] truncate">
                                {rec.reason}
                              </span>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => handleAddToCart(rec.product.id)}
                          className="bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-900/50 w-8 h-8 rounded-full flex items-center justify-center transition-colors flex-shrink-0"
                          data-testid={`btn-collab-${rec.product.id}`}
                        >
                          <span className="font-bold">+</span>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ─── ANONYMOUS: Cross-sell opportunities, no personal AI ─── */}
          {!isLoggedIn && (
            <div className="mt-16 space-y-10">
              {/* Cross-Sell header */}
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <h2 className="text-xl font-bold text-gray-900 dark:text-slate-100">
                    Complete Your Setup
                  </h2>
                  <div className="inline-flex items-center gap-1.5 text-xs font-medium text-orange-700 dark:text-orange-300 bg-orange-50 dark:bg-orange-950/60 px-2.5 py-1 rounded-full border border-orange-200 dark:border-orange-900/50">
                    <TrendingUp size={12} /> Cross-Sell Opportunities
                  </div>
                </div>
                <p className="text-sm text-gray-500 dark:text-slate-400 mb-6">
                  Shoppers frequently add these alongside their cart items
                </p>

                {crossSellProducts.length > 0 && (
                  <AnonymousRecommendationWidget
                    title="Chargers, Headphones & More"
                    subtitle="Popular accessories to go with your purchase"
                    badge="Frequently Added"
                    badgeVariant="trending"
                    products={crossSellProducts}
                  />
                )}
              </div>

              {/* Popular accessories */}
              {popularAccessories.length > 0 && (
                <AnonymousRecommendationWidget
                  title="Top-Rated Accessories"
                  subtitle="Highest-rated picks from our electronics collection"
                  badge="Editorial Pick"
                  badgeVariant="editorial"
                  products={popularAccessories}
                />
              )}

              {/* Sign-in nudge */}
              <div className="bg-gradient-to-r from-indigo-600 to-violet-600 rounded-2xl p-6 flex flex-col md:flex-row items-center justify-between gap-6 shadow-lg">
                <div>
                  <div className="text-white/70 text-xs font-medium mb-1">
                    For Logged-In Shoppers
                  </div>
                  <h3 className="text-lg font-bold text-white mb-1">
                    Get AI picks tailored just for you
                  </h3>
                  <p className="text-indigo-200 text-sm">
                    Sign in to unlock Hybrid AI recommendations based on your
                    browsing and purchase history.
                  </p>
                </div>
                <button
                  className="flex-shrink-0 bg-white text-indigo-700 font-bold px-6 py-3 rounded-xl hover:bg-indigo-50 transition-colors whitespace-nowrap"
                  data-testid="btn-signin-cart-nudge"
                  onClick={() =>
                    window.scrollTo({ top: 0, behavior: 'smooth' })
                  }
                >
                  Sign In
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
