import React from "react";
import { Link } from "wouter";
import { Star, ShoppingCart } from "lucide-react";
import { motion } from 'framer-motion';
import { Product, useAddToCart, getGetCartQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  onProductImageError,
  resolveProductImageSrc,
} from '../lib/product-image';

interface ProductCardProps {
  product: Product;
  reason?: string;
  className?: string;
}

export function ProductCard({ product, reason, className = "" }: ProductCardProps) {
  const queryClient = useQueryClient();
  const addToCart = useAddToCart();

  const handleAddToCart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    addToCart.mutate(
      { data: { productId: product.id, quantity: 1 } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetCartQueryKey() });
        }
      }
    );
  };

  const formattedPrice = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(product.price);

  return (
    <motion.div
      whileHover={{ y: -4, transition: { duration: 0.2 } }}
      whileTap={{ scale: 0.98 }}
    >
      <Link href={`/product/${product.id}`} className="block">
        <div
          className={`min-w-0 w-full h-full border border-gray-200 dark:border-slate-800 rounded-xl p-3 sm:p-4 hover:border-indigo-300 dark:hover:border-indigo-500/50 hover:shadow-lg dark:hover:shadow-indigo-500/5 transition-all bg-white dark:bg-slate-900 group cursor-pointer flex flex-col ${className}`}
          data-testid={`card-product-${product.id}`}
        >
          <div className="h-40 bg-gray-50 dark:bg-slate-800/80 rounded-lg mb-3 flex items-center justify-center overflow-hidden relative p-2">
            <img
              src={resolveProductImageSrc(product.imageUrl, product.name)}
              alt={product.name}
              className="w-full h-full object-contain mix-blend-multiply dark:mix-blend-normal"
              onError={(e) => onProductImageError(e, product.name)}
            />
            <button
              onClick={handleAddToCart}
              aria-label={`Add ${product.name} to cart`}
              className="absolute bottom-2 right-2 w-11 h-11 bg-white dark:bg-slate-800 rounded-full shadow-md border border-gray-100 dark:border-slate-700 flex items-center justify-center opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity hover:bg-indigo-50 dark:hover:bg-indigo-950/60 active:scale-95"
              data-testid={`button-add-to-cart-${product.id}`}
            >
              <ShoppingCart
                size={16}
                className="text-gray-700 dark:text-slate-300"
              />
            </button>
            {!product.inStock && (
              <div className="absolute top-2 left-2 bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded">
                Out of Stock
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-1 mb-1">
            <span className="text-[10px] font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider">
              {product.brand}
            </span>
            {(product as any).componentType && (
              <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                {(product as any).componentType}
              </span>
            )}
          </div>
          <h3 className="font-semibold text-gray-900 dark:text-slate-100 text-sm leading-tight mb-1 line-clamp-2">
            {product.name}
          </h3>

          <div className="flex items-center gap-1 mb-2">
            <Star size={12} className="text-amber-400 fill-amber-400" />
            <span className="text-xs font-medium text-gray-700 dark:text-slate-300">
              {product.rating}
            </span>
            <span className="text-xs text-gray-400 dark:text-slate-500 ml-1">
              ({product.reviewCount})
            </span>
          </div>

          <div className="mt-auto">
            <div className="font-bold text-lg mb-3 text-slate-900 dark:text-indigo-400">
              {formattedPrice}
            </div>
            {reason && (
              <div className="text-[10px] text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-100 dark:border-indigo-900/50 px-2 py-1 rounded inline-block font-medium">
                {reason}
              </div>
            )}
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
