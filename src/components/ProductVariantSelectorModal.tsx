'use client';

import React, { useMemo } from 'react';
import { StoreProduct, ProductPriceOption, Shop, OrderItem } from '@/types';
import { useCart } from '@/context/CartContext';
import { fallbackStore } from '@/lib/firebase';
import {
  X,
  Plus,
  Minus,
  Store,
  Tag,
  Package,
  Layers,
} from 'lucide-react';
import { hapticFeedback } from '@/lib/native';

interface ProductVariantSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: StoreProduct | null;
  shop?: Shop | null;
  // Optional custom items & handlers for non-CartContext consumers (like StoreProductShelf)
  customItems?: OrderItem[];
  onCustomAdd?: (item: OrderItem) => void;
  onCustomRemove?: (itemId: string) => void;
  onCustomUpdateQty?: (itemId: string, delta: number) => void;
}

export const ProductVariantSelectorModal: React.FC<ProductVariantSelectorModalProps> = ({
  isOpen,
  onClose,
  product,
  shop,
  customItems,
  onCustomAdd,
  onCustomRemove,
  onCustomUpdateQty,
}) => {
  const cart = useCart();

  // Active items source (either customItems or cartItems from CartContext)
  const activeItems = customItems ?? cart.cartItems;

  const targetShop: Shop = useMemo(() => {
    if (shop) return shop;
    if (product?.storeId) {
      const found = fallbackStore.shops.get(product.storeId);
      if (found) return found;
    }
    return {
      id: product?.storeId || 'store',
      name: product?.storeName || 'Store',
      type: 'Retail',
      contactPerson: '',
      whatsapp: '',
      location: { latitude: 0, longitude: 0, address: '' },
      createdAt: new Date().toISOString(),
    } as unknown as Shop;
  }, [shop, product]);

  // Handle escape key
  React.useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !product || !product.priceOptions || product.priceOptions.length === 0) {
    return null;
  }

  const getEffectiveOptionPrice = (opt: ProductPriceOption) => {
    const discount = opt.discountRate ?? product.discountRate ?? 0;
    if (discount > 0) {
      return Math.round(opt.price * (1 - discount / 100));
    }
    return opt.price;
  };

  const getVariantItemId = (opt: ProductPriceOption) => {
    const safeName = opt.name.trim();
    // If using customItems (e.g. shelf), check if prefixed with prod-
    if (customItems) {
      return `prod-${product.id}_${encodeURIComponent(safeName)}`;
    }
    return `${product.id}_${encodeURIComponent(safeName)}`;
  };

  const getOptionQty = (opt: ProductPriceOption): number => {
    const variantId = getVariantItemId(opt);
    const safeName = opt.name.trim().toLowerCase();
    const found = activeItems.find(
      (it) =>
        it.id === variantId ||
        it.id === `${product.id}_${encodeURIComponent(safeName)}` ||
        it.id === `prod-${product.id}_${encodeURIComponent(safeName)}` ||
        (it.selectedOptionName && it.selectedOptionName.toLowerCase() === safeName && (it.id.startsWith(product.id) || it.id.startsWith(`prod-${product.id}`)))
    );
    return found ? found.quantity || parseInt(found.qty || '1', 10) || 1 : 0;
  };

  const handleIncrement = (opt: ProductPriceOption) => {
    hapticFeedback('selection');
    const safeOptName = opt.name.trim();
    const variantId = getVariantItemId(opt);
    const currentQty = getOptionQty(opt);

    if (currentQty === 0) {
      const effectivePrice = getEffectiveOptionPrice(opt);
      const newItem: OrderItem = {
        id: variantId,
        name: `${product.name} (${safeOptName})`,
        unit: opt.unit || product.unit,
        price: effectivePrice,
        photoUrl: product.photoUrl,
        quantity: 1,
        qty: '1',
        storeId: targetShop.id,
        storeName: targetShop.name,
        discountRate: opt.discountRate ?? product.discountRate,
        selectedOptionName: safeOptName,
        isCustom: false,
      };

      if (onCustomAdd) {
        onCustomAdd(newItem);
      } else {
        cart.addToCart(newItem, targetShop);
      }
    } else {
      if (onCustomUpdateQty) {
        onCustomUpdateQty(variantId, 1);
      } else {
        cart.updateQuantity(variantId, 1);
      }
    }
  };

  const handleDecrement = (opt: ProductPriceOption) => {
    hapticFeedback('selection');
    const variantId = getVariantItemId(opt);
    const currentQty = getOptionQty(opt);

    if (currentQty <= 0) return;

    if (currentQty === 1) {
      if (onCustomRemove) {
        onCustomRemove(variantId);
      } else {
        cart.removeFromCart(variantId);
      }
    } else {
      if (onCustomUpdateQty) {
        onCustomUpdateQty(variantId, -1);
      } else {
        cart.updateQuantity(variantId, -1);
      }
    }
  };

  // Calculate total price and count for all variants of this product currently in cart
  const { totalVariantPrice, totalVariantCount } = product.priceOptions.reduce(
    (acc, opt) => {
      const q = getOptionQty(opt);
      if (q > 0) {
        const price = getEffectiveOptionPrice(opt);
        acc.totalVariantPrice += price * q;
        acc.totalVariantCount += q;
      }
      return acc;
    },
    { totalVariantPrice: 0, totalVariantCount: 0 }
  );

  const storeDisplayName = shop?.name || product.storeName || '';

  return (
    <div
      className="fixed inset-0 z-[100000] bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl max-w-md w-full overflow-hidden shadow-2xl border border-gray-100 flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-gray-100 flex items-start justify-between gap-3 bg-gradient-to-br from-emerald-50/50 via-white to-teal-50/30">
          <div className="flex items-start gap-3 min-w-0">
            {/* Product Photo */}
            <div className="w-14 h-14 rounded-2xl bg-white border border-gray-200 overflow-hidden shrink-0 flex items-center justify-center shadow-xs">
              {product.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={product.photoUrl}
                  alt={product.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <Package className="w-7 h-7 text-emerald-600/70" />
              )}
            </div>

            {/* Product Meta */}
            <div className="min-w-0">
              {storeDisplayName && (
                <p className="text-[10px] font-bold text-emerald-800 flex items-center gap-1 truncate mb-0.5">
                  <Store className="w-3 h-3 text-emerald-600 shrink-0" />
                  <span className="truncate">{storeDisplayName}</span>
                </p>
              )}
              <h3 className="font-extrabold text-sm sm:text-base text-gray-900 leading-snug break-words">
                {product.name}
              </h3>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100/70 text-emerald-900 font-extrabold text-[10px]">
                  <Layers className="w-2.5 h-2.5" />
                  <span>{product.priceOptions.length}টি সাইজ উপলব্ধ</span>
                </span>
                {product.category && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 font-bold text-[10px]">
                    <Tag className="w-2.5 h-2.5" />
                    <span>{product.category}</span>
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Close button */}
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-600 flex items-center justify-center shrink-0 cursor-pointer transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body: Options list with individual quantity controls */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3">
          <div className="flex items-center justify-between pb-1 gap-2">
            <label className="text-xs font-black text-gray-800">
              সাইজ ও পরিমাণ:
            </label>
            <div
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-black transition-all ${
                totalVariantCount > 0
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200/90 shadow-2xs'
                  : 'bg-gray-100 text-gray-500 border border-gray-200'
              }`}
            >
              <span>{totalVariantCount}টি যোগ হয়েছে</span>
              <span>•</span>
              <span className={totalVariantCount > 0 ? 'text-emerald-700 font-extrabold' : 'text-gray-600'}>
                ৳{totalVariantPrice}
              </span>
            </div>
          </div>

          <div className="space-y-2.5 pb-2">
            {product.priceOptions.map((option, index) => {
              const qty = getOptionQty(option);
              const effectivePrice = getEffectiveOptionPrice(option);
              const hasDiscount = effectivePrice < option.price;
              const optUnit = option.unit || product.unit;
              const isSelected = qty > 0;

              return (
                <div
                  key={index}
                  className={`w-full p-3 sm:p-3.5 rounded-2xl border transition-all flex items-center justify-between gap-3 ${
                    isSelected
                      ? 'border-emerald-500 bg-emerald-50/40 ring-2 ring-emerald-500/20 shadow-xs'
                      : 'border-gray-200/90 bg-white hover:border-gray-300'
                  }`}
                >
                  {/* Left Side: Option Details */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-extrabold text-xs sm:text-sm text-gray-900 truncate">
                        {option.name}
                      </p>
                      {optUnit && (
                        <span className="text-[10px] text-gray-500 font-semibold bg-gray-100 px-1.5 py-0.5 rounded">
                          {optUnit}
                        </span>
                      )}
                    </div>

                    <div className="flex items-baseline gap-1.5 mt-1">
                      <span className="font-black text-xs sm:text-sm text-emerald-700">
                        ৳{effectivePrice}
                      </span>
                      {hasDiscount && (
                        <span className="text-[10px] text-gray-400 line-through">
                          ৳{option.price}
                        </span>
                      )}
                      {hasDiscount && (
                        <span className="text-[9px] font-extrabold text-rose-600 bg-rose-50 px-1 py-0.2 rounded">
                          ছাড়
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Right Side: Quantity Controller with default 0 */}
                  <div className="shrink-0">
                    {qty === 0 ? (
                      <button
                        type="button"
                        onClick={() => handleIncrement(option)}
                        className="px-3.5 py-1.5 sm:py-2 rounded-xl bg-emerald-50 hover:bg-emerald-600 text-emerald-800 hover:text-white border border-emerald-300/80 font-black text-xs flex items-center gap-1.5 transition-all active:scale-95 shadow-2xs cursor-pointer group"
                      >
                        <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                        <span>যোগ করুন</span>
                      </button>
                    ) : (
                      <div className="flex items-center space-x-1.5 bg-emerald-600 text-white p-1 rounded-xl shadow-xs">
                        <button
                          type="button"
                          onClick={() => handleDecrement(option)}
                          className="w-7 h-7 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white flex items-center justify-center font-bold active:scale-90 transition-all cursor-pointer"
                          aria-label={`Decrease ${option.name} quantity`}
                        >
                          <Minus className="w-3.5 h-3.5 stroke-[3]" />
                        </button>

                        <span className="font-black text-xs sm:text-sm px-2 text-white min-w-[20px] text-center select-none">
                          {qty}
                        </span>

                        <button
                          type="button"
                          onClick={() => handleIncrement(option)}
                          className="w-7 h-7 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white flex items-center justify-center font-bold active:scale-90 transition-all cursor-pointer"
                          aria-label={`Increase ${option.name} quantity`}
                        >
                          <Plus className="w-3.5 h-3.5 stroke-[3]" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
