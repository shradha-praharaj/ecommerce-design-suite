import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'wouter';
import {
  ChevronLeft,
  ChevronRight,
  Star,
  ShoppingCart,
  Sparkles,
  Pause,
  Play,
  Zap,
} from 'lucide-react';
import type { Product } from '@workspace/api-client-react';
import {
  onProductImageError,
  resolveProductImageSrc,
} from '../lib/product-image';

interface FeaturedCarouselProps {
  products: Product[];
  onAddToCart: (e: React.MouseEvent, productId: number) => void;
  onBuyNow: (e: React.MouseEvent, productId: number) => void;
}

// Curated gradient palette per slide index
const SLIDE_THEMES = [
  {
    bg: 'from-[#0a0e27] via-[#111940] to-[#0d1117]',
    accent: 'text-sky-400',
    accentBg: 'bg-sky-500',
    dot: 'bg-sky-400',
    badge: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  },
  {
    bg: 'from-[#1a0a2e] via-[#2d1050] to-[#0d1117]',
    accent: 'text-violet-400',
    accentBg: 'bg-violet-500',
    dot: 'bg-violet-400',
    badge: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
  },
  {
    bg: 'from-[#0a1a1a] via-[#0d2b2b] to-[#0d1117]',
    accent: 'text-emerald-400',
    accentBg: 'bg-emerald-500',
    dot: 'bg-emerald-400',
    badge: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  },
  {
    bg: 'from-[#1a0a0a] via-[#2b1010] to-[#0d1117]',
    accent: 'text-rose-400',
    accentBg: 'bg-rose-500',
    dot: 'bg-rose-400',
    badge: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
  },
  {
    bg: 'from-[#1a1400] via-[#2b2200] to-[#0d1117]',
    accent: 'text-amber-400',
    accentBg: 'bg-amber-500',
    dot: 'bg-amber-400',
    badge: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  },
];

