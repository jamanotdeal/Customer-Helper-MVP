'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { fallbackStore } from '@/lib/firebase';
import { AppNotification } from '@/types';
import { X, Bell } from 'lucide-react';

interface NotificationDrawerProps {
  onClose: () => void;
  onSelectOrder?: (orderId: string) => void;
}

export const NotificationDrawer: React.FC<NotificationDrawerProps> = ({ onClose, onSelectOrder }) => {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [visibleCount, setVisibleCount] = useState(10);

  // The ids that were unread when the drawer opened. Kept in a ref so the "new"
  // highlight survives the mark-as-read below — the user still sees what arrived
  // since last time, but nothing is left to re-announce on the next launch.
  const wasUnread = useRef<Set<string>>(new Set());

  useEffect(() => {
    const syncNotifs = () => {
      if (user) {
        const list = [...(fallbackStore.notifications.get(user.uid) || [])];
        list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setNotifications(list);
      }
    };
    syncNotifs();
    const unsub = fallbackStore.subscribe(syncNotifs);
    return () => {
      unsub();
    };
  }, [user]);

  // Opening the drawer IS seeing them. Marking read here is what stops an
  // already-viewed notification from being announced again on the next app
  // launch — the read state is persisted per device, so it survives a restart.
  useEffect(() => {
    if (!user) return;
    const uid = user.uid;
    const markSeen = () => {
      (fallbackStore.notifications.get(uid) || []).forEach((n) => {
        if (!n.read) wasUnread.current.add(n.id);
      });
      fallbackStore.markNotificationsRead(uid);
    };
    markSeen();
    // Again on close, so anything that arrived while the drawer was open —
    // including the first snapshot, if it landed after mount — is covered too.
    return markSeen;
  }, [user]);

  const visibleNotifications = notifications.slice(0, visibleCount);
  const hasMore = notifications.length > visibleCount;

  return (
    <div
      className="fixed inset-0 z-[10010] bg-black/50 backdrop-blur-xs flex justify-end"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm bg-white h-screen h-[100dvh] max-h-screen max-h-[100dvh] shadow-2xl px-5 flex flex-col justify-between overflow-y-auto animate-in slide-in-from-right duration-200"
        style={{
          paddingTop: 'max(20px, calc(env(safe-area-inset-top) + 12px))',
          paddingBottom: 'max(20px, calc(env(safe-area-inset-bottom) + 12px))',
        }}
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
              {/* No "Read all" button: opening the drawer marks everything read. */}
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
              {visibleNotifications.map((n) => (
                <div
                  key={n.id}
                  onClick={() => {
                    if (user) fallbackStore.markNotificationRead(user.uid, n.id);
                    if (n.orderId && onSelectOrder) {
                      onSelectOrder(n.orderId);
                      onClose();
                    }
                  }}
                  className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
                    n.read && !wasUnread.current.has(n.id)
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

              {hasMore && (
                <button
                  type="button"
                  onClick={() => setVisibleCount((prev) => prev + 10)}
                  className="w-full py-3 rounded-2xl border border-gray-200 hover:bg-gray-50 text-xs font-extrabold text-emerald-700 bg-white transition-all shadow-xs active:scale-98 flex items-center justify-center space-x-1"
                >
                  <span>Load More Notifications</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
