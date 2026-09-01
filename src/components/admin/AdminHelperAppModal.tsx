'use client';

import React, { useState, useEffect } from 'react';
import { HelperApplication, UserProfile } from '@/types';
import { fallbackStore } from '@/lib/firebase';
import { useModal } from '../CustomModal';
import { X, User, Phone, Mail, Award, CheckCircle, Search } from 'lucide-react';

interface AdminHelperAppModalProps {
  application?: HelperApplication | null;
  users: UserProfile[];
  onClose: () => void;
  onSaved: () => void;
}

export const AdminHelperAppModal: React.FC<AdminHelperAppModalProps> = ({
  application,
  users,
  onClose,
  onSaved,
}) => {
  const { showAlert } = useModal();
  const isEdit = !!application;

  const [userId, setUserId] = useState(application?.userId || '');
  const [searchQuery, setSearchQuery] = useState('');
  const [legalName, setLegalName] = useState(application?.legalName || '');
  const [nid, setNid] = useState(application?.nid || '');
  const [email, setEmail] = useState(application?.email || '');
  const [whatsapp, setWhatsapp] = useState(application?.whatsapp || '');
  const [fbProfile, setFbProfile] = useState(application?.fbProfile || '');
  const [hasSmartphone, setHasSmartphone] = useState(application?.hasSmartphone ?? true);
  const [hasCycle, setHasCycle] = useState(application?.hasCycle ?? false);
  const [hasBike, setHasBike] = useState(application?.hasBike ?? false);
  const [status, setStatus] = useState<HelperApplication['status']>(application?.status || 'PENDING');
  const [selectedUserObj, setSelectedUserObj] = useState<UserProfile | null>(null);
  const [isSearchingUser, setIsSearchingUser] = useState<boolean>(false);
  const [searchResults, setSearchResults] = useState<UserProfile[]>([]);

  // Search users directly from server on query entry
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setIsSearchingUser(false);
      return;
    }

    setIsSearchingUser(true);
    const timer = setTimeout(async () => {
      try {
        const serverUsersList = await fallbackStore.getAllUsers();
        const q = searchQuery.toLowerCase().trim();
        const matched = serverUsersList.filter((u) => {
          if (!u) return false;
          return (
            (u.displayName && u.displayName.toLowerCase().includes(q)) ||
            (u.email && u.email.toLowerCase().includes(q)) ||
            (u.alternativePhone && u.alternativePhone.toLowerCase().includes(q)) ||
            (u.uid && u.uid.toLowerCase().includes(q))
          );
        }).slice(0, 30);
        setSearchResults(matched);
      } catch (err) {
        console.error('Error searching server users:', err);
      } finally {
        setIsSearchingUser(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // If a user is chosen, prefill email and name from their profile
  useEffect(() => {
    if (!isEdit && userId) {
      const uObj = selectedUserObj || users.find((u) => u.uid === userId);
      if (uObj) {
        setSelectedUserObj(uObj);
        setEmail(uObj.email || '');
        setLegalName(uObj.displayName || '');
        setWhatsapp(uObj.alternativePhone || '');
      }
    }
  }, [userId, isEdit, users, selectedUserObj]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!userId) {
      showAlert('Error', 'Please select a registered user profile.', 'error');
      return;
    }

    if (!legalName.trim() || !nid.trim() || !whatsapp.trim()) {
      showAlert('Error', 'Legal Name, NID #, and WhatsApp are required fields.', 'error');
      return;
    }

    const selectedUser = users.find((u) => u.uid === userId);
    const uName = selectedUser?.displayName || 'User';

    if (isEdit && application) {
      await fallbackStore.updateHelperApp(application.id, {
        legalName: legalName.trim(),
        nid: nid.trim(),
        email: email.trim(),
        whatsapp: whatsapp.trim(),
        fbProfile: fbProfile.trim(),
        hasSmartphone,
        hasCycle,
        hasBike,
        status,
      });
      showAlert('Success', 'Helper application updated successfully.', 'success');
    } else {
      // Check if user already has an application
      const existingApp = Array.from(fallbackStore.helperApplications.values()).find(
        (a) => a.userId === userId
      );
      if (existingApp) {
        showAlert('Error', 'This user already has a helper application record.', 'error');
        return;
      }

      const newApp: HelperApplication = {
        id: `app-${Date.now()}`,
        userId,
        userName: uName,
        legalName: legalName.trim(),
        nid: nid.trim(),
        email: email.trim(),
        whatsapp: whatsapp.trim(),
        fbProfile: fbProfile.trim(),
        hasSmartphone,
        hasCycle,
        hasBike,
        applicationType: 'dedicated',
        status,
        createdAt: new Date().toISOString(),
      };

      await fallbackStore.addHelperAppAdmin(newApp);
      showAlert('Success', 'Helper application created successfully.', 'success');
    }

    onSaved();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="p-5 border-b border-gray-100 flex items-center justify-between bg-purple-950 text-white">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-2xl bg-purple-800/60 border border-purple-700">
              <Award className="w-5 h-5 text-purple-200" />
            </div>
            <div>
              <h3 className="font-extrabold text-base">{isEdit ? 'Edit Helper Application' : 'Create Helper Application'}</h3>
              <p className="text-xs text-purple-200">
                {isEdit ? `Application ID: #${application.id}` : 'Fill in registration details for a helper'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-2xl bg-white/10 hover:bg-white/20 text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Searchable User Profile Selector (Only on create) */}
          <div>
            <label className="text-xs font-bold text-gray-700 block mb-1.5">
              Select User Profile *
            </label>
            {isEdit ? (
              <div className="w-full p-3.5 rounded-2xl bg-gray-50 border border-gray-150 text-sm font-semibold text-gray-700 flex items-center space-x-2">
                <User className="w-4 h-4 text-gray-400" />
                <span>{application.userName} ({application.userId})</span>
              </div>
            ) : (() => {
              const selectedUser = users.find((u) => u.uid === userId);

              return (
                <div className="space-y-2">
                  {selectedUser ? (
                    <div className="p-3 bg-purple-50 rounded-2xl border border-purple-200 flex items-center justify-between">
                      <div className="flex items-center space-x-2.5 overflow-hidden">
                        <div className="p-2 bg-purple-900 text-white rounded-xl">
                          <User className="w-4 h-4" />
                        </div>
                        <div className="overflow-hidden">
                          <div className="font-extrabold text-xs text-purple-950 truncate">
                            {selectedUser.displayName || 'No Name'}
                          </div>
                          <div className="text-[11px] text-purple-700 font-mono truncate">
                            {selectedUser.email || selectedUser.alternativePhone || selectedUser.uid}
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setUserId('');
                          setSearchQuery('');
                        }}
                        className="p-1.5 rounded-xl bg-purple-100 hover:bg-purple-200 text-purple-900 font-extrabold text-xs shrink-0 transition-colors"
                      >
                        Change User
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="relative">
                        <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-3.5" />
                        <input
                          type="text"
                          placeholder="Search by user name, email, phone or user ID..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="w-full pl-10 pr-4 py-3 rounded-2xl border border-gray-200 text-xs font-semibold bg-white focus:border-purple-600 focus:ring-4 focus:ring-purple-600/10 outline-none"
                        />
                      </div>

                      <div className="max-h-44 overflow-y-auto rounded-2xl border border-gray-200 bg-white p-1 space-y-1 divide-y divide-gray-50">
                        {isSearchingUser ? (
                          <p className="text-xs text-purple-700 font-bold py-3 text-center animate-pulse">
                            Searching users from server...
                          </p>
                        ) : !searchQuery.trim() ? (
                          <p className="text-xs text-gray-500 py-3 text-center">
                            Type user name, email, phone or ID to search server...
                          </p>
                        ) : searchResults.length === 0 ? (
                          <p className="text-xs text-rose-600 py-3 text-center font-semibold">
                            No matching user found on server
                          </p>
                        ) : (
                          searchResults.map((u) => (
                            <button
                              key={u.uid}
                              type="button"
                              onClick={() => {
                                setUserId(u.uid);
                                setSelectedUserObj(u);
                                setSearchQuery('');
                              }}
                              className="w-full text-left p-2.5 rounded-xl hover:bg-purple-50 transition-colors flex items-center justify-between"
                            >
                              <div className="overflow-hidden">
                                <div className="font-extrabold text-xs text-gray-900 truncate">
                                  {u.displayName || 'Unnamed User'}
                                </div>
                                <div className="text-[11px] text-gray-500 font-mono truncate">
                                  {u.email ? `${u.email} • ` : ''}{u.alternativePhone ? `${u.alternativePhone} • ` : ''}ID: {u.uid}
                                </div>
                              </div>
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-900 shrink-0">
                                Select
                              </span>
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>

          {/* Legal Name */}
          <div>
            <label className="text-xs font-bold text-gray-700 block mb-1.5">
              Legal Name *
            </label>
            <input
              type="text"
              value={legalName}
              onChange={(e) => setLegalName(e.target.value)}
              className="w-full p-3.5 rounded-2xl border border-gray-200 text-sm font-semibold outline-none focus:border-purple-600 focus:ring-4 focus:ring-purple-600/10"
              placeholder="Full legal name (matches NID)"
              required
            />
          </div>

          {/* NID # */}
          <div>
            <label className="text-xs font-bold text-gray-700 block mb-1.5">
              NID Number *
            </label>
            <input
              type="text"
              value={nid}
              onChange={(e) => setNid(e.target.value)}
              className="w-full p-3.5 rounded-2xl border border-gray-200 text-sm font-semibold outline-none focus:border-purple-600 focus:ring-4 focus:ring-purple-600/10"
              placeholder="National ID Card number"
              required
            />
          </div>

          {/* Email */}
          <div>
            <label className="text-xs font-bold text-gray-700 block mb-1.5">
              Email Address
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full p-3.5 rounded-2xl border border-gray-200 text-sm font-semibold outline-none focus:border-purple-600 focus:ring-4 focus:ring-purple-600/10"
              placeholder="helper@example.com"
            />
          </div>

          {/* WhatsApp */}
          <div>
            <label className="text-xs font-bold text-gray-700 block mb-1.5">
              WhatsApp Number *
            </label>
            <input
              type="tel"
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
              className="w-full p-3.5 rounded-2xl border border-gray-200 text-sm font-semibold outline-none focus:border-purple-600 focus:ring-4 focus:ring-purple-600/10"
              placeholder="01xxxxxxxxx"
              required
            />
          </div>

          {/* FB Profile */}
          <div>
            <label className="text-xs font-bold text-gray-700 block mb-1.5">
              Facebook Profile URL
            </label>
            <input
              type="text"
              value={fbProfile}
              onChange={(e) => setFbProfile(e.target.value)}
              className="w-full p-3.5 rounded-2xl border border-gray-200 text-sm font-semibold outline-none focus:border-purple-600 focus:ring-4 focus:ring-purple-600/10"
              placeholder="facebook.com/profile"
            />
          </div>

          {/* Assets Checkbox Checklist */}
          <div>
            <label className="text-xs font-bold text-gray-700 block mb-1.5">
              Vehicles & Assets
            </label>
            <div className="flex flex-wrap gap-4 mt-2">
              <label className="flex items-center space-x-2 text-xs font-bold text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={hasSmartphone}
                  onChange={(e) => setHasSmartphone(e.target.checked)}
                  className="rounded border-gray-300 text-purple-600 focus:ring-purple-500 h-4 w-4"
                />
                <span>Has Smartphone</span>
              </label>
              <label className="flex items-center space-x-2 text-xs font-bold text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={hasCycle}
                  onChange={(e) => setHasCycle(e.target.checked)}
                  className="rounded border-gray-300 text-purple-600 focus:ring-purple-500 h-4 w-4"
                />
                <span>Has Cycle</span>
              </label>
              <label className="flex items-center space-x-2 text-xs font-bold text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={hasBike}
                  onChange={(e) => setHasBike(e.target.checked)}
                  className="rounded border-gray-300 text-purple-600 focus:ring-purple-500 h-4 w-4"
                />
                <span>Has Motorbike</span>
              </label>
            </div>
          </div>

          {/* Application Status */}
          <div>
            <label className="text-xs font-bold text-gray-700 block mb-1.5">
              Application Status
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as any)}
              className="w-full p-3.5 rounded-2xl border border-gray-200 text-sm font-semibold bg-white focus:border-purple-600 focus:ring-4 focus:ring-purple-600/10 outline-none"
            >
              <option value="PENDING">PENDING</option>
              <option value="APPROVED">APPROVED</option>
              <option value="REJECTED">REJECTED</option>
            </select>
            <p className="text-[11px] text-gray-400 mt-1">
              Approving here automatically updates the user's role and grants helper privileges.
            </p>
          </div>

          {/* Form Actions */}
          <div className="pt-4 flex justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="py-3 px-5 rounded-2xl bg-gray-200 hover:bg-gray-300 font-extrabold text-xs text-gray-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="py-3 px-5 rounded-2xl bg-purple-900 hover:bg-purple-950 text-white font-extrabold text-xs shadow-md transition-colors"
            >
              {isEdit ? 'Update Application' : 'Create Application'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
