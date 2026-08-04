import React from "react";
import { Link, useLocation } from 'wouter';
import {
  Smartphone,
  Laptop,
  Headphones,
  Camera,
  Home,
  Gamepad2,
  Timer,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { AppLayout } from "../components/AppLayout";
import { FeaturedCarousel } from '../components/FeaturedCarousel';
import { RecommendationWidget } from "../components/RecommendationWidget";
import { AnonymousRecommendationWidget } from "../components/AnonymousRecommendationWidget";
import { useListProducts, useListDeals, useGetHomepageRecommendations, useAddToCart, getGetCartQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useUser } from "../context/UserContext";
import {
  onProductImageError,
  resolveProductImageSrc,
} from '../lib/product-image';

// Skeleton components for loading states
function CarouselSkeleton() {
  return (
    <div
      className="relative w-full overflow-hidden bg-gradient-to-br from-gray-100 to-gray-50 dark:from-slate-900 dark:to-slate-950"
      style={{ minHeight: '360px', height: 'clamp(360px, 58vw, 420px)' }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-full flex items-center">
        <div className="flex-1 space-y-4">
          <div className="h-4 w-24 bg-gray-200 dark:bg-slate-800 rounded-full animate-pulse" />
          <div className="h-8 w-80 bg-gray-200 dark:bg-slate-800 rounded-lg animate-pulse" />
          <div className="h-4 w-64 bg-gray-200 dark:bg-slate-800 rounded animate-pulse" />
          <div className="flex gap-3 pt-4">
            <div className="h-10 w-32 bg-gray-200 dark:bg-slate-800 rounded-lg animate-pulse" />
            <div className="h-10 w-32 bg-gray-200 dark:bg-slate-800 rounded-lg animate-pulse" />
          </div>
        </div>
        <div className="hidden md:block w-72 h-72 bg-gray-200 dark:bg-slate-800 rounded-2xl animate-pulse" />
      </div>
    </div>
  );
}

function DealCardSkeleton() {
  return (
    <div className="border border-gray-200 dark:border-slate-800 rounded-xl p-4 bg-white dark:bg-slate-900 h-full flex flex-col animate-pulse">
      <div className="h-40 bg-gray-100 dark:bg-slate-800 rounded-lg mb-4" />
      <div className="h-4 w-3/4 bg-gray-200 dark:bg-slate-800 rounded mb-2" />
      <div className="flex items-center gap-2 mb-2">
        <div className="h-5 w-20 bg-gray-200 dark:bg-slate-800 rounded" />
        <div className="h-3 w-16 bg-gray-100 dark:bg-slate-800/50 rounded" />
      </div>
      <div className="mt-auto">
        <div className="h-1.5 w-full bg-gray-100 dark:bg-slate-800 rounded-full mb-3" />
        <div className="h-9 w-full bg-gray-100 dark:bg-slate-800 rounded" />
      </div>
    </div>
  );
}

function DealsGridSkeleton() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <div className="h-7 w-64 bg-gray-200 dark:bg-slate-800 rounded animate-pulse" />
        <div className="h-8 w-40 bg-gray-100 dark:bg-slate-800/50 rounded-md animate-pulse" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <DealCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

function RecommendationSkeleton() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex items-center gap-3 mb-6">
        <div className="h-6 w-48 bg-gray-200 dark:bg-slate-800 rounded animate-pulse" />
        <div className="h-5 w-28 bg-gray-100 dark:bg-slate-800/50 rounded-full animate-pulse" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        {[...Array(6)].map((_, i) => (
          <div
            key={i}
            className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 p-3 animate-pulse"
          >
            <div className="h-32 bg-gray-100 dark:bg-slate-800 rounded-lg mb-3" />
            <div className="h-3 w-3/4 bg-gray-200 dark:bg-slate-800 rounded mb-2" />
            <div className="h-4 w-1/2 bg-gray-200 dark:bg-slate-800 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}

// Animation variants
const fadeInUp = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0 },
};

const staggerContainer = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08 } },
};

const scaleIn = {
  hidden: { opacity: 0, scale: 0.92 },
  visible: { opacity: 1, scale: 1 },
};

