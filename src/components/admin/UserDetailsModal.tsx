'use client';

import React, { useState } from 'react';
import { UserProfile, Order } from '@/types';
import { fallbackStore } from '@/lib/firebase';
import { useModal } from '../CustomModal';
import {
  X,
  User,
  Phone,
  Mail,
  Shield,
  ShieldAlert,
  Ban,
  Trash2,
  Tag,
  Plus,
  Check,
  ShoppingBag,
  Bike,
  Clock,
  ChevronRight,
  Wallet,
  AlertCircle,
  Sparkles,
} from 'lucide-react';
import { AdminOrderDetailsModal } from './AdminOrderDetailsModal';
import { PaginationControl } from './PaginationControl';
import { useAuth } from '@/context/AuthContext';

interface UserDetailsModalProps {
  userId: string;
  onClose: () => void;
  onUserUpdated?: () => void;
}

export const UserDetailsModal: React.FC<UserDetailsModalProps> = ({
  userId,
  onClose,
  onUserUpdated,
}) => {
  const { user: currentUser } = useAuth();
  const { showAlert, showConfirm } = useModal();
  const [activeTab, setActiveTab] = useState<'OVERVIEW' | 'CUSTOMER_ORDERS' | 'HELPER_DELIVERIES' | 'WALLET' | 'MANAGEMENT'>('OVERVIEW');
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

  // Label management state
  const [newLabelInput, setNewLabelInput] = useState('');
  const [blockReasonInput, setBlockReasonInput] = useState('');
  const [showBlockReasonForm, setShowBlockReasonForm] = useState(false);

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Fetch real-time user data
  const user = fallbackStore.users.get(userId);
  const allOrders = Array.from(fallbackStore.orders.values());
  const helperApp = Array.from(fallbackStore.helperApplications.values()).find((a) => a.userId === userId);
  const wallet = fallbackStore.wallets.get(userId) || {
    userId,
    balance: 0,
    totalEarned: 0,
    totalWithdrawn: 0,
    updatedAt: new Date().toISOString(),
  };
  const walletTxs = fallbackStore.walletTransactions.get(userId) || [];

  if (!user) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
        <div className="bg-white p-6 rounded-3xl max-w-sm w-full text-center space-y-3">
          <p className="text-sm font-bold text-gray-700">ব্যবহারকারী তথ্য পাওয়া যায়নি।</p>
          <button onClick={onClose} className="py-2 px-4 bg-purple-900 text-white rounded-xl text-xs font-bold">
            বন্ধ করুন
          </button>
        </div>
      </div>
    );
  }

  // Calculate Customer Orders
  const customerOrders = allOrders
    .filter((o) => o.customerId === userId || (user.alternativePhone && o.customerPhone === user.alternativePhone))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const completedCustomerOrders = customerOrders.filter((o) => o.status === 'DELIVERED');
  const activeCustomerOrders = customerOrders.filter(
    (o) => o.status !== 'DELIVERED' && o.status !== 'CANCELED'
  );
  const totalSpent = completedCustomerOrders.reduce(
    (sum, o) => sum + (o.productCost || 0) + o.deliveryFee,
    0
  );

  // Calculate Helper Deliveries
  const helperOrders = allOrders
    .filter((o) => o.helperId === userId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const completedHelperOrders = helperOrders.filter((o) => o.status === 'DELIVERED');
  const activeHelperOrders = helperOrders.filter(
    (o) => o.status !== 'DELIVERED' && o.status !== 'CANCELED'
  );

  // User Actions: Block / Unblock
  const handleToggleBlock = async () => {
    if (user.isBlocked) {
      const confirmed = await showConfirm(
        'আনব্লক নিশ্চিতকরণ',
        `আপনি কি ${user.displayName}-কে আনব্লক করতে চান?`,
        'হ্যাঁ, আনব্লক করুন',
        'বাতিল'
      );
      if (!confirmed) return;

      await fallbackStore.blockUser(userId, false);
      showAlert('আনব্লক সম্পন্ন', 'ব্যবহারকারী একাউন্ট পুনরায় সক্রিয় করা হয়েছে।', 'success');
      if (onUserUpdated) onUserUpdated();
    } else {
      setShowBlockReasonForm(true);
    }
  };

  const handleConfirmBlockWithReason = async (e: React.FormEvent) => {
    e.preventDefault();
    await fallbackStore.blockUser(userId, true, blockReasonInput || 'Administrator Block');
    setShowBlockReasonForm(false);
    showAlert('ব্লক সম্পন্ন', `${user.displayName}-কে ব্লক করা হয়েছে।`, 'info');
    if (onUserUpdated) onUserUpdated();
  };

  // User Actions: Delete User
  const handleDeleteUser = async () => {
    const confirmed = await showConfirm(
      'একাউন্ট ডিলিট স্থায়ী সতর্কতা',
      `আপনি কি নিশ্চিত যে ${user.displayName}-এর প্রোফাইল স্থায়ীভাবে ডিলিট করতে চান? এই প্রক্রিয়া ফিরিয়ে আনা সম্ভব নয়।`,
      'হ্যাঁ, ডিলিট করুন',
      'বাতিল'
    );
    if (!confirmed) return;

    await fallbackStore.deleteUser(userId);
    showAlert('ডিলিট সম্পন্ন', 'ব্যবহারকারী প্রোফাইল সিস্টেম থেকে মুছে ফেলা হয়েছে।', 'success');
    if (onUserUpdated) onUserUpdated();
    onClose();
  };

  // Label Actions: Add & Remove Label
  const handleAddLabel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLabelInput.trim()) return;
    const currentLabels = user.labels || [];
    const trimmed = newLabelInput.trim();
    if (currentLabels.includes(trimmed)) {
      showAlert('লেবেল বিদ্যমান', 'এই লেবেলটি ইতোমধ্যে যুক্ত করা আছে।', 'info');
      return;
    }
    const updated = [...currentLabels, trimmed];
    await fallbackStore.updateUserLabels(userId, updated);
    setNewLabelInput('');
    showAlert('লেবেল যুক্ত হয়েছে', `নতুন লেবেল "${trimmed}" যুক্ত করা হয়েছে।`, 'success');
    if (onUserUpdated) onUserUpdated();
  };

  const handleRemoveLabel = async (labelToRemove: string) => {
    const currentLabels = user.labels || [];
    const updated = currentLabels.filter((l) => l !== labelToRemove);
    await fallbackStore.updateUserLabels(userId, updated);
    showAlert('লেবেল অপসারিত', `লেবেল "${labelToRemove}" রিমুভ করা হয়েছে।`, 'info');
    if (onUserUpdated) onUserUpdated();
  };

  const handleToggleAdminRoleInModal = async () => {
    if (!currentUser?.isSuperAdmin) {
      showAlert('অনুমতি নেই', 'শুধুমাত্র Super Admin অন্য ব্যবহারকারীদের অ্যাডমিন বানাতে বা সরাতে পারবেন।', 'error');
      return;
    }
    const makeAdmin = !user.isAdmin;
    const actionText = makeAdmin ? 'অ্যাডমিন স্ট্যাটাস প্রদান করতে' : 'অ্যাডমিন রোল অপসারণ করতে';
    const confirmed = await showConfirm(
      'অ্যাডমিন রোল পরিবর্তন',
      `আপনি কি ${user.displayName}-কে ${actionText} চান?`,
      makeAdmin ? 'হ্যাঁ, অ্যাডমিন করুন' : 'হ্যাঁ, রোল সরান',
      'বাতিল'
    );
    if (!confirmed) return;

    await fallbackStore.setAdminRole(userId, makeAdmin);
    showAlert(
      'রোল আপডেট সম্পন্ন',
      `${user.displayName} ${makeAdmin ? 'এখন একজন Admin।' : 'এর Admin রোল সরানো হয়েছে।'}`,
      'success'
    );
    if (onUserUpdated) onUserUpdated();
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
        <div className="bg-white w-full max-w-4xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
          {/* Top Banner Header */}
          <div className="p-6 bg-gradient-to-r from-purple-950 via-indigo-950 to-purple-900 text-white flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center space-x-4">
              <div className="w-14 h-14 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center text-2xl font-bold text-purple-200 shadow-md">
                {user.displayName.charAt(0).toUpperCase()}
              </div>
              <div>
                <div className="flex items-center space-x-2 flex-wrap">
                  <h2 className="font-extrabold text-xl md:text-2xl tracking-tight text-white">
                    {user.displayName}
                  </h2>
                  {user.isBlocked && (
                    <span className="px-2.5 py-0.5 rounded-full bg-red-500 text-white font-extrabold text-[10px] uppercase tracking-wider flex items-center space-x-1 shadow-sm">
                      <Ban className="w-3 h-3" />
                      <span>BLOCKED</span>
                    </span>
                  )}
                  <span className="px-2.5 py-0.5 rounded-full bg-purple-500/30 text-purple-200 border border-purple-400/30 font-extrabold text-[10px] uppercase">
                    Role: {user.role}
                  </span>
                  {user.isHelper && (
                    <span className="px-2.5 py-0.5 rounded-full bg-indigo-500/30 text-indigo-200 border border-indigo-400/30 font-extrabold text-[10px] uppercase">
                      Helper
                    </span>
                  )}
                </div>
                <p className="text-xs text-purple-200 font-medium mt-0.5">
                  UID: <span className="font-mono">{user.uid}</span> • Email: {user.email || 'N/A'} • Registered: {new Date(user.createdAt).toLocaleDateString()}
                </p>

                {/* Custom User Labels Badges */}
                {user.labels && user.labels.length > 0 && (
                  <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                    <span className="text-[10px] text-purple-300 font-bold">Labels:</span>
                    {user.labels.map((lbl) => (
                      <span
                        key={lbl}
                        className="px-2.5 py-0.5 rounded-full bg-amber-400 text-purple-950 font-black text-[10px] shadow-sm flex items-center space-x-1"
                      >
                        <Tag className="w-2.5 h-2.5" />
                        <span>{lbl}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-2.5 rounded-2xl bg-white/10 hover:bg-white/20 text-white transition-colors self-start md:self-auto"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Current Live Running States Summary Strip */}
          <div className="p-4 bg-slate-900 text-white border-b border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
            <div className="flex items-center space-x-2">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span className="font-extrabold text-slate-300">Live Active Running State:</span>
            </div>
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-1.5">
                <ShoppingBag className="w-3.5 h-3.5 text-purple-400" />
                <span>Running Customer Requests: </span>
                <strong className={activeCustomerOrders.length > 0 ? 'text-amber-400 font-black' : 'text-slate-400 font-bold'}>
                  {activeCustomerOrders.length > 0 ? `${activeCustomerOrders.length} Active (#${activeCustomerOrders[0].id})` : 'None'}
                </strong>
              </div>
              <span className="text-slate-700">|</span>
              <div className="flex items-center space-x-1.5">
                <Bike className="w-3.5 h-3.5 text-indigo-400" />
                <span>Running Helper Deliveries: </span>
                <strong className={activeHelperOrders.length > 0 ? 'text-emerald-400 font-black' : 'text-slate-400 font-bold'}>
                  {activeHelperOrders.length > 0 ? `${activeHelperOrders.length} Active (#${activeHelperOrders[0].id})` : 'None'}
                </strong>
              </div>
            </div>
          </div>

          {/* Key Metrics Dashboard Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 bg-gray-50 border-b border-gray-100 text-center text-xs">
            <div className="p-3 bg-white rounded-2xl border border-gray-200 shadow-sm">
              <span className="text-[10px] font-extrabold text-gray-400 uppercase tracking-wider block">Customer Orders</span>
              <span className="text-xl font-black text-gray-900">{customerOrders.length}</span>
              <span className="text-[10px] text-emerald-600 block font-bold">{completedCustomerOrders.length} completed</span>
            </div>
            <div className="p-3 bg-white rounded-2xl border border-gray-200 shadow-sm">
              <span className="text-[10px] font-extrabold text-gray-400 uppercase tracking-wider block">Total Spent</span>
              <span className="text-xl font-black text-purple-900">৳{totalSpent}</span>
              <span className="text-[10px] text-gray-400 block">gross purchases</span>
            </div>
            <div className="p-3 bg-white rounded-2xl border border-gray-200 shadow-sm">
              <span className="text-[10px] font-extrabold text-gray-400 uppercase tracking-wider block">Helper Deliveries</span>
              <span className="text-xl font-black text-indigo-900">{helperOrders.length}</span>
              <span className="text-[10px] text-emerald-600 block font-bold">{completedHelperOrders.length} completed</span>
            </div>
            <div className="p-3 bg-white rounded-2xl border border-gray-200 shadow-sm">
              <span className="text-[10px] font-extrabold text-gray-400 uppercase tracking-wider block">Wallet Balance</span>
              <span className="text-xl font-black text-emerald-600">৳{wallet.balance}</span>
              <span className="text-[10px] text-indigo-700 block font-semibold">৳{wallet.totalEarned} earned</span>
            </div>
          </div>

          {/* Sub Navigation Bar */}
          <div className="flex border-b border-gray-200 bg-gray-100/70 px-4 pt-2 gap-2 text-xs font-extrabold overflow-x-auto no-scrollbar">
            <button
              onClick={() => setActiveTab('OVERVIEW')}
              className={`py-2.5 px-4 rounded-t-2xl border-t border-x transition-all whitespace-nowrap ${
                activeTab === 'OVERVIEW'
                  ? 'bg-white border-gray-200 text-purple-950 shadow-sm'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              Overview & Live State
            </button>
            <button
              onClick={() => setActiveTab('CUSTOMER_ORDERS')}
              className={`py-2.5 px-4 rounded-t-2xl border-t border-x transition-all whitespace-nowrap ${
                activeTab === 'CUSTOMER_ORDERS'
                  ? 'bg-white border-gray-200 text-purple-950 shadow-sm'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              Customer Orders History ({customerOrders.length})
            </button>
            {user.isHelper && (
              <button
                onClick={() => setActiveTab('HELPER_DELIVERIES')}
                className={`py-2.5 px-4 rounded-t-2xl border-t border-x transition-all whitespace-nowrap ${
                  activeTab === 'HELPER_DELIVERIES'
                    ? 'bg-white border-gray-200 text-purple-950 shadow-sm'
                    : 'border-transparent text-gray-600 hover:text-gray-900'
                }`}
              >
                Helper Work History ({helperOrders.length})
              </button>
            )}
            <button
              onClick={() => setActiveTab('WALLET')}
              className={`py-2.5 px-4 rounded-t-2xl border-t border-x transition-all whitespace-nowrap ${
                activeTab === 'WALLET'
                  ? 'bg-white border-gray-200 text-purple-950 shadow-sm'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              Wallet Transactions ({walletTxs.length})
            </button>
            <button
              onClick={() => setActiveTab('MANAGEMENT')}
              className={`py-2.5 px-4 rounded-t-2xl border-t border-x transition-all whitespace-nowrap ${
                activeTab === 'MANAGEMENT'
                  ? 'bg-white border-gray-200 text-purple-950 shadow-sm'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              Labeling, Block & Actions
            </button>
          </div>

          {/* Modal Main Body */}
          <div className="p-5 overflow-y-auto space-y-4 flex-1 text-xs">

            {/* TAB 1: OVERVIEW & LIVE RUNNING STATES */}
            {activeTab === 'OVERVIEW' && (
              <div className="space-y-5">
                {/* Block Warning Banner if user is blocked */}
                {user.isBlocked && (
                  <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-900 flex items-start space-x-3">
                    <ShieldAlert className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <h4 className="font-extrabold text-sm text-red-950">এই ব্যবহারকারী একাউন্ট বর্তমানে ব্লকড (BLOCKED)!</h4>
                      <p className="text-xs text-red-800 mt-0.5">
                        কারণ: "{user.blockedReason || 'অ্যাডমিন দ্বারা সীমাবদ্ধ'}"
                      </p>
                    </div>
                  </div>
                )}

                {/* Profile Details Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Account Information */}
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-2">
                    <h4 className="font-extrabold text-xs text-slate-800 uppercase tracking-wider flex items-center space-x-1.5">
                      <User className="w-4 h-4 text-purple-700" />
                      <span>Account Profile Details</span>
                    </h4>
                    <div className="space-y-1.5 text-slate-700 font-medium">
                      <p><strong>Name:</strong> {user.displayName}</p>
                      <p><strong>Email:</strong> {user.email || 'N/A'}</p>
                      <p><strong>Whatsapp Number (Contact):</strong> <span className="font-extrabold text-slate-900">{user.alternativePhone || 'N/A'}</span></p>
                      <p><strong>Saved Delivery Address:</strong> <span className="font-extrabold text-emerald-800">{user.defaultDeliveryLocation?.address || 'N/A'}</span></p>
                      <p><strong>Preferred Missing Item Action:</strong> {user.missingItemPreference || 'DEFAULT (SKIP)'}</p>
                      <p><strong>Primary Mode:</strong> {user.lastActiveMode}</p>
                    </div>
                  </div>

                  {/* Helper Information */}
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-2">
                    <h4 className="font-extrabold text-xs text-slate-800 uppercase tracking-wider flex items-center space-x-1.5">
                      <Bike className="w-4 h-4 text-indigo-700" />
                      <span>Helper Verification & Application</span>
                    </h4>
                    {helperApp ? (
                      <div className="space-y-1.5 text-slate-700 font-medium">
                        <p><strong>Legal Name:</strong> {helperApp.legalName}</p>
                        <p><strong>NID Number:</strong> {helperApp.nid}</p>
                        <p><strong>Application Status:</strong> <span className="font-extrabold text-emerald-700">{helperApp.status}</span></p>
                        <p><strong>Assets:</strong>{' '}
                          {helperApp.hasSmartphone && <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-blue-50 text-blue-800 text-[10px] font-bold mr-1">Smartphone</span>}
                          {helperApp.hasCycle && <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-green-50 text-green-800 text-[10px] font-bold mr-1">Cycle</span>}
                          {helperApp.hasBike && <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 text-[10px] font-bold">Bike</span>}
                        </p>
                      </div>
                    ) : (
                      <p className="text-gray-500 italic py-2">কোনো হেলপার রেজিস্ট্রেশন আবেদন জমা দেওয়া হয়নি।</p>
                    )}
                  </div>
                </div>

                {/* Active Running Orders Cards */}
                <div className="space-y-3">
                  <h4 className="font-extrabold text-xs text-gray-800 uppercase tracking-wider flex items-center space-x-1.5">
                    <Clock className="w-4 h-4 text-amber-600" />
                    <span>Current Active Running Requests / Deliveries</span>
                  </h4>

                  {activeCustomerOrders.length === 0 && activeHelperOrders.length === 0 ? (
                    <div className="p-6 bg-gray-50 rounded-2xl border border-gray-200 text-center text-gray-500 font-medium">
                      বর্তমানে ব্যবহারকারীর কোনো সক্রিয় রানিং অর্ডার বা ডেলিভারি নেই।
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {activeCustomerOrders.map((ord) => (
                        <div
                          key={ord.id}
                          onClick={() => setSelectedOrderId(ord.id)}
                          className="p-4 rounded-2xl bg-amber-50/80 border border-amber-200 hover:border-amber-400 transition-all cursor-pointer flex items-center justify-between"
                        >
                          <div>
                            <div className="flex items-center space-x-2">
                              <span className="font-black text-amber-950">#{ord.id}</span>
                              <span className="px-2 py-0.5 rounded-full bg-amber-200 text-amber-900 font-extrabold text-[10px] uppercase">
                                Customer Request ({ord.status})
                              </span>
                            </div>
                            <p className="font-extrabold text-gray-900 mt-1">{ord.title}</p>
                            <p className="text-[11px] text-gray-600">Assigned Helper: {ord.helperName || 'Unassigned'}</p>
                          </div>
                          <div className="flex items-center space-x-1.5 text-purple-900 font-extrabold">
                            <span>View Order</span>
                            <ChevronRight className="w-4 h-4" />
                          </div>
                        </div>
                      ))}

                      {activeHelperOrders.map((ord) => (
                        <div
                          key={ord.id}
                          onClick={() => setSelectedOrderId(ord.id)}
                          className="p-4 rounded-2xl bg-indigo-50/80 border border-indigo-200 hover:border-indigo-400 transition-all cursor-pointer flex items-center justify-between"
                        >
                          <div>
                            <div className="flex items-center space-x-2">
                              <span className="font-black text-indigo-950">#{ord.id}</span>
                              <span className="px-2 py-0.5 rounded-full bg-indigo-200 text-indigo-900 font-extrabold text-[10px] uppercase">
                                Helper Delivery ({ord.status})
                              </span>
                            </div>
                            <p className="font-extrabold text-gray-900 mt-1">{ord.title}</p>
                            <p className="text-[11px] text-gray-600">Customer: {ord.customerName} ({ord.customerPhone})</p>
                          </div>
                          <div className="flex items-center space-x-1.5 text-purple-900 font-extrabold">
                            <span>View Order</span>
                            <ChevronRight className="w-4 h-4" />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB 2: CUSTOMER ORDERS HISTORY */}
            {activeTab === 'CUSTOMER_ORDERS' && (
              <div className="space-y-3">
                <h4 className="font-extrabold text-xs text-gray-700 uppercase tracking-wider">
                  Total Customer Orders ({customerOrders.length})
                </h4>

                {customerOrders.length === 0 ? (
                  <div className="py-12 text-center text-gray-400">
                    <ShoppingBag className="w-10 h-10 mx-auto mb-2 opacity-40" />
                    <p className="font-bold">No orders placed as customer yet.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {customerOrders.map((ord) => (
                      <div
                        key={ord.id}
                        onClick={() => setSelectedOrderId(ord.id)}
                        className="p-3.5 rounded-2xl bg-white border border-gray-200 hover:border-purple-300 hover:shadow-soft transition-all cursor-pointer flex items-center justify-between"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center space-x-2">
                            <span className="font-black text-gray-900">#{ord.id}</span>
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                                ord.status === 'DELIVERED'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : ord.status === 'CANCELED'
                                  ? 'bg-red-100 text-red-800'
                                  : 'bg-amber-100 text-amber-800'
                              }`}
                            >
                              {ord.status}
                            </span>
                          </div>
                          <p className="font-extrabold text-gray-800">{ord.title}</p>
                          <p className="text-[11px] text-gray-500">
                            {new Date(ord.createdAt).toLocaleString()} • Delivery Fee: ৳{ord.deliveryFee}
                          </p>
                        </div>

                        <div className="flex items-center space-x-1.5 text-purple-900 font-extrabold">
                          <span>Details</span>
                          <ChevronRight className="w-4 h-4" />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* TAB 3: HELPER DELIVERIES HISTORY */}
            {activeTab === 'HELPER_DELIVERIES' && (
              <div className="space-y-3">
                <h4 className="font-extrabold text-xs text-gray-700 uppercase tracking-wider">
                  Total Helper Delivery Work ({helperOrders.length})
                </h4>

                {helperOrders.length === 0 ? (
                  <div className="py-12 text-center text-gray-400">
                    <Bike className="w-10 h-10 mx-auto mb-2 opacity-40" />
                    <p className="font-bold">No deliveries assigned as helper yet.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {helperOrders.map((ord) => (
                      <div
                        key={ord.id}
                        onClick={() => setSelectedOrderId(ord.id)}
                        className="p-3.5 rounded-2xl bg-white border border-gray-200 hover:border-purple-300 hover:shadow-soft transition-all cursor-pointer flex items-center justify-between"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center space-x-2">
                            <span className="font-black text-gray-900">#{ord.id}</span>
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                                ord.status === 'DELIVERED'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : ord.status === 'CANCELED'
                                  ? 'bg-red-100 text-red-800'
                                  : 'bg-amber-100 text-amber-800'
                              }`}
                            >
                              {ord.status}
                            </span>
                          </div>
                          <p className="font-extrabold text-gray-800">{ord.title}</p>
                          <p className="text-[11px] text-gray-500">
                            Customer: {ord.customerName} • Delivery Fee: ৳{ord.deliveryFee}
                          </p>
                        </div>

                        <div className="flex items-center space-x-1.5 text-purple-900 font-extrabold">
                          <span>Details</span>
                          <ChevronRight className="w-4 h-4" />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* TAB 4: WALLET TRANSACTIONS */}
            {activeTab === 'WALLET' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-extrabold text-xs text-gray-700 uppercase tracking-wider">
                    Wallet Ledger ({walletTxs.length})
                  </h4>
                  <div className="text-xs font-bold text-gray-700">
                    Current Balance: <strong className="text-emerald-600 font-extrabold">৳{wallet.balance}</strong>
                  </div>
                </div>

                {walletTxs.length === 0 ? (
                  <div className="py-12 text-center text-gray-400">
                    <Wallet className="w-10 h-10 mx-auto mb-2 opacity-40" />
                    <p className="font-bold">No wallet transactions recorded.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {walletTxs.map((tx) => (
                      <div
                        key={tx.id}
                        className="p-3.5 rounded-2xl bg-white border border-gray-200 flex items-center justify-between"
                      >
                        <div>
                          <p className="font-extrabold text-gray-900">{tx.description}</p>
                          <p className="text-[11px] text-gray-400">{new Date(tx.createdAt).toLocaleString()}</p>
                        </div>
                        <span
                          className={`font-black text-sm ${
                            tx.amount > 0 ? 'text-emerald-600' : 'text-purple-900'
                          }`}
                        >
                          {tx.amount > 0 ? `+৳${tx.amount}` : `-৳${Math.abs(tx.amount)}`}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* TAB 5: MANAGEMENT, LABELING, BLOCKING & DELETION */}
            {activeTab === 'MANAGEMENT' && (
              <div className="space-y-6">
                {/* 0. Admin Access Management Section (Super Admin Control) */}
                <div className="p-4 rounded-2xl bg-slate-900 text-white space-y-3 shadow-md">
                  <h4 className="font-extrabold text-xs text-amber-400 uppercase tracking-wider flex items-center space-x-1.5">
                    <Shield className="w-4 h-4 text-amber-400" />
                    <span>Admin Role & Permissions (Super Admin Control)</span>
                  </h4>

                  {currentUser?.isSuperAdmin ? (
                    user.isSuperAdmin ? (
                      <p className="text-xs text-slate-300 font-semibold">
                        এই ব্যবহারকারী একজন <strong className="text-amber-400 font-extrabold">Super Admin</strong>। Super Admin রোল সুরক্ষিত।
                      </p>
                    ) : (
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-1">
                        <div>
                          <p className="text-xs font-bold text-slate-200">
                            বর্তমান স্ট্যাটাস: <span className="text-amber-300 uppercase font-black">{user.isAdmin ? 'ADMIN' : 'REGULAR USER'}</span>
                          </p>
                          <p className="text-[11px] text-slate-400">
                            {user.isAdmin
                              ? 'Admin সুবিধা তুলে নিলে ব্যবহারকারী সাধারণ Customer/Helper হিসেবে অ্যাকাউন্টটি ব্যবহার করবেন।'
                              : 'Admin রোল দিলে ব্যবহারকারী Super Admin ব্যতীত বাকি সকল অপারেশনাল এবং অ্যানালিটিক্স কাজ করতে পারবেন।'}
                          </p>
                        </div>
                        {user.isAdmin ? (
                          <button
                            onClick={handleToggleAdminRoleInModal}
                            className="py-2 px-4 rounded-xl bg-red-500 hover:bg-red-600 text-white font-extrabold text-xs transition-all flex items-center space-x-1 whitespace-nowrap"
                          >
                            <ShieldAlert className="w-4 h-4" />
                            <span>Remove Admin Role</span>
                          </button>
                        ) : (
                          <button
                            onClick={handleToggleAdminRoleInModal}
                            className="py-2 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs transition-all flex items-center space-x-1 whitespace-nowrap shadow-md"
                          >
                            <Shield className="w-4 h-4" />
                            <span>Make Admin</span>
                          </button>
                        )}
                      </div>
                    )
                  ) : (
                    <p className="text-xs text-slate-400 italic">
                      শুধুমাত্র <strong className="text-amber-400 font-extrabold">Super Admin</strong> অন্য ব্যবহারকারীদের অ্যাডমিন হিসেবে যোগ করতে বা রোল সরাতে পারবেন।
                    </p>
                  )}
                </div>

                {/* 1. Custom Labeling Section */}
                <div className="p-4 rounded-2xl bg-white border border-gray-200 space-y-3">
                  <h4 className="font-extrabold text-xs text-gray-900 uppercase tracking-wider flex items-center space-x-1.5">
                    <Tag className="w-4 h-4 text-purple-700" />
                    <span>User Labeling & Tags Management</span>
                  </h4>
                  <p className="text-gray-500">
                    ব্যবহারকারীর প্রোফাইলে কাস্টম ট্যাগ/ব্যাজ যুক্ত করুন (যেমন: VIP, Trusted Helper, Verified, Frequent):
                  </p>

                  <div className="flex flex-wrap gap-2 py-1">
                    {(user.labels || []).length === 0 ? (
                      <span className="text-gray-400 italic">কোনো লেবেল সেট করা নেই</span>
                    ) : (
                      user.labels!.map((lbl) => (
                        <span
                          key={lbl}
                          className="px-3 py-1 rounded-full bg-amber-100 text-purple-950 font-extrabold text-xs flex items-center space-x-1 border border-amber-300"
                        >
                          <span>{lbl}</span>
                          <button
                            onClick={() => handleRemoveLabel(lbl)}
                            className="p-0.5 rounded-full hover:bg-amber-200 text-amber-900 transition-colors"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))
                    )}
                  </div>

                  <form onSubmit={handleAddLabel} className="flex gap-2 pt-2">
                    <input
                      type="text"
                      placeholder="নতুন লেবেল লিখুন (e.g. VIP, Top Customer)..."
                      value={newLabelInput}
                      onChange={(e) => setNewLabelInput(e.target.value)}
                      className="flex-1 px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-purple-600"
                    />
                    <button
                      type="submit"
                      className="py-2 px-4 bg-purple-900 hover:bg-purple-950 text-white rounded-xl text-xs font-extrabold transition-all flex items-center space-x-1"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Add Label</span>
                    </button>
                  </form>
                </div>

                {/* 2. Block / Unblock Section */}
                <div className="p-4 rounded-2xl bg-white border border-gray-200 space-y-3">
                  <h4 className="font-extrabold text-xs text-gray-900 uppercase tracking-wider flex items-center space-x-1.5">
                    <Ban className="w-4 h-4 text-red-600" />
                    <span>Block / Unblock User Controls</span>
                  </h4>

                  {user.isBlocked ? (
                    <div className="space-y-2">
                      <p className="text-red-700 font-bold">
                        স্ট্যাটাস: বর্তমানে ব্লকড (কারণ: "{user.blockedReason || 'অ্যাডমিন স্ট্যাটাস'}")
                      </p>
                      <button
                        onClick={handleToggleBlock}
                        className="py-2.5 px-5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded-xl text-xs shadow-sm transition-all"
                      >
                        Unblock User Account
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-gray-600">
                        ব্যবহারকারী ব্লক করা হলে সে নতুন রিকোয়েস্ট পাঠাতে বা ডেলিভারি গ্রহণ করতে পারবে না।
                      </p>

                      {!showBlockReasonForm ? (
                        <button
                          onClick={handleToggleBlock}
                          className="py-2.5 px-5 bg-red-600 hover:bg-red-700 text-white font-extrabold rounded-xl text-xs shadow-sm transition-all flex items-center space-x-1.5"
                        >
                          <Ban className="w-4 h-4" />
                          <span>Block User Account</span>
                        </button>
                      ) : (
                        <form onSubmit={handleConfirmBlockWithReason} className="p-4 bg-red-50 rounded-2xl border border-red-200 space-y-3">
                          <label className="font-extrabold text-red-950 text-xs block">
                            ব্লক করার কারণ উল্লেখ করুন:
                          </label>
                          <input
                            type="text"
                            placeholder="e.g. Fraudulent behavior, repeated order cancellation..."
                            value={blockReasonInput}
                            onChange={(e) => setBlockReasonInput(e.target.value)}
                            className="w-full p-3 bg-white border border-red-200 rounded-xl text-xs font-medium focus:outline-none"
                            required
                          />
                          <div className="flex gap-2">
                            <button
                              type="submit"
                              className="py-2 px-4 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold"
                            >
                              Confirm Block
                            </button>
                            <button
                              type="button"
                              onClick={() => setShowBlockReasonForm(false)}
                              className="py-2 px-4 bg-gray-200 text-gray-800 rounded-xl text-xs font-bold"
                            >
                              Cancel
                            </button>
                          </div>
                        </form>
                      )}
                    </div>
                  )}
                </div>

                {/* 3. Permanent Account Deletion Section */}
                <div className="p-4 rounded-2xl bg-red-50/50 border border-red-200 space-y-3">
                  <h4 className="font-extrabold text-xs text-red-950 uppercase tracking-wider flex items-center space-x-1.5">
                    <Trash2 className="w-4 h-4 text-red-600" />
                    <span>Permanent Account Deletion</span>
                  </h4>
                  <p className="text-red-900 text-xs">
                    সতর্কতা: এই ব্যবহারকারীর প্রোফাইল ডাটাবেস থেকে মুছে ফেলা হবে।
                  </p>
                  <button
                    onClick={handleDeleteUser}
                    className="py-2.5 px-5 bg-red-700 hover:bg-red-800 text-white font-extrabold rounded-xl text-xs shadow-sm transition-all flex items-center space-x-1.5"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Delete User Profile Permanently</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Modal Footer */}
          <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-end">
            <button
              onClick={onClose}
              className="py-2.5 px-6 rounded-2xl bg-gray-200 hover:bg-gray-300 font-extrabold text-xs text-gray-800 transition-colors"
            >
              Close Details
            </button>
          </div>
        </div>
      </div>

      {/* Admin Order Details Modal */}
      {selectedOrderId && (
        <AdminOrderDetailsModal
          orderId={selectedOrderId}
          onClose={() => setSelectedOrderId(null)}
        />
      )}
    </>
  );
};
