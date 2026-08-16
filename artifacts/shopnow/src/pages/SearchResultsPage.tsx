import React, { useState, useMemo, useEffect } from 'react';
import { useSearch } from 'wouter';
import { AppLayout } from '../components/AppLayout';
import { ProductCard } from '../components/ProductCard';
import {
  useSearchProducts,
  useGetCategories,
} from '@workspace/api-client-react';
import { SlidersHorizontal, X, ChevronDown, SearchX } from 'lucide-react';
import { useBehaviorTracking } from '../hooks/useBehaviorTracking';

const SORT_OPTIONS = [
  { value: 'relevance', label: 'Relevance' },
  { value: 'price_asc', label: 'Price: Low to High' },
  { value: 'price_desc', label: 'Price: High to Low' },
  { value: 'rating', label: 'Top Rated' },
  { value: 'newest', label: 'Newest' },
] as const;

export default function SearchResultsPage() {
  const searchString = useSearch();
  const { trackSearch } = useBehaviorTracking();
  const params = useMemo(
    () => new URLSearchParams(searchString),
    [searchString],
  );

  const queryFromUrl = params.get('q') || '';
  const categoryFromUrl = params.get('category') || '';
  const sortFromUrl =
    (params.get('sortBy') as (typeof SORT_OPTIONS)[number]['value']) ||
    'relevance';
  const pageFromUrl = parseInt(params.get('page') || '1', 10);

  const [category, setCategory] = useState(categoryFromUrl);
  const [sortBy, setSortBy] = useState(sortFromUrl);
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [inStockOnly, setInStockOnly] = useState(false);
  const [page, setPage] = useState(pageFromUrl);
  const [showFilters, setShowFilters] = useState(false);

  const { data: categories } = useGetCategories();

  // Track search keywords for personalized recommendations
  useEffect(() => {
    if (queryFromUrl && queryFromUrl.trim()) {
      trackSearch(queryFromUrl.trim(), categoryFromUrl || undefined);
    }
  }, [queryFromUrl, categoryFromUrl, trackSearch]);


  const searchParams = {
    q: queryFromUrl || undefined,
    category: category || undefined,
    minPrice: minPrice ? Number(minPrice) : undefined,
    maxPrice: maxPrice ? Number(maxPrice) : undefined,
    inStock: inStockOnly ? true : undefined,
    sortBy,
    page,
    limit: 20,
  };

  const { data, isLoading } = useSearchProducts(searchParams);

  const clearFilters = () => {
    setCategory('');
    setMinPrice('');
    setMaxPrice('');
    setInStockOnly(false);
    setSortBy('relevance');
    setPage(1);
  };

  const hasActiveFilters = category || minPrice || maxPrice || inStockOnly;

  return (
    <AppLayout>
      <div className="bg-white dark:bg-slate-950 min-h-screen transition-colors">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
              {queryFromUrl ? (
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                  Results for "
                  <span className="text-indigo-600 dark:text-indigo-400">
                    {queryFromUrl}
                  </span>
                  "
                </h1>
              ) : (
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                  All Products
                </h1>
              )}
              {data && (
                <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
                  {data.total} product{data.total !== 1 ? 's' : ''} found
                </p>
              )}
            </div>

            <div className="flex items-center gap-3">
              {/* Mobile filter toggle */}
              <button
                onClick={() => setShowFilters(!showFilters)}
                className="lg:hidden flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 dark:border-slate-700 text-sm font-medium text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
              >
                <SlidersHorizontal size={14} />
                Filters
                {hasActiveFilters && (
                  <span className="w-2 h-2 rounded-full bg-indigo-500" />
                )}
              </button>

              {/* Sort dropdown */}
              <div className="relative">
                <select
                  value={sortBy}
                  onChange={(e) => {
                    setSortBy(e.target.value as typeof sortBy);
                    setPage(1);
                  }}
                  className="appearance-none bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg px-3 py-2 pr-8 text-sm font-medium text-gray-700 dark:text-slate-300 cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500"
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

          <div className="flex gap-6">
            {/* Filters sidebar */}
            <aside
              className={`${showFilters ? 'block' : 'hidden'} lg:block w-full lg:w-60 shrink-0 ${showFilters ? 'fixed inset-0 z-50 bg-white dark:bg-slate-950 p-6 overflow-y-auto lg:relative lg:inset-auto lg:z-auto lg:p-0' : ''}`}
            >
              {showFilters && (
                <div className="flex items-center justify-between mb-4 lg:hidden">
                  <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                    Filters
                  </h2>
                  <button
                    onClick={() => setShowFilters(false)}
                    className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800"
                  >
                    <X size={20} className="text-gray-500" />
                  </button>
                </div>
              )}

              <div className="space-y-6">
                {/* Categories */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
                    Category
                  </h3>
                  <div className="space-y-1.5">
                    <button
                      onClick={() => {
                        setCategory('');
                        setPage(1);
                      }}
                      className={`w-full text-left px-3 py-1.5 rounded-md text-sm transition-colors ${
                        !category
                          ? 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 font-medium'
                          : 'text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800'
                      }`}
                    >
                      All Categories
                    </button>
                    {(categories ?? []).map((cat) => (
                      <button
                        key={cat.name}
                        onClick={() => {
                          setCategory(cat.name);
                          setPage(1);
                        }}
                        className={`w-full text-left px-3 py-1.5 rounded-md text-sm transition-colors flex items-center justify-between ${
                          category === cat.name
                            ? 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 font-medium'
                            : 'text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800'
                        }`}
                      >
                        {cat.name}
                        <span className="text-xs text-gray-400 dark:text-slate-500">
                          {cat.count}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Price range */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
                    Price Range
                  </h3>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      placeholder="Min"
                      value={minPrice}
                      onChange={(e) => {
                        setMinPrice(e.target.value);
                        setPage(1);
                      }}
                      className="w-full px-2.5 py-1.5 rounded-md border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-gray-700 dark:text-slate-300 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                    <span className="text-gray-400 text-xs">—</span>
                    <input
                      type="number"
                      placeholder="Max"
                      value={maxPrice}
                      onChange={(e) => {
                        setMaxPrice(e.target.value);
                        setPage(1);
                      }}
                      className="w-full px-2.5 py-1.5 rounded-md border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-gray-700 dark:text-slate-300 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                {/* In stock */}
                <div>
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={inStockOnly}
                      onChange={(e) => {
                        setInStockOnly(e.target.checked);
                        setPage(1);
                      }}
                      className="w-4 h-4 rounded border-gray-300 dark:border-slate-600 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="text-sm text-gray-700 dark:text-slate-300">
                      In Stock Only
                    </span>
                  </label>
                </div>

                {/* Clear filters */}
                {hasActiveFilters && (
                  <button
                    onClick={clearFilters}
                    className="w-full text-center text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 font-medium py-2 rounded-lg border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 transition-colors"
                  >
                    Clear All Filters
                  </button>
                )}
              </div>

              {showFilters && (
                <button
                  onClick={() => setShowFilters(false)}
                  className="lg:hidden mt-6 w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 rounded-lg transition-colors"
                >
                  Show Results
                </button>
              )}
            </aside>

            {/* Results grid */}
            <div className="flex-1 min-w-0">
              {isLoading ? (
                <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
                  {Array.from({ length: 8 }).map((_, i) => (
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
                  <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
                    {data.products.map((product) => (
                      <ProductCard key={product.id} product={product} />
                    ))}
                  </div>

                  {/* Pagination */}
                  {data.totalPages > 1 && (
                    <div className="flex items-center justify-center gap-2 mt-8">
                      <button
                        disabled={page <= 1}
                        onClick={() => setPage(page - 1)}
                        className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
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
                                className={`w-9 h-9 rounded-lg text-sm font-medium transition-colors ${
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
                        className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        Next
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <SearchX
                    size={48}
                    className="text-gray-300 dark:text-slate-600 mb-4"
                  />
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                    No products found
                  </h2>
                  <p className="text-sm text-gray-500 dark:text-slate-400 max-w-sm">
                    {queryFromUrl
                      ? `We couldn't find anything matching "${queryFromUrl}". Try a different search or adjust your filters.`
                      : "Try adjusting your filters to find what you're looking for."}
                  </p>
                  {hasActiveFilters && (
                    <button
                      onClick={clearFilters}
                      className="mt-4 text-sm text-indigo-600 dark:text-indigo-400 font-medium hover:underline"
                    >
                      Clear all filters
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
