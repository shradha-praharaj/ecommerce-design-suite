import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, Router as WouterRouter } from 'wouter';
import HomePage from './pages/HomePage';
import PDPPage from './pages/PDPPage';
import CartPage from './pages/CartPage';
import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';
import CheckoutPage from './pages/CheckoutPage';
import OrderSuccessPage from './pages/OrderSuccessPage';
import PaymentFailedPage from './pages/PaymentFailedPage';
import OrderHistoryPage from './pages/OrderHistoryPage';
import OrderDetailPage from './pages/OrderDetailPage';
import SearchResultsPage from './pages/SearchResultsPage';
import CategoryPage from './pages/CategoryPage';
import { UserProvider } from './context/UserContext';
import { ThemeProvider } from './context/ThemeContext';
import { ToastProvider } from './context/ToastContext';
import { Analytics } from '@vercel/analytics/react';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 2 * 60 * 1000, // 2 min — data stays fresh, no refetch
      gcTime: 10 * 60 * 1000, // 10 min — keep in cache after unmount
      refetchOnWindowFocus: false, // don't refetch on tab switch
      refetchOnReconnect: true,
      retry: 1,
    },
  },
});

function Router() {
  return (
    <Switch>
      <Route path="/" component={HomePage} />
      <Route path="/search" component={SearchResultsPage} />
      <Route path="/category/:category" component={CategoryPage} />
      <Route path="/product/:id" component={PDPPage} />
      <Route path="/cart" component={CartPage} />
      <Route path="/login" component={LoginPage} />
      <Route path="/signup" component={SignupPage} />
      <Route path="/checkout" component={CheckoutPage} />
      <Route path="/order-success" component={OrderSuccessPage} />
      <Route path="/payment-failed" component={PaymentFailedPage} />
      <Route path="/orders" component={OrderHistoryPage} />
      <Route path="/orders/:id" component={OrderDetailPage} />
      <Route path="/order/:id" component={OrderDetailPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ThemeProvider>
          <ToastProvider>
            <UserProvider>
              <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
                <Router />
              </WouterRouter>
              <Toaster />
              <Analytics />
            </UserProvider>
          </ToastProvider>
        </ThemeProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}


export default App;
