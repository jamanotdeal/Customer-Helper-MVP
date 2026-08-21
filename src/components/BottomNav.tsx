'use client';

import React from 'react';
import { useAuth } from '@/context/AuthContext';
import { ShoppingBag, ShieldCheck, Wallet, Compass, HeartHandshake } from 'lucide-react';

interface BottomNavProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({ activeTab, setActiveTab }) => {
  const { user, activeMode } = useAuth();

  if (!user) return null;

  const isDedicatedHelper = user.isHelper && activeMode === 'helper' && user.helperType === 'dedicated';
  const isCustomerMode = activeMode === 'customer';

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-[10005] bg-white/95 backdrop-blur-md border-t border-gray-100 py-2 px-4 shadow-lg">
      <div className="max-w-md mx-auto flex items-center justify-around">
        {/* Customer / Request Tab */}
        <button
          onClick={() => setActiveTab('request')}
          className={`flex flex-col items-center space-y-1 py-1 px-3 rounded-2xl transition-all ${
            activeTab === 'request'
              ? 'text-emerald-700 font-bold scale-105'
              : 'text-gray-400 hover:text-gray-600'
          }`}
        >
          <ShoppingBag className="w-5 h-5" />
          <span className="text-[11px]">Request</span>
        </button>

        {/* Helper Center — visible to customer mode users */}
        {isCustomerMode && (
          <button
            onClick={() => setActiveTab('helper_center')}
            className={`flex flex-col items-center space-y-1 py-1 px-3 rounded-2xl transition-all ${
              activeTab === 'helper_center'
                ? 'text-emerald-700 font-bold scale-105'
                : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            <HeartHandshake className="w-5 h-5" />
            <span className="text-[11px]">Help Center</span>
          </button>
        )}

        {/* Explore Tab (dedicated helpers only) */}
        {isDedicatedHelper && (
          <button
            onClick={() => setActiveTab('explore')}
            className={`flex flex-col items-center space-y-1 py-1 px-3 rounded-2xl transition-all ${
              activeTab === 'explore'
                ? 'text-emerald-700 font-bold scale-105'
                : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            <Compass className="w-5 h-5" />
            <span className="text-[11px]">Explore</span>
          </button>
        )}

        {/* Wallet Tab (helper mode only) */}
        {user.isHelper && activeMode === 'helper' && (
          <button
            onClick={() => setActiveTab('wallet')}
            className={`flex flex-col items-center space-y-1 py-1 px-3 rounded-2xl transition-all ${
              activeTab === 'wallet'
                ? 'text-emerald-700 font-bold scale-105'
                : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            <Wallet className="w-5 h-5" />
            <span className="text-[11px]">Wallet</span>
          </button>
        )}

        {/* Admin Tab */}
        {user.isAdmin && (
          <button
            onClick={() => setActiveTab('admin_panel')}
            className={`flex flex-col items-center space-y-1 py-1 px-3 rounded-2xl transition-all ${
              activeTab === 'admin_panel'
                ? 'text-purple-700 font-bold scale-105'
                : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            <ShieldCheck className="w-5 h-5" />
            <span className="text-[11px]">Admin</span>
          </button>
        )}
      </div>
    </nav>
  );
};
