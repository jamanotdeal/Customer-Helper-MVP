'use client';

import React, { useState, useRef, useEffect } from 'react';
import { UserProfile } from '@/types';
import { MoreVertical, User, ShieldCheck, ShieldAlert, Ban, Trash2, CheckCircle2 } from 'lucide-react';

interface UserActionDropdownProps {
  user: UserProfile;
  currentUser: UserProfile | null;
  onViewProfile: (userId: string) => void;
  onToggleAdmin: (user: UserProfile, makeAdmin: boolean) => void;
  onToggleBlock: (user: UserProfile) => void;
  onDeleteUser: (user: UserProfile) => void;
}

export const UserActionDropdown: React.FC<UserActionDropdownProps> = ({
  user,
  currentUser,
  onViewProfile,
  onToggleAdmin,
  onToggleBlock,
  onDeleteUser,
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
        className="p-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors flex items-center space-x-1 font-bold text-xs"
      >
        <span>Actions</span>
        <MoreVertical className="w-3.5 h-3.5" />
      </button>

      {isOpen && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="origin-top-right absolute right-0 mt-2 w-48 rounded-2xl shadow-xl bg-white ring-1 ring-black/5 divide-y divide-gray-100 z-30 animate-in fade-in duration-150"
        >
          <div className="py-1">
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                onViewProfile(user.uid);
              }}
              className="w-full text-left px-4 py-2.5 text-xs font-bold text-gray-700 hover:bg-purple-50 hover:text-purple-900 flex items-center space-x-2"
            >
              <User className="w-4 h-4 text-purple-600" />
              <span>View Profile & History</span>
            </button>

            {currentUser?.isSuperAdmin && user.uid !== currentUser.uid && !user.isSuperAdmin && (
              user.isAdmin ? (
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
