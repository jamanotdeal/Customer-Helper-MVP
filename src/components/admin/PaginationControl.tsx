'use client';

import React from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

interface PaginationControlProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  pageSizeOptions?: number[];
  colorScheme?: 'purple' | 'indigo' | 'emerald';
  className?: string;
}

export const PaginationControl: React.FC<PaginationControlProps> = ({
  currentPage,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 25, 30, 50, 100],
  colorScheme = 'purple',
  className = '',
}) => {
  if (totalItems === 0) return null;

  const startItem = (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, totalItems);

  // Helper to generate page numbers with ellipsis
  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    const maxVisible = 5;

    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (currentPage > 3) pages.push('...');

      const start = Math.max(2, currentPage - 1);
      const end = Math.min(totalPages - 1, currentPage + 1);

      for (let i = start; i <= end; i++) {
        if (!pages.includes(i)) pages.push(i);
      }

      if (currentPage < totalPages - 2) pages.push('...');
      if (!pages.includes(totalPages)) pages.push(totalPages);
    }

    return pages;
  };

  const activeBtnClass =
    colorScheme === 'indigo'
      ? 'bg-indigo-900 text-white shadow-md'
      : colorScheme === 'emerald'
      ? 'bg-emerald-700 text-white shadow-md'
      : 'bg-purple-900 text-white shadow-md';

  const focusRingClass =
    colorScheme === 'indigo'
      ? 'focus:ring-indigo-500/20'
      : colorScheme === 'emerald'
      ? 'focus:ring-emerald-500/20'
      : 'focus:ring-purple-500/20';

  return (
    <div className={`flex flex-col sm:flex-row items-center justify-between gap-4 py-3 px-5 bg-white border-t border-gray-100 rounded-b-3xl text-xs ${className}`}>
      {/* Items Range & Page Size Picker */}
      <div className="flex items-center space-x-4 text-gray-500 font-medium">
        <span>
          Showing <strong className="text-gray-900">{startItem}</strong> to{' '}
          <strong className="text-gray-900">{endItem}</strong> of{' '}
          <strong className="text-gray-900">{totalItems.toLocaleString()}</strong> items
        </span>

        <div className="flex items-center space-x-2">
          <label htmlFor="pageSizeSelect" className="text-gray-400 font-bold">Per page:</label>
          <select
            id="pageSizeSelect"
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className={`bg-gray-50 border border-gray-200 rounded-xl px-2.5 py-1 text-xs font-bold text-gray-800 focus:outline-none focus:ring-2 ${focusRingClass}`}
          >
            {pageSizeOptions.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Page Navigation Buttons */}
      <div className="flex items-center space-x-1">
        <button
          onClick={() => onPageChange(1)}
          disabled={currentPage === 1}
          className="p-1.5 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:hover:bg-transparent transition-all"
          title="First Page"
        >
          <ChevronsLeft className="w-4 h-4" />
        </button>

        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className="p-1.5 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:hover:bg-transparent transition-all"
          title="Previous Page"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        <div className="flex items-center space-x-1 px-1">
          {getPageNumbers().map((pg, idx) =>
            typeof pg === 'number' ? (
              <button
                key={idx}
                onClick={() => onPageChange(pg)}
                className={`w-8 h-8 rounded-xl text-xs font-extrabold transition-all ${
                  currentPage === pg
                    ? activeBtnClass
                    : 'text-gray-700 hover:bg-gray-100 border border-transparent'
                }`}
              >
                {pg}
              </button>
            ) : (
              <span key={idx} className="px-1 text-gray-400 font-extrabold">
                ...
              </span>
            )
          )}
        </div>

        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          className="p-1.5 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:hover:bg-transparent transition-all"
          title="Next Page"
        >
          <ChevronRight className="w-4 h-4" />
        </button>

        <button
          onClick={() => onPageChange(totalPages)}
          disabled={currentPage === totalPages}
          className="p-1.5 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:hover:bg-transparent transition-all"
          title="Last Page"
        >
          <ChevronsRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
