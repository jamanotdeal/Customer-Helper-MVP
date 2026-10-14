'use client';

import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface LifetimeDataNoticeProps {
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  className?: string;
}

/** Says that wallet balances / lifetime totals on screen are still incomplete. */
export const LifetimeDataNotice: React.FC<LifetimeDataNoticeProps> = ({ loading, error, onRetry, className = '' }) => {
  if (error) {
    return (
      <div className={`px-4 py-2.5 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold flex items-center gap-2 ${className}`}>
        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
        <span>Couldn&apos;t load the full order history — balances and totals below may be incomplete.</span>
        <button type="button" onClick={onRetry} className="underline font-extrabold shrink-0">
          Retry
        </button>
      </div>
    );
  }
  if (!loading) return null;
  return (
    <div className={`px-4 py-2.5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800 text-xs font-semibold flex items-center gap-2 ${className}`}>
      <RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0" />
      <span>Loading full order history — balances and totals below will update when it finishes.</span>
    </div>
  );
};
