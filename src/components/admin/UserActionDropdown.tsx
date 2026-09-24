'use client';

import React, { useState, useRef, useEffect } from 'react';
import { UserProfile } from '@/types';
import { MoreVertical, User, ShieldCheck, ShieldAlert, Ban, Trash2, CheckCircle2, Coins } from 'lucide-react';

interface UserActionDropdownProps {
  user: UserProfile;
  currentUser: UserProfile | null;
  onViewProfile: (userId: string) => void;
  onEditCoins?: (user: UserProfile) => void;
  onToggleAdmin: (user: UserProfile, makeAdmin: boolean) => void;
  onToggleSuperAdmin?: (user: UserProfile, makeSuperAdmin: boolean) => void;
  onToggleBlock: (user: UserProfile) => void;
  onDeleteUser: (user: UserProfile) => void;
}

export const UserActionDropdown: React.FC<UserActionDropdownProps> = ({
  user,
  currentUser,
  onViewProfile,
  onEditCoins,
  onToggleAdmin,
  onToggleSuperAdmin,
  onToggleBlock,
  onDeleteUser,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const isPrimarySuperAdmin = user.email && ['ajnasim72@gmail.com'].includes(user.email.trim().toLowerCase());

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
        className="p-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors flex items-center space-x-1 font-bold text-xs cursor-pointer"
      >
        <span>Actions</span>
        <MoreVertical className="w-3.5 h-3.5" />
      </button>

      {isOpen && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="origin-top-right absolute right-0 mt-2 w-56 rounded-2xl shadow-xl bg-white ring-1 ring-black/5 divide-y divide-gray-100 z-30 animate-in fade-in duration-150"
        >
          <div className="py-1">
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                onViewProfile(user.uid);
              }}
              className="w-full text-left px-4 py-2.5 text-xs font-bold text-gray-700 hover:bg-purple-50 hover:text-purple-900 flex items-center space-x-2 cursor-pointer"
            >
              <User className="w-4 h-4 text-purple-600" />
              <span>View Profile & History</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                if (onEditCoins) {
                  onEditCoins(user);
                } else {
                  onViewProfile(user.uid);
                }
              }}
              className="w-full text-left px-4 py-2 text-xs font-bold text-amber-950 hover:bg-amber-50 flex items-center justify-between cursor-pointer"
            >
              <div className="flex items-center space-x-2">
                <Coins className="w-4 h-4 text-amber-600" />
                <span>Edit Reward Coins</span>
              </div>
              <span className="px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-900 font-black text-[10px]">
                🪙 {user.coins || 0}
              </span>
            </button>

            {currentUser?.isSuperAdmin && user.uid !== currentUser.uid && (
              user.isSuperAdmin ? (
                !isPrimarySuperAdmin && onToggleSuperAdmin && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsOpen(false);
                      onToggleSuperAdmin(user, false);
                    }}
                    className="w-full text-left px-4 py-2.5 text-xs font-bold text-amber-800 hover:bg-amber-50 flex items-center space-x-2"
                  >
                    <ShieldAlert className="w-4 h-4 text-amber-600" />
                    <span>Demote to Normal Admin</span>
                  </button>
                )
              ) : user.isAdmin ? (
                <>
                  {onToggleSuperAdmin && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsOpen(false);
                        onToggleSuperAdmin(user, true);
                      }}
                      className="w-full text-left px-4 py-2.5 text-xs font-bold text-purple-700 hover:bg-purple-50 flex items-center space-x-2"
                    >
                      <ShieldCheck className="w-4 h-4 text-purple-600" />
                      <span>Promote to Super Admin</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setIsOpen(false);
                      onToggleAdmin(user, false);
                    }}
                    className="w-full text-left px-4 py-2.5 text-xs font-bold text-amber-700 hover:bg-amber-50 flex items-center space-x-2"
                  >
                    <ShieldAlert className="w-4 h-4 text-amber-600" />
                    <span>Remove Admin Role</span>
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setIsOpen(false);
                    onToggleAdmin(user, true);
                  }}
                  className="w-full text-left px-4 py-2.5 text-xs font-bold text-emerald-700 hover:bg-emerald-50 flex items-center space-x-2"
                >
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  <span>Promote to Admin</span>
                </button>
              )
            )}
          </div>

          <div className="py-1">
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                onToggleBlock(user);
              }}
              className={`w-full text-left px-4 py-2.5 text-xs font-bold flex items-center space-x-2 ${
                user.isBlocked
                  ? 'text-emerald-700 hover:bg-emerald-50'
                  : 'text-amber-700 hover:bg-amber-50'
              }`}
            >
              {user.isBlocked ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>Unblock User</span>
                </>
              ) : (
                <>
                  <Ban className="w-4 h-4 text-amber-600" />
                  <span>Block User</span>
                </>
              )}
            </button>

            {user.uid !== currentUser?.uid && !user.isSuperAdmin && (
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  onDeleteUser(user);
                }}
                className="w-full text-left px-4 py-2.5 text-xs font-bold text-red-600 hover:bg-red-50 flex items-center space-x-2"
              >
                <Trash2 className="w-4 h-4 text-red-600" />
                <span>Delete Account</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
