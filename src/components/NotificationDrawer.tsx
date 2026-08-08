'use client';

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { fallbackStore } from '@/lib/firebase';
import { AppNotification } from '@/types';
import { X, Bell, CheckCheck } from 'lucide-react';

interface NotificationDrawerProps {
  onClose: () => void;
  onSelectOrder?: (orderId: string) => void;
}

export const NotificationDrawer: React.FC<NotificationDrawerProps> = ({ onClose, onSelectOrder }) => {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  useEffect(() => {
    const syncNotifs = () => {
      if (user) {
        const list = fallbackStore.notifications.get(user.uid) || [];
        setNotifications([...list]);
      }
    };
    syncNotifs();
    const unsub = fallbackStore.subscribe(syncNotifs);
    return () => {
      unsub();
    };
  }, [user]);

  const markAllRead = () => {
    if (!user) return;
    fallbackStore.markNotificationsRead(user.uid);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex justify-end"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm bg-white h-full shadow-2xl p-5 flex flex-col justify-between overflow-y-auto animate-in slide-in-from-right duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <div className="flex items-center justify-between pb-4 border-b border-gray-100 mb-4">
            <div className="flex items-center space-x-2">
              <div className="p-2 rounded-xl bg-emerald-100 text-emerald-800">
                <Bell className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-gray-900 text-base">Notifications</h3>
            </div>

            <div className="flex items-center space-x-1">
              {notifications.some((n) => !n.read) && (
                <button
                  onClick={markAllRead}
                  className="p-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 rounded-xl flex items-center space-x-1"
                >
                  <CheckCheck className="w-4 h-4" />
                  <span>Read all</span>
                </button>
              )}
              <button
                onClick={onClose}
                className="p-2 rounded-xl bg-gray-100 text-gray-500 hover:bg-gray-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {notifications.length === 0 ? (
            <div className="py-16 text-center">
              <Bell className="w-12 h-12 text-gray-300 mx-auto mb-2" />
              <p className="text-sm font-medium text-gray-500">এখন কোনো নতুন notification নেই।</p>
            </div>
          ) : (
            <div className="space-y-3">
              {notifications.map((n) => (
                <div
                  key={n.id}
                  onClick={() => {
                    if (n.orderId && onSelectOrder) {
                      onSelectOrder(n.orderId);
                      onClose();
                    }
                  }}
                  className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
                    n.read
                      ? 'border-gray-100 bg-gray-50/50 text-gray-600'
                      : 'border-emerald-200 bg-emerald-50/40 text-gray-900 shadow-sm'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-xs leading-tight">{n.title}</span>
                    <span className="text-[10px] text-gray-400">
                      {new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <p className="text-xs text-gray-600 leading-snug">{n.body}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
