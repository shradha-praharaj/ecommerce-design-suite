import React, { useState } from 'react';
import { useParams } from 'wouter';
import { AppLayout } from '../components/AppLayout';
import { ProductCard } from '../components/ProductCard';
import { useSearchProducts } from '@workspace/api-client-react';
import {
  ChevronDown,
  ChevronRight,
  Cpu,
  Thermometer,
  MonitorPlay,
  MemoryStick,
  HardDrive,
  Zap,
  Search,
  X,
} from 'lucide-react';
import { Link } from 'wouter';

const SORT_OPTIONS = [
  { value: 'relevance', label: 'Relevance' },
  { value: 'price_asc', label: 'Price: Low to High' },
  { value: 'price_desc', label: 'Price: High to Low' },
  { value: 'rating', label: 'Top Rated' },
  { value: 'newest', label: 'Newest' },
] as const;

const GAMING_COMPONENT_TYPES = [
  { label: 'All', value: '', icon: null },
  { label: 'Processors', value: 'Processor', icon: Cpu },
  { label: 'CPU Coolers', value: 'CPU Cooler', icon: Thermometer },
  { label: 'Graphics Cards', value: 'Graphics Card', icon: MonitorPlay },
  { label: 'RAM', value: 'RAM', icon: MemoryStick },
  { label: 'Storage', value: 'Storage', icon: HardDrive },
  { label: 'Power Supplies', value: 'Power Supply', icon: Zap },
] as const;

