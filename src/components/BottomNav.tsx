'use client';

import React from 'react';
import { useAuth } from '@/context/AuthContext';
import { ShoppingBag, Bike, ShieldCheck, Wallet } from 'lucide-react';
import { hapticFeedback } from '@/lib/native';

interface BottomNavProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({ activeTab, setActiveTab }) => {
  const { user } = useAuth();

  if (!user) return null;

  const handleTabChange = (tab: string) => {
    if (tab === activeTab) return;
    // Native haptic feedback on tab switch
    hapticFeedback('selection');
    setActiveTab(tab);
  };

  const tabClass = (isActive: boolean, color: 'emerald' | 'purple' = 'emerald') =>
    [
      'flex flex-col items-center space-y-1 py-1 px-4 rounded-2xl transition-all duration-200 tap-spring',
      'min-w-[56px]',
      isActive
        ? color === 'purple'
          ? 'text-purple-700 font-bold scale-105'
          : 'text-emerald-700 font-bold scale-105'
        : 'text-gray-400 hover:text-gray-600 active:scale-95',
    ].join(' ');

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 bg-white/97 backdrop-blur-md border-t border-gray-100 pt-2 shadow-lg"
      style={{
        // iPhone home indicator safe area
        paddingBottom: 'max(8px, env(safe-area-inset-bottom))',
      }}
    >
      <div className="max-w-md mx-auto flex items-center justify-around px-4">

        {/* Customer / Request Tab */}
        <button
          id="nav-tab-request"
          onClick={() => handleTabChange('request')}
          className={tabClass(activeTab === 'request')}
          aria-label="Request"
        >
          <ShoppingBag className="w-5 h-5" />
          <span className="text-[11px]">Request</span>
          {activeTab === 'request' && (
            <span className="absolute bottom-0 w-1 h-1 rounded-full bg-emerald-600" />
          )}
        </button>

        {/* Wallet Tab (helpers only) */}
        {user.isHelper && (
          <button
            id="nav-tab-wallet"
            onClick={() => handleTabChange('wallet')}
            className={tabClass(activeTab === 'wallet')}
            aria-label="Wallet"
          >
            <Wallet className="w-5 h-5" />
            <span className="text-[11px]">Wallet</span>
          </button>
        )}

        {/* Admin Tab (admin only) */}
        {user.isAdmin && (
          <button
            id="nav-tab-admin"
            onClick={() => handleTabChange('admin_panel')}
            className={tabClass(activeTab === 'admin_panel', 'purple')}
            aria-label="Admin"
          >
            <ShieldCheck className="w-5 h-5" />
            <span className="text-[11px]">Admin</span>
          </button>
        )}

      </div>
    </nav>
  );
};
