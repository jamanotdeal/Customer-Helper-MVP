'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Shop } from '@/types';
import {
  MoreVertical,
  DollarSign,
  Package,
  Globe,
  Edit,
  Power,
  Ban,
  CheckCircle2,
  Trash2,
} from 'lucide-react';

interface ShopActionDropdownProps {
  shop: Shop;
  isStoreActive: boolean;
  onDisburse: () => void;
  onToggleBlock: () => void;
  onToggleActive: () => void;
  onManageItems: () => void;
  onViewDetails: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export const ShopActionDropdown: React.FC<ShopActionDropdownProps> = ({
  shop,
  isStoreActive,
  onDisburse,
  onToggleBlock,
  onToggleActive,
  onManageItems,
  onViewDetails,
  onEdit,
  onDelete,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        className="w-8 h-8 rounded-xl bg-gray-100 hover:bg-purple-100 hover:text-purple-800 text-gray-600 transition-all flex items-center justify-center cursor-pointer shadow-xs active:scale-95"
        title="More actions"
      >
        <MoreVertical className="w-4 h-4" />
      </button>

      {isOpen && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="origin-top-right absolute right-0 mt-1.5 w-56 rounded-2xl shadow-xl bg-white border border-gray-100 divide-y divide-gray-100 z-50 animate-in fade-in duration-150 py-1"
        >
          <div className="py-1">
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                onDisburse();
              }}
              className="w-full text-left px-3.5 py-2 text-xs font-bold text-gray-700 hover:bg-emerald-50 hover:text-emerald-900 flex items-center space-x-2.5 transition-colors cursor-pointer"
            >
              <DollarSign className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Disburse Payout (পেমেন্ট)</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                onManageItems();
              }}
              className="w-full text-left px-3.5 py-2 text-xs font-bold text-gray-700 hover:bg-indigo-50 hover:text-indigo-900 flex items-center space-x-2.5 transition-colors cursor-pointer"
            >
              <Package className="w-4 h-4 text-indigo-600 shrink-0" />
              <span>Manage Items (পণ্য)</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                onViewDetails();
              }}
              className="w-full text-left px-3.5 py-2 text-xs font-bold text-gray-700 hover:bg-purple-50 hover:text-purple-900 flex items-center space-x-2.5 transition-colors cursor-pointer"
            >
              <Globe className="w-4 h-4 text-purple-600 shrink-0" />
              <span>View Details (বিস্তারিত)</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                onEdit();
              }}
              className="w-full text-left px-3.5 py-2 text-xs font-bold text-gray-700 hover:bg-blue-50 hover:text-blue-900 flex items-center space-x-2.5 transition-colors cursor-pointer"
            >
              <Edit className="w-4 h-4 text-blue-600 shrink-0" />
              <span>Edit Store (সম্পাদনা)</span>
            </button>
          </div>

          <div className="py-1">
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                onToggleActive();
              }}
              className="w-full text-left px-3.5 py-2 text-xs font-bold text-gray-700 hover:bg-amber-50 hover:text-amber-900 flex items-center space-x-2.5 transition-colors cursor-pointer"
            >
              <Power className={`w-4 h-4 ${isStoreActive ? 'text-amber-600' : 'text-emerald-600'} shrink-0`} />
              <span>{isStoreActive ? 'Deactivate (দোকান বন্ধ)' : 'Activate (দোকান চালু)'}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                onToggleBlock();
              }}
              className={`w-full text-left px-3.5 py-2 text-xs font-bold flex items-center space-x-2.5 transition-colors cursor-pointer ${
                shop.isBlocked
                  ? 'text-emerald-700 hover:bg-emerald-50'
                  : 'text-rose-700 hover:bg-rose-50'
              }`}
            >
              {shop.isBlocked ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Unblock Store (আনব্লক)</span>
                </>
              ) : (
                <>
                  <Ban className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>Block Store (ব্লক)</span>
                </>
              )}
            </button>
          </div>

          <div className="py-1">
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                onDelete();
              }}
              className="w-full text-left px-3.5 py-2 text-xs font-bold text-red-600 hover:bg-red-50 flex items-center space-x-2.5 transition-colors cursor-pointer"
            >
              <Trash2 className="w-4 h-4 text-red-600 shrink-0" />
              <span>Delete Store (মুছে ফেলুন)</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
