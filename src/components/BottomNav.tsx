'use client';

import React from 'react';
import { useAuth } from '@/context/AuthContext';
import { ShoppingBag, Bike, ShieldCheck, Wallet, UserCheck } from 'lucide-react';

interface BottomNavProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({ activeTab, setActiveTab }) => {
  const { user, activeMode } = useAuth();

  if (!user) return null;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-gray-100 py-2 px-4 shadow-lg">
      <div className="max-w-md mx-auto flex items-center justify-around">
        {/* Customer Tab */}
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

        {/* Wallet Tab (Available if user is Helper or Has Helper Role) */}
        {user.isHelper && (
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

        {/* Admin Tab (if admin) */}
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
