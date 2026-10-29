'use client';

import React from 'react';
import { LucideIcon, ChevronDown } from 'lucide-react';

export type SettingsAccordionColorScheme =
  | 'purple'
  | 'emerald'
  | 'blue'
  | 'amber'
  | 'indigo'
  | 'rose'
  | 'slate'
  | 'orange';

export interface SettingsAccordionSectionProps {
  id: string;
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  badge?: React.ReactNode;
  isOpen: boolean;
  onToggle: () => void;
  colorScheme?: SettingsAccordionColorScheme;
  headerExtra?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

const colorMap: Record<
  SettingsAccordionColorScheme,
  {
    border: string;
    bgOpen: string;
    bgClosedHover: string;
    iconBg: string;
    iconColor: string;
    titleColor: string;
    subtitleColor: string;
    ring: string;
  }
> = {
  purple: {
    border: 'border-purple-200/90',
    bgOpen: 'bg-white',
    bgClosedHover: 'hover:bg-purple-50/40',
    iconBg: 'bg-purple-100 text-purple-700',
    iconColor: 'text-purple-700',
    titleColor: 'text-purple-950',
    subtitleColor: 'text-purple-700/80',
    ring: 'focus-visible:ring-purple-500/30',
  },
  emerald: {
    border: 'border-emerald-200/90',
    bgOpen: 'bg-white',
    bgClosedHover: 'hover:bg-emerald-50/40',
    iconBg: 'bg-emerald-100 text-emerald-700',
    iconColor: 'text-emerald-700',
    titleColor: 'text-emerald-950',
    subtitleColor: 'text-emerald-700/80',
    ring: 'focus-visible:ring-emerald-500/30',
  },
  blue: {
    border: 'border-blue-200/90',
    bgOpen: 'bg-white',
    bgClosedHover: 'hover:bg-blue-50/40',
    iconBg: 'bg-blue-100 text-blue-700',
    iconColor: 'text-blue-700',
    titleColor: 'text-blue-950',
    subtitleColor: 'text-blue-700/80',
    ring: 'focus-visible:ring-blue-500/30',
  },
  amber: {
    border: 'border-amber-200/90',
    bgOpen: 'bg-white',
    bgClosedHover: 'hover:bg-amber-50/40',
    iconBg: 'bg-amber-100 text-amber-700',
    iconColor: 'text-amber-700',
    titleColor: 'text-amber-950',
    subtitleColor: 'text-amber-800/80',
    ring: 'focus-visible:ring-amber-500/30',
  },
  indigo: {
    border: 'border-indigo-200/90',
    bgOpen: 'bg-white',
    bgClosedHover: 'hover:bg-indigo-50/40',
    iconBg: 'bg-indigo-100 text-indigo-700',
    iconColor: 'text-indigo-700',
    titleColor: 'text-indigo-950',
    subtitleColor: 'text-indigo-700/80',
    ring: 'focus-visible:ring-indigo-500/30',
  },
  rose: {
    border: 'border-rose-200/90',
    bgOpen: 'bg-white',
    bgClosedHover: 'hover:bg-rose-50/40',
    iconBg: 'bg-rose-100 text-rose-700',
    iconColor: 'text-rose-700',
    titleColor: 'text-rose-950',
    subtitleColor: 'text-rose-700/80',
    ring: 'focus-visible:ring-rose-500/30',
  },
  slate: {
    border: 'border-slate-200',
    bgOpen: 'bg-white',
    bgClosedHover: 'hover:bg-slate-50/60',
    iconBg: 'bg-slate-100 text-slate-700',
    iconColor: 'text-slate-700',
    titleColor: 'text-slate-900',
    subtitleColor: 'text-slate-600',
    ring: 'focus-visible:ring-slate-500/30',
  },
  orange: {
    border: 'border-orange-200/90',
    bgOpen: 'bg-white',
    bgClosedHover: 'hover:bg-orange-50/40',
    iconBg: 'bg-orange-100 text-orange-700',
    iconColor: 'text-orange-700',
    titleColor: 'text-orange-950',
    subtitleColor: 'text-orange-800/80',
    ring: 'focus-visible:ring-orange-500/30',
  },
};

export const SettingsAccordionSection: React.FC<SettingsAccordionSectionProps> = ({
  id,
  title,
  subtitle,
  icon: Icon,
  badge,
  isOpen,
  onToggle,
  colorScheme = 'purple',
  headerExtra,
  children,
  className = '',
}) => {
  const styles = colorMap[colorScheme] || colorMap.purple;

  return (
    <div
      id={`accordion-${id}`}
      className={`rounded-2xl border transition-all duration-200 shadow-xs overflow-hidden ${
        styles.border
      } ${isOpen ? `${styles.bgOpen} shadow-sm ring-1 ${styles.border}` : `bg-white ${styles.bgClosedHover}`} ${className}`}
    >
      {/* Accordion Header */}
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-controls={`accordion-content-${id}`}
        className={`w-full text-left p-4 sm:p-4.5 flex items-center justify-between gap-3 transition-colors cursor-pointer select-none outline-none ${
          styles.ring
        } ${isOpen ? 'border-b border-gray-100 bg-gray-50/40' : ''}`}
      >
        <div className="flex items-center gap-3.5 min-w-0">
          {Icon && (
            <div
              className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center shrink-0 transition-transform ${
                styles.iconBg
              } ${isOpen ? 'scale-105' : ''}`}
            >
              <Icon className="w-5 h-5" />
            </div>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`font-extrabold text-sm sm:text-[15px] leading-tight ${styles.titleColor}`}>
                {title}
              </span>
              {badge && <span className="shrink-0">{badge}</span>}
            </div>
            {subtitle && (
              <p className={`text-xs mt-0.5 line-clamp-1 font-medium ${styles.subtitleColor}`}>
                {subtitle}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0 ml-2">
          {headerExtra && (
            <div
              onClick={(e) => {
                e.stopPropagation();
              }}
              className="flex items-center"
            >
              {headerExtra}
            </div>
          )}

          <div
            className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all ${
              isOpen
                ? 'bg-purple-100 text-purple-800 rotate-180'
                : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}
          >
            <ChevronDown className="w-4 h-4 transition-transform duration-200" />
          </div>
        </div>
      </button>

      {/* Accordion Content Body */}
      {isOpen && (
        <div
          id={`accordion-content-${id}`}
          role="region"
          aria-labelledby={`accordion-${id}`}
          className="p-4 sm:p-6 space-y-4 animate-in fade-in-50 duration-200"
        >
          {children}
        </div>
      )}
    </div>
  );
};
