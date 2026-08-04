import React, { useState } from 'react';
import { Link, useLocation } from 'wouter';
import {
  ShoppingCart,
  Search,
  ChevronDown,
  Zap,
  LogOut,
  LogIn,
  Sun,
  Moon,
  Package,
  User,
  Smartphone,
  Laptop,
  Headphones,
  Camera,
  Cable,
  Tag,
} from 'lucide-react';
import { useGetCart, getGetCartQueryKey } from '@workspace/api-client-react';
import { useUser } from '../context/UserContext';
import { useTheme } from '../context/ThemeContext';
import { AIChatbot } from './AIChatbot';

interface AppLayoutProps {
  children: React.ReactNode;
  activePage?: 'home' | 'pdp' | 'cart' | 'orders';
}

const categories = [
  { label: 'Mobiles', icon: Smartphone },
  { label: 'Laptops', icon: Laptop },
  { label: 'Accessories', icon: Cable },
  { label: 'Audio', icon: Headphones },
  { label: 'Cameras', icon: Camera },
];

export function AppLayout({ children, activePage = 'home' }: AppLayoutProps) {
  const [location, setLocation] = useLocation();
  const { data: cart } = useGetCart({
    query: { queryKey: getGetCartQueryKey() },
  });
  const { isLoggedIn, userName, logout } = useUser();
  const { theme, toggleTheme } = useTheme();

  const cartCount =
    cart?.items?.reduce((acc, item) => acc + item.quantity, 0) || 0;
  const [searchQuery, setSearchQuery] = useState('');
  const activeCategory = location.startsWith('/category/')
    ? decodeURIComponent(location.replace('/category/', '').split('/')[0])
    : undefined;
  const isDealsActive =
    location.startsWith('/search') && location.includes('sortBy=price_desc');

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchQuery.trim();
    if (q) {
      setLocation(`/search?q=${encodeURIComponent(q)}`);
      setSearchQuery('');
    }
  };

  const displayName = (() => {
    const parts = userName.trim().split(/\s+/);
    const firstName = parts[0] || 'Guest';
    const lastName = parts.length > 1 ? parts[parts.length - 1] : '';
    if (firstName.length > 9) {
      return (firstName[0] + (lastName ? lastName[0] : '')).toUpperCase();
    }
    return firstName;
  })();

  const initials = (() => {
    const parts = userName.trim().split(/\s+/);
    const first = parts[0] || 'G';
    const last = parts.length > 1 ? parts[parts.length - 1] : '';
    return (first[0] + (last ? last[0] : '')).toUpperCase();
  })();

  return (
    <div className="min-h-screen flex flex-col bg-[#f8f9fb] dark:bg-slate-950 font-sans transition-colors duration-200">
      {/* Top announcement bar */}
      <div className="bg-[#1a1a2e] text-[#e0e0ff] text-[12px] sm:text-[13px] py-2 text-center px-3 sm:px-4 leading-relaxed">
        Free shipping on orders over ₹999 &nbsp;|&nbsp; Use code{' '}
        <strong>TECH20</strong> for 20% off
      </div>

      {/* Nav */}
      <header className="bg-white dark:bg-slate-900 border-b border-[#e8eaf0] dark:border-slate-800 sticky top-0 z-50 shadow-[0_1px_8px_rgba(0,0,0,0.06)] transition-colors">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 h-16 sm:h-[76px] flex items-center justify-between gap-3 sm:gap-6">
          {/* Logo */}
          <Link
            href="/"
            className="flex items-center gap-2 sm:gap-2.5 shrink-0"
            data-testid="link-home"
          >
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-indigo-500 via-indigo-600 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Zap size={19} color="white" strokeWidth={2.5} />
            </div>
            <span className="font-extrabold text-[20px] sm:text-[24px] text-[#1a1a2e] dark:text-white tracking-tight whitespace-nowrap">
              Shop
              <span className="text-indigo-600 dark:text-indigo-400">Now</span>
            </span>
          </Link>

          {/* Search — grows to fill remaining space on tablet/desktop, hidden on mobile */}
          <form
            onSubmit={handleSearch}
            className="hidden sm:flex items-center bg-slate-50 dark:bg-slate-800/80 rounded-xl px-4 py-3 gap-2.5 flex-1 max-w-xl min-w-0 border border-slate-200 dark:border-slate-700 focus-within:border-indigo-400 dark:focus-within:border-indigo-500 focus-within:ring-4 focus-within:ring-indigo-500/10 transition-colors"
          >
            <Search
              size={18}
              className="text-gray-400 dark:text-slate-400 shrink-0"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search products, brands and more"
              className="text-sm text-gray-900 dark:text-slate-100 bg-transparent outline-none w-full placeholder:text-gray-400 dark:placeholder:text-slate-400"
              data-testid="search-input-desktop"
            />
          </form>

          {/* Right actions */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0 relative flex-nowrap min-w-0">
            {/* AI Chatbot */}
            <div className="hidden sm:block">
              <AIChatbot />
            </div>

            {/* Theme Toggle */}
            <button
              onClick={toggleTheme}
              title={`Switch to ${theme === 'light' ? 'Dark' : 'Light'} Mode`}
              aria-label={`Switch to ${theme === 'light' ? 'Dark' : 'Light'} Mode`}
              className="hidden sm:flex shrink-0 w-11 h-11 rounded-xl border border-gray-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 items-center justify-center text-gray-700 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 hover:border-indigo-200 dark:hover:border-indigo-700 transition-colors cursor-pointer"
              data-testid="button-theme-toggle"
            >
              {theme === 'light' ? (
                <Moon size={16} />
              ) : (
                <Sun size={16} className="text-amber-400" />
              )}
            </button>

            {/* User avatar with hover dropdown */}
            {isLoggedIn ? (
              <div className="relative group">
                {/* Trigger: Avatar pill */}
                <div className="flex items-center gap-1 bg-gray-100 dark:bg-slate-800 rounded-full pl-1 pr-1.5 sm:pr-2.5 py-1 cursor-pointer border border-transparent hover:border-indigo-300 dark:hover:border-indigo-600 transition-colors">
                  <div className="w-[26px] h-[26px] rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center text-white text-[11px] font-bold shrink-0">
                    {initials}
                  </div>
                  <span className="hidden sm:inline text-[12px] font-semibold text-gray-700 dark:text-slate-200 whitespace-nowrap">
                    {displayName}
                  </span>
                  <ChevronDown
                    size={12}
                    className="text-gray-400 dark:text-slate-500"
                  />
                </div>

                {/* Dropdown — shown on hover via group-hover */}
                <div className="absolute right-0 top-full mt-2 w-48 bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-gray-100 dark:border-slate-800 overflow-hidden opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-150 z-50">
                  {/* User info header */}
                  <div className="px-4 py-3 border-b border-gray-100 dark:border-slate-800">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center text-white text-[12px] font-bold">
                        {initials}
                      </div>
                      <div>
                        <div className="text-[13px] font-semibold text-gray-900 dark:text-white">
                          {displayName}
                        </div>
                        <div className="text-[11px] text-gray-500 dark:text-slate-400">
                          Signed in
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Menu items */}
                  <Link
                    href="/orders"
                    className="flex items-center gap-2.5 px-4 py-2.5 text-[13px] text-gray-700 dark:text-slate-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                  >
                    <Package size={14} />
                    Order History
                  </Link>

                  <div className="border-t border-gray-100 dark:border-slate-800 my-1" />

                  <button
                    onClick={async () => {
                      await logout();
                      window.location.href = '/';
                    }}
                    className="w-full flex items-center gap-2.5 px-4 py-2.5 text-[13px] text-gray-500 dark:text-slate-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-500 dark:hover:text-red-400 transition-colors cursor-pointer"
                    data-testid="button-sign-out"
                  >
                    <LogOut size={14} />
                    Sign out
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setLocation('/login')}
                className="shrink-0 flex items-center justify-center w-11 h-11 sm:w-auto sm:h-auto gap-1.5 sm:px-4 sm:py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold shadow-md shadow-indigo-500/20 transition-colors cursor-pointer"
                data-testid="button-sign-in"
                aria-label="Sign in"
                title="Sign in"
              >
                <LogIn size={17} /> <span className="hidden sm:inline">Sign In</span>
              </button>
            )}

            {/* Cart icon */}
            <Link
              href="/cart"
              className="relative cursor-pointer block shrink-0"
              data-testid="link-cart"
              aria-label={`Shopping cart${cartCount > 0 ? `, ${cartCount} items` : ''}`}
            >
              <div
                className={`w-11 h-11 rounded-xl flex items-center justify-center border ${
                  activePage === 'cart'
                    ? 'bg-indigo-500 border-indigo-500 text-white'
                    : 'bg-gray-100 dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-300'
                }`}
              >
                <ShoppingCart size={18} />
              </div>
              {cartCount > 0 && (
                <div className="absolute -top-1.5 -right-1.5 w-[18px] h-[18px] rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                  {cartCount}
                </div>
              )}
            </Link>
          </div>
        </div>

        {/* Desktop category navigation */}
        <div className="hidden lg:block border-t border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/70">
          <nav
            className="max-w-7xl mx-auto px-6 h-14 flex items-center gap-1"
            aria-label="Product categories"
          >
            <Link
              href="/"
              className={`h-full px-3 flex items-center text-sm font-semibold border-b-2 transition-colors ${
                activePage === 'home' && !activeCategory && !isDealsActive
                  ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                  : 'border-transparent text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400'
              }`}
              data-testid="button-nav-home"
            >
              Discover
            </Link>
            {categories.map(({ label, icon: Icon }) => {
              const isActive = activeCategory === label;

              return (
                <Link
                  key={label}
                  href={`/category/${encodeURIComponent(label)}`}
                  aria-current={isActive ? 'page' : undefined}
                  className={`h-full px-3 flex items-center gap-2 text-sm font-medium border-b-2 transition-colors ${
                    isActive
                      ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 bg-indigo-50/70 dark:bg-indigo-950/30'
                      : 'border-transparent text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 hover:border-indigo-300 dark:hover:border-indigo-600'
                  }`}
                  data-testid={`button-nav-${label.toLowerCase()}`}
                >
                  <Icon size={16} strokeWidth={2} />
                  {label}
                </Link>
              );
            })}
            <div className="ml-auto h-full flex items-center">
              <Link
                href="/search?sortBy=price_desc&inStock=true"
                aria-current={isDealsActive ? 'page' : undefined}
                className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-semibold transition-colors ${
                  isDealsActive
                    ? 'bg-amber-500 text-white shadow-sm shadow-amber-500/30'
                    : 'bg-amber-100 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-900/60'
                }`}
                data-testid="button-nav-deals"
              >
                <Tag size={15} />
                Deals
              </Link>
            </div>
          </nav>
        </div>

        {/* Mobile search row — shown on mobile screens under 640px */}
        <div className="sm:hidden px-4 pb-3">
          <form
            onSubmit={handleSearch}
            className="flex items-center bg-slate-50 dark:bg-slate-800/80 rounded-xl px-4 py-3 gap-2.5 border border-gray-200 dark:border-slate-700 w-full focus-within:border-indigo-400 dark:focus-within:border-indigo-500 focus-within:ring-4 focus-within:ring-indigo-500/10 transition-colors"
          >
            <Search
              size={18}
              className="text-gray-400 dark:text-slate-400 shrink-0"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search products and brands"
              className="text-sm text-gray-900 dark:text-slate-100 bg-transparent outline-none w-full placeholder:text-gray-400 dark:placeholder:text-slate-400"
              data-testid="search-input-mobile"
            />
          </form>
        </div>

        {/* Categories scroll row — shown on mobile & tablet, hidden on desktop (lg and up) */}
        <div className="lg:hidden border-t border-[#e8eaf0] dark:border-slate-800 px-4 py-2 bg-gray-50/50 dark:bg-slate-900/50 overflow-x-auto scrollbar-none flex gap-2 whitespace-nowrap">
          {[...categories, { label: 'Deals', icon: Tag }].map(
            ({ label, icon: Icon }) => {
              const isActive =
                label === 'Deals' ? isDealsActive : activeCategory === label;

              return (
                <Link
                  key={label}
                  href={
                    label === 'Deals'
                      ? '/search?sortBy=price_desc&inStock=true'
                      : `/category/${encodeURIComponent(label)}`
                  }
                  aria-current={isActive ? 'page' : undefined}
                  className={`px-3.5 py-2.5 rounded-full text-[12px] font-semibold border transition-colors shrink-0 min-h-11 flex items-center gap-1.5 ${
                    isActive
                      ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm shadow-indigo-500/25'
                      : 'text-gray-600 dark:text-slate-300 bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700 hover:text-indigo-600 dark:hover:text-indigo-400 hover:border-indigo-300 dark:hover:border-indigo-700'
                  }`}
                  data-testid={`mobile-button-nav-${label.toLowerCase()}`}
                >
                  <Icon size={14} />
                  {label}
                </Link>
              );
            },
          )}
        </div>
      </header>

      {/* Anonymous mode banner */}
      {!isLoggedIn && (
        <div className="bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-900/60 px-4 sm:px-6 py-2.5 text-center">
          <span className="text-amber-800 dark:text-amber-300 text-[13px]">
            You're browsing as a <strong>guest</strong> — showing curated &amp;
            trending picks.{' '}
            <button
              onClick={() => setLocation('/login')}
              className="underline font-semibold text-amber-900 dark:text-amber-200 hover:text-indigo-700 dark:hover:text-indigo-400 cursor-pointer"
              data-testid="button-sign-in-banner"
            >
              Sign in
            </button>{' '}
            for personalised recommendations.
          </span>
        </div>
      )}

      {/* Page content */}
      <main className="flex-1">{children}</main>

      {/* Footer */}
      <footer className="bg-[#1a1a2e] text-gray-400 py-8 px-4 sm:px-6 mt-10">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4 text-center md:text-left">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center">
              <Zap size={14} color="white" />
            </div>
            <span className="text-white font-bold text-base">ShopNow</span>
          </div>
          <div className="text-xs">
            © 2025 ShopNow Electronics. Trusted by 2M+ customers.
          </div>
          <div className="flex flex-wrap justify-center gap-x-5 gap-y-2 text-[13px]">
            {['Privacy', 'Terms', 'Support', 'Returns'].map((l) => (
              <span
                key={l}
                className="cursor-pointer hover:text-white transition-colors"
              >
                {l}
              </span>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}