export default function HomePage() {
  const queryClient = useQueryClient();
  const addToCart = useAddToCart();
  const { isLoggedIn } = useUser();
  const [, navigate] = useLocation();

  const { data: featuredProducts, isLoading: isFeaturedLoading } =
    useListProducts({ featured: true });
  const { data: deals, isLoading: isDealsLoading } = useListDeals();
  const { data: homepageRecs, isLoading: isRecsLoading } =
    useGetHomepageRecommendations();

  // Anonymous: pull mobiles and laptops from product list
  const { data: allProducts, isLoading: isAllLoading } = useListProducts();
  const trendingMobiles = (allProducts ?? [])
    .filter((p) => p.category === 'Mobiles')
    .slice(0, 6);
  const laptopDeals = (allProducts ?? [])
    .filter((p) => p.category === 'Laptops')
    .slice(0, 6);

  const handleAddToCart = (e: React.MouseEvent, productId: number) => {
    e.preventDefault();
    e.stopPropagation();
    addToCart.mutate(
      { data: { productId, quantity: 1 } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetCartQueryKey() });
        },
      },
    );
  };

  const handleBuyNow = (e: React.MouseEvent, productId: number) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isLoggedIn) {
      navigate('/login');
      return;
    }
    addToCart.mutate(
      { data: { productId, quantity: 1 } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetCartQueryKey() });
          navigate('/checkout');
        },
      },
    );
  };

  const formatPrice = (price: number) =>
    new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(price);

  return (
    <AppLayout activePage="home">
      <div className="bg-white dark:bg-slate-950 text-slate-900 dark:text-white min-h-screen pb-24 transition-colors">
        {/* Category browsing strip */}
        <div className="border-b border-gray-100 dark:border-slate-800 bg-white dark:bg-slate-900 transition-colors">
          <motion.div
            className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-start overflow-x-auto gap-5 sm:gap-8"
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
          >
            {[
              { name: 'Mobiles', icon: Smartphone },
              { name: 'Laptops', icon: Laptop },
              { name: 'Audio', icon: Headphones },
              { name: 'Cameras', icon: Camera },
              { name: 'Smart Home', icon: Home },
              { name: 'Gaming', icon: Gamepad2 },
            ].map((cat) => (
              <motion.div
                key={cat.name}
                variants={fadeInUp}
                transition={{ duration: 0.35 }}
              >
                <Link
                  href={`/category/${encodeURIComponent(cat.name)}`}
                  className="flex flex-col items-center gap-2 min-w-max group cursor-pointer"
                  data-testid={`category-${cat.name}`}
                >
                  <div className="w-12 h-12 rounded-full bg-gray-50 dark:bg-slate-800 flex items-center justify-center group-hover:bg-indigo-50 dark:group-hover:bg-indigo-950/50 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors border border-gray-100 dark:border-slate-700">
                    <cat.icon
                      size={20}
                      className="text-gray-600 dark:text-slate-300 group-hover:text-indigo-600 dark:group-hover:text-indigo-400"
                    />
                  </div>
                  <span className="text-xs font-medium text-gray-600 dark:text-slate-300 group-hover:text-indigo-600 dark:group-hover:text-indigo-400">
                    {cat.name}
                  </span>
                </Link>
              </motion.div>
            ))}
          </motion.div>
        </div>

        {/* Featured Product Carousel */}
        {isFeaturedLoading && <CarouselSkeleton />}
        {!isFeaturedLoading &&
          featuredProducts &&
          featuredProducts.length > 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5 }}
            >
              <FeaturedCarousel
                products={featuredProducts}
                onAddToCart={handleAddToCart}
                onBuyNow={handleBuyNow}
              />
            </motion.div>
          )}

        {/* Top Deals */}
        {isDealsLoading && <DealsGridSkeleton />}
        {!isDealsLoading && deals && deals.length > 0 && (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
            <motion.div
              className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6"
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4 }}
            >
              <h2 className="text-2xl font-bold text-gray-900 dark:text-slate-100 flex items-center gap-2">
                <Timer size={24} className="text-red-500" />
                Top Deals in Electronics
              </h2>
              <div className="flex items-center gap-2 text-sm font-semibold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/60 border border-red-100 dark:border-red-900/50 px-3 py-1.5 rounded-md">
                Ends in: 04h 23m 15s
              </div>
            </motion.div>

            <motion.div
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
              variants={staggerContainer}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
            >
              {deals.map((deal) => (
                <motion.div
                  key={deal.id}
                  variants={scaleIn}
                  transition={{
                    duration: 0.35,
                    ease: [0.25, 0.46, 0.45, 0.94],
                  }}
                >
                  <Link href={`/product/${deal.id}`} className="block">
                    <div
                      className="border border-gray-200 dark:border-slate-800 rounded-xl p-4 hover:shadow-lg dark:hover:shadow-indigo-500/5 transition-all bg-white dark:bg-slate-900 relative group cursor-pointer h-full flex flex-col"
                      data-testid={`deal-${deal.id}`}
                    >
                      {deal.discountPct && (
                        <div className="absolute top-3 left-3 bg-red-500 text-white text-xs font-bold px-2 py-1 rounded z-10">
                          -{deal.discountPct}%
                        </div>
                      )}
                      <div className="h-40 bg-gray-50 dark:bg-slate-800/80 rounded-lg mb-4 flex items-center justify-center overflow-hidden p-2">
                        <img
                          src={resolveProductImageSrc(deal.imageUrl)}
                          alt={deal.name}
                          className="w-full h-full object-contain mix-blend-multiply dark:mix-blend-normal"
                          onError={onProductImageError}
                        />
                      </div>
                      <h3 className="font-semibold text-gray-900 dark:text-slate-100 text-sm mb-1 line-clamp-2">
                        {deal.name}
                      </h3>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="font-bold text-lg text-slate-900 dark:text-indigo-400">
                          {formatPrice(deal.price)}
                        </span>
                        {deal.originalPrice && (
                          <span className="text-xs text-gray-400 dark:text-slate-500 line-through">
                            {formatPrice(deal.originalPrice)}
                          </span>
                        )}
                      </div>
                      <div className="mt-auto">
                        <div className="w-full bg-gray-100 dark:bg-slate-800 rounded-full h-1.5 mb-1">
                          <div
                            className="bg-red-500 h-1.5 rounded-full"
                            style={{ width: '80%' }}
                          ></div>
                        </div>
                        <div className="flex justify-between items-center text-[10px] text-gray-500 dark:text-slate-400 mb-3">
                          <span>80% Claimed</span>
                        </div>
                        <button
                          onClick={(e) => handleAddToCart(e, deal.id)}
                          className="w-full min-h-11 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 border border-indigo-100 dark:border-indigo-900/50 font-semibold py-2 rounded transition-colors text-sm"
                          data-testid={`btn-deal-cart-${deal.id}`}
                        >
                          Add to Cart
                        </button>
                      </div>
                    </div>
                  </Link>
                </motion.div>
              ))}
            </motion.div>
          </div>
        )}

        {/* ─── Personalised AI Preference Cards ─── */}
        {isRecsLoading && (
          <>
            <RecommendationSkeleton />
            <RecommendationSkeleton />
          </>
        )}
        {homepageRecs && (
          <>
            {homepageRecs.hybrid && (
              <RecommendationWidget
                widget={homepageRecs.hybrid}
                variant="hybrid"
              />
            )}
            {homepageRecs.contentBased && (
              <RecommendationWidget
                widget={homepageRecs.contentBased}
                variant="content_based"
              />
            )}
            {homepageRecs.collaborative && (
              <RecommendationWidget
                widget={homepageRecs.collaborative}
                variant="collaborative"
              />
            )}
          </>
        )}

        {/* ─── ANONYMOUS: editorial + popularity widgets ─── */}
        {!isLoggedIn && (
          <>
            {isAllLoading && (
              <>
                <RecommendationSkeleton />
                <RecommendationSkeleton />
              </>
            )}
            {!isAllLoading && trendingMobiles.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.45 }}
              >
                <AnonymousRecommendationWidget
                  title="Top Trending Mobiles"
                  subtitle="Most popular handsets this week across India"
                  badge="Popularity-Based"
                  badgeVariant="trending"
                  products={trendingMobiles}
                />
              </motion.div>
            )}

            {!isAllLoading && laptopDeals.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.45, delay: 0.1 }}
              >
                <AnonymousRecommendationWidget
                  title="Best Laptop Deals Right Now"
                  subtitle="Handpicked by our editors — top value for your budget"
                  badge="Editorial Pick"
                  badgeVariant="editorial"
                  products={laptopDeals}
                />
              </motion.div>
            )}

            {/* Sign-in nudge card */}
            <motion.div
              className="max-w-7xl mx-auto px-4 sm:px-6 py-8"
              initial={{ opacity: 0, scale: 0.96 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.15 }}
            >
              <div className="bg-gradient-to-r from-indigo-600 to-violet-600 rounded-2xl p-8 flex flex-col md:flex-row items-center justify-between gap-6 shadow-xl">
                <div>
                  <div className="text-white/70 text-sm font-medium mb-1">
                    Unlock Personalised Recommendations
                  </div>
                  <h3 className="text-2xl font-bold text-white mb-2">
                    Sign in for your AI-powered shopping feed
                  </h3>
                  <p className="text-indigo-200 text-sm max-w-md">
                    Get picks tailored to your browsing history, past purchases,
                    and preferences — powered by Content-Based, Collaborative,
                    and Hybrid AI.
                  </p>
                </div>
                <button
                  className="flex-shrink-0 bg-white text-indigo-700 font-bold px-8 py-3.5 rounded-xl shadow-lg hover:bg-indigo-50 transition-colors whitespace-nowrap"
                  data-testid="btn-signin-nudge"
                  onClick={() => {
                    // trigger context toggle via the nav; scrolling up is UX hint
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                >
                  Sign In to ShopNow
                </button>
              </div>
            </motion.div>
          </>
        )}
      </div>
    </AppLayout>
  );
}
