'use client';

import React, { useEffect, useState } from 'react';
import { AlertCircle, Calendar, RefreshCw } from 'lucide-react';
import { AdminDatePreset, AdminDateRange, rangeForPreset } from '@/lib/adminDateRange';

const PRESETS: { key: Exclude<AdminDatePreset, 'CUSTOM' | 'LAST_7' | 'LAST_30'>; label: string }[] = [
  { key: 'TODAY', label: 'Today' },
  { key: 'YESTERDAY', label: 'Yesterday' },
  { key: 'THIS_WEEK', label: 'This Week' },
  { key: 'THIS_MONTH', label: 'This Month' },
  { key: 'ALL_TIME', label: 'All Time' },
];

interface AdminDateRangeFilterProps {
  value: AdminDateRange;
  onChange: (range: AdminDateRange) => void;
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
  /** e.g. "42 orders" — shown once the range has loaded. */
  summary?: string;
}

/**
 * The date range an admin list is read for. Presets apply at once; a custom
 * range is only read when Apply is pressed, so picking the two dates does not
 * download the data twice.
 */
export const AdminDateRangeFilter: React.FC<AdminDateRangeFilterProps> = ({
  value,
  onChange,
  loading,
  error,
  onRetry,
  summary,
}) => {
  const [draftStart, setDraftStart] = useState(value.start);
  const [draftEnd, setDraftEnd] = useState(value.end);
  useEffect(() => {
    setDraftStart(value.start);
    setDraftEnd(value.end);
  }, [value.start, value.end]);

  const draftValid = Boolean(draftStart && draftEnd && draftStart <= draftEnd);
  const draftChanged = draftStart !== value.start || draftEnd !== value.end;

  const applyCustom = () => {
    if (!draftValid || !draftChanged) return;
    onChange({ preset: 'CUSTOM', start: draftStart, end: draftEnd });
  };

  return (
    <div className="bg-white p-4 rounded-3xl border border-gray-100 shadow-soft flex flex-col lg:flex-row lg:items-center gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-extrabold text-gray-500 mr-1 flex items-center gap-1">
          <Calendar className="w-3.5 h-3.5 text-purple-600" />
          <span>Date:</span>
        </span>
        {PRESETS.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => {
              if (value.preset !== p.key) onChange(rangeForPreset(p.key));
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all ${
              value.preset === p.key
                ? 'bg-purple-950 text-white shadow-sm'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 lg:ml-auto">
        <div
          className={`flex items-center gap-2 border px-3 py-1.5 rounded-xl ${
            value.preset === 'CUSTOM' ? 'bg-purple-50 border-purple-300' : 'bg-gray-50 border-gray-200'
          }`}
        >
          <input
            type="date"
            value={draftStart}
            max={draftEnd || undefined}
            onChange={(e) => setDraftStart(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && applyCustom()}
            aria-label="From date"
            className="bg-transparent text-gray-900 text-xs font-bold focus:outline-none cursor-pointer"
          />
          <span className="text-gray-400 text-xs font-bold">to</span>
          <input
            type="date"
            value={draftEnd}
            min={draftStart || undefined}
            onChange={(e) => setDraftEnd(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && applyCustom()}
            aria-label="To date"
            className="bg-transparent text-gray-900 text-xs font-bold focus:outline-none cursor-pointer"
          />
        </div>
        <button
          type="button"
          onClick={applyCustom}
          disabled={!draftValid || !draftChanged}
          className="px-3.5 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 disabled:bg-gray-200 disabled:text-gray-400 text-white text-xs font-extrabold transition-all active:scale-95"
        >
          Apply
        </button>

        <span className="text-xs font-semibold min-w-[6rem]" aria-live="polite">
          {loading ? (
            <span className="text-purple-700 flex items-center gap-1">
              <RefreshCw className="w-3 h-3 animate-spin" /> Loading…
            </span>
          ) : error ? (
            <span className="text-red-600 flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5" /> Couldn&apos;t load.
              {onRetry && (
                <button type="button" onClick={onRetry} className="underline font-extrabold">
                  Retry
                </button>
              )}
            </span>
          ) : (
            summary && <span className="text-gray-500">{summary}</span>
          )}
        </span>
      </div>
    </div>
  );
};
