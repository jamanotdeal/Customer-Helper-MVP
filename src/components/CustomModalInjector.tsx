'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { AdminCustomModalConfig } from '@/types';
import { fallbackStore } from '@/lib/firebase';
import { useAuth } from '@/context/AuthContext';
import { X, ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react';
import { parse24HourTime } from './admin/TimePickerInput';

interface CustomModalInjectorProps {
  currentEvent?: string; // e.g. 'FIRST_VISIT', 'LOGIN', 'REQUEST_SUBMIT', 'ORDER_COMPLETE', 'DASHBOARD_OPEN'
}

/**
 * Global helper to trigger custom modals on demand from any component in the app.
 * Usage: triggerCustomModal('ADD_TO_CART');
 */
export function triggerCustomModal(eventName: string) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('modal_trigger', { detail: eventName }));
  }
}

// Convert any time string (24h or 12h e.g. "14:30" or "02:30 PM") to total minutes from midnight
const parseTimeToMinutes = (tStr?: string): number | null => {
  if (!tStr || typeof tStr !== 'string' || !tStr.includes(':')) return null;
  const parsed = parse24HourTime(tStr);
  let h24 = parsed.hour12;
  if (parsed.ampm === 'AM') {
    if (h24 === 12) h24 = 0;
  } else {
    if (h24 !== 12) h24 += 12;
  }
  return h24 * 60 + parsed.minute;
};