export default function CategoryPage() {
  const { category } = useParams<{ category: string }>();
  const categoryName = decodeURIComponent(category || '');
  const isGaming = categoryName.toLowerCase() === 'gaming';

  const [sortBy, setSortBy] =
    useState<(typeof SORT_OPTIONS)[number]['value']>('relevance');
  const [page, setPage] = useState(1);
  const [inStockOnly, setInStockOnly] = useState(false);
  const [componentType, setComponentType] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // For Gaming, use department filter; for others, use flat category filter
  const searchParams = isGaming
    ? {
        department: 'Gaming',
        ...(componentType ? { componentType } : {}),
        ...(searchQuery.trim() ? { q: searchQuery.trim() } : {}),
        sortBy,
        page,
        limit: 20,
        inStock: inStockOnly ? true : undefined,
      }
    : {
        category: categoryName,
        ...(searchQuery.trim() ? { q: searchQuery.trim() } : {}),
        sortBy,
        page,
        limit: 20,
        inStock: inStockOnly ? true : undefined,
      };

  const { data, isLoading } = useSearchProducts(searchParams as any);

  return (
    <AppLayout>
      <div className="bg-white dark:bg-slate-950 min-h-screen transition-colors">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
          {/* Breadcrumb */}
          <nav className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-slate-400 mb-6 overflow-x-auto whitespace-nowrap">
            <Link
              href="/"
              className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
            >
              Home
            </Link>
            <ChevronRight size={14} />
            {isGaming && componentType ? (
              <>
                <Link
                  href="/category/Gaming"
                  className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                >
                  Gaming
                </Link>
                <ChevronRight size={14} />
                <span className="text-gray-900 dark:text-white font-medium">
                  {componentType}
                </span>
              </>
            ) : (
              <span className="text-gray-900 dark:text-white font-medium">
                {categoryName}
              </span>
            )}
          </nav>

          {/* Gaming component-type filter pills */}
          {isGaming && (
            <div className="flex flex-wrap gap-2 mb-6">
              {GAMING_COMPONENT_TYPES.map((ct) => {
                const Icon = ct.icon;
                const active = componentType === ct.value;
                return (
                  <button
                    key={ct.value}
                    onClick={() => {
                      setComponentType(ct.value);
                      setPage(1);
                    }}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-full min-h-11 text-xs font-semibold border transition-colors ${
                      active
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-white dark:bg-slate-900 text-gray-600 dark:text-slate-300 border-gray-200 dark:border-slate-700 hover:border-indigo-400 dark:hover:border-indigo-500'
                    }`}
                  >
                    {Icon && <Icon size={12} />}
                    {ct.label}
                  </button>
                );
              })}
            </div>
          )}

          {/* Quick Search input box */}
          <div className="mb-6">
            <div className="relative flex items-center max-w-xl">
              <Search
                size={18}
                className="absolute left-3.5 text-gray-400 dark:text-slate-500 pointer-events-none"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPage(1);
                }}
                placeholder={
                  isGaming
                    ? 'Quick search gaming products (e.g. Ryzen 7, RTX 4070, DDR5, Corsair, 360mm)...'
                    : `Quick search in ${categoryName}...`
                }
                className="w-full pl-10 pr-10 py-3 min-h-11 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-xl text-sm text-gray-900 dark:text-slate-100 placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 shadow-sm transition-all"
                data-testid="input-quick-search-gaming"
              />
              {searchQuery && (
                <button
                  onClick={() => {
                    setSearchQuery('');
                    setPage(1);
                  }}
                  className="absolute right-3.5 p-1 rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
                  aria-label="Clear quick search"
                >
                  <X size={15} />
                </button>
              )}
            </div>
          </div>

          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                {isGaming && componentType ? componentType : categoryName}
              </h1>
              {isGaming && (
                <p className="text-xs text-indigo-600 dark:text-indigo-400 font-semibold mt-1">
                  🎮 Gaming Components
                </p>
              )}
              {data && (
                <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
                  {data.total} product{data.total !== 1 ? 's' : ''}
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-slate-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={inStockOnly}
                  onChange={(e) => {
                    setInStockOnly(e.target.checked);
                    setPage(1);
                  }}
                  className="w-4 h-4 rounded border-gray-300 dark:border-slate-600 text-indigo-600 focus:ring-indigo-500"
                />
                In Stock
              </label>

              <div className="relative">
                <select
                  value={sortBy}
                  onChange={(e) => {
                    setSortBy(e.target.value as typeof sortBy);
                    setPage(1);
                  }}
                  className="appearance-none min-h-11 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg px-3 py-2 pr-8 text-sm font-medium text-gray-700 dark:text-slate-300 cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {SORT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  size={14}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
                />
              </div>
            </div>
          </div>

          {/* Product grid */}
          {isLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {Array.from({ length: 10 }).map((_, i) => (
                <div
                  key={i}
                  className="animate-pulse rounded-xl border border-gray-200 dark:border-slate-800 p-4"
                >
                  <div className="h-40 bg-gray-100 dark:bg-slate-800 rounded-lg mb-3" />
                  <div className="h-3 bg-gray-100 dark:bg-slate-800 rounded w-1/3 mb-2" />
                  <div className="h-4 bg-gray-100 dark:bg-slate-800 rounded w-2/3 mb-2" />
                  <div className="h-3 bg-gray-100 dark:bg-slate-800 rounded w-1/4 mb-3" />
                  <div className="h-5 bg-gray-100 dark:bg-slate-800 rounded w-1/3" />
                </div>
              ))}
            </div>
          ) : data && data.products.length > 0 ? (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {data.products.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>

              {/* Pagination */}
              {data.totalPages > 1 && (
                <div className="flex flex-wrap items-center justify-center gap-2 mt-8">
                  <button
                    disabled={page <= 1}
                    onClick={() => setPage(page - 1)}
                    className="px-4 py-2 rounded-lg min-h-11 text-sm font-medium border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Previous
                  </button>
                  <div className="flex items-center gap-1">
                    {Array.from(
                      { length: Math.min(data.totalPages, 5) },
                      (_, i) => {
                        let pageNum: number;
                        if (data.totalPages <= 5) {
                          pageNum = i + 1;
                        } else if (page <= 3) {
                          pageNum = i + 1;
                        } else if (page >= data.totalPages - 2) {
                          pageNum = data.totalPages - 4 + i;
                        } else {
                          pageNum = page - 2 + i;
                        }
                        return (
                          <button
                            key={pageNum}
                            onClick={() => setPage(pageNum)}
                            className={`w-11 h-11 rounded-lg text-sm font-medium transition-colors ${
                              page === pageNum
                                ? 'bg-indigo-600 text-white'
                                : 'text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800'
                            }`}
                          >
                            {pageNum}
                          </button>
                        );
                      },
                    )}
                  </div>
                  <button
                    disabled={page >= data.totalPages}
                    onClick={() => setPage(page + 1)}
                    className="px-4 py-2 rounded-lg min-h-11 text-sm font-medium border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                No products in {categoryName}
              </h2>
              <p className="text-sm text-gray-500 dark:text-slate-400">
                Check back later or browse other categories.
              </p>
              <Link
                href="/"
                className="mt-4 text-sm text-indigo-600 dark:text-indigo-400 font-medium hover:underline"
              >
                Back to Home
              </Link>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
