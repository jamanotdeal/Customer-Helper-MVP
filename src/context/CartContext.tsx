'use client';

import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { Shop, OrderItem } from '@/types';

export const CART_STORAGE_KEY = 'jamanot_customer_cart_data';

export interface CartContextType {
  cartItems: OrderItem[];
  cartShop: Shop | null;
  addToCart: (item: OrderItem, shop: Shop) => void;
  addCustomItem: (item: OrderItem, shop?: Shop) => void;
  addCustomItems: (items: OrderItem[], shop?: Shop) => void;
  replaceCartItem: (oldItemId: string, newItems: OrderItem[]) => void;
  updateQuantity: (itemId: string, delta: number) => void;
  removeFromCart: (itemId: string) => void;
  clearCart: () => void;
  isCartDrawerOpen: boolean;
  highlightCustomItem: boolean;
  customItemInitialText?: string;
  openCartDrawer: (highlightCustom?: boolean, initialCustomText?: string) => void;
  closeCartDrawer: () => void;
  setCartShop: (shop: Shop | null) => void;
  totalCartCount: number;
  subtotal: number;
}

const CartContext = createContext<CartContextType | null>(null);

export const CartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [cartItems, setCartItems] = useState<OrderItem[]>([]);
  const [cartShop, setCartShop] = useState<Shop | null>(null);
  const [isCartDrawerOpen, setIsCartDrawerOpen] = useState(false);
  const [highlightCustomItem, setHighlightCustomItem] = useState(false);
  const [customItemInitialText, setCustomItemInitialText] = useState<string | undefined>(undefined);
  const [isLoaded, setIsLoaded] = useState(false);

  // ── Load cart from localStorage on mount ──
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem(CART_STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed.items)) {
            setCartItems(parsed.items);
          }
          if (parsed.shop) {
            setCartShop(parsed.shop);
          }
        }
      } catch (err) {
        console.error('[CartContext] Failed to load cart from localStorage:', err);
      } finally {
        setIsLoaded(true);
      }
    }
  }, []);

  // ── Persist cart to localStorage on changes ──
  useEffect(() => {
    if (!isLoaded || typeof window === 'undefined') return;

    if (cartItems.length > 0) {
      try {
        localStorage.setItem(
          CART_STORAGE_KEY,
          JSON.stringify({
            shop: cartShop,
            items: cartItems,
            updatedAt: new Date().toISOString(),
          })
        );
      } catch (err) {
        console.error('[CartContext] Failed to save cart to localStorage:', err);
      }
    } else {
      localStorage.removeItem(CART_STORAGE_KEY);
    }
  }, [cartItems, cartShop, isLoaded]);

  // Totals
  const totalCartCount = useMemo(() => {
    return cartItems.reduce((acc, item) => acc + (item.quantity || 1), 0);
  }, [cartItems]);

  const subtotal = useMemo(() => {
    return cartItems.reduce((acc, item) => {
      if (item.price !== undefined) {
        return acc + item.price * (item.quantity || 1);
      }
      return acc;
    }, 0);
  }, [cartItems]);

  const addToCart = useCallback((item: OrderItem, shop: Shop) => {
    setCartShop((prevShop) => {
      // If adding from another store, update the store reference
      if (!prevShop || prevShop.id !== shop.id) {
        return shop;
      }
      return prevShop;
    });

    setCartItems((prev) => {
      const idx = prev.findIndex((i) => i.id === item.id);
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = {
          ...updated[idx],
          quantity: (updated[idx].quantity || 1) + (item.quantity || 1),
        };
        return updated;
      }
      return [...prev, item];
    });
  }, []);

  const addCustomItems = useCallback((items: OrderItem[], shop?: Shop) => {
    if (shop) {
      setCartShop((prev) => prev || shop);
    }
    setCartItems((prev) => [...prev, ...items]);
  }, []);

  const addCustomItem = useCallback((item: OrderItem, shop?: Shop) => {
    addCustomItems([item], shop);
  }, [addCustomItems]);

  const replaceCartItem = useCallback((oldItemId: string, newItems: OrderItem[]) => {
    setCartItems((prev) => {
      const idx = prev.findIndex((i) => i.id === oldItemId);
      if (idx < 0) return [...prev, ...newItems];
      const copy = [...prev];
      copy.splice(idx, 1, ...newItems);
      return copy;
    });
  }, []);

  const updateQuantity = useCallback((itemId: string, delta: number) => {
    setCartItems((prev) => {
      const idx = prev.findIndex((i) => i.id === itemId);
      if (idx < 0) return prev;

      const current = prev[idx];
      const newQty = (current.quantity || 1) + delta;

      if (newQty <= 0) {
        const filtered = prev.filter((i) => i.id !== itemId);
        return filtered;
      }

      const updated = [...prev];
      updated[idx] = { ...current, quantity: newQty };
      return updated;
    });
  }, []);

  const removeFromCart = useCallback((itemId: string) => {
    setCartItems((prev) => {
      const filtered = prev.filter((i) => i.id !== itemId);
      if (filtered.length === 0) {
        setCartShop(null);
      }
      return filtered;
    });
  }, []);

  const clearCart = useCallback(() => {
    setCartItems([]);
    setCartShop(null);
    if (typeof window !== 'undefined') {
      localStorage.removeItem(CART_STORAGE_KEY);
    }
  }, []);

  const openCartDrawer = useCallback((highlightCustom?: boolean, initialCustomText?: string) => {
    setHighlightCustomItem(Boolean(highlightCustom));
    setCustomItemInitialText(initialCustomText);
    setIsCartDrawerOpen(true);
  }, []);

  const closeCartDrawer = useCallback(() => {
    setIsCartDrawerOpen(false);
    setHighlightCustomItem(false);
    setCustomItemInitialText(undefined);
  }, []);

  return (
    <CartContext.Provider
      value={{
        cartItems,
        cartShop,
        addToCart,
        addCustomItem,
        addCustomItems,
        replaceCartItem,
        updateQuantity,
        removeFromCart,
        clearCart,
        isCartDrawerOpen,
        highlightCustomItem,
        customItemInitialText,
        openCartDrawer,
        closeCartDrawer,
        setCartShop,
        totalCartCount,
        subtotal,
      }}
    >
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => {
  const ctx = useContext(CartContext);
  if (!ctx) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return ctx;
};