export const CustomModalInjector: React.FC<CustomModalInjectorProps> = ({
  currentEvent = 'FIRST_VISIT',
}) => {
  const { user } = useAuth();
  const [activeModals, setActiveModals] = useState<AdminCustomModalConfig[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isHovered, setIsHovered] = useState(false);

  // Critical requirement: Until the custom modal image is completely loaded in memory,
  // the modal UI (including backdrop & close button) will NOT be visible to users.
  const [isImageReady, setIsImageReady] = useState(false);

  // Dragging / swiping states for the slider
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartX, setDragStartX] = useState(0);
  const [dragCurrentX, setDragCurrentX] = useState(0);
  const sliderContainerRef = useRef<HTMLDivElement>(null);

  // Track fired events so multiple triggers can be handled cleanly
  const [firedEvents, setFiredEvents] = useState<Set<string>>(() => new Set([currentEvent]));

  // Check matching modals based on all fired events and admin configuration rules
  const checkCustomModals = useCallback(() => {
    const allModals = Array.from(fallbackStore.customModals.values());
    if (allModals.length === 0) return;

    const isMobileAppUser =
      typeof window !== 'undefined' &&
      (window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as any).standalone === true ||
        (window as any).isNativeApp === true ||
        (window as any).isApp === true ||
        /wv|TWA|AndroidApp|JamanotApp|Jamanot/i.test(navigator.userAgent || '') ||
        /(iPhone|iPod|iPad).*AppleWebKit(?!.*Safari)/i.test(navigator.userAgent || ''));

    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const todayStr = `${year}-${month}-${day}`;
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    const matching = allModals.filter((modal) => {
      // Must be enabled and have an image URL
      if (!modal.isEnabled || !modal.imageUrl || !modal.imageUrl.trim()) return false;

      // 1. Event trigger match
      const trigger = modal.triggerEvent || 'FIRST_VISIT';
      if (!firedEvents.has(trigger) && trigger !== 'FIRST_VISIT' && currentEvent !== trigger) {
        return false;
      }

      // 2. Platform match (Web vs Mobile App)
      const platform = (modal.targetPlatform || (
        modal.targetAudience === 'WEBSITE_USERS' || modal.targetAudience === 'website'
          ? 'WEB'
          : modal.targetAudience === 'MOBILE_APP_USERS' || modal.targetAudience === 'mobile_app'
          ? 'MOBILE_APP'
          : 'ALL'
      )).toUpperCase();

      if (platform === 'MOBILE_APP' && !isMobileAppUser) return false;
      if (platform === 'WEB' && isMobileAppUser) return false;

      // 3. Target audience match (Ensure 'ALL' works for unauthenticated visitors and authenticated users alike)
      const audience = (modal.targetAudience || 'ALL').toUpperCase();

      if (audience === 'ALL' || audience === 'WEBSITE_USERS' || audience === 'MOBILE_APP_USERS') {
        // Matches everyone — unauthenticated visitors, customers, helpers, admins
      } else if (audience === 'LOGGED_OUT') {
        if (user) return false;
      } else if (audience === 'LOGGED_IN') {
        if (!user) return false;
      } else if (audience === 'CUSTOMERS') {
        if (!user || user.isHelper) return false;
      } else if (audience === 'HELPERS') {
        if (!user || !user.isHelper) return false;
      } else if (audience === 'COMMUTER_HELPERS') {
        if (!user || !user.isHelper || user.helperType !== 'commuter') return false;
      } else if (audience === 'DEDICATED_HELPERS') {
        if (!user || !user.isHelper || user.helperType !== 'dedicated') return false;
      } else {
        const customSegments = [
          'MULTIPLE_ORDERS',
          'WEEKLY_2_ORDERS',
          'WEEKLY_1_ORDERS',
          'INACTIVE_1_WEEK',
          'INACTIVE_2_WEEKS',
          'NEVER_ORDERED',
          'RARE_ORDERS_WEEK',
          'RARE_ORDERS_MONTH',
          'NEW_REGISTERED',
        ];
        if (customSegments.includes(audience)) {
          if (!user) return false;
          if (!fallbackStore.doesUserMatchSegment(user, audience)) return false;
        }
      }

      // 4. Showing Date & Closing Date Check
      if (modal.expiresAt && now.getTime() > new Date(modal.expiresAt).getTime()) return false;
      if (modal.startDate && todayStr < modal.startDate) return false;
      if (modal.endDate && todayStr > modal.endDate) return false;

      // 5. Showing Time & Closing Time Check
      const effectiveStartTime = modal.startTime || modal.scheduledTime;
      if (effectiveStartTime) {
        const startMinutes = parseTimeToMinutes(effectiveStartTime);
        if (startMinutes !== null) {
          if (modal.startDate && todayStr === modal.startDate && currentMinutes < startMinutes) return false;
          if (!modal.startDate && currentMinutes < startMinutes) return false;
        }
      }

      const effectiveEndTime = modal.endTime || modal.expiryTime;
      if (effectiveEndTime) {
        const endMinutes = parseTimeToMinutes(effectiveEndTime);
        if (endMinutes !== null) {
          if (modal.endDate && todayStr === modal.endDate && currentMinutes > endMinutes) return false;
          if (!modal.endDate && currentMinutes > endMinutes) return false;
        }
      }

      // 6. Frequency & Repeated Activity Check
      const storageKey = `custom_modal_shown_${modal.id}`;
      const freq = modal.displayFrequency || 'ONCE_PER_SESSION';

      if (freq === 'ONCE_EVER' && typeof localStorage !== 'undefined') {
        if (localStorage.getItem(storageKey)) return false;
      } else if (freq === 'ONCE_PER_SESSION' && typeof sessionStorage !== 'undefined') {
        if (sessionStorage.getItem(storageKey)) return false;
      } else if ((freq === 'DAILY' || modal.repeatedDaily) && typeof localStorage !== 'undefined') {
        const todayKey = `custom_modal_shown_daily_${modal.id}_${todayStr}`;
        if (localStorage.getItem(todayKey)) return false;
      }

      return true;
    });

    if (matching.length > 0) {
      // PRELOAD the banner image first!
      // Do not show any modal UI until the image is completely loaded.
      const firstImage = matching[0]?.imageUrl;
      if (firstImage) {
        const img = new Image();
        img.src = firstImage;
        if (img.complete && img.naturalWidth > 0) {
          setActiveModals(matching);
          setCurrentIndex(0);
          setIsImageReady(true);
        } else {
          img.onload = () => {
            setActiveModals(matching);
            setCurrentIndex(0);
            setIsImageReady(true);
          };
          img.onerror = () => {
            setIsImageReady(false);
          };
        }
      }
    } else {
      setActiveModals([]);
      setIsImageReady(false);
    }
  }, [firedEvents, currentEvent, user]);

  // Load custom modals immediately on mount so visitors and unauthenticated users get them
  useEffect(() => {
    // 1. Fetch from Firestore / localStorage cache
    fallbackStore.loadModalsCached();
    checkCustomModals();
    const unsub = fallbackStore.subscribe(checkCustomModals);

    // 2. Global custom event listener for instant reactive triggers
    const handleTriggerEvent = (e: Event) => {
      const customEvt = e as CustomEvent<string>;
      if (customEvt.detail) {
        setFiredEvents((prev) => {
          const next = new Set(prev);
          next.add(customEvt.detail);
          return next;
        });
      }
    };
    window.addEventListener('modal_trigger', handleTriggerEvent);

    // 3. Smart Trigger: 5s Time Delay
    const timer5s = setTimeout(() => {
      setFiredEvents((prev) => new Set(prev).add('TIME_DELAY_5S'));
    }, 5000);

    // 4. Smart Trigger: 10s Time Delay
    const timer10s = setTimeout(() => {
      setFiredEvents((prev) => new Set(prev).add('TIME_DELAY_10S'));
    }, 10000);

    // 5. Smart Trigger: Scroll 50%
    const handleScroll = () => {
      const totalScrollable = document.documentElement.scrollHeight - window.innerHeight;
      if (totalScrollable > 0 && window.scrollY / totalScrollable >= 0.5) {
        setFiredEvents((prev) => new Set(prev).add('SCROLL_50'));
        window.removeEventListener('scroll', handleScroll);
      }
    };
    window.addEventListener('scroll', handleScroll, { passive: true });

    // 6. Smart Trigger: Exit Intent (Cursor leaves towards top of window)
    const handleMouseLeave = (e: MouseEvent) => {
      if (e.clientY <= 15) {
        setFiredEvents((prev) => new Set(prev).add('EXIT_INTENT'));
        document.removeEventListener('mouseleave', handleMouseLeave);
      }
    };
    document.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      unsub();
      window.removeEventListener('modal_trigger', handleTriggerEvent);
      clearTimeout(timer5s);
      clearTimeout(timer10s);
      window.removeEventListener('scroll', handleScroll);
      document.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, [checkCustomModals]);

  // Autoplay functionality for multi-modal slider
  useEffect(() => {
    if (activeModals.length <= 1 || isHovered || isDragging) return;

    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % activeModals.length);
    }, 4500);

    return () => clearInterval(interval);
  }, [activeModals.length, isHovered, isDragging]);

  // Handle modal close & store frequency records
  const handleClose = () => {
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
      now.getDate()
    ).padStart(2, '0')}`;

    // Mark frequency for all active modals in this view
    activeModals.forEach((modal) => {
      const storageKey = `custom_modal_shown_${modal.id}`;
      const freq = modal.displayFrequency || 'ONCE_PER_SESSION';

      if (freq === 'ONCE_EVER' && typeof localStorage !== 'undefined') {
        localStorage.setItem(storageKey, 'true');
      } else if (freq === 'ONCE_PER_SESSION' && typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem(storageKey, 'true');
      } else if ((freq === 'DAILY' || modal.repeatedDaily) && typeof localStorage !== 'undefined') {
        localStorage.setItem(`custom_modal_shown_daily_${modal.id}_${todayStr}`, 'true');
      }
    });

    setIsImageReady(false);
    setActiveModals([]);
  };

  // Handle clicking on the image banner
  const handleImageClick = (modal: AdminCustomModalConfig) => {
    const dragDistance = Math.abs(dragCurrentX - dragStartX);
    if (dragDistance > 12) return;

    const targetUrl =
      modal.linkUrl ||
      modal.actionUrl ||
      (modal.buttons && modal.buttons[0]?.actionUrl);

    if (targetUrl && targetUrl.trim()) {
      const url = targetUrl.trim();
      if (url.startsWith('http://') || url.startsWith('https://')) {
        window.open(url, '_blank', 'noopener,noreferrer');
      } else {
        window.location.href = url;
      }
      handleClose();
    }
  };

  // Slide navigation
  const handlePrev = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setCurrentIndex((prev) => (prev - 1 + activeModals.length) % activeModals.length);
  };

  const handleNext = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setCurrentIndex((prev) => (prev + 1) % activeModals.length);
  };

  // Drag & Swipe Handlers
  const handleDragStart = (clientX: number) => {
    if (activeModals.length <= 1) return;
    setIsDragging(true);
    setDragStartX(clientX);
    setDragCurrentX(clientX);
  };

  const handleDragMove = (clientX: number) => {
    if (!isDragging) return;
    setDragCurrentX(clientX);
  };

  const handleDragEnd = () => {
    if (!isDragging) return;
    setIsDragging(false);
    const diff = dragCurrentX - dragStartX;
    if (diff > 45) {
      handlePrev();
    } else if (diff < -45) {
      handleNext();
    }
    setDragStartX(0);
    setDragCurrentX(0);
  };

  // CRITICAL REQUIREMENT:
  // Until loading the custom modal image, the modal UI will not be visible to users.
  if (!isImageReady || activeModals.length === 0 || typeof document === 'undefined') {
    return null;
  }

  const currentModal = activeModals[currentIndex] || activeModals[0];
  const hasMultiple = activeModals.length > 1;
  const currentLink =
    currentModal.linkUrl ||
    currentModal.actionUrl ||
    (currentModal.buttons && currentModal.buttons[0]?.actionUrl);

  const dragOffset = isDragging ? dragCurrentX - dragStartX : 0;

  return createPortal(
    <div
      className="fixed inset-0 z-[999999] bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center p-4 transition-opacity duration-300 animate-in fade-in"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100vw',
        height: '100dvh',
        minHeight: '100vh',
        margin: 0,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          handleClose();
        }
      }}
    >
      <div
        ref={sliderContainerRef}
        className="flex flex-col items-center justify-center relative max-w-lg w-full"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => {
          setIsHovered(false);
          if (isDragging) handleDragEnd();
        }}
      >
        {/* Main Image Banner (Image Focused Only - No card, no border, no title, no extra body) */}
        <div
          className="relative w-full flex items-center justify-center select-none"
          onTouchStart={(e) => handleDragStart(e.touches[0].clientX)}
          onTouchMove={(e) => handleDragMove(e.touches[0].clientX)}
          onTouchEnd={handleDragEnd}
          onMouseDown={(e) => handleDragStart(e.clientX)}
          onMouseMove={(e) => handleDragMove(e.clientX)}
          onMouseUp={handleDragEnd}
        >
          {/* Navigation Arrows for Multiple Modals */}
          {hasMultiple && (
            <>
              <button
                type="button"
                onClick={handlePrev}
                aria-label="Previous Slide"
                className="absolute left-1 sm:-left-5 z-20 p-2.5 rounded-full bg-black/60 hover:bg-black/85 text-white backdrop-blur-md shadow-xl transition-all hover:scale-110 active:scale-95 cursor-pointer border border-white/10"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>

              <button
                type="button"
                onClick={handleNext}
                aria-label="Next Slide"
                className="absolute right-1 sm:-right-5 z-20 p-2.5 rounded-full bg-black/60 hover:bg-black/85 text-white backdrop-blur-md shadow-xl transition-all hover:scale-110 active:scale-95 cursor-pointer border border-white/10"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </>
          )}

          {/* Image Container */}
          <div
            onClick={() => handleImageClick(currentModal)}
            style={{
              transform: `translateX(${dragOffset}px)`,
              transition: isDragging ? 'none' : 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
            }}
            className={`relative max-w-full max-h-[75vh] flex items-center justify-center overflow-hidden rounded-2xl sm:rounded-3xl shadow-2xl ${
              currentLink ? 'cursor-pointer hover:opacity-95' : 'cursor-default'
            }`}
          >
            <img
              src={currentModal.imageUrl}
              alt="Modal Banner"
              draggable={false}
              className="w-auto h-auto max-w-[92vw] sm:max-w-md md:max-w-lg max-h-[72vh] object-contain rounded-2xl sm:rounded-3xl pointer-events-none drop-shadow-2xl"
            />

            {/* Slide Counter Badge for Multiple Modals */}
            {hasMultiple && (
              <div className="absolute top-3 right-3 px-2.5 py-1 rounded-full bg-black/60 backdrop-blur-md text-white text-[11px] font-black tracking-wide border border-white/10 shadow-sm pointer-events-none">
                {currentIndex + 1} / {activeModals.length}
              </div>
            )}

            {/* Click Link Indicator if redirect URL is present */}
            {currentLink && (
              <div className="absolute bottom-3 right-3 px-2.5 py-1 rounded-full bg-black/60 backdrop-blur-md text-white text-[10px] font-bold flex items-center gap-1 shadow-md border border-white/15 pointer-events-none">
                <span>ভিজিট করুন</span>
                <ExternalLink className="w-3 h-3 text-amber-400" />
              </div>
            )}
          </div>
        </div>

        {/* Slide Pagination Dots for Multiple Modals */}
        {hasMultiple && (
          <div className="flex items-center justify-center gap-1.5 pt-3">
            {activeModals.map((_, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setCurrentIndex(idx)}
                aria-label={`Go to slide ${idx + 1}`}
                className={`transition-all duration-300 rounded-full cursor-pointer ${
                  currentIndex === idx
                    ? 'w-6 h-2 bg-white shadow-sm'
                    : 'w-2 h-2 bg-white/40 hover:bg-white/70'
                }`}
              />
            ))}
          </div>
        )}

        {/* Close Button Under the Modal at the Middle (Red color medium size icon) */}
        <div className="flex justify-center pt-5">
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close Custom Modal"
            className="w-12 h-12 rounded-full bg-red-600 hover:bg-red-700 text-white flex items-center justify-center shadow-2xl transition-all duration-200 hover:scale-110 active:scale-95 cursor-pointer ring-4 ring-black/30"
          >
            <X className="w-6 h-6 stroke-[2.5]" />
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