const formatPrice = (price: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(price);

export function FeaturedCarousel({
  products,
  onAddToCart,
  onBuyNow,
}: FeaturedCarouselProps) {
  const displayProducts = products.slice(0, 10);
  const [current, setCurrent] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [direction, setDirection] = useState<'left' | 'right'>('right');
  const [isTransitioning, setIsTransitioning] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const total = displayProducts.length;

  const goTo = useCallback(
    (index: number, dir?: 'left' | 'right') => {
      if (isTransitioning || index === current) return;
      setDirection(dir ?? (index > current ? 'right' : 'left'));
      setIsTransitioning(true);
      setTimeout(() => {
        setCurrent(index);
        setTimeout(() => setIsTransitioning(false), 50);
      }, 300);
    },
    [current, isTransitioning],
  );

  const next = useCallback(
    () => goTo((current + 1) % total, 'right'),
    [current, total, goTo],
  );
  const prev = useCallback(
    () => goTo((current - 1 + total) % total, 'left'),
    [current, total, goTo],
  );

  // Auto-play
  useEffect(() => {
    if (isPlaying && total > 1) {
      timerRef.current = setInterval(next, 5000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isPlaying, next, total]);

  // Keyboard nav
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') prev();
      else if (e.key === 'ArrowRight') next();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [prev, next]);

  if (!displayProducts.length) return null;

  const product = displayProducts[current];
  const theme = SLIDE_THEMES[current % SLIDE_THEMES.length];
  const savings = product.originalPrice
    ? product.originalPrice - product.price
    : 0;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      <div
        className={`relative rounded-2xl overflow-hidden bg-gradient-to-br ${theme.bg} min-h-95 sm:min-h-105 md:min-h-110 transition-all duration-700`}
        role="region"
        aria-roledescription="carousel"
        aria-label="Featured Products"
      >
        {/* Decorative elements */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div
            className={`absolute -top-32 -right-32 w-96 h-96 rounded-full ${theme.accentBg} opacity-[0.07] blur-3xl`}
          />
          <div
            className={`absolute -bottom-24 -left-24 w-72 h-72 rounded-full ${theme.accentBg} opacity-[0.05] blur-3xl`}
          />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-white/[0.03] to-transparent" />
          {/* Grid pattern */}
          <div
            className="absolute inset-0 opacity-[0.03]"
            style={{
              backgroundImage:
                'linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)',
              backgroundSize: '40px 40px',
            }}
          />
        </div>

        {/* Content */}
        <div
          className={`relative z-10 flex flex-col md:flex-row items-center gap-6 md:gap-12 p-5 sm:p-8 md:p-12 transition-all duration-300 ${
            isTransitioning ? 'opacity-0 scale-[0.97]' : 'opacity-100 scale-100'
          }`}
          role="group"
          aria-roledescription="slide"
          aria-label={`${current + 1} of ${total}`}
        >
          {/* Left: Text */}
          <div className="flex-1 min-w-0 order-2 md:order-1 text-center md:text-left">
            <div
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold mb-5 border ${theme.badge}`}
            >
              <Sparkles size={13} />
              <span>Featured Product</span>
            </div>

            <p className="text-xs font-semibold tracking-widest uppercase text-white/40 mb-2">
              {product.brand}
            </p>

            <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-[2.75rem] font-extrabold text-white leading-tight mb-4 tracking-tight">
              {product.name}
            </h2>

            {product.specs && (
              <p className="text-white/50 text-sm md:text-base mb-6 max-w-md leading-relaxed line-clamp-2">
                {product.specs}
              </p>
            )}

            {/* Price block */}
            <div className="flex items-end gap-3 mb-6 justify-center md:justify-start">
              <span
                className={`text-3xl md:text-4xl font-black ${theme.accent}`}
              >
                {formatPrice(product.price)}
              </span>
              {product.originalPrice &&
                product.originalPrice > product.price && (
                  <div className="flex flex-col items-start">
                    <span className="text-sm text-white/30 line-through">
                      {formatPrice(product.originalPrice)}
                    </span>
                    <span className="text-xs font-bold text-green-400">
                      Save {formatPrice(savings)}
                    </span>
                  </div>
                )}
            </div>

            {/* Rating */}
            <div className="flex items-center gap-2 mb-8 justify-center md:justify-start">
              <div className="flex items-center gap-0.5">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star
                    key={i}
                    size={14}
                    className={
                      i < Math.round(product.rating)
                        ? 'text-amber-400 fill-amber-400'
                        : 'text-white/20'
                    }
                  />
                ))}
              </div>
              <span className="text-xs text-white/40 font-medium">
                {product.rating} ({product.reviewCount.toLocaleString()}{' '}
                reviews)
              </span>
            </div>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 justify-center md:justify-start w-full sm:w-auto">
              <Link
                href={`/product/${product.id}`}
                className={`${theme.accentBg} hover:brightness-110 text-white px-7 py-3 min-h-11 rounded-xl font-semibold transition-all flex items-center justify-center gap-2 shadow-lg shadow-black/20`}
              >
                View Details <ChevronRight size={16} />
              </Link>
              <button
                onClick={(e) => onBuyNow(e, product.id)}
                className="bg-white/10 hover:bg-white/15 text-white px-5 py-3 min-h-11 rounded-xl font-semibold transition-all backdrop-blur-sm border border-white/10 flex items-center justify-center gap-2"
              >
                <Zap size={16} /> Buy Now
              </button>
            </div>
          </div>

          {/* Right: Product Image */}
          <div className="flex-shrink-0 order-1 md:order-2 relative">
            <div
              className={`absolute inset-0 ${theme.accentBg} opacity-10 blur-3xl rounded-full scale-75`}
            />
            <div className="relative w-56 h-56 md:w-72 md:h-72 lg:w-80 lg:h-80">
              <img
                src={resolveProductImageSrc(product.imageUrl)}
                alt={product.name}
                className="w-full h-full object-contain drop-shadow-2xl relative z-10"
                loading={current === 0 ? 'eager' : 'lazy'}
                onError={onProductImageError}
              />
            </div>
          </div>
        </div>

        {/* Navigation arrows */}
        {total > 1 && (
          <>
            <button
              onClick={prev}
              className="absolute left-2 sm:left-3 top-1/2 -translate-y-1/2 z-20 w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-sm border border-white/10 flex items-center justify-center text-white transition-all sm:opacity-0 sm:group-hover:opacity-100 hover:scale-110 active:scale-95"
              aria-label="Previous product"
            >
              <ChevronLeft size={20} />
            </button>
            <button
              onClick={next}
              className="absolute right-2 sm:right-3 top-1/2 -translate-y-1/2 z-20 w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-sm border border-white/10 flex items-center justify-center text-white transition-all sm:opacity-0 sm:group-hover:opacity-100 hover:scale-110 active:scale-95"
              aria-label="Next product"
            >
              <ChevronRight size={20} />
            </button>
          </>
        )}

        {/* Bottom bar: dots + play/pause + counter */}
        {total > 1 && (
          <div className="absolute bottom-0 left-0 right-0 z-20 px-8 py-4 flex items-center justify-between bg-gradient-to-t from-black/30 to-transparent">
            {/* Slide counter */}
            <span className="text-xs text-white/40 font-mono tabular-nums">
              {String(current + 1).padStart(2, '0')} /{' '}
              {String(total).padStart(2, '0')}
            </span>

            {/* Dots with progress */}
            <div className="flex items-center gap-2">
              {displayProducts.map((_, i) => (
                <button
                  key={i}
                  onClick={() => goTo(i)}
                  className="relative h-1.5 rounded-full overflow-hidden transition-all duration-300"
                  style={{ width: i === current ? 32 : 8 }}
                  aria-label={`Go to slide ${i + 1}`}
                >
                  <div className="absolute inset-0 bg-white/20 rounded-full" />
                  {i === current && (
                    <div
                      className={`absolute inset-y-0 left-0 ${theme.dot} rounded-full`}
                      style={{
                        animation: isPlaying ? 'progress 5s linear' : 'none',
                        width: isPlaying ? undefined : '100%',
                      }}
                    />
                  )}
                  {i !== current && (
                    <div className="absolute inset-0 bg-white/30 rounded-full" />
                  )}
                </button>
              ))}
            </div>

            {/* Play/pause */}
            <button
              onClick={() => setIsPlaying((p) => !p)}
              className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/60 hover:text-white transition-all"
              aria-label={isPlaying ? 'Pause autoplay' : 'Resume autoplay'}
            >
              {isPlaying ? <Pause size={12} /> : <Play size={12} />}
            </button>
          </div>
        )}

        {/* Progress bar animation keyframes */}
        <style>{`
          @keyframes progress {
            from { width: 0%; }
            to { width: 100%; }
          }
        `}</style>
      </div>
    </div>
  );
}
