'use client';

import React, { useRef, useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight, GripHorizontal } from 'lucide-react';

interface DraggableTabsContainerProps {
  children: React.ReactNode;
  className?: string;
  containerClassName?: string;
  showScrollButtons?: boolean;
  activeKey?: string | number;
}

export const DraggableTabsContainer: React.FC<DraggableTabsContainerProps> = ({
  children,
  className = '',
  containerClassName = '',
  showScrollButtons = true,
  activeKey,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isMouseDown, setIsMouseDown] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeftState, setScrollLeftState] = useState(0);
  const [dragged, setDragged] = useState(false);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const prevActiveRef = useRef<string | null>(null);

  // Check scroll boundaries
  const updateScrollButtons = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setCanScrollLeft(scrollLeft > 4);
    setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 4);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    // Initial check
    updateScrollButtons();

    // Check after image/layout load
    const timer = setTimeout(updateScrollButtons, 150);

    const handleResize = () => updateScrollButtons();
    window.addEventListener('resize', handleResize);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', handleResize);
    };
  }, [updateScrollButtons]);

  // Handle active tab auto scroll into view (only within horizontal container el, NEVER scrolling the main window)
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const activeChild = el.querySelector('[data-active="true"]') as HTMLElement;
    if (!activeChild) return;

    const currentActiveId =
      activeKey !== undefined
        ? String(activeKey)
        : activeChild.getAttribute('id') ||
          activeChild.getAttribute('data-tab-id') ||
          activeChild.textContent ||
          '';

    // Only scroll horizontal tab bar if active tab has actually changed
    if (prevActiveRef.current !== currentActiveId) {
      const isInitial = prevActiveRef.current === null;
      prevActiveRef.current = currentActiveId;

      const childLeft = activeChild.offsetLeft;
      const childWidth = activeChild.offsetWidth;
      const containerWidth = el.clientWidth;
      const targetScrollLeft = childLeft - containerWidth / 2 + childWidth / 2;

      // Scroll ONLY the tab container el, never scroll window or parent page!
      el.scrollTo({
        left: Math.max(0, targetScrollLeft),
        behavior: isInitial ? 'auto' : 'smooth',
      });

      updateScrollButtons();
    }
  }, [children, activeKey, updateScrollButtons]);

  // Mouse Down
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = scrollRef.current;
    if (!el) return;
    // Only primary mouse button (left click)
    if (e.button !== 0) return;

    setIsMouseDown(true);
    setStartX(e.pageX - el.offsetLeft);
    setScrollLeftState(el.scrollLeft);
    setDragged(false);
  };

  // Mouse Move
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isMouseDown) return;
    const el = scrollRef.current;
    if (!el) return;

    const x = e.pageX - el.offsetLeft;
    const walk = (x - startX) * 1.5; // Drag sensitivity speed

    if (Math.abs(walk) > 6) {
      setDragged(true);
    }

    el.scrollLeft = scrollLeftState - walk;
    updateScrollButtons();
  };

  // Mouse Up / Leave
  const handleMouseUpOrLeave = () => {
    setIsMouseDown(false);
    updateScrollButtons();
  };

  // Prevent button click if dragged
  const handleClickCapture = (e: React.MouseEvent) => {
    if (dragged) {
      e.stopPropagation();
      e.preventDefault();
      setDragged(false);
    }
  };

  // Convert vertical wheel to horizontal scroll for mouse wheel users
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    const el = scrollRef.current;
    if (!el) return;

    // If scrolling vertically and scrollable horizontally
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX) && el.scrollWidth > el.clientWidth) {
      el.scrollLeft += e.deltaY * 0.95;
      updateScrollButtons();
    }
  };

  const scrollByAmount = (amount: number) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: amount, behavior: 'smooth' });
    setTimeout(updateScrollButtons, 300);
  };

  return (
    <div className={`relative flex items-center group/tabcontainer ${containerClassName}`}>
      {/* Left Scroll Chevron Button */}
      {showScrollButtons && canScrollLeft && (
        <button
          type="button"
          onClick={() => scrollByAmount(-220)}
          className="absolute left-1.5 z-20 p-2 rounded-full bg-white/95 text-purple-950 shadow-lg border border-purple-200/80 hover:bg-purple-50 hover:scale-105 active:scale-95 transition-all backdrop-blur-md flex items-center justify-center cursor-pointer"
          title="Scroll tabs left"
          aria-label="Scroll left"
        >
          <ChevronLeft className="w-4 h-4 text-purple-800" />
        </button>
      )}

      {/* Main Draggable Scroll Container */}
      <div
        ref={scrollRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUpOrLeave}
        onMouseLeave={handleMouseUpOrLeave}
        onClickCapture={handleClickCapture}
        onWheel={handleWheel}
        onScroll={updateScrollButtons}
        className={`flex items-center space-x-2 bg-gray-100/90 p-1.5 rounded-2xl overflow-x-auto no-scrollbar border border-gray-200/80 text-xs font-extrabold select-none w-full transition-all touch-pan-x ${
          isMouseDown
            ? 'cursor-grabbing active:cursor-grabbing'
            : 'cursor-grab hover:cursor-grab'
        } ${className}`}
        style={{
          WebkitOverflowScrolling: 'touch',
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
        }}
      >
        {children}
      </div>

      {/* Right Scroll Chevron Button */}
      {showScrollButtons && canScrollRight && (
        <button
          type="button"
          onClick={() => scrollByAmount(220)}
          className="absolute right-1.5 z-20 p-2 rounded-full bg-white/95 text-purple-950 shadow-lg border border-purple-200/80 hover:bg-purple-50 hover:scale-105 active:scale-95 transition-all backdrop-blur-md flex items-center justify-center cursor-pointer"
          title="Scroll tabs right"
          aria-label="Scroll right"
        >
          <ChevronRight className="w-4 h-4 text-purple-800" />
        </button>
      )}
    </div>
  );
};
