import React, { useState, useEffect } from 'react';
import { Link, useParams, useLocation } from 'wouter';
import {
  Star,
  ShoppingCart,
  ChevronRight,
  Check,
  ShieldCheck,
  Truck,
  RotateCcw,
  CreditCard,
  Heart,
  TrendingUp,
  Activity,
  Send,
} from 'lucide-react';
import { AppLayout } from '../components/AppLayout';
import { RecommendationWidget } from '../components/RecommendationWidget';
import { AnonymousRecommendationWidget } from '../components/AnonymousRecommendationWidget';
import {
  useGetProduct,
  useGetPdpRecommendations,
  useAddToCart,
  useListProducts,
  getGetCartQueryKey,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/skeleton';
import { useUser } from '../context/UserContext';
import { useToast } from '../context/ToastContext';
import { logAndAlertError } from '../lib/errorHandler';
import {
  onProductImageError,
  resolveProductImageSrc,
} from '../lib/product-image';
import { useBehaviorTracking } from '../hooks/useBehaviorTracking';

export default function PDPPage() {
  const { id } = useParams();
  const productId = Number(id);
  const queryClient = useQueryClient();
  const addToCart = useAddToCart();
  const { isLoggedIn } = useUser();
  const { trackView } = useBehaviorTracking();
  const [, navigate] = useLocation();

  const { data: product, isLoading: isProductLoading } = useGetProduct(
    productId,
    {
      query: { enabled: !!productId } as any,
    },
  );

  const { data: pdpRecs, isLoading: isRecsLoading } = useGetPdpRecommendations(
    productId,
    {
      query: { enabled: !!productId } as any,
    },
  );

  // Track product view for recommendation engine
  useEffect(() => {
    if (product && product.id) {
      trackView(product.id, product.category, product.brand);
    }
  }, [product?.id, product?.category, product?.brand, trackView]);

  // For anonymous: fetch accessories and trending items
  const { data: allProducts } = useListProducts();
  const trendingAccessories = (allProducts ?? [])
    .filter(
      (p) =>
        ['Accessories', 'Audio'].includes(p.category) && p.id !== productId,
    )
    .slice(0, 6);

  const [activeColor, setActiveColor] = useState('Silver');
  const [activeImageIdx, setActiveImageIdx] = useState(0);


  if (isProductLoading || !product) {
    return (
      <AppLayout activePage="pdp">
        <div className="bg-white dark:bg-slate-950 min-h-screen pb-24">
          {/* Breadcrumb skeleton */}
          <div className="border-b border-gray-100 dark:border-slate-800 bg-white dark:bg-slate-900">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-2">
              <Skeleton className="h-3 w-10" />
              <Skeleton className="h-3 w-3" />
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-3 w-3" />
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-3 w-3" />
              <Skeleton className="h-3 w-32" />
            </div>
          </div>

          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
            <div className="flex flex-col md:flex-row gap-12">
              {/* Left: Image gallery skeleton */}
              <div className="w-full md:w-1/2 flex flex-col gap-4">
                <Skeleton className="aspect-square w-full rounded-2xl" />
                <div className="flex gap-4">
                  {[0, 1, 2, 3].map((i) => (
                    <Skeleton key={i} className="w-20 h-20 rounded-xl" />
                  ))}
                </div>
              </div>

              {/* Right: Product info skeleton */}
              <div className="w-full md:w-1/2 flex flex-col">
                <Skeleton className="h-4 w-20 mb-3" />
                <Skeleton className="h-8 w-3/4 mb-2" />
                <Skeleton className="h-6 w-1/2 mb-6" />

                {/* Rating */}
                <div className="flex items-center gap-4 mb-6">
                  <Skeleton className="h-7 w-16 rounded" />
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-32" />
                </div>

                {/* Price box */}
                <div className="rounded-xl p-5 mb-8 border border-gray-100 dark:border-slate-800">
                  <div className="flex items-end gap-3 mb-3">
                    <Skeleton className="h-9 w-32" />
                    <Skeleton className="h-5 w-20" />
                  </div>
                  <Skeleton className="h-4 w-48 mb-4" />
                  <div className="pt-4 border-t border-gray-200 dark:border-slate-800 flex items-center gap-3">
                    <Skeleton className="h-5 w-5 rounded" />
                    <div className="flex-1">
                      <Skeleton className="h-4 w-52 mb-1" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                  </div>
                </div>

                {/* Specs */}
                <Skeleton className="h-4 w-20 mb-2" />
                <Skeleton className="h-3 w-full mb-1" />
                <Skeleton className="h-3 w-4/5 mb-6" />

                {/* Color selector */}
                <Skeleton className="h-4 w-24 mb-3" />
                <div className="flex gap-3 mb-8">
                  <Skeleton className="w-12 h-12 rounded-full" />
                  <Skeleton className="w-12 h-12 rounded-full" />
                </div>

                {/* Delivery & buttons */}
                <div className="rounded-xl p-4 border border-gray-200 dark:border-slate-800 mb-8">
                  <div className="flex items-center gap-3 mb-4">
                    <Skeleton className="h-5 w-5" />
                    <div>
                      <Skeleton className="h-4 w-40 mb-1" />
                      <Skeleton className="h-4 w-48" />
                    </div>
                  </div>
                  <Skeleton className="h-4 w-16 mb-4" />
                  <div className="flex flex-col sm:flex-row gap-3">
                    <Skeleton className="flex-1 h-12 rounded-lg" />
                    <Skeleton className="flex-1 h-12 rounded-lg" />
                  </div>
                </div>

                {/* Trust badges */}
                <div className="flex gap-6 border-t border-gray-100 dark:border-slate-800 pt-6">
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      className="flex flex-col items-center gap-2 flex-1"
                    >
                      <Skeleton className="h-6 w-6 rounded" />
                      <Skeleton className="h-3 w-12" />
                      <Skeleton className="h-3 w-14" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }

  let rawImages: string[] = [];
  const prodImages = (product as any).images;
  if (prodImages) {
    try {
      if (Array.isArray(prodImages)) {
        rawImages = prodImages;
      } else if (typeof prodImages === 'string') {
        const parsed = JSON.parse(prodImages);
        if (Array.isArray(parsed) && parsed.length > 0) {
          rawImages = parsed;
        }
      }
    } catch {
      // Fallback if parsing fails
    }
  }
  if (rawImages.length === 0 && product.imageUrl) {
    rawImages = [product.imageUrl];
  }
  const images = rawImages.map((img) => resolveProductImageSrc(img));
  const activeImage = images[activeImageIdx] || images[0];

  let parsedSpecsObj: Record<string, any> | null = null;
  if (product.specs) {
    try {
      if (typeof product.specs === 'object') {
        parsedSpecsObj = product.specs;
      } else if (
        typeof product.specs === 'string' &&
        product.specs.trim().startsWith('{')
      ) {
        parsedSpecsObj = JSON.parse(product.specs);
      }
    } catch {
      parsedSpecsObj = null;
    }
  }

  const formatPrice = (price: number) =>
    new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(price);

  const formattedPrice = formatPrice(product.price);
  const formattedOldPrice = product.originalPrice
    ? formatPrice(product.originalPrice)
    : null;
  const savings = product.originalPrice
    ? product.originalPrice - product.price
    : 0;
  const formattedSavings = formatPrice(savings);

  const handleAddToCart = () => {
    addToCart.mutate(
      { data: { productId: product.id, quantity: 1 } },
      {
        onSuccess: () =>
          queryClient.invalidateQueries({ queryKey: getGetCartQueryKey() }),
      },
    );
  };

  const handleBuyNow = () => {
    if (!isLoggedIn) {
      navigate('/login');
      return;
    }
    addToCart.mutate(
      { data: { productId: product.id, quantity: 1 } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetCartQueryKey() });
          navigate('/checkout');
        },
      },
    );
  };

  return (
    <AppLayout activePage="pdp">
      <div className="bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 min-h-screen pb-24 transition-colors">
        {/* Breadcrumb */}
        <div className="border-b border-gray-100 dark:border-slate-800 bg-white dark:bg-slate-900">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center text-xs font-medium text-gray-500 dark:text-slate-400 gap-2 overflow-x-auto whitespace-nowrap">
            <Link
              href="/"
              className="hover:text-indigo-600 dark:hover:text-indigo-400 cursor-pointer"
            >
              Home
            </Link>
            <ChevronRight size={12} />
            <span className="hover:text-indigo-600 dark:hover:text-indigo-400 cursor-pointer">
              {product.category}
            </span>
            <ChevronRight size={12} />
            <span className="hover:text-indigo-600 dark:hover:text-indigo-400 cursor-pointer">
              {product.brand}
            </span>
            <ChevronRight size={12} />
            <span className="text-gray-900 dark:text-slate-100 font-semibold">
              {product.name}
            </span>
          </div>
        </div>

        {/* Product Hero */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
          <div className="flex flex-col md:flex-row gap-8 md:gap-12">
            {/* Left: Gallery */}
            <div className="w-full md:w-1/2 flex flex-col gap-4">
              <div className="aspect-square bg-gray-50 dark:bg-slate-900 rounded-2xl flex items-center justify-center p-8 border border-gray-100 dark:border-slate-800 relative group overflow-hidden">
                {product.isFeatured && (
                  <div className="absolute top-4 left-4 bg-indigo-600 text-white text-xs font-bold px-3 py-1.5 rounded-full z-10 shadow-sm">
                    Best Seller
                  </div>
                )}
                <button className="absolute top-4 right-4 p-2 bg-white dark:bg-slate-800 border border-gray-100 dark:border-slate-700 rounded-full text-gray-400 dark:text-slate-300 hover:text-red-500 shadow-sm z-10 transition-colors">
                  <Heart size={20} />
                </button>
                <img
                  src={resolveProductImageSrc(activeImage)}
                  alt={product.name}
                  className="w-full h-full object-contain mix-blend-multiply dark:mix-blend-normal transition-transform duration-500 group-hover:scale-105"
                  onError={onProductImageError}
                />
              </div>
              <div className="flex gap-2 sm:gap-4 overflow-x-auto pb-1">
                {images.map((img, i) => (
                  <button
                    key={i}
                    onClick={() => setActiveImageIdx(i)}
                    className={`w-16 h-16 sm:w-20 sm:h-20 rounded-xl bg-gray-50 dark:bg-slate-900 border-2 shrink-0 flex items-center justify-center p-2 overflow-hidden ${activeImageIdx === i ? 'border-indigo-600 dark:border-indigo-500' : 'border-transparent hover:border-gray-200 dark:hover:border-slate-800'}`}
                    data-testid={`btn-thumb-${i}`}
                  >
                    <img
                      src={resolveProductImageSrc(img)}
                      className="w-full h-full object-contain mix-blend-multiply dark:mix-blend-normal"
                      onError={onProductImageError}
                    />
                  </button>
                ))}
              </div>
            </div>

            {/* Right: Info */}
            <div className="w-full md:w-1/2 flex flex-col">
              <div className="mb-2">
                <span className="text-sm font-bold text-indigo-600 dark:text-indigo-400 tracking-wider uppercase">
                  {product.brand}
                </span>
              </div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-slate-100 mb-3 leading-tight">
                {product.name}
              </h1>

              <div className="flex items-center gap-4 mb-6">
                <div className="flex items-center gap-1 bg-amber-50 dark:bg-amber-950/60 px-2 py-1 rounded border border-amber-100 dark:border-amber-900/50">
                  <span className="text-sm font-bold text-amber-700 dark:text-amber-300">
                    {product.rating}
                  </span>
                  <Star size={14} className="text-amber-500 fill-amber-500" />
                </div>
                <span className="text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer">
                  {product.reviewCount} ratings
                </span>
                <span className="text-gray-300 dark:text-slate-700">|</span>
                <span className="text-sm font-medium text-gray-600 dark:text-slate-400">
                  89 answered questions
                </span>
              </div>

              <div className="bg-gray-50 dark:bg-slate-900 rounded-xl p-5 mb-8 border border-gray-100 dark:border-slate-800">
                <div className="flex items-end gap-3 mb-1">
                  <span className="text-3xl font-bold text-gray-900 dark:text-indigo-400">
                    {formattedPrice}
                  </span>
                  {formattedOldPrice && (
                    <span className="text-lg text-gray-400 dark:text-slate-500 line-through mb-1">
                      {formattedOldPrice}
                    </span>
                  )}
                </div>
                {savings > 0 && (
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-green-600 dark:text-emerald-400 font-bold">
                      Save {formattedSavings} ({product.discountPct}%)
                    </span>
                    <span className="text-gray-500 dark:text-slate-400">
                      Inclusive of all taxes
                    </span>
                  </div>
                )}
                <div className="mt-4 flex items-start gap-3 pt-4 border-t border-gray-200 dark:border-slate-800">
                  <CreditCard
                    size={18}
                    className="text-indigo-600 dark:text-indigo-400 mt-0.5"
                  />
                  <div>
                    <div className="text-sm font-semibold text-gray-900 dark:text-slate-100">
                      No Cost EMI starts at ₹10,416/month.
                    </div>
                    <div className="text-xs text-indigo-600 dark:text-indigo-400 mt-1 cursor-pointer hover:underline">
                      View EMI options
                    </div>
                  </div>
                </div>
              </div>

              {parsedSpecsObj ? (
                <div className="mb-6">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-slate-100 mb-2.5">
                    Key Specs Highlights
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(parsedSpecsObj)
                      .filter(
                        ([key]) =>
                          ![
                            'cpuSocket',
                            'supportedSockets',
                            'ramGeneration',
                            'coolerType',
                            'gpuLength',
                            'psuWattage',
                            'radiatorSize',
                            'storageInterface',
                          ].includes(key),
                      )
                      .slice(0, 4)
                      .map(([key, val]) => (
                        <div
                          key={key}
                          className="bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700"
                        >
                          <span className="text-slate-500 dark:text-slate-400 font-medium">
                            {key}:{' '}
                          </span>
                          <span className="font-semibold">{String(val)}</span>
                        </div>
                      ))}
                  </div>
                </div>
              ) : product.specs ? (
                <div className="mb-6">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-slate-100 mb-2">
                    Key Specs
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-slate-300">
                    {product.specs}
                  </p>
                </div>
              ) : null}

              <div className="mb-8">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-slate-100 mb-3">
                  Color:{' '}
                  <span className="text-gray-500 dark:text-slate-400">
                    {activeColor}
                  </span>
                </h3>
                <div className="flex gap-3">
                  {['Silver', 'Black'].map((color) => (
                    <button
                      key={color}
                      onClick={() => setActiveColor(color)}
                      className={`w-12 h-12 rounded-full border-2 p-1 ${activeColor === color ? 'border-indigo-600 dark:border-indigo-400' : 'border-gray-200 dark:border-slate-700 hover:border-gray-300'}`}
                      data-testid={`btn-color-${color.toLowerCase()}`}
                    >
                      <div
                        className={`w-full h-full rounded-full ${color === 'Silver' ? 'bg-gray-200 dark:bg-slate-300' : 'bg-gray-800 dark:bg-slate-900'}`}
                      ></div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="mb-8 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-xl p-4 shadow-sm">
                <div className="flex items-start gap-3 mb-4">
                  <Truck
                    size={20}
                    className="text-gray-700 dark:text-slate-300"
                  />
                  <div>
                    <div className="text-sm font-medium text-gray-900 dark:text-slate-100">
                      Deliver to{' '}
                      <span className="font-bold">Mumbai 400001</span>
                    </div>
                    <div className="text-sm text-green-600 dark:text-emerald-400 font-bold mt-1">
                      FREE Delivery by Tomorrow, 11 AM
                    </div>
                  </div>
                </div>
                <div
                  className={`text-sm font-bold mb-4 ${product.inStock ? 'text-green-700 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}
                >
                  {product.inStock ? 'In Stock' : 'Out of Stock'}
                </div>

                <div className="flex flex-col sm:flex-row gap-3">
                  <button
                    onClick={handleAddToCart}
                    disabled={!product.inStock}
                    className="flex-1 min-h-11 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 font-bold py-3.5 px-6 rounded-lg transition-colors flex items-center justify-center gap-2 border border-indigo-200 dark:border-indigo-900/50 disabled:opacity-50"
                    data-testid="btn-add-to-cart"
                  >
                    <ShoppingCart size={18} />
                    Add to Cart
                  </button>
                  <button
                    onClick={handleBuyNow}
                    disabled={!product.inStock}
                    className="flex-1 min-h-11 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3.5 px-6 rounded-lg shadow-md shadow-indigo-200 dark:shadow-none transition-colors disabled:opacity-50"
                    data-testid="btn-buy-now"
                  >
                    Buy Now
                  </button>
                </div>
              </div>

              <div className="flex gap-6 border-t border-gray-100 dark:border-slate-800 pt-6">
                <div className="flex flex-col items-center gap-2 flex-1 text-center">
                  <ShieldCheck
                    size={24}
                    className="text-gray-400 dark:text-slate-500"
                  />
                  <span className="text-xs text-gray-500 dark:text-slate-400 font-medium leading-tight">
                    1 Year
                    <br />
                    Warranty
                  </span>
                </div>
                <div className="flex flex-col items-center gap-2 flex-1 text-center">
                  <RotateCcw
                    size={24}
                    className="text-gray-400 dark:text-slate-500"
                  />
                  <span className="text-xs text-gray-500 dark:text-slate-400 font-medium leading-tight">
                    7 Days
                    <br />
                    Replacement
                  </span>
                </div>
                <div className="flex flex-col items-center gap-2 flex-1 text-center">
                  <Truck
                    size={24}
                    className="text-gray-400 dark:text-slate-500"
                  />
                  <span className="text-xs text-gray-500 dark:text-slate-400 font-medium leading-tight">
                    ShopNow
                    <br />
                    Delivered
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Product Tabs */}
        <ProductTabs product={product} isLoggedIn={isLoggedIn} />

        {/* ─── LOGGED-IN: Personalised AI recommendations ─── */}
        {!isRecsLoading && pdpRecs && isLoggedIn && (
          <>
            <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-8">
              <RecommendationWidget widget={pdpRecs.hybrid} variant="hybrid" />
            </div>

            <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
              <div className="flex items-center gap-3 mb-6">
                <h2 className="text-xl font-bold text-gray-900 dark:text-slate-100">
                  {pdpRecs.frequentlyBoughtTogether.title}
                </h2>
                <div className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-100 dark:border-emerald-900/50">
                  <TrendingUp size={12} /> Collaborative Filtering
                </div>
              </div>

              <div className="flex flex-col md:flex-row items-center gap-8 bg-gray-50/50 dark:bg-slate-900/50 rounded-2xl p-6 border border-gray-100 dark:border-slate-800">
                <div className="flex items-center gap-4 overflow-x-auto pb-4 md:pb-0 w-full md:w-auto">
                  <div className="w-32 flex-shrink-0">
                    <div className="w-32 h-32 bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 mb-3 flex items-center justify-center p-4 relative shadow-sm">
                      <div className="absolute top-2 right-2 w-5 h-5 bg-indigo-600 rounded flex items-center justify-center">
                        <Check size={12} color="white" />
                      </div>
                      <img
                        src={resolveProductImageSrc(product.imageUrl)}
                        className="w-full h-full object-contain mix-blend-multiply dark:mix-blend-normal"
                        onError={onProductImageError}
                      />
                    </div>
                    <div className="text-xs text-gray-500 dark:text-slate-400 font-medium mb-1">
                      This item
                    </div>
                    <div className="text-sm font-bold text-gray-900 dark:text-slate-100">
                      {formattedPrice}
                    </div>
                  </div>

                  {pdpRecs.frequentlyBoughtTogether.products
                    .slice(0, 3)
                    .map((rec) => (
                      <React.Fragment key={rec.product.id}>
                        <div className="text-2xl text-gray-300 dark:text-slate-600 font-light">
                          +
                        </div>
                        <div className="w-32 flex-shrink-0">
                          <Link href={`/product/${rec.product.id}`}>
                            <div className="w-32 h-32 bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 mb-3 flex items-center justify-center p-4 relative shadow-sm cursor-pointer hover:border-indigo-300">
                              <div className="absolute top-2 right-2 w-5 h-5 bg-indigo-600 rounded flex items-center justify-center">
                                <Check size={12} color="white" />
                              </div>
                              <img
                                src={resolveProductImageSrc(
                                  rec.product.imageUrl,
                                )}
                                className="w-full h-full object-contain mix-blend-multiply dark:mix-blend-normal"
                                onError={onProductImageError}
                              />
                            </div>
                          </Link>
                          <Link href={`/product/${rec.product.id}`}>
                            <div className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer mb-1 truncate">
                              {rec.product.name}
                            </div>
                          </Link>
                          <div className="text-sm font-bold text-gray-900 dark:text-slate-100">
                            {formatPrice(rec.product.price)}
                          </div>
                        </div>
                      </React.Fragment>
                    ))}
                </div>

                <div className="flex-1 bg-white dark:bg-slate-900 p-5 rounded-xl border border-gray-200 dark:border-slate-800 shadow-sm w-full md:w-auto">
                  <div className="text-sm text-gray-500 dark:text-slate-400 font-medium mb-1">
                    Total price:
                  </div>
                  <div className="text-2xl font-bold text-gray-900 dark:text-slate-100 mb-1">
                    {formatPrice(
                      product.price +
                        pdpRecs.frequentlyBoughtTogether.products
                          .slice(0, 3)
                          .reduce((acc, p) => acc + p.product.price, 0),
                    )}
                  </div>
                  <div className="text-xs text-green-600 dark:text-emerald-400 font-bold bg-green-50 dark:bg-emerald-950/60 border border-green-100 dark:border-emerald-900/50 px-2 py-1 rounded inline-block mb-4">
                    Bundle Savings: ₹1,200
                  </div>
                  <button
                    onClick={() => {
                      handleAddToCart();
                      pdpRecs.frequentlyBoughtTogether.products
                        .slice(0, 3)
                        .forEach((p) =>
                          addToCart.mutate({
                            data: { productId: p.product.id, quantity: 1 },
                          }),
                        );
                      setTimeout(
                        () =>
                          queryClient.invalidateQueries({
                            queryKey: getGetCartQueryKey(),
                          }),
                        500,
                      );
                    }}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 px-4 rounded-lg transition-colors"
                    data-testid="btn-add-bundle"
                  >
                    Add All to Cart
                  </button>
                </div>
              </div>
            </div>

            <RecommendationWidget
              widget={pdpRecs.contentBased}
              variant="content_based"
            />
          </>
        )}

        {/* ─── ANONYMOUS: Curated, no personal AI ─── */}
        {!isRecsLoading && pdpRecs && !isLoggedIn && (
          <>
            {/* Frequently Bought Together */}
            <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
              <div className="flex items-center gap-3 mb-6">
                <h2 className="text-xl font-bold text-gray-900 dark:text-slate-100">
                  Frequently Bought Together
                </h2>
                <div className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-100 dark:border-emerald-900/50">
                  <TrendingUp size={12} /> Popular Combo
                </div>
              </div>

              <div className="flex flex-col md:flex-row items-center gap-8 bg-gray-50/50 dark:bg-slate-900/50 rounded-2xl p-6 border border-gray-100 dark:border-slate-800">
                <div className="flex items-center gap-4 overflow-x-auto pb-4 md:pb-0 w-full md:w-auto">
                  <div className="w-32 flex-shrink-0">
                    <div className="w-32 h-32 bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 mb-3 flex items-center justify-center p-4 relative shadow-sm">
                      <div className="absolute top-2 right-2 w-5 h-5 bg-indigo-600 rounded flex items-center justify-center">
                        <Check size={12} color="white" />
                      </div>
                      <img
                        src={resolveProductImageSrc(product.imageUrl)}
                        className="w-full h-full object-contain mix-blend-multiply dark:mix-blend-normal"
                        onError={onProductImageError}
                      />
                    </div>
                    <div className="text-xs text-gray-500 dark:text-slate-400 font-medium mb-1">
                      This item
                    </div>
                    <div className="text-sm font-bold text-gray-900 dark:text-slate-100">
                      {formattedPrice}
                    </div>
                  </div>

                  {pdpRecs.frequentlyBoughtTogether.products
                    .slice(0, 3)
                    .map((rec) => (
                      <React.Fragment key={rec.product.id}>
                        <div className="text-2xl text-gray-300 dark:text-slate-600 font-light">
                          +
                        </div>
                        <div className="w-32 flex-shrink-0">
                          <Link href={`/product/${rec.product.id}`}>
                            <div className="w-32 h-32 bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 mb-3 flex items-center justify-center p-4 relative shadow-sm cursor-pointer hover:border-indigo-300">
                              <div className="absolute top-2 right-2 w-5 h-5 bg-indigo-600 rounded flex items-center justify-center">
                                <Check size={12} color="white" />
                              </div>
                              <img
                                src={resolveProductImageSrc(
                                  rec.product.imageUrl,
                                )}
                                className="w-full h-full object-contain mix-blend-multiply dark:mix-blend-normal"
                                onError={onProductImageError}
                              />
                            </div>
                          </Link>
                          <Link href={`/product/${rec.product.id}`}>
                            <div className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer mb-1 truncate">
                              {rec.product.name}
                            </div>
                          </Link>
                          <div className="text-sm font-bold text-gray-900 dark:text-slate-100">
                            {formatPrice(rec.product.price)}
                          </div>
                        </div>
                      </React.Fragment>
                    ))}
                </div>

                <div className="flex-1 bg-white dark:bg-slate-900 p-5 rounded-xl border border-gray-200 dark:border-slate-800 shadow-sm w-full md:w-auto">
                  <div className="text-sm text-gray-500 dark:text-slate-400 font-medium mb-1">
                    Total price:
                  </div>
                  <div className="text-2xl font-bold text-gray-900 dark:text-slate-100 mb-1">
                    {formatPrice(
                      product.price +
                        pdpRecs.frequentlyBoughtTogether.products
                          .slice(0, 3)
                          .reduce((acc, p) => acc + p.product.price, 0),
                    )}
                  </div>
                  <div className="text-xs text-green-600 dark:text-emerald-400 font-bold bg-green-50 dark:bg-emerald-950/60 border border-green-100 dark:border-emerald-900/50 px-2 py-1 rounded inline-block mb-4">
                    Bundle Savings: ₹1,200
                  </div>
                  <button
                    onClick={() => {
                      handleAddToCart();
                      pdpRecs.frequentlyBoughtTogether.products
                        .slice(0, 3)
                        .forEach((p) =>
                          addToCart.mutate({
                            data: { productId: p.product.id, quantity: 1 },
                          }),
                        );
                      setTimeout(
                        () =>
                          queryClient.invalidateQueries({
                            queryKey: getGetCartQueryKey(),
                          }),
                        500,
                      );
                    }}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 px-4 rounded-lg transition-colors"
                    data-testid="btn-add-bundle-anon"
                  >
                    Add All to Cart
                  </button>
                </div>
              </div>
            </div>

            {/* Trending Accessories */}
            {trendingAccessories.length > 0 && (
              <AnonymousRecommendationWidget
                title="Trending Accessories"
                subtitle="Top-rated add-ons shoppers are picking up this week"
                badge="Trending"
                badgeVariant="trending"
                products={trendingAccessories}
              />
            )}

            {/* Subtle sign-in nudge */}
            <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
              <div className="bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-100 dark:border-indigo-900/50 rounded-xl px-6 py-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <Activity
                    size={20}
                    className="text-indigo-500 dark:text-indigo-400 flex-shrink-0"
                  />
                  <p className="text-sm text-indigo-800 dark:text-indigo-200">
                    <strong>Sign in</strong> to see AI-powered picks
                    personalised for you — based on what you browse and buy.
                  </p>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}

// ─── Product Tabs with Reviews ───────────────────────────────────────────────

function ProductTabs({
  product,
  isLoggedIn,
}: {
  product: any;
  isLoggedIn: boolean;
}) {
  const [activeTab, setActiveTab] = useState<
    'description' | 'specifications' | 'reviews'
  >('description');
  const [reviews, setReviews] = useState<any[]>([]);
  const [stats, setStats] = useState<{
    total: number;
    averageRating: number;
    distribution: number[];
  } | null>(null);
  const [userReview, setUserReview] = useState<any>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [reviewForm, setReviewForm] = useState({
    rating: 5,
    title: '',
    comment: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const { userName } = useUser();
  const toast = useToast();

  useEffect(() => {
    if (activeTab === 'reviews') {
      fetch(`/api/products/${product.id}/reviews`, { credentials: 'include' })
        .then((r) => r.json())
        .then((data) => {
          setReviews(data.reviews || []);
          setStats(data.stats || null);
          // Find user's review if logged in
          if (isLoggedIn && data.reviews) {
            const userReviewItem = data.reviews.find(
              (r: any) => r.userName === (userName || 'User'),
            );
            if (userReviewItem) {
              setUserReview(userReviewItem);
              setReviewForm({
                rating: userReviewItem.rating,
                title: userReviewItem.title,
                comment: userReviewItem.comment,
              });
              setIsEditMode(true);
            } else {
              // User is logged in but no review found - clear edit mode
              setIsEditMode(false);
              setUserReview(null);
            }
          } else {
            // User not logged in - clear edit mode
            setIsEditMode(false);
            setUserReview(null);
          }
        })
        .catch(() => {});
    }
  }, [activeTab, product.id, isLoggedIn, userName]);

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewForm.title.trim() || !reviewForm.comment.trim()) return;
    setSubmitting(true);
    console.log('[Frontend] Submitting review (POST):', {
      productId: product.id,
      rating: reviewForm.rating,
      title: reviewForm.title,
      comment: reviewForm.comment,
      userName,
    });
    try {
      const res = await fetch(`/api/products/${product.id}/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ...reviewForm, userName: userName || 'User' }),
      });
      if (res.ok) {
        const newReview = await res.json();
        console.log('[Frontend] Review created successfully:', newReview);
        setReviews((prev) => [newReview, ...prev]);
        setUserReview(newReview);
        setReviewForm({ rating: 5, title: '', comment: '' });
        setIsEditMode(true);
        // Refresh stats
        const statsRes = await fetch(`/api/products/${product.id}/reviews`, {
          credentials: 'include',
        });
        const statsData = await statsRes.json();
        setStats(statsData.stats);
      } else if (res.status === 409) {
        // User already has a review - reload and switch to edit mode
        console.warn('[Frontend] 409 Conflict - user already has review');
        const reloadRes = await fetch(`/api/products/${product.id}/reviews`, {
          credentials: 'include',
        });
        const reloadData = await reloadRes.json();
        const existingReview = reloadData.reviews?.find(
          (r: any) => r.userName === (userName || 'User'),
        );
        if (existingReview) {
          setUserReview(existingReview);
          setReviewForm({
            rating: existingReview.rating,
            title: existingReview.title,
            comment: existingReview.comment,
          });
          setIsEditMode(true);
          toast.info('Review loaded in edit mode.');
        } else {
          toast.error('You already have a review. Please refresh the page.');
        }
      } else if (res.status === 401) {
        toast.error('Please log in to submit a review.');
      } else {
        const errorData = await res.json();
        const userMessage = logAndAlertError(
          errorData,
          'handleSubmitReview',
          'Failed to submit review. Please try again.',
        );
        toast.error(userMessage);
      }
    } catch (error) {
      const userMessage = logAndAlertError(
        error,
        'handleSubmitReview (catch)',
        'Something went wrong. Please try again.',
      );
      toast.error(userMessage);
    }
    setSubmitting(false);
  };

  const handleUpdateReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewForm.title.trim() || !reviewForm.comment.trim()) return;

    // Check if user is still logged in
    if (!isLoggedIn) {
      toast.error('Your session has expired. Please log in again.');
      return;
    }

    if (!userReview?.id) {
      console.error('[Frontend] Review ID not found:', userReview);
      toast.error('Review not found. Please refresh the page.');
      return;
    }

    setSubmitting(true);
    console.log('[Frontend] Updating review (PUT):', {
      productId: product.id,
      reviewId: userReview.id,
      rating: reviewForm.rating,
      title: reviewForm.title,
      comment: reviewForm.comment,
      userName,
      isLoggedIn,
    });

    try {
      const res = await fetch(`/api/products/${product.id}/reviews`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          ...reviewForm,
          userName: userName || 'User',
          reviewId: userReview.id,
        }),
      });

      console.log('[Frontend] Update response:', res.status, res.statusText);

      if (res.ok) {
        const updatedReview = await res.json();
        setReviews((prev) =>
          prev.map((r) => (r.id === updatedReview.id ? updatedReview : r)),
        );
        setUserReview(updatedReview);
        // Refresh stats
        const statsRes = await fetch(`/api/products/${product.id}/reviews`, {
          credentials: 'include',
        });
        const statsData = await statsRes.json();
        setStats(statsData.stats);
        toast.success('Review updated successfully!');
      } else if (res.status === 401) {
        toast.error('Your session has expired. Please log in again.');
        setIsEditMode(false);
      } else if (res.status === 404) {
        toast.error('Review not found. Please refresh the page.');
        setIsEditMode(false);
        setUserReview(null);
      } else {
        const errorData = await res.json();
        const userMessage = logAndAlertError(
          errorData,
          'handleUpdateReview',
          'Failed to update review. Please try again.',
        );
        toast.error(userMessage);
      }
    } catch (error) {
      const userMessage = logAndAlertError(
        error,
        'handleUpdateReview (catch)',
        'Something went wrong. Please try again.',
      );
      toast.error(userMessage);
    }
    setSubmitting(false);
  };

  const handleCancelEdit = () => {
    if (userReview) {
      setReviewForm({
        rating: userReview.rating,
        title: userReview.title,
        comment: userReview.comment,
      });
    }
  };

  let parsedSpecsObj: Record<string, any> | null = null;
  if (product.specs) {
    try {
      if (typeof product.specs === 'object') {
        parsedSpecsObj = product.specs;
      } else if (
        typeof product.specs === 'string' &&
        product.specs.trim().startsWith('{')
      ) {
        parsedSpecsObj = JSON.parse(product.specs);
      }
    } catch {
      parsedSpecsObj = null;
    }
  }

  const tabs = ['description', 'specifications', 'reviews'] as const;

  return (
    <div className="max-w-7xl mx-auto px-6 py-8 border-t border-gray-100 dark:border-slate-800 mt-4">
      <div className="flex gap-8 border-b border-gray-200 dark:border-slate-800 mb-6">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`pb-3 border-b-2 font-medium text-sm capitalize transition-colors ${
              activeTab === tab
                ? 'border-indigo-600 dark:border-indigo-400 text-indigo-600 dark:text-indigo-400 font-bold'
                : 'border-transparent text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-100'
            }`}
          >
            {tab === 'reviews'
              ? `Reviews (${stats?.total ?? product.reviewCount ?? 0})`
              : tab}
          </button>
        ))}
      </div>

      {activeTab === 'description' && (
        <div className="prose prose-sm max-w-none text-gray-600 dark:text-slate-300 space-y-4">
          <p className="text-base leading-relaxed">
            {product.description || (
              <>
                Experience unmatched performance with the{' '}
                <span className="font-semibold text-gray-900 dark:text-white">
                  {product.name}
                </span>
                . Designed for gaming enthusiasts, creators, and professionals,
                it features top-tier component quality and reliable
                performance.
              </>
            )}
          </p>
          {parsedSpecsObj && (
            <div className="mt-4 p-4 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">
                Key Highlights
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {Object.entries(parsedSpecsObj)
                  .filter(
                    ([key]) =>
                      ![
                        'cpuSocket',
                        'supportedSockets',
                        'ramGeneration',
                        'coolerType',
                        'gpuLength',
                        'psuWattage',
                        'radiatorSize',
                        'storageInterface',
                      ].includes(key),
                  )
                  .slice(0, 6)
                  .map(([key, val]) => (
                    <div
                      key={key}
                      className="bg-white dark:bg-slate-950 p-2.5 rounded-lg border border-slate-200/60 dark:border-slate-800"
                    >
                      <div className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase">
                        {key}
                      </div>
                      <div className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">
                        {String(val)}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'specifications' && (
        <div className="text-sm text-gray-600 dark:text-slate-300">
          {parsedSpecsObj && Object.keys(parsedSpecsObj).length > 0 ? (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Technical Specifications */}
              <div className="lg:col-span-2 bg-gray-50 dark:bg-slate-900/90 rounded-xl p-6 border border-gray-200/70 dark:border-slate-800">
                <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-200 dark:border-slate-800">
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                    <span>⚡ Technical Specifications</span>
                  </h3>
                  {product.componentType && (
                    <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-900">
                      {product.componentType}
                    </span>
                  )}
                </div>
                <div className="divide-y divide-gray-200/60 dark:divide-slate-800">
                  {Object.entries(parsedSpecsObj)
                    .filter(
                      ([key]) =>
                        ![
                          'cpuSocket',
                          'supportedSockets',
                          'ramGeneration',
                          'coolerType',
                          'gpuLength',
                          'psuWattage',
                          'radiatorSize',
                          'storageInterface',
                        ].includes(key),
                    )
                    .map(([key, val]) => (
                      <div
                        key={key}
                        className="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-1"
                      >
                        <span className="text-xs font-medium text-gray-500 dark:text-slate-400 sm:w-1/3">
                          {key}
                        </span>
                        <span className="text-sm font-semibold text-gray-900 dark:text-slate-100 sm:w-2/3 text-left sm:text-right">
                          {Array.isArray(val) ? val.join(', ') : String(val)}
                        </span>
                      </div>
                    ))}
                </div>
              </div>

              {/* General Info */}
              <div className="bg-gray-50 dark:bg-slate-900/90 rounded-xl p-6 border border-gray-200/70 dark:border-slate-800 space-y-4 h-fit">
                <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider pb-3 border-b border-gray-200 dark:border-slate-800">
                  📋 Product Details
                </h3>
                <div className="space-y-3">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-500 dark:text-slate-400 font-medium">
                      Brand
                    </span>
                    <span className="font-bold text-gray-900 dark:text-white">
                      {product.brand}
                    </span>
                  </div>
                  {product.department && (
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-gray-500 dark:text-slate-400 font-medium">
                        Department
                      </span>
                      <span className="font-semibold text-indigo-600 dark:text-indigo-400">
                        🎮 {product.department}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-500 dark:text-slate-400 font-medium">
                      Category
                    </span>
                    <span className="font-semibold text-gray-800 dark:text-slate-200">
                      {product.category}
                    </span>
                  </div>
                  {product.componentType && (
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-gray-500 dark:text-slate-400 font-medium">
                        Component Type
                      </span>
                      <span className="font-semibold text-gray-800 dark:text-slate-200">
                        {product.componentType}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-500 dark:text-slate-400 font-medium">
                      Availability
                    </span>
                    <span
                      className={`font-bold ${
                        product.inStock
                          ? 'text-green-600 dark:text-emerald-400'
                          : 'text-red-600'
                      }`}
                    >
                      {product.inStock ? 'In Stock' : 'Out of Stock'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ) : product.specs ? (
            <div className="bg-gray-50 dark:bg-slate-900 rounded-xl p-6 border border-gray-200 dark:border-slate-800">
              <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-2">
                Specifications
              </h3>
              <p className="text-sm text-gray-700 dark:text-slate-300">
                {product.specs}
              </p>
            </div>
          ) : (
            <p className="text-gray-400">
              No specifications available for this product.
            </p>
          )}
        </div>
      )}

      {activeTab === 'reviews' && (
        <div className="space-y-6">
          {/* Rating Summary */}
          {stats && (
            <div className="flex flex-col md:flex-row gap-8 items-start">
              <div className="text-center">
                <div className="text-5xl font-bold text-gray-900 dark:text-slate-100">
                  {stats.averageRating || product.rating}
                </div>
                <div className="flex items-center justify-center gap-0.5 mt-1">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <Star
                      key={s}
                      size={16}
                      className={
                        s <=
                        Math.round(
                          stats.averageRating || Number(product.rating),
                        )
                          ? 'text-amber-400 fill-amber-400'
                          : 'text-gray-300 dark:text-slate-600'
                      }
                    />
                  ))}
                </div>
                <div className="text-sm text-gray-500 mt-1">
                  {stats.total} reviews
                </div>
              </div>
              <div className="flex-1 space-y-1.5 w-full">
                {[5, 4, 3, 2, 1].map((star) => {
                  const count = stats.distribution[star - 1] || 0;
                  const pct = stats.total > 0 ? (count / stats.total) * 100 : 0;
                  return (
                    <div key={star} className="flex items-center gap-2 text-sm">
                      <span className="w-8 text-right text-gray-500 dark:text-slate-400">
                        {star}★
                      </span>
                      <div className="flex-1 h-2.5 bg-gray-100 dark:bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-amber-400 rounded-full transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="w-8 text-gray-400 text-xs">{count}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Write/Edit Review Form */}
          {isLoggedIn ? (
            <>
              {userReview && (
                <div className="bg-blue-50 dark:bg-blue-950 rounded-xl p-4 border border-blue-200 dark:border-blue-900 mb-4">
                  <p className="text-sm text-blue-900 dark:text-blue-100">
                    ✓ You already reviewed this product. You can edit your
                    review below.
                  </p>
                </div>
              )}
              <form
                onSubmit={(e) => {
                  // Use userReview directly to determine which handler to call
                  // This is more reliable than relying on isEditMode state
                  if (userReview?.id) {
                    handleUpdateReview(e);
                  } else {
                    handleSubmitReview(e);
                  }
                }}
                className="bg-gray-50 dark:bg-slate-900 rounded-xl p-5 space-y-3 border border-gray-100 dark:border-slate-800"
              >
                <h3 className="font-semibold text-sm text-gray-900 dark:text-slate-100">
                  {userReview?.id ? 'Edit Your Review' : 'Write a Review'}
                </h3>
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() =>
                        setReviewForm((f) => ({ ...f, rating: s }))
                      }
                      className="transition-colors"
                    >
                      <Star
                        size={20}
                        className={
                          s <= reviewForm.rating
                            ? 'text-amber-400 fill-amber-400'
                            : 'text-gray-300 dark:text-slate-600'
                        }
                      />
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  placeholder="Review title"
                  value={reviewForm.title}
                  onChange={(e) =>
                    setReviewForm((f) => ({ ...f, title: e.target.value }))
                  }
                  className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  maxLength={100}
                />
                <textarea
                  placeholder="Share your experience..."
                  value={reviewForm.comment}
                  onChange={(e) =>
                    setReviewForm((f) => ({ ...f, comment: e.target.value }))
                  }
                  className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 min-h-[80px] resize-none"
                  maxLength={500}
                />
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={
                      submitting ||
                      !reviewForm.title.trim() ||
                      !reviewForm.comment.trim()
                    }
                    className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50"
                  >
                    <Send size={14} />
                    {userReview?.id ? 'Save Changes' : 'Submit Review'}
                  </button>
                  {userReview?.id && (
                    <button
                      type="button"
                      onClick={handleCancelEdit}
                      className="px-4 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-gray-900 dark:text-slate-100 text-sm font-semibold rounded-lg transition-colors"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </form>
            </>
          ) : (
            <div className="bg-gray-50 dark:bg-slate-900 rounded-xl p-5 text-center border border-gray-100 dark:border-slate-800">
              <p className="text-sm text-gray-500 dark:text-slate-400 mb-2">
                Log in to write a review
              </p>
              <Link
                href="/login"
                className="text-sm font-semibold text-indigo-600 hover:text-indigo-700"
              >
                Log In →
              </Link>
            </div>
          )}

          {/* Review List */}
          {reviews.length > 0 ? (
            <div className="space-y-4">
              {reviews.map((review) => (
                <div
                  key={review.id}
                  className="border-b border-gray-100 dark:border-slate-800 pb-4 last:border-0"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <div className="flex items-center gap-0.5">
                      {[1, 2, 3, 4, 5].map((s) => (
                        <Star
                          key={s}
                          size={12}
                          className={
                            s <= review.rating
                              ? 'text-amber-400 fill-amber-400'
                              : 'text-gray-300 dark:text-slate-600'
                          }
                        />
                      ))}
                    </div>
                    <span className="text-sm font-semibold text-gray-900 dark:text-slate-100">
                      {review.title}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-slate-300 mb-2">
                    {review.comment}
                  </p>
                  <div className="flex items-center gap-2 text-xs text-gray-400">
                    <span className="font-medium">{review.userName}</span>
                    <span>•</span>
                    <span>
                      {new Date(review.createdAt).toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400 dark:text-slate-500">
              No reviews yet. Be the first to review!
            </p>
          )}
        </div>
      )}
    </div>
  );
}
