import React from 'react';
import { useAuth } from '@/context/AuthContext';
import { ShoppingBag, Bike, ShieldCheck, Wallet, Compass, HeartHandshake, Calculator } from 'lucide-react';
import { hapticFeedback } from '@/lib/native';

interface BottomNavProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({ activeTab, setActiveTab }) => {
  const { user, activeMode } = useAuth();

  if (!user) return null;

  const isDedicatedHelper = user.isHelper && activeMode === 'helper' && user.helperType === 'dedicated';
  const isCustomerMode = activeMode === 'customer';

  const handleTabChange = (tab: string) => {
    if (tab === activeTab) return;
    // Native haptic feedback on tab switch
    hapticFeedback('selection');
    setActiveTab(tab);
  };

  const tabClass = (isActive: boolean, color: 'emerald' | 'purple' = 'emerald') =>
    [
      'relative flex flex-col items-center space-y-1 py-1 px-3 rounded-2xl transition-all duration-200 tap-spring',
      'min-w-[52px]',
      isActive
        ? color === 'purple'
          ? 'text-purple-700 font-bold scale-105'
          : 'text-emerald-700 font-bold scale-105'
        : 'text-gray-400 hover:text-gray-600 active:scale-95',
    ].join(' ');

  return (
    <nav
      className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[720px] z-[10005] bg-white/95 backdrop-blur-md border-t border-gray-100 pt-2 shadow-xl"
      style={{
        // iPhone home indicator safe area
        paddingBottom: 'max(8px, env(safe-area-inset-bottom))',
      }}
    >
      <div className="max-w-xl mx-auto flex items-center justify-around px-2">
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



        {/* Helper Center — visible to customer mode users */}
        {isCustomerMode && (
          <button
            id="nav-tab-helper-center"
            onClick={() => handleTabChange('helper_center')}
            className={tabClass(activeTab === 'helper_center')}
            aria-label="Help Center"
          >
            <HeartHandshake className="w-5 h-5" />
            <span className="text-[11px] whitespace-nowrap">Help Center</span>
            {activeTab === 'helper_center' && (
              <span className="absolute bottom-0 w-1 h-1 rounded-full bg-emerald-600" />
            )}
          </button>
        )}

        {/* Explore Tab (dedicated helpers only) */}
        {isDedicatedHelper && (
          <button
            id="nav-tab-explore"
            onClick={() => handleTabChange('explore')}
            className={tabClass(activeTab === 'explore')}
            aria-label="Explore"
          >
            <Compass className="w-5 h-5" />
            <span className="text-[11px]">Explore</span>
            {activeTab === 'explore' && (
              <span className="absolute bottom-0 w-1 h-1 rounded-full bg-emerald-600" />
            )}
          </button>
        )}

        {/* Wallet Tab (helpers only) */}
        {user.isHelper && activeMode === 'helper' && (
          <button
            id="nav-tab-wallet"
            onClick={() => handleTabChange('wallet')}
            className={tabClass(activeTab === 'wallet')}
            aria-label="Wallet"
          >
            <Wallet className="w-5 h-5" />
            <span className="text-[11px]">Wallet</span>
            {activeTab === 'wallet' && (
              <span className="absolute bottom-0 w-1 h-1 rounded-full bg-emerald-600" />
            )}
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
            {activeTab === 'admin_panel' && (
              <span className="absolute bottom-0 w-1 h-1 rounded-full bg-purple-600" />
            )}
          </button>
        )}

        {/* Fee Details Tab — Last (rightmost) */}
        <button
          id="nav-tab-fee-details"
          onClick={() => handleTabChange('fee_details')}
          className={tabClass(activeTab === 'fee_details')}
          aria-label="Fee Details"
        >
          <Calculator className="w-5 h-5" />
          <span className="text-[11px] whitespace-nowrap">Fee Details</span>
          {activeTab === 'fee_details' && (
            <span className="absolute bottom-0 w-1 h-1 rounded-full bg-emerald-600" />
          )}
        </button>
      </div>
    </nav>
  );
};

