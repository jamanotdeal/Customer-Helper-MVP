'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { fallbackStore } from '@/lib/firebase';
import { ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react';

const ANIM_MS = 350;

export interface HeroSlide {
  id?: string;
  title?: string;
  subtitle?: string;
  imageUrl?: string;
  link?: string;
  hint?: string;
}

// Modern default banner graphics as crisp SVG data URLs
const DEFAULT_BANNER_1 = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="480" viewBox="0 0 1200 480"><defs><linearGradient id="g1" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="%23059669"/><stop offset="50%" stop-color="%23047857"/><stop offset="100%" stop-color="%230f766e"/></linearGradient><linearGradient id="g2" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="%2310b981" stop-opacity="0.4"/><stop offset="100%" stop-color="%2314b8a6" stop-opacity="0"/></linearGradient></defs><rect width="1200" height="480" fill="url(%23g1)" rx="32"/><circle cx="1050" cy="240" r="220" fill="url(%23g2)"/><circle cx="150" cy="400" r="140" fill="white" fill-opacity="0.05"/><text x="80" y="180" font-family="system-ui, -apple-system, sans-serif" font-size="44" font-weight="900" fill="white">বাজার-সদাই এনে দিই ঘরে</text><text x="80" y="240" font-family="system-ui, -apple-system, sans-serif" font-size="22" font-weight="500" fill="%23d1fae5">কাঁচাবাজার, মাছ-মাংস, চাল-ডাল — যা দরকার বলুন।</text><rect x="80" y="290" width="220" height="52" rx="26" fill="white" fill-opacity="0.2" stroke="white" stroke-opacity="0.4"/><text x="120" y="324" font-family="system-ui, -apple-system, sans-serif" font-size="18" font-weight="800" fill="white">অর্ডার করুন →</text><circle cx="980" cy="240" r="130" fill="white" fill-opacity="0.15"/><text x="920" y="275" font-family="system-ui, -apple-system, sans-serif" font-size="100" fill="white">🛍️</text></svg>`;

const DEFAULT_BANNER_2 = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="480" viewBox="0 0 1200 480"><defs><linearGradient id="g3" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="%230284c7"/><stop offset="50%" stop-color="%230369a1"/><stop offset="100%" stop-color="%231d4ed8"/></linearGradient><linearGradient id="g4" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="%2338bdf8" stop-opacity="0.4"/><stop offset="100%" stop-color="%2360a5fa" stop-opacity="0"/></linearGradient></defs><rect width="1200" height="480" fill="url(%23g3)" rx="32"/><circle cx="1050" cy="240" r="220" fill="url(%23g4)"/><circle cx="120" cy="80" r="110" fill="white" fill-opacity="0.05"/><text x="80" y="180" font-family="system-ui, -apple-system, sans-serif" font-size="44" font-weight="900" fill="white">ওষুধ আনানো এখন সহজ</text><text x="80" y="240" font-family="system-ui, -apple-system, sans-serif" font-size="22" font-weight="500" fill="%23e0f2fe">ফার্মেসি থেকে প্রেসক্রিপশন অনুযায়ী ওষুধ দ্রুত পৌঁছে দেবো।</text><rect x="80" y="290" width="220" height="52" rx="26" fill="white" fill-opacity="0.2" stroke="white" stroke-opacity="0.4"/><text x="120" y="324" font-family="system-ui, -apple-system, sans-serif" font-size="18" font-weight="800" fill="white">দ্রুত ডেলিভারি →</text><circle cx="980" cy="240" r="130" fill="white" fill-opacity="0.15"/><text x="920" y="275" font-family="system-ui, -apple-system, sans-serif" font-size="100" fill="white">💊</text></svg>`;

const DEFAULT_BANNER_3 = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="480" viewBox="0 0 1200 480"><defs><linearGradient id="g5" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="%23ea580c"/><stop offset="50%" stop-color="%23c2410c"/><stop offset="100%" stop-color="%23b91c1c"/></linearGradient><linearGradient id="g6" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="%23fb923c" stop-opacity="0.4"/><stop offset="100%" stop-color="%23f87171" stop-opacity="0"/></linearGradient></defs><rect width="1200" height="480" fill="url(%23g5)" rx="32"/><circle cx="1050" cy="240" r="220" fill="url(%23g6)"/><circle cx="180" cy="420" r="160" fill="white" fill-opacity="0.05"/><text x="80" y="180" font-family="system-ui, -apple-system, sans-serif" font-size="44" font-weight="900" fill="white">পছন্দের খাবার সরাসরি দরজায়</text><text x="80" y="240" font-family="system-ui, -apple-system, sans-serif" font-size="22" font-weight="500" fill="%23ffedd5">রেস্তোরাঁ বা দোকান থেকে গরম খাবার পৌঁছে যাবে মুহূর্তেই।</text><rect x="80" y="290" width="220" height="52" rx="26" fill="white" fill-opacity="0.2" stroke="white" stroke-opacity="0.4"/><text x="120" y="324" font-family="system-ui, -apple-system, sans-serif" font-size="18" font-weight="800" fill="white">খাবার আনান →</text><circle cx="980" cy="240" r="130" fill="white" fill-opacity="0.15"/><text x="920" y="275" font-family="system-ui, -apple-system, sans-serif" font-size="100" fill="white">🍔</text></svg>`;

const DEFAULT_SLIDES: HeroSlide[] = [
  {
    id: 'default-1',
    title: 'বাজার-সদাই এনে দিই ঘরে',
    subtitle: 'কাঁচাবাজার, মাছ-মাংস, চাল-ডাল — যা দরকার বলুন।',
    imageUrl: DEFAULT_BANNER_1,
    hint: 'বাজার-সদাই করে দিন',
  },
  {
    id: 'default-2',
    title: 'ওষুধ আনানো এখন সহজ',
    subtitle: 'ফার্মেসি থেকে প্রেসক্রিপশন অনুযায়ী ওষুধ দ্রুত পৌঁছে দেবো।',
    imageUrl: DEFAULT_BANNER_2,
    hint: 'ফার্মেসি থেকে ওষুধ এনে দিন',
  },
  {
    id: 'default-3',
    title: 'পছন্দের খাবার সরাসরি দরজায়',
    subtitle: 'রেস্তোরাঁ বা দোকান থেকে গরম খাবার সরাসরি আপনার দরজায়।',
    imageUrl: DEFAULT_BANNER_3,
    hint: 'খাবার আনানো',
  },
];

interface ServiceTickerHeaderProps {
  onOpenCustomRequest?: (serviceHint?: string) => void;
}

export const ServiceTickerHeader: React.FC<ServiceTickerHeaderProps> = ({
  onOpenCustomRequest,
}) => {
  const [slides, setSlides] = useState<HeroSlide[]>(DEFAULT_SLIDES);
  const [slideIndex, setSlideIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  // Animation state: 'idle' | 'exit' | 'enter'
  const [animPhase, setAnimPhase] = useState<'idle' | 'exit' | 'enter'>('idle');
  const [animDir, setAnimDir] = useState<1 | -1>(1);
  const [displayIndex, setDisplayIndex] = useState(0);
  const animTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Drag / swipe state
  const dragStartX = useRef<number | null>(null);
  const dragDelta = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Load admin-controlled slides from pricingSettings
  useEffect(() => {
    const sync = () => {
      const adminSlides = fallbackStore.pricingSettings?.homeSlides;
      if (adminSlides && adminSlides.length > 0) {
        // Ensure each slide has a banner image
        const normalized = adminSlides.map((s, idx) => ({
          ...s,
          imageUrl: s.imageUrl || (idx % 3 === 0 ? DEFAULT_BANNER_1 : idx % 3 === 1 ? DEFAULT_BANNER_2 : DEFAULT_BANNER_3),
        }));
        setSlides(normalized);
      } else {
        setSlides(DEFAULT_SLIDES);
      }
    };
    sync();
    const unsub = fallbackStore.subscribe(sync);
    return () => unsub();
  }, []);

  const goTo = useCallback(
    (idx: number, dir?: 1 | -1) => {
      if (slides.length <= 1) return;
      const next = ((idx % slides.length) + slides.length) % slides.length;
      if (next === slideIndex) return;
      const direction = dir ?? (next > slideIndex ? 1 : -1);

      if (animTimerRef.current) clearTimeout(animTimerRef.current);

      setAnimDir(direction);
      setAnimPhase('exit');

      animTimerRef.current = setTimeout(() => {
        setDisplayIndex(next);
        setSlideIndex(next);
        setAnimPhase('enter');

        animTimerRef.current = setTimeout(() => {
          setAnimPhase('idle');
        }, ANIM_MS);
      }, ANIM_MS);
    },
    [slides.length, slideIndex]
  );

  // Auto-advance every 4 seconds, pausable
  useEffect(() => {
    if (isPaused || slides.length <= 1) return;
    const timer = setInterval(() => {
      goTo((slideIndex + 1) % slides.length, 1);
    }, 4500);
    return () => clearInterval(timer);
  }, [isPaused, slides.length, slideIndex, goTo]);

  useEffect(() => {
    return () => {
      if (animTimerRef.current) clearTimeout(animTimerRef.current);
    };
  }, []);

  // Handle banner click: if link set, redirect; if no link set, nothing happens
  const handleBannerClick = (slide: HeroSlide) => {
    if (!slide.link || !slide.link.trim()) {
      // "if no link set then nothing will happen"
      return;
    }

    const url = slide.link.trim();
    if (url.startsWith('http://') || url.startsWith('https://')) {
      window.open(url, '_blank', 'noopener,noreferrer');
    } else {
      window.location.href = url;
    }
  };

  // Pointer drag
  const onPointerDown = (e: React.PointerEvent) => {
    dragStartX.current = e.clientX;
    dragDelta.current = 0;
    setIsPaused(true);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (dragStartX.current === null) return;
    dragDelta.current = e.clientX - dragStartX.current;
    if (
      Math.abs(dragDelta.current) > 10 &&
      containerRef.current &&
      !containerRef.current.hasPointerCapture(e.pointerId)
    ) {
      try {
        containerRef.current.setPointerCapture(e.pointerId);
      } catch {}
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (containerRef.current && containerRef.current.hasPointerCapture(e.pointerId)) {
      try {
        containerRef.current.releasePointerCapture(e.pointerId);
      } catch {}
    }
    if (dragStartX.current === null) return;

    const delta = dragDelta.current;
    if (Math.abs(delta) > 35) {
      const dir = delta < 0 ? 1 : -1;
      goTo(slideIndex + dir, dir);
    } else if (Math.abs(delta) < 8) {
      // Tap on banner
      const curSlide = slides[displayIndex] || slides[0];
      handleBannerClick(curSlide);
    }

    dragStartX.current = null;
    dragDelta.current = 0;
    setIsPaused(false);
  };

  const currentSlide = slides[displayIndex] || slides[0];
  const hasLink = Boolean(currentSlide?.link && currentSlide.link.trim().length > 0);

  const getSlideStyle = (): React.CSSProperties => {
    if (animPhase === 'exit') {
      return {
        opacity: 0,
        transform: `translateX(${animDir === 1 ? '-6%' : '6%'}) scale(0.98)`,
        transition: `opacity ${ANIM_MS}ms ease, transform ${ANIM_MS}ms ease`,
      };
    }
    if (animPhase === 'enter') {
      return {
        opacity: 1,
        transform: 'translateX(0) scale(1)',
        transition: `opacity ${ANIM_MS}ms ease, transform ${ANIM_MS}ms ease`,
      };
    }
    return { opacity: 1, transform: 'translateX(0) scale(1)' };
  };

  return (
    <div
      ref={containerRef}
      className={`relative w-full rounded-3xl overflow-hidden shadow-sm select-none touch-pan-y group bg-gray-100 ${
        hasLink ? 'cursor-pointer' : 'cursor-default'
      }`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => {
        if (dragStartX.current === null) setIsPaused(false);
      }}
      aria-label="Promotional banner slider"
    >
      {/* ── Full Banner Image Container ── */}
      <div
        className="w-full relative aspect-[2.4/1] sm:aspect-[2.8/1] overflow-hidden rounded-3xl"
        style={getSlideStyle()}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={currentSlide.imageUrl || DEFAULT_BANNER_1}
          alt={currentSlide.title || 'Jamanot Banner'}
          draggable={false}
          className="w-full h-full object-cover rounded-3xl block"
        />

        {/* Subtle indicator if link is attached */}
        {hasLink && (
          <div className="absolute top-3 right-3 bg-black/40 hover:bg-black/60 backdrop-blur-md text-white p-1.5 rounded-full shadow-md transition-all">
            <ExternalLink className="w-3.5 h-3.5" />
          </div>
        )}
      </div>

      {/* Prev / Next arrows (subtle, visible on hover for desktop) */}
      {slides.length > 1 && (
        <>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              goTo(slideIndex - 1, -1);
            }}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/30 hover:bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-xs cursor-pointer"
            aria-label="Previous slide"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              goTo(slideIndex + 1, 1);
            }}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/30 hover:bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-xs cursor-pointer"
            aria-label="Next slide"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </>
      )}

      {/* Dot Indicators */}
      {slides.length > 1 && (
        <div className="absolute bottom-2.5 left-0 right-0 flex items-center justify-center gap-1.5 pointer-events-none">
          {slides.map((_, i) => (
            <span
              key={i}
              className={`rounded-full transition-all duration-300 drop-shadow-sm ${
                i === displayIndex
                  ? 'w-5 h-1.5 bg-white shadow-xs'
                  : 'w-1.5 h-1.5 bg-white/60'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
};
