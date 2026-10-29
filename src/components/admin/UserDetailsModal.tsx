'use client';

import React, { useState, useEffect } from 'react';
import { UserProfile, Order, UserRole, Referral } from '@/types';
import { fallbackStore } from '@/lib/firebase';
import { calculateHelperCommission } from '@/lib/pricing';
import { useModal } from '../CustomModal';
import {
  X,
  User,
  Phone,
  Mail,
  Shield,
  ShieldAlert,
  ShieldCheck,
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
  Coins,
  Edit2,
  Share2,
  ExternalLink,
  CheckCircle2,
  MapPin,
  Globe,
  Calendar,
} from 'lucide-react';
import { AdminOrderDetailsModal } from './AdminOrderDetailsModal';
import { PaginationControl } from './PaginationControl';
import { useAuth } from '@/context/AuthContext';
import { DraggableTabsContainer } from './DraggableTabsContainer';
import { LifetimeDataNotice } from './LifetimeDataNotice';
import { useAdminLifetimeData } from '@/hooks/useAdminLifetimeData';

type PresetType = 'ALL_TIME' | 'TODAY' | 'YESTERDAY' | 'LAST_7' | 'LAST_30' | 'THIS_MONTH' | 'CUSTOM';

const presetLabels: Record<PresetType, string> = {
  ALL_TIME: 'All Time',
  TODAY: 'Today',
  YESTERDAY: 'Yesterday',
  LAST_7: 'Last 7 Days',
  LAST_30: 'Last 30 Days',
  THIS_MONTH: 'This Month',
  CUSTOM: 'Custom',
};

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
  // Wallets and history here are summed over every order, withdrawal and
  // shop order, which the admin panel reads only when a view like this opens.
  const lifetimeData = useAdminLifetimeData();
  // This user's wallet transactions are read when the screen opens (the admin
  // panel no longer loads an arbitrary 500 of everyone's at startup).
  const [, setTxVersion] = useState(0);
  const [loadingUser, setLoadingUser] = useState(!fallbackStore.users.get(userId));

  useEffect(() => {
    let cancelled = false;
    if (!fallbackStore.users.get(userId)) {
      setLoadingUser(true);
      fallbackStore.fetchUserFromFirestore(userId).then(() => {
        if (!cancelled) {
          setLoadingUser(false);
          setTxVersion((v) => v + 1);
        }
      }).catch(() => {
        if (!cancelled) setLoadingUser(false);
      });
    }
    fallbackStore.loadWalletTransactionsFor(userId).then(() => {
      if (!cancelled) setTxVersion((v) => v + 1);
    });
    fallbackStore.fetchOrdersForUser(userId, 'both').then(() => {
      if (!cancelled) setTxVersion((v) => v + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const { user: currentUser } = useAuth();
  const { showAlert, showConfirm } = useModal();
  const [activeTab, setActiveTab] = useState<'OVERVIEW' | 'CUSTOMER_ORDERS' | 'HELPER_DELIVERIES' | 'WALLET' | 'REFERRALS' | 'MANAGEMENT'>('OVERVIEW');
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

  // Referrals state for this user
  const [userReferrals, setUserReferrals] = useState<Referral[]>(() => {
    return Array.from(fallbackStore.referrals.values())
      .filter((r) => r.referrerId === userId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  });

  useEffect(() => {
    let cancelled = false;
    fallbackStore.fetchReferralsForUser(userId).then((list) => {
      if (!cancelled) {
        setUserReferrals(
          list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        );
      }
    });

    const syncRefs = () => {
      const list = Array.from(fallbackStore.referrals.values())
        .filter((r) => r.referrerId === userId)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setUserReferrals(list);
    };

    const unsub = fallbackStore.subscribe(syncRefs);
    return () => {
      cancelled = true;
      unsub();
    };
  }, [userId]);

  // Referral is strictly calculated for successfully delivered orders
  const deliveredReferrals = userReferrals.filter((r) => r.status === 'COMPLETED');
  const totalDeliveredReferrals = deliveredReferrals.length;
  const pendingReferrals = userReferrals.filter((r) => r.status !== 'COMPLETED');

  // Label management state
  const [newLabelInput, setNewLabelInput] = useState('');
  const [blockReasonInput, setBlockReasonInput] = useState('');
  const [showBlockReasonForm, setShowBlockReasonForm] = useState(false);

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Local YYYY-MM-DD Helper
  const getLocalYYYYMMDD = (d: Date = new Date()): string => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const getTodayStr = () => getLocalYYYYMMDD(new Date());
  const getDaysAgoStr = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return getLocalYYYYMMDD(d);
  };
  const getStartOfMonthStr = () => {
    const d = new Date();
    d.setDate(1);
    return getLocalYYYYMMDD(d);
  };

  // Date Range Filtering State - Default to TODAY
  const [startDate, setStartDate] = useState<string>(getTodayStr());
  const [endDate, setEndDate] = useState<string>(getTodayStr());
  const [activePreset, setActivePreset] = useState<PresetType>('TODAY');
  const [showCustomPicker, setShowCustomPicker] = useState<boolean>(false);

  const handlePresetSelect = (preset: PresetType) => {
    setActivePreset(preset);
    setCurrentPage(1);
    if (preset === 'CUSTOM') {
      setShowCustomPicker(true);
      return;
    }
    setShowCustomPicker(false);
    if (preset === 'ALL_TIME') {
      setStartDate('');
      setEndDate('');
    } else if (preset === 'TODAY') {
      setStartDate(getTodayStr());
      setEndDate(getTodayStr());
    } else if (preset === 'YESTERDAY') {
      const y = getDaysAgoStr(1);
      setStartDate(y);
      setEndDate(y);
    } else if (preset === 'LAST_7') {
      setStartDate(getDaysAgoStr(6));
      setEndDate(getTodayStr());
    } else if (preset === 'LAST_30') {
      setStartDate(getDaysAgoStr(29));
      setEndDate(getTodayStr());
    } else if (preset === 'THIS_MONTH') {
      setStartDate(getStartOfMonthStr());
      setEndDate(getTodayStr());
    }
  };

  const matchesDateRange = (dateVal?: string | number) => {
    if (!startDate && !endDate) return true;
    if (!dateVal) return false;
    const t = new Date(dateVal).getTime();
    if (isNaN(t)) return true;
    if (startDate && t < new Date(`${startDate}T00:00:00`).getTime()) return false;
    if (endDate && t > new Date(`${endDate}T23:59:59.999`).getTime()) return false;
    return true;
  };

  // Payback states
  const [paybackAmount, setPaybackAmount] = useState('');
  const [paybackNote, setPaybackNote] = useState('');
  const [recordingPayback, setRecordingPayback] = useState(false);

  const handleRecordPayback = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(paybackAmount);
    if (isNaN(amt) || amt <= 0) {
      showAlert('ভুল পরিমাণ', 'সঠিক পরিমাণ প্রদান করুন।', 'warning');
      return;
    }
    setRecordingPayback(true);
    await fallbackStore.recordHelperPayback(userId, amt, paybackNote.trim() || 'Recorded by admin');
    setRecordingPayback(false);
    setPaybackAmount('');
    setPaybackNote('');
    showAlert('পেমেন্ট রেকর্ড সম্পন্ন', `হেলপারের পরিশোধিত ৳${amt} পেমেন্ট রেকর্ড করা হয়েছে।`, 'success');
    if (onUserUpdated) onUserUpdated();
  };

  // Fetch real-time user data
  const user = fallbackStore.users.get(userId);

  // Edit info states
  const [isEditingInfo, setIsEditingInfo] = useState(false);
  const [editName, setEditName] = useState(user?.displayName || '');
  const [editEmail, setEditEmail] = useState(user?.email || '');
  const [editPhone, setEditPhone] = useState(user?.alternativePhone || '');

  // Edit Reward Coins states
  const [isEditingCoins, setIsEditingCoins] = useState(false);
  const [coinsInput, setCoinsInput] = useState(String(user?.coins ?? 0));
  const [coinsReasonInput, setCoinsReasonInput] = useState('');
  const [savingCoins, setSavingCoins] = useState(false);

  // Change user account type
  const [savingRole, setSavingRole] = useState(false);

  // Service Zone / Area Assignment states
  const [userAssignedAreas, setUserAssignedAreas] = useState<string[]>(user?.assignedAreaIds || []);
  const [userServeAllAreas, setUserServeAllAreas] = useState<boolean>(user?.serveAllAreas || false);
  const [isSavingAreas, setIsSavingAreas] = useState<boolean>(false);

  // Convert Admin to Customer or Helper modal state
  const [convertingTargetRole, setConvertingTargetRole] = useState<'customer' | 'helper' | null>(null);
  const [convertTargetAreas, setConvertTargetAreas] = useState<string[]>([]);
  const [convertServeAll, setConvertServeAll] = useState<boolean>(false);
  const [isConvertingUserRole, setIsConvertingUserRole] = useState<boolean>(false);

  React.useEffect(() => {
    if (user) {
      setEditName(user.displayName);
      setEditEmail(user.email || '');
      setEditPhone(user.alternativePhone || '');
      setCoinsInput(String(user.coins ?? 0));
      setUserAssignedAreas(user.assignedAreaIds || []);
      setUserServeAllAreas(user.serveAllAreas || false);
    }
  }, [user]);

  const handleSaveCoins = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const num = parseInt(coinsInput, 10);
    if (isNaN(num) || num < 0) {
      showAlert('ভুল সংখ্যা', 'অনুগ্রহ করে সঠিক কয়েন সংখ্যা প্রদান করুন (০ বা তার বেশি)।', 'warning');
      return;
    }
    setSavingCoins(true);
    const res = await fallbackStore.updateUserCoins(userId, num, coinsReasonInput.trim() || undefined);
    setSavingCoins(false);
    setIsEditingCoins(false);
    setCoinsReasonInput('');
    if (res.success) {
      const deltaText = res.delta > 0 ? `+${res.delta}` : `${res.delta}`;
      showAlert(
        'কয়েন আপডেট সফল',
        `ব্যবহারকারীর কয়েন ব্যালেন্স সফলভাবে ${num} কয়েন নির্ধারণ করা হয়েছে (${deltaText})। ব্যবহারকারীর স্ক্রিনে ও হেডারে অবিলম্বে ${num} কয়েন প্রদর্শিত হবে।`,
        'success'
      );
      if (onUserUpdated) onUserUpdated();
    } else {
      showAlert('ব্যর্থ', 'কয়েন আপডেট করা সম্ভব হয়নি।', 'error');
    }
  };

  const handleChangeUserType = async (newRole: UserRole) => {
    if (!user) return;
    if (newRole === user.role) return;

    const roleLabel =
      newRole === 'customer' ? 'Customer'
      : newRole === 'store' ? 'Store'
      : 'Helper';

    const confirmed = await showConfirm(
      'Account Type পরিবর্তন',
      `আপনি কি ${user.displayName}-এর account type "${roleLabel}" হিসেবে পরিবর্তন করতে চান?`,
      `হ্যাঁ, ${roleLabel} করুন`,
      'বাতিল'
    );
    if (!confirmed) return;

    setSavingRole(true);
    try {
      const updatedUser: UserProfile = {
        ...user,
        role: newRole,
        isHelper: newRole === 'helper',
        isStore: newRole === 'store',
        isStoreApproved: newRole === 'store' ? true : false,
      };
      await fallbackStore.saveUser(updatedUser);
      showAlert(
        'Account Type আপডেট সম্পন্ন',
        `${user.displayName}-এর account type সফলভাবে "${roleLabel}" হিসেবে পরিবর্তন করা হয়েছে।`,
        'success'
      );
      if (onUserUpdated) onUserUpdated();
    } catch (err: any) {
      showAlert('ত্রুটি', `Account type পরিবর্তন করতে ব্যর্থ হয়েছে: ${err?.message || err}`, 'error');
    } finally {
      setSavingRole(false);
    }
  };

  const handleSaveInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const updatedUser = {
      ...user,
      displayName: editName.trim(),
      email: editEmail.trim() || '',
      alternativePhone: editPhone.trim() || undefined,
    };
    await fallbackStore.saveUser(updatedUser);
    setIsEditingInfo(false);
    showAlert('আপডেট সম্পন্ন', 'ব্যবহারকারীর তথ্য সফলভাবে আপডেট করা হয়েছে।', 'success');
    if (onUserUpdated) onUserUpdated();
  };
  const allOrders = Array.from(fallbackStore.orders.values());
  const helperApp = Array.from(fallbackStore.helperApplications.values()).find((a) => a.userId === userId);
  const wallet = fallbackStore.getHelperWallet(userId);
  const allWalletTxs = fallbackStore.walletTransactions.get(userId) || [];
  const walletTxs = allWalletTxs.filter((tx) => matchesDateRange(tx.createdAt));

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
  const allCustomerOrders = allOrders
    .filter((o) => o.customerId === userId || (user.alternativePhone && o.customerPhone === user.alternativePhone))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  // Filtered customer orders for active date preset (default TODAY)
  const customerOrders = allCustomerOrders.filter((o) => matchesDateRange(o.createdAt));

  const completedCustomerOrders = customerOrders.filter((o) => o.status === 'DELIVERED');
  const activeCustomerOrders = allCustomerOrders.filter(
    (o) =>
      o.status !== 'DELIVERED' &&
      (o.status as string) !== 'COMPLETED' &&
      o.status !== 'CANCELED' &&
      (o.status as string) !== 'CANCELLED' &&
      o.cancellationRequest?.status !== 'APPROVED'
  );
  const totalSpent = completedCustomerOrders.reduce(
    (sum, o) => sum + (o.productCost || 0) + o.deliveryFee,
    0
  );

  // Calculate Helper Deliveries
  const allHelperOrders = allOrders
    .filter((o) => o.helperId === userId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  // Filtered helper orders for active date preset (default TODAY)
  const helperOrders = allHelperOrders.filter((o) =>
    matchesDateRange(o.deliveredAt || o.updatedAt || o.createdAt)
  );

  const completedHelperOrders = helperOrders.filter(
    (o) => o.status === 'DELIVERED' || (o.status as string) === 'COMPLETED'
  );
  const activeHelperOrders = allHelperOrders.filter(
    (o) =>
      o.status !== 'DELIVERED' &&
      (o.status as string) !== 'COMPLETED' &&
      o.status !== 'CANCELED' &&
      (o.status as string) !== 'CANCELLED' &&
      o.cancellationRequest?.status !== 'APPROVED'
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
    const makeAdmin = !user?.isAdmin;
    const actionText = makeAdmin ? 'অ্যাডমিন স্ট্যাটাস প্রদান করতে' : 'অ্যাডমিন রোল অপসারণ করতে';
    const confirmed = await showConfirm(
      'অ্যাডমিন রোল পরিবর্তন',
      `আপনি কি ${user?.displayName || 'ব্যবহারকারী'}-কে ${actionText} চান?`,
      makeAdmin ? 'হ্যাঁ, অ্যাডমিন করুন' : 'হ্যাঁ, রোল সরান',
      'বাতিল'
    );
    if (!confirmed) return;

    try {
      await fallbackStore.setAdminRole(userId, makeAdmin, user);
      showAlert(
        'রোল আপডেট সম্পন্ন',
        `${user?.displayName || 'ব্যবহারকারী'} ${makeAdmin ? 'এখন একজন Admin।' : 'এর Admin রোল সরানো হয়েছে।'}`,
        'success'
      );
      if (onUserUpdated) onUserUpdated();
    } catch (err: any) {
      console.error('Error toggling admin role in modal:', err);
      showAlert('ত্রুটি', 'অ্যাডমিন রোল পরিবর্তন করা সম্ভব হয়নি। অনুগ্রহ করে ইন্টারনেট চেক করুন।', 'error');
    }
  };

  const handleStartConvertToHelper = () => {
    setConvertTargetAreas(user?.assignedAreaIds || []);
    setConvertServeAll(user?.serveAllAreas || false);
    setConvertingTargetRole('helper');
  };

  const handleStartConvertToCustomer = async () => {
    if (!currentUser?.isSuperAdmin) {
      showAlert('অনুমতি নেই', 'শুধুমাত্র Super Admin রোল রূপান্তর করতে পারবেন।', 'error');
      return;
    }
    const confirmed = await showConfirm(
      'কাস্টমার অ্যাকাউন্টে রূপান্তর',
      `আপনি কি নিশ্চিত যে ${user?.displayName || 'ব্যবহারকারী'}-কে Admin থেকে সাধারণ Customer অ্যাকাউন্টে পরিবর্তন করতে চান? অ্যাডমিন সুবিধাসমূহ ও জোন অ্যাসাইনমেন্ট সরানো হবে।`,
      'হ্যাঁ, Customer করুন',
      'বাতিল'
    );
    if (!confirmed) return;

    try {
      await fallbackStore.convertUserRole(userId, 'customer', [], false, user);
      setUserAssignedAreas([]);
      setUserServeAllAreas(false);
      showAlert('রূপান্তর সম্পন্ন', `${user?.displayName || 'ব্যবহারকারী'} এখন সাধারণ Customer হিসেবে সংরক্ষিত।`, 'success');
      if (onUserUpdated) onUserUpdated();
    } catch (err: any) {
      console.error('Error converting user to customer in modal:', err);
      showAlert('ত্রুটি', 'কাস্টমার রূপান্তর সম্পন্ন করা যায়নি।', 'error');
    }
  };

  const handleConfirmConvertToHelper = async () => {
    if (!currentUser?.isSuperAdmin) return;
    setIsConvertingUserRole(true);
    try {
      await fallbackStore.convertUserRole(
        userId,
        'helper',
        convertServeAll ? [] : convertTargetAreas,
        convertServeAll,
        user
      );
      setUserAssignedAreas(convertServeAll ? [] : convertTargetAreas);
      setUserServeAllAreas(convertServeAll);
      showAlert(
        'হেলপার অ্যাকাউন্টে রূপান্তর সম্পন্ন',
        `${user?.displayName || 'ব্যবহারকারী'} এখন একজন Helper হিসেবে নিবন্ধিত এবং সার্ভিস জোন নির্ধারণ করা হয়েছে।`,
        'success'
      );
      setConvertingTargetRole(null);
      if (onUserUpdated) onUserUpdated();
    } catch (err: any) {
      showAlert('ত্রুটি', err?.message || 'রূপান্তর সম্পন্ন করা সম্ভব হয়নি।', 'error');
    } finally {
      setIsConvertingUserRole(false);
    }
  };

  const handleSaveZoneAssignment = async () => {
    if (!user) return;
    setIsSavingAreas(true);
    try {
      const updatedUser: UserProfile = {
        ...user,
        assignedAreaIds: userServeAllAreas ? [] : userAssignedAreas,
        serveAllAreas: userServeAllAreas,
      };
      await fallbackStore.saveUser(updatedUser);

      // Sync allowedDeliveryAreas in pricing settings
      const areas = fallbackStore.pricingSettings.allowedDeliveryAreas || [];
      let areasChanged = false;
      const updatedAreas = areas.map((area) => {
        const nextArea = { ...area };
        const isSelected = userAssignedAreas.includes(area.id);

        if (user.isHelper || user.role === 'helper') {
          let helpers = nextArea.assignedHelperIds || [];
          if (isSelected && !userServeAllAreas) {
            if (!helpers.includes(user.uid)) {
              helpers = [...helpers, user.uid];
              areasChanged = true;
            }
          } else {
            if (helpers.includes(user.uid)) {
              helpers = helpers.filter((id) => id !== user.uid);
              areasChanged = true;
            }
          }
          nextArea.assignedHelperIds = helpers;
        }

        if (user.isAdmin || user.role === 'admin') {
          let admins = nextArea.assignedAdminIds || [];
          if (isSelected && !userServeAllAreas) {
            if (!admins.includes(user.uid)) {
              admins = [...admins, user.uid];
              areasChanged = true;
            }
          } else {
            if (admins.includes(user.uid)) {
              admins = admins.filter((id) => id !== user.uid);
              areasChanged = true;
            }
          }
          nextArea.assignedAdminIds = admins;
        }

        return nextArea;
      });

      if (areasChanged) {
        await fallbackStore.savePricingSettings({
          ...fallbackStore.pricingSettings,
          allowedDeliveryAreas: updatedAreas,
        });
      }

      showAlert('জোন সংরক্ষিত', 'সার্ভিস জোন সফলভাবে সংরক্ষণ করা হয়েছে।', 'success');
      if (onUserUpdated) onUserUpdated();
    } catch (err: any) {
      showAlert('ত্রুটি', err?.message || 'জোন সংরক্ষণ করা সম্ভব হয়নি।', 'error');
    } finally {
      setIsSavingAreas(false);
    }
  };

  const handleToggleSuperAdminRoleInModal = async () => {
    if (!currentUser?.isSuperAdmin) {
      showAlert('অনুমতি নেই', 'শুধুমাত্র Super Admin অন্য কাউকে Super Admin বানাতে বা সরাতে পারবেন।', 'error');
      return;
    }
    const isPrimarySuperAdmin = user?.email && ['ajnasim72@gmail.com'].includes(user.email.trim().toLowerCase());
    if (isPrimarySuperAdmin && user?.isSuperAdmin) {
      showAlert('সুরক্ষিত অ্যাকাউন্ট', 'মূল Super Admin এর রোল পরিবর্তন করা যাবে না।', 'warning');
      return;
    }
    const makeSuperAdmin = !user?.isSuperAdmin;
    const actionText = makeSuperAdmin ? 'Super Admin রোল প্রদান করতে' : 'Super Admin রোল অপসারণ করে সাধারণ Admin করতে';
    const confirmed = await showConfirm(
      'Super Admin রোল পরিবর্তন',
      `আপনি কি ${user?.displayName || 'ব্যবহারকারী'}-কে ${actionText} চান?`,
      makeSuperAdmin ? 'হ্যাঁ, Super Admin করুন' : 'হ্যাঁ, ডিমোট করুন',
      'বাতিল'
    );
    if (!confirmed) return;

    try {
      await fallbackStore.setSuperAdminRole(userId, makeSuperAdmin, user);
      showAlert(
        'রোল আপডেট সম্পন্ন',
        `${user?.displayName || 'ব্যবহারকারী'} ${makeSuperAdmin ? 'এখন একজন Super Admin।' : 'এখন একজন সাধারণ Admin হিসেবে সংরক্ষিত।'}`,
        'success'
      );
      if (onUserUpdated) onUserUpdated();
    } catch (err: any) {
      console.error('Error toggling super admin role in modal:', err);
      showAlert('ত্রুটি', 'Super Admin রোল পরিবর্তন করা সম্ভব হয়নি।', 'error');
    }
  };

  if (loadingUser || !user) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
        <div className="bg-white rounded-3xl p-8 flex flex-col items-center justify-center shadow-2xl space-y-4 max-w-sm w-full">
          <div className="w-10 h-10 border-4 border-purple-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-sm font-bold text-slate-600">ব্যবহারকারীর তথ্য লোড হচ্ছে...</p>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-800 bg-slate-100 rounded-xl"
          >
            বন্ধ করুন
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
        <div className="bg-white w-full max-w-4xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
          <LifetimeDataNotice className="m-3 mb-0 shrink-0" loading={lifetimeData.loading} error={lifetimeData.error} onRetry={lifetimeData.retry} />
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
              className="p-2.5 rounded-2xl bg-rose-500/80 hover:bg-rose-600 text-white transition-colors self-start md:self-auto shadow-sm"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Date Filter Bar - Defaults to TODAY */}
          <div className="p-3 sm:px-5 bg-gray-50 border-b border-gray-200 flex items-center justify-between gap-2 flex-wrap text-xs shrink-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[11px] font-bold text-gray-500 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-purple-700" />
                <span>Date Filter:</span>
              </span>
              {(['ALL_TIME', 'TODAY', 'YESTERDAY', 'LAST_7', 'LAST_30', 'THIS_MONTH', 'CUSTOM'] as const).map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => handlePresetSelect(preset)}
                  className={`px-3 py-1 rounded-xl font-extrabold text-xs transition-all cursor-pointer ${
                    activePreset === preset
                      ? 'bg-purple-900 text-white shadow-xs'
                      : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-100'
                  }`}
                >
                  {presetLabels[preset]}
                </button>
              ))}
            </div>

            {/* Custom Date Range Pickers */}
            {(activePreset === 'CUSTOM' || showCustomPicker) && (
              <div className="flex items-center gap-2 bg-white px-2.5 py-1 rounded-xl border border-gray-200 shadow-xs animate-in fade-in duration-150">
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="px-2 py-0.5 bg-gray-50 rounded-lg text-xs font-bold text-gray-800 border border-gray-200 outline-none"
                />
                <span className="text-gray-400 font-bold">to</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => {
                    setEndDate(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="px-2 py-0.5 bg-gray-50 rounded-lg text-xs font-bold text-gray-800 border border-gray-200 outline-none"
                />
              </div>
            )}
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
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 p-4 bg-gray-50 border-b border-gray-100 text-center text-xs">
            <div className="p-3 bg-white rounded-2xl border border-gray-200 shadow-sm">
              <span className="text-[10px] font-extrabold text-gray-400 uppercase tracking-wider block">
                Customer Orders {activePreset !== 'ALL_TIME' && `(${presetLabels[activePreset]})`}
              </span>
              <span className="text-xl font-black text-gray-900">{customerOrders.length}</span>
              <span className="text-[10px] text-emerald-600 block font-bold">
                {completedCustomerOrders.length} completed
                {activePreset !== 'ALL_TIME' && ` • ${allCustomerOrders.length} total`}
              </span>
            </div>
            <div className="p-3 bg-white rounded-2xl border border-gray-200 shadow-sm">
              <span className="text-[10px] font-extrabold text-gray-400 uppercase tracking-wider block">
                Total Spent {activePreset !== 'ALL_TIME' && `(${presetLabels[activePreset]})`}
              </span>
              <span className="text-xl font-black text-purple-900">৳{totalSpent}</span>
              <span className="text-[10px] text-gray-400 block">
                {activePreset !== 'ALL_TIME' ? 'in selected period' : 'gross purchases'}
              </span>
            </div>
            <div className="p-3 bg-white rounded-2xl border border-gray-200 shadow-sm">
              <span className="text-[10px] font-extrabold text-gray-400 uppercase tracking-wider block">
                Helper Deliveries {activePreset !== 'ALL_TIME' && `(${presetLabels[activePreset]})`}
              </span>
              <span className="text-xl font-black text-indigo-900">{helperOrders.length}</span>
              <span className="text-[10px] text-emerald-600 block font-bold">
                {completedHelperOrders.length} completed
                {activePreset !== 'ALL_TIME' && ` • ${allHelperOrders.length} total`}
              </span>
            </div>
            <div className="p-3 bg-white rounded-2xl border border-gray-200 shadow-sm">
              <span className="text-[10px] font-extrabold text-gray-400 uppercase tracking-wider block">
                {user.isHelper ? 'Outstanding Due' : 'Wallet Balance'}
              </span>
              <span className={`text-xl font-black ${user.isHelper && wallet.balance > 0 ? 'text-red-650' : 'text-emerald-600'}`}>
                ৳{wallet.balance}
              </span>
              <span className="text-[10px] text-indigo-700 block font-semibold">৳{wallet.totalEarned} earned</span>
            </div>
            <div 
              onClick={() => {
                setCoinsInput(String(user.coins ?? 0));
                setIsEditingCoins(true);
              }}
              className="p-3 bg-gradient-to-br from-amber-50 to-yellow-50/80 rounded-2xl border border-amber-200/80 shadow-sm cursor-pointer hover:border-amber-400 hover:shadow-md transition-all text-amber-950 group"
              title="Click to edit user reward coins"
            >
              <div className="flex items-center justify-center space-x-1">
                <Coins className="w-3.5 h-3.5 text-amber-600" />
                <span className="text-[10px] font-extrabold text-amber-700 uppercase tracking-wider block">Reward Coins</span>
              </div>
              <span className="text-xl font-black text-amber-950 flex items-center justify-center gap-1">
                🪙 {user.coins ?? 0}
              </span>
              <span className="text-[10px] text-amber-700 block font-bold group-hover:underline">
                {user.totalEarnedCoins || user.coins || 0} earned • Edit ✏️
              </span>
            </div>
          </div>

          {/* Sub Navigation Bar */}
          <DraggableTabsContainer
            showScrollButtons={false}
            containerClassName="bg-gray-100/70 border-b border-gray-200 rounded-none px-4 pt-2 pb-0"
            className="bg-transparent border-none p-0 space-x-2"
            activeKey={activeTab}
          >
            <button
              onClick={() => setActiveTab('OVERVIEW')}
              data-active={activeTab === 'OVERVIEW'}
              className={`py-2.5 px-4 rounded-t-2xl border-t border-x transition-all whitespace-nowrap shrink-0 ${
                activeTab === 'OVERVIEW'
                  ? 'bg-white border-gray-200 text-purple-950 shadow-sm font-bold'
                  : 'border-transparent text-gray-600 hover:text-gray-900 font-semibold'
              }`}
            >
              Overview & Live State
            </button>
            <button
              onClick={() => setActiveTab('CUSTOMER_ORDERS')}
              data-active={activeTab === 'CUSTOMER_ORDERS'}
              className={`py-2.5 px-4 rounded-t-2xl border-t border-x transition-all whitespace-nowrap shrink-0 ${
                activeTab === 'CUSTOMER_ORDERS'
                  ? 'bg-white border-gray-200 text-purple-950 shadow-sm font-bold'
                  : 'border-transparent text-gray-600 hover:text-gray-900 font-semibold'
              }`}
            >
              Customer Orders History ({customerOrders.length})
            </button>
            {user.isHelper && (
              <button
                onClick={() => setActiveTab('HELPER_DELIVERIES')}
                data-active={activeTab === 'HELPER_DELIVERIES'}
                className={`py-2.5 px-4 rounded-t-2xl border-t border-x transition-all whitespace-nowrap shrink-0 ${
                  activeTab === 'HELPER_DELIVERIES'
                    ? 'bg-white border-gray-200 text-purple-950 shadow-sm font-bold'
                    : 'border-transparent text-gray-600 hover:text-gray-900 font-semibold'
                }`}
              >
                Helper Work History ({helperOrders.length})
              </button>
            )}
            <button
              onClick={() => setActiveTab('WALLET')}
              data-active={activeTab === 'WALLET'}
              className={`py-2.5 px-4 rounded-t-2xl border-t border-x transition-all whitespace-nowrap shrink-0 ${
                activeTab === 'WALLET'
                  ? 'bg-white border-gray-200 text-purple-950 shadow-sm font-bold'
                  : 'border-transparent text-gray-600 hover:text-gray-900 font-semibold'
              }`}
            >
              Wallet Transactions ({walletTxs.length})
            </button>
            <button
              onClick={() => setActiveTab('REFERRALS')}
              data-active={activeTab === 'REFERRALS'}
              className={`py-2.5 px-4 rounded-t-2xl border-t border-x transition-all whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
                activeTab === 'REFERRALS'
                  ? 'bg-white border-gray-200 text-purple-950 shadow-sm font-bold'
                  : 'border-transparent text-gray-600 hover:text-gray-900 font-semibold'
              }`}
            >
              <span>Referrals</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                totalDeliveredReferrals > 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-200 text-gray-600'
              }`}>
                {totalDeliveredReferrals}
              </span>
            </button>
            <button
              onClick={() => setActiveTab('MANAGEMENT')}
              data-active={activeTab === 'MANAGEMENT'}
              className={`py-2.5 px-4 rounded-t-2xl border-t border-x transition-all whitespace-nowrap shrink-0 ${
                activeTab === 'MANAGEMENT'
                  ? 'bg-white border-gray-200 text-purple-950 shadow-sm font-bold'
                  : 'border-transparent text-gray-600 hover:text-gray-900 font-semibold'
              }`}
            >
              Labeling, Block & Actions
            </button>
          </DraggableTabsContainer>

          {/* Modal Main Body */}
          <div className="p-5 overflow-y-auto space-y-4 flex-1 text-xs">

            {/* TAB 1: OVERVIEW & LIVE RUNNING STATES */}
            {activeTab === 'OVERVIEW' && (
              <div className="space-y-5">
                {/* Block Warning Banner if user is blocked */}
                {user.isBlocked && (
                  <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-900 flex items-start space-x-3">
                    <ShieldAlert className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <h4 className="font-extrabold text-sm text-red-950">এই ব্যবহারকারী একাউন্ট বর্তমানে ব্লকড (BLOCKED)!</h4>
                      <p className="text-xs text-red-800">
                        🔒 <strong>অ্যাডমিন ইন্টারনাল নোট:</strong> "{user.adminBlockNote || user.blockedReason || 'অ্যাডমিন দ্বারা সীমাবদ্ধ'}"
                      </p>
                      <p className="text-[10px] text-red-600 font-medium">
                        (এই নোটটি শুধুমাত্র অ্যাডমিন দেখতে পাবেন। ব্যবহারকারীর কাছে অ্যাডমিন সেটিংসের নোটিশ যাবে।)
                      </p>
                    </div>
                  </div>
                )}

                {/* Reward Coins & Gamification Balance Card */}
                <div className="bg-gradient-to-br from-amber-50 via-yellow-50/50 to-orange-50/30 p-4 rounded-2xl border border-amber-200/80 space-y-3 shadow-xs">
                  <div className="flex justify-between items-center flex-wrap gap-2">
                    <h4 className="font-extrabold text-xs text-amber-950 uppercase tracking-wider flex items-center space-x-1.5">
                      <Coins className="w-4 h-4 text-amber-600" />
                      <span>জামানত কয়েন ও রিওয়ার্ড ব্যালেন্স (Reward Coins & Balance)</span>
                    </h4>
                    {!isEditingCoins && (
                      <button
                        type="button"
                        onClick={() => {
                          setCoinsInput(String(user.coins ?? 0));
                          setIsEditingCoins(true);
                        }}
                        className="py-1 px-3 bg-amber-500 hover:bg-amber-600 text-purple-950 font-black rounded-xl text-[10px] transition-all flex items-center space-x-1 shadow-xs cursor-pointer active:scale-95"
                      >
                        <Edit2 className="w-3 h-3" />
                        <span>কয়েন পরিবর্তন (Edit Coins)</span>
                      </button>
                    )}
                  </div>

                  {isEditingCoins ? (
                    <form onSubmit={handleSaveCoins} className="p-3.5 bg-white rounded-2xl border border-amber-300 space-y-3 shadow-sm">
                      <div className="flex items-center justify-between flex-wrap gap-1">
                        <label className="text-xs font-black text-amber-950">
                          নতুন কয়েন সংখ্যা নির্ধারণ করুন (Set Coin Balance):
                        </label>
                        <span className="text-[10px] text-gray-500 font-bold">
                          বর্তমান ব্যালেন্স: <strong className="text-amber-700">{user.coins ?? 0}</strong> কয়েন
                        </span>
                      </div>

                      <div className="flex items-center space-x-2">
                        <div className="relative flex-1">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm">🪙</span>
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={coinsInput}
                            onChange={(e) => setCoinsInput(e.target.value)}
                            className="w-full pl-9 pr-3 py-2 bg-amber-50/50 border border-amber-300 rounded-xl text-sm font-black text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                            required
                            autoFocus
                          />
                        </div>
                      </div>

                      {/* Quick Adjust Buttons */}
                      <div className="flex flex-wrap gap-1.5 items-center pt-0.5">
                        <span className="text-[10px] font-bold text-gray-500 mr-1">দ্রুত যোগ/বিয়োগ:</span>
                        {[-50, -20, -10, 10, 20, 50, 100].map((delta) => (
                          <button
                            key={delta}
                            type="button"
                            onClick={() => {
                              const currentVal = parseInt(coinsInput, 10) || 0;
                              setCoinsInput(String(Math.max(0, currentVal + delta)));
                            }}
                            className={`px-2 py-1 rounded-lg text-[10px] font-extrabold transition-all cursor-pointer ${
                              delta > 0 
                                ? 'bg-emerald-100 hover:bg-emerald-200 text-emerald-900' 
                                : 'bg-red-100 hover:bg-red-200 text-red-900'
                            }`}
                          >
                            {delta > 0 ? `+${delta}` : `${delta}`}
                          </button>
                        ))}
                        <button
                          type="button"
                          onClick={() => setCoinsInput('0')}
                          className="px-2 py-1 rounded-lg text-[10px] font-extrabold bg-gray-100 hover:bg-gray-200 text-gray-700 transition-all cursor-pointer"
                        >
                          Reset (0)
                        </button>
                      </div>

                      <div>
                        <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">
                          পরিবর্তনের কারণ/নোট (ঐচ্ছিক - ব্যবহারকারী নোটিফিকেশনে দেখতে পাবেন):
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. Compensation, loyalty bonus, admin adjustment..."
                          value={coinsReasonInput}
                          onChange={(e) => setCoinsReasonInput(e.target.value)}
                          className="w-full px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-amber-500"
                        />
                      </div>

                      <div className="flex gap-2 pt-1">
                        <button
                          type="submit"
                          disabled={savingCoins}
                          className="py-1.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black transition-all shadow-xs flex items-center space-x-1 cursor-pointer"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>{savingCoins ? 'সংরক্ষণ হচ্ছে...' : 'সংরক্ষণ করুন (Save Coins)'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setIsEditingCoins(false);
                            setCoinsInput(String(user.coins ?? 0));
                            setCoinsReasonInput('');
                          }}
                          className="py-1.5 px-3 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-xl text-xs font-bold transition-all cursor-pointer"
                        >
                          বাতিল (Cancel)
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                      <div className="p-3 bg-white/80 rounded-xl border border-amber-200">
                        <span className="text-[10px] font-extrabold text-amber-800 uppercase block">Current Active Coins</span>
                        <div className="text-xl font-black text-amber-950 flex items-center space-x-1.5 mt-0.5">
                          <span>🪙 {user.coins ?? 0}</span>
                          <span className="text-xs font-bold text-gray-500">Coins</span>
                        </div>
                        <span className="text-[10px] text-gray-500 block mt-0.5">User sees this balance live</span>
                      </div>
                      <div className="p-3 bg-white/80 rounded-xl border border-amber-200">
                        <span className="text-[10px] font-extrabold text-amber-800 uppercase block">Lifetime Earned</span>
                        <div className="text-xl font-black text-purple-950 flex items-center space-x-1.5 mt-0.5">
                          <span>{user.totalEarnedCoins || user.coins || 0}</span>
                          <span className="text-xs font-bold text-gray-500">Coins</span>
                        </div>
                        <span className="text-[10px] text-gray-500 block mt-0.5">Total earned across orders</span>
                      </div>
                      <div className="p-3 bg-white/80 rounded-xl border border-amber-200">
                        <span className="text-[10px] font-extrabold text-amber-800 uppercase block">Loyalty Tier Status</span>
                        <span className="text-sm font-black text-indigo-900 block mt-1">
                          {(user.totalEarnedCoins || user.coins || 0) >= 500
                            ? '💎 Platinum Member'
                            : (user.totalEarnedCoins || user.coins || 0) >= 200
                            ? '🥇 Gold Member'
                            : (user.totalEarnedCoins || user.coins || 0) >= 50
                            ? '🥈 Silver Member'
                            : '🥉 Standard Member'}
                        </span>
                        <span className="text-[10px] text-indigo-700 block mt-0.5">Tier unlocks perks</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Referrals & Growth Summary Card */}
                <div className="bg-gradient-to-br from-emerald-50/70 via-teal-50/40 to-slate-50 p-4 rounded-2xl border border-emerald-200/80 space-y-3 shadow-xs">
                  <div className="flex justify-between items-center flex-wrap gap-2">
                    <div>
                      <h4 className="font-extrabold text-xs text-emerald-950 uppercase tracking-wider flex items-center space-x-1.5">
                        <Share2 className="w-4 h-4 text-emerald-600" />
                        <span>রেফারেল পরিসংখ্যান (Referrals & Invited Users)</span>
                      </h4>
                      <p className="text-[10px] text-gray-500 font-semibold mt-0.5">
                        * শুধুমাত্র সফলভাবে ডেলিভারি (DELIVERED) সম্পন্ন হওয়া অর্ডারসমূহ সফল রেফারেল হিসেবে গণ্য হয়।
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveTab('REFERRALS')}
                      className="py-1 px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded-xl text-[10px] transition-all flex items-center space-x-1 shadow-xs cursor-pointer active:scale-95"
                    >
                      <span>বিস্তারিত তালিকা ({totalDeliveredReferrals})</span>
                      <ChevronRight className="w-3 h-3" />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                    <div className="p-3 bg-white rounded-xl border border-emerald-200 shadow-2xs">
                      <span className="text-[10px] font-extrabold text-emerald-800 uppercase block">
                        Total Successfully Referred
                      </span>
                      <div className="text-xl font-black text-emerald-950 flex items-center space-x-1.5 mt-0.5">
                        <span>👥 {totalDeliveredReferrals}</span>
                        <span className="text-xs font-bold text-gray-500">Users</span>
                      </div>
                      <span className="text-[10px] text-emerald-700 font-semibold block mt-0.5">
                        Successfully delivered orders only
                      </span>
                    </div>

                    <div className="p-3 bg-white rounded-xl border border-emerald-200 shadow-2xs">
                      <span className="text-[10px] font-extrabold text-emerald-800 uppercase block">
                        Referral Coins Earned
                      </span>
                      <div className="text-xl font-black text-amber-900 flex items-center space-x-1.5 mt-0.5">
                        <span>🪙 {deliveredReferrals.reduce((sum, r) => sum + (r.rewardedCoins || 20), 0)}</span>
                        <span className="text-xs font-bold text-gray-500">Coins</span>
                      </div>
                      <span className="text-[10px] text-gray-500 block mt-0.5">
                        Credited to user balance
                      </span>
                    </div>

                    <div className="p-3 bg-white rounded-xl border border-emerald-200 shadow-2xs">
                      <span className="text-[10px] font-extrabold text-emerald-800 uppercase block">
                        Pending First Order
                      </span>
                      <div className="text-xl font-black text-gray-800 flex items-center space-x-1.5 mt-0.5">
                        <span>⏳ {pendingReferrals.length}</span>
                        <span className="text-xs font-bold text-gray-500">Invited</span>
                      </div>
                      <span className="text-[10px] text-gray-500 block mt-0.5">
                        Awaiting first delivered order
                      </span>
                    </div>
                  </div>
                </div>

                {/* Profile Details Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                   {/* Account Information */}
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-2">
                    <div className="flex justify-between items-center">
                      <h4 className="font-extrabold text-xs text-slate-800 uppercase tracking-wider flex items-center space-x-1.5">
                        <User className="w-4 h-4 text-purple-700" />
                        <span>Account Profile Details</span>
                      </h4>
                      {!isEditingInfo && (
                        <button
                          onClick={() => setIsEditingInfo(true)}
                          className="py-1 px-3 bg-purple-900 hover:bg-purple-950 text-white rounded-xl text-[10px] font-extrabold transition-all"
                        >
                          Edit
                        </button>
                      )}
                    </div>
                    {isEditingInfo ? (
                      <form onSubmit={handleSaveInfo} className="space-y-2.5 pt-1">
                        <div>
                          <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">Name</label>
                          <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="w-full px-3 py-1.5 bg-white border border-gray-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-purple-600"
                            required
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">Email</label>
                          <input
                            type="email"
                            value={editEmail}
                            onChange={(e) => setEditEmail(e.target.value)}
                            className="w-full px-3 py-1.5 bg-white border border-gray-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-purple-600"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">Whatsapp Number</label>
                          <input
                            type="text"
                            value={editPhone}
                            onChange={(e) => setEditPhone(e.target.value)}
                            className="w-full px-3 py-1.5 bg-white border border-gray-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-purple-600"
                          />
                        </div>
                        <div className="flex gap-2 pt-1">
                          <button
                            type="submit"
                            className="py-1.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-extrabold transition-all"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setIsEditingInfo(false);
                              if (user) {
                                setEditName(user.displayName);
                                setEditEmail(user.email || '');
                                setEditPhone(user.alternativePhone || '');
                              }
                            }}
                            className="py-1.5 px-3 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-xl text-xs font-extrabold transition-all"
                          >
                            Cancel
                          </button>
                        </div>
                      </form>
                    ) : (
                      <div className="space-y-1.5 text-slate-700 font-medium">
                        <p><strong>Name:</strong> {user.displayName}</p>
                        <p><strong>Email:</strong> {user.email || 'N/A'}</p>
                        <p><strong>Whatsapp Number (Contact):</strong> <span className="font-extrabold text-slate-900">{user.alternativePhone || 'N/A'}</span></p>
                        <p><strong>Saved Delivery Address:</strong> <span className="font-extrabold text-emerald-800">{user.defaultDeliveryLocation?.address || 'N/A'}</span></p>
                        <p><strong>Preferred Missing Item Action:</strong> {user.missingItemPreference || 'DEFAULT (SKIP)'}</p>
                        <p><strong>Primary Mode:</strong> {user.lastActiveMode}</p>

                        {/* Account Type (Role) Change */}
                        <div className="pt-2 mt-1 border-t border-slate-200">
                          <div className="flex items-center justify-between flex-wrap gap-2">
                            <span className="font-bold text-slate-700 text-xs">Account Type:</span>
                            <div className="flex items-center gap-2">
                              <select
                                value={['customer', 'store', 'helper'].includes(user.role) ? user.role : 'customer'}
                                disabled={savingRole}
                                onChange={(e) => handleChangeUserType(e.target.value as UserRole)}
                                className="px-2.5 py-1.5 bg-white border border-purple-300 rounded-xl text-xs font-extrabold text-purple-950 focus:outline-none focus:ring-2 focus:ring-purple-500 cursor-pointer disabled:opacity-60"
                              >
                                <option value="customer">👤 Customer</option>
                                <option value="store">🏪 Store</option>
                                <option value="helper">🚲 Helper</option>
                              </select>
                              {savingRole && (
                                <span className="text-[10px] text-purple-600 font-bold animate-pulse">Saving...</span>
                              )}
                            </div>
                          </div>
                          <p className="text-[10px] text-gray-400 mt-1">Changing account type updates the user's role and syncs their helper/store flags accordingly.</p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Helper Information & Type Status Toggle */}
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="font-extrabold text-xs text-slate-800 uppercase tracking-wider flex items-center space-x-1.5">
                        <Bike className="w-4 h-4 text-indigo-700" />
                        <span>Helper Verification & Status</span>
                      </h4>
                      {user.isEduVerified && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-extrabold bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full border border-blue-200">
                          <Check className="w-3 h-3 text-blue-600" />
                          <span>Edu Verified</span>
                        </span>
                      )}
                    </div>

                    <div className="bg-white p-3 rounded-xl border border-slate-200 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-gray-700">Helper Sub-Type Status:</span>
                        <select
                          value={user.helperType || 'commuter'}
                          onChange={async (e) => {
                            const newType = e.target.value as 'commuter' | 'dedicated';
                            const updated = { ...user, helperType: newType, isHelper: true };
                            await fallbackStore.saveUser(updated);

                            if (newType === 'dedicated' && helperApp) {
                              await fallbackStore.updateHelperApp(helperApp.id, {
                                applicationType: 'dedicated',
                                status: 'APPROVED',
                              });
                            }

                            showAlert('স্ট্যাটাস আপডেট', `হেলপার স্ট্যাটাস ${newType === 'dedicated' ? 'Dedicated Helper' : 'Commuter Helper'} হিসেবে পরিবর্তন করা হয়েছে।`, 'success');
                            if (onUserUpdated) onUserUpdated();
                          }}
                          className="px-2.5 py-1 bg-slate-100 border border-slate-300 rounded-lg text-xs font-extrabold text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-500"
                        >
                          <option value="commuter">🚲 Commuter Helper</option>
                          <option value="dedicated">⚡ Dedicated Rider</option>
                        </select>
                      </div>
                    </div>

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
                      <p className="text-gray-500 italic py-1">কোনো হেলপার রেজিস্ট্রেশন আবেদন জমা দেওয়া হয়নি।</p>
                    )}

                    {/* Customer Feedback & Rider Rating Summary */}
                    {(() => {
                      const hFeedbacks = Array.from(fallbackStore.orderFeedbacks.values()).filter(
                        (fb) => fb.helperId === userId
                      );
                      if (hFeedbacks.length === 0) return null;
                      const avgRider = (hFeedbacks.reduce((s, f) => s + f.riderRating, 0) / hFeedbacks.length).toFixed(1);
                      const avgService = (hFeedbacks.reduce((s, f) => s + f.serviceRating, 0) / hFeedbacks.length).toFixed(1);
                      const comments = hFeedbacks.filter((f) => f.improvementComment && f.improvementComment.trim().length > 0);

                      return (
                        <div className="mt-3 pt-3 border-t border-slate-200 space-y-2">
                          <h5 className="font-extrabold text-xs text-amber-900 uppercase tracking-wider flex items-center space-x-1.5">
                            <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                            <span>Rider Performance Ratings & Feedback ({hFeedbacks.length})</span>
                          </h5>
                          <div className="grid grid-cols-2 gap-2 text-center text-xs">
                            <div className="p-2 bg-amber-50 rounded-xl border border-amber-200">
                              <span className="text-[10px] font-bold text-amber-800 block uppercase">Behavior Rating</span>
                              <span className="text-sm font-black text-amber-900">⭐ {avgRider} / 5</span>
                            </div>
                            <div className="p-2 bg-emerald-50 rounded-xl border border-emerald-200">
                              <span className="text-[10px] font-bold text-emerald-800 block uppercase">Service Quality</span>
                              <span className="text-sm font-black text-emerald-900">⭐ {avgService} / 5</span>
                            </div>
                          </div>
                          {comments.length > 0 && (
                            <div className="space-y-1.5 pt-1">
                              <span className="text-[10px] font-bold text-gray-500 block uppercase">Recent Customer Comments:</span>
                              <div className="space-y-1 max-h-24 overflow-y-auto">
                                {comments.map((c) => (
                                  <div key={c.id} className="p-2 bg-gray-50 border border-gray-200 rounded-xl text-[11px]">
                                    <span className="font-bold text-gray-900">{c.customerName || 'Customer'}:</span>{' '}
                                    <span className="text-gray-700">&ldquo;{c.improvementComment}&rdquo;</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })()}
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
                            <p className="font-extrabold text-gray-900 mt-1">{ord.title || ord.items?.[0]?.name || 'Order'}</p>
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
                            <p className="font-extrabold text-gray-900 mt-1">{ord.title || ord.items?.[0]?.name || 'Order'}</p>
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
                <div className="flex items-center justify-between">
                  <h4 className="font-extrabold text-xs text-gray-700 uppercase tracking-wider">
                    Customer Orders ({customerOrders.length}) {activePreset !== 'ALL_TIME' && `• ${presetLabels[activePreset]}`}
                  </h4>
                  {activePreset !== 'ALL_TIME' && allCustomerOrders.length > 0 && (
                    <button
                      type="button"
                      onClick={() => handlePresetSelect('ALL_TIME')}
                      className="text-xs font-bold text-purple-700 hover:underline cursor-pointer"
                    >
                      Show All Time ({allCustomerOrders.length})
                    </button>
                  )}
                </div>

                {customerOrders.length === 0 ? (
                  <div className="py-12 text-center text-gray-400 space-y-2">
                    <ShoppingBag className="w-10 h-10 mx-auto opacity-40" />
                    <p className="font-bold text-sm text-gray-700">
                      {activePreset === 'TODAY'
                        ? 'আজকে এই ব্যবহারকারীর কোনো কাস্টমার অর্ডার নেই।'
                        : 'নির্বাচিত সময়ে কোনো কাস্টমার অর্ডার নেই।'}
                    </p>
                    {allCustomerOrders.length > 0 && activePreset !== 'ALL_TIME' && (
                      <button
                        type="button"
                        onClick={() => handlePresetSelect('ALL_TIME')}
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-900 text-xs font-black transition-all cursor-pointer shadow-xs"
                      >
                        সকল {allCustomerOrders.length}টি পূর্বের অর্ডার দেখতে ক্লিক করুন (All Time)
                      </button>
                    )}
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
                          <p className="font-extrabold text-gray-800">{ord.title || ord.items?.[0]?.name || 'Order'}</p>
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
                <div className="flex items-center justify-between">
                  <h4 className="font-extrabold text-xs text-gray-700 uppercase tracking-wider">
                    Helper Delivery Work ({helperOrders.length}) {activePreset !== 'ALL_TIME' && `• ${presetLabels[activePreset]}`}
                  </h4>
                  {activePreset !== 'ALL_TIME' && allHelperOrders.length > 0 && (
                    <button
                      type="button"
                      onClick={() => handlePresetSelect('ALL_TIME')}
                      className="text-xs font-bold text-purple-700 hover:underline cursor-pointer"
                    >
                      Show All Time ({allHelperOrders.length})
                    </button>
                  )}
                </div>

                {helperOrders.length === 0 ? (
                  <div className="py-12 text-center text-gray-400 space-y-2">
                    <Bike className="w-10 h-10 mx-auto opacity-40" />
                    <p className="font-bold text-sm text-gray-700">
                      {activePreset === 'TODAY'
                        ? 'আজকে এই হেলপারের কোনো ডেলিভারি কাজ নেই।'
                        : 'নির্বাচিত সময়ে কোনো হেলপার ডেলিভারি নেই।'}
                    </p>
                    {allHelperOrders.length > 0 && activePreset !== 'ALL_TIME' && (
                      <button
                        type="button"
                        onClick={() => handlePresetSelect('ALL_TIME')}
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-900 text-xs font-black transition-all cursor-pointer shadow-xs"
                      >
                        সকল {allHelperOrders.length}টি পূর্বের ডেলিভারি দেখতে ক্লিক করুন (All Time)
                      </button>
                    )}
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
                          <p className="font-extrabold text-gray-800">{ord.title || ord.items?.[0]?.name || 'Order'}</p>
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
            {activeTab === 'WALLET' && (() => {
              const pricing = fallbackStore.pricingSettings;
              const minFee = pricing.feeCalculatorMinFee ?? 20;
              const totalRiderEarned = completedHelperOrders.reduce((sum, o) => {
                const effectiveFee = o.isFreeDelivery
                  ? Math.max(o.originalDeliveryFee || 0, minFee)
                  : Math.max(o.deliveryFee || 0, minFee);
                return sum + calculateHelperCommission(effectiveFee, pricing);
              }, 0);
              const totalPlatformShare = completedHelperOrders.reduce((sum, o) => {
                const effectiveFee = o.isFreeDelivery
                  ? Math.max(o.originalDeliveryFee || 0, minFee)
                  : Math.max(o.deliveryFee || 0, minFee);
                return sum + (effectiveFee - calculateHelperCommission(effectiveFee, pricing));
              }, 0);
              const totalPaidCommission = wallet.totalPaidCommission || 0;
              const remainingDueCommission = Math.max(0, totalPlatformShare - totalPaidCommission);

              return (
                <div className="space-y-4">
                  {user.isHelper && (
                    <div className="p-5 bg-gradient-to-br from-indigo-950 via-slate-900 to-indigo-900 text-white rounded-3xl space-y-4 shadow-md border border-indigo-800/40">
                      <h4 className="font-extrabold text-sm text-indigo-300 uppercase tracking-wider flex items-center space-x-2">
                        <Bike className="w-5 h-5 text-indigo-400" />
                        <span>Rider Cash Collection & Commission Ledger</span>
                      </h4>
                      <p className="text-[11px] text-slate-300 font-medium">
                        যেহেতু হেলপার কাস্টমারের কাছ থেকে সরাসরি নগদ মূল্য (পণ্য ও ডেলিভারি ফি) সংগ্রহ করে, তাই হেলপারের কাছ থেকে প্লাটফর্ম কমিশন পাওনা থাকে।
                      </p>
                      
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
                        <div className="p-3 bg-white/5 rounded-2xl border border-white/10">
                          <span className="text-[10px] text-indigo-200 uppercase block font-bold">Total Earned (Rider)</span>
                          <span className="text-lg font-black text-white">৳{totalRiderEarned}</span>
                        </div>
                        <div className="p-3 bg-white/5 rounded-2xl border border-white/10">
                          <span className="text-[10px] text-indigo-200 uppercase block font-bold">Platform Share</span>
                          <span className="text-lg font-black text-amber-300">৳{totalPlatformShare}</span>
                        </div>
                        <div className="p-3 bg-white/5 rounded-2xl border border-white/10">
                          <span className="text-[10px] text-indigo-200 uppercase block font-bold">Total Paid Back</span>
                          <span className="text-lg font-black text-emerald-400">৳{totalPaidCommission}</span>
                        </div>
                        <div className="p-3 bg-white/5 rounded-2xl border border-white/10">
                          <span className="text-[10px] text-indigo-200 uppercase block font-bold">Remaining Due</span>
                          <span className={`text-lg font-black ${remainingDueCommission > 0 ? 'text-red-400 font-black' : 'text-slate-300'}`}>৳{remainingDueCommission}</span>
                        </div>
                      </div>

                      {/* Record Commission Payback Form */}
                      <form onSubmit={handleRecordPayback} className="p-4 bg-white/5 rounded-2xl border border-white/10 space-y-3">
                        <h5 className="font-extrabold text-xs text-indigo-200">হেলপারের পরিশোধিত কমিশন রেকর্ড করুন (Record Payment from Rider):</h5>
                        <div className="flex flex-col sm:flex-row gap-2">
                          <input
                            type="number"
                            min="1"
                            placeholder="Amount (৳)..."
                            value={paybackAmount}
                            onChange={(e) => setPaybackAmount(e.target.value)}
                            className="flex-1 px-4 py-2 bg-white/10 border border-white/20 rounded-xl text-xs font-semibold text-white focus:outline-none focus:border-indigo-400 outline-none"
                            required
                          />
                          <input
                            type="text"
                            placeholder="Payment details (e.g. bKash TxID, cash)..."
                            value={paybackNote}
                            onChange={(e) => setPaybackNote(e.target.value)}
                            className="flex-1 px-4 py-2 bg-white/10 border border-white/20 rounded-xl text-xs font-semibold text-white focus:outline-none focus:border-indigo-400 outline-none"
                            required
                          />
                          <button
                            type="submit"
                            disabled={recordingPayback}
                            className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black transition-all flex items-center justify-center space-x-1"
                          >
                            <span>Record Payment</span>
                          </button>
                        </div>
                      </form>
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-2">
                    <h4 className="font-extrabold text-xs text-gray-700 uppercase tracking-wider">
                      Wallet Ledger ({walletTxs.length})
                    </h4>
                    <div className="text-xs font-bold text-gray-700">
                      {user.isHelper ? 'Outstanding Due: ' : 'Current Balance: '}
                      <strong className={`font-extrabold ${user.isHelper && wallet.balance > 0 ? 'text-red-650' : 'text-emerald-600'}`}>
                        ৳{wallet.balance}
                      </strong>
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
                              tx.amount > 0 
                                ? tx.type === 'PAYBACK' 
                                  ? 'text-indigo-600' 
                                  : 'text-emerald-600' 
                                : 'text-purple-900'
                            }`}
                          >
                            {tx.amount > 0 ? `+৳${tx.amount}` : `-৳${Math.abs(tx.amount)}`}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* TAB: REFERRALS HISTORY & DETAILS */}
            {activeTab === 'REFERRALS' && (
              <div className="space-y-4">
                {/* Referrals Metric Header */}
                <div className="p-4 bg-gradient-to-r from-emerald-600 to-teal-700 text-white rounded-2xl shadow-sm flex items-center justify-between flex-wrap gap-3">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-md flex items-center justify-center shrink-0">
                      <Share2 className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h3 className="font-extrabold text-sm text-white">
                        Customer Referral History (রেফারেল হিস্ট্রি)
                      </h3>
                      <p className="text-[11px] text-emerald-100 font-medium">
                        সফল রেফারেল কেবল তখনই গণনা করা হয় যখন নতুন গ্রাহকের প্রথম অর্ডারটি সফলভাবে ডেলিভারি (DELIVERED) সম্পন্ন হয়।
                      </p>
                    </div>
                  </div>
                  <div className="text-right bg-white/10 px-3 py-1.5 rounded-xl border border-white/20">
                    <div className="text-[10px] font-extrabold uppercase text-emerald-100">Total Delivered Referrals</div>
                    <div className="text-xl font-black text-white">{totalDeliveredReferrals} Users</div>
                  </div>
                </div>

                {/* Section: Delivered Referrals ("to whoms") */}
                <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-2xs space-y-3 p-4">
                  <div className="flex items-center justify-between border-b border-gray-100 pb-2.5">
                    <h4 className="font-black text-xs text-gray-900 flex items-center gap-1.5 uppercase tracking-wider">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span>সফলভাবে রেফারকৃত গ্রাহকগণ (Successfully Referred Users - {totalDeliveredReferrals})</span>
                    </h4>
                    <span className="text-[10px] font-bold text-gray-500">
                      ক্যালকুলেটেড: শুধুমাত্র DELIVERED অর্ডার
                    </span>
                  </div>

                  {deliveredReferrals.length === 0 ? (
                    <div className="text-center py-8 text-gray-500 bg-gray-50/60 rounded-xl border border-dashed border-gray-200">
                      <Share2 className="w-8 h-8 text-gray-300 mx-auto mb-1.5" />
                      <p className="font-bold text-xs text-gray-700">কোনো সফল রেফারেল ডেলিভারি পাওয়া যায়নি</p>
                      <p className="text-[11px] text-gray-400 mt-0.5">
                        রেফার করা বন্ধু প্রথম অর্ডার সফলভাবে ডেলিভারি সম্পন্ন করলে এখানে তালিকাভুক্ত হবে।
                      </p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="bg-emerald-50/70 text-emerald-950 font-bold border-b border-emerald-100">
                            <th className="p-2.5">রেফারেল ফোন (WhatsApp)</th>
                            <th className="p-2.5">গ্রাহকের নাম (User Name)</th>
                            <th className="p-2.5">ডেলিভার্ড অর্ডার (Order ID)</th>
                            <th className="p-2.5">ডেলিভারির তারিখ</th>
                            <th className="p-2.5">অর্জিত কয়েন</th>
                            <th className="p-2.5 text-right">স্ট্যাটাস</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {deliveredReferrals.map((ref) => (
                            <tr key={ref.id} className="hover:bg-emerald-50/30 transition-colors">
                              <td className="p-2.5 font-bold text-gray-900">
                                <a
                                  href={`https://wa.me/${ref.normalizedPhone.startsWith('01') ? '88' + ref.normalizedPhone : ref.normalizedPhone}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-emerald-700 hover:underline flex items-center gap-1"
                                >
                                  <span>{ref.friendPhone}</span>
                                  <ExternalLink className="w-3 h-3 text-emerald-500" />
                                </a>
                              </td>
                              <td className="p-2.5 font-semibold text-gray-800">
                                {ref.referredUserName || 'Customer'}
                              </td>
                              <td className="p-2.5 font-mono text-[11px] font-bold text-purple-700">
                                {ref.completedOrderId ? (
                                  <button
                                    type="button"
                                    onClick={() => setSelectedOrderId(ref.completedOrderId || null)}
                                    className="hover:underline flex items-center gap-1 text-purple-700 font-extrabold cursor-pointer"
                                  >
                                    <span>#{ref.completedOrderId}</span>
                                    <ExternalLink className="w-3 h-3" />
                                  </button>
                                ) : (
                                  '—'
                                )}
                              </td>
                              <td className="p-2.5 text-gray-600 font-medium whitespace-nowrap">
                                {ref.completedAt ? new Date(ref.completedAt).toLocaleString() : '—'}
                              </td>
                              <td className="p-2.5 font-extrabold text-amber-700 whitespace-nowrap">
                                🪙 +{ref.rewardedCoins || 20} Coins
                              </td>
                              <td className="p-2.5 text-right whitespace-nowrap">
                                <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-black text-[10px] border border-emerald-200">
                                  ✓ DELIVERED
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Section: Pending Referrals (Invited, awaiting first delivered order) */}
                {pendingReferrals.length > 0 && (
                  <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-2xs space-y-3 p-4">
                    <div className="flex items-center justify-between border-b border-gray-100 pb-2.5">
                      <h4 className="font-black text-xs text-amber-900 flex items-center gap-1.5 uppercase tracking-wider">
                        <Clock className="w-4 h-4 text-amber-600" />
                        <span>অপেক্ষমান রেফারেল (Pending First Order - {pendingReferrals.length})</span>
                      </h4>
                      <span className="text-[10px] text-gray-500">
                        এখনো প্রথম অর্ডার সম্পন্ন হয়নি (নট কাউন্টেড)
                      </span>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="bg-amber-50/50 text-amber-950 font-bold border-b border-amber-100">
                            <th className="p-2.5">হোয়াটসঅ্যাপ নম্বর</th>
                            <th className="p-2.5">রেফার তৈরির তারিখ</th>
                            <th className="p-2.5 text-right">স্ট্যাটাস</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {pendingReferrals.map((ref) => (
                            <tr key={ref.id} className="hover:bg-amber-50/20">
                              <td className="p-2.5 font-bold text-gray-800 font-mono">
                                {ref.friendPhone}
                              </td>
                              <td className="p-2.5 text-gray-500 font-medium">
                                {new Date(ref.createdAt).toLocaleString()}
                              </td>
                              <td className="p-2.5 text-right">
                                <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-bold text-[10px] border border-amber-200">
                                  অপেক্ষমান (Pending)
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
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
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-1">
                        <div>
                          <p className="text-xs font-bold text-amber-300 flex items-center space-x-1.5">
                            <ShieldCheck className="w-4 h-4 text-amber-400" />
                            <span>রোল: <strong>SUPER ADMIN</strong></span>
                          </p>
                          <p className="text-[11px] text-slate-400">
                            {user.email && ['ajnasim72@gmail.com'].includes(user.email.trim().toLowerCase())
                              ? 'এই ব্যবহারকারী মূল Super Admin অ্যাকাউন্ট। এটি সুরক্ষিত।'
                              : 'এই ব্যবহারকারী একজন অনুমোদিত Super Admin।'}
                          </p>
                        </div>
                        {user.uid !== currentUser.uid && !(user.email && ['ajnasim72@gmail.com'].includes(user.email.trim().toLowerCase())) && (
                          <button
                            type="button"
                            onClick={handleToggleSuperAdminRoleInModal}
                            className="py-2 px-4 rounded-xl bg-amber-600/30 hover:bg-amber-600/50 text-amber-200 border border-amber-500/40 font-extrabold text-xs transition-all flex items-center space-x-1 whitespace-nowrap cursor-pointer"
                          >
                            <ShieldAlert className="w-4 h-4" />
                            <span>Demote to Normal Admin</span>
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-1">
                        <div>
                          <p className="text-xs font-bold text-slate-200">
                            বর্তমান স্ট্যাটাস: <span className="text-amber-300 uppercase font-black">{user.isAdmin ? 'ADMIN' : 'REGULAR USER'}</span>
                          </p>
                          <p className="text-[11px] text-slate-400">
                            {user.isAdmin
                              ? 'Admin সুবিধা তুলে নিলে ব্যবহারকারী সাধারণ Customer/Helper হবেন। অথবা Super Admin-এ উন্নীত করতে পারেন।'
                              : 'Admin রোল দিলে ব্যবহারকারী Super Admin ব্যতীত বাকি সকল অপারেশনাল এবং অ্যানালিটিক্স কাজ করতে পারবেন।'}
                          </p>
                        </div>
                        {user.isAdmin ? (
                          <div className="flex items-center space-x-2 flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={handleStartConvertToHelper}
                              className="py-2 px-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs transition-all flex items-center space-x-1.5 whitespace-nowrap shadow-md cursor-pointer"
                            >
                              <Bike className="w-4 h-4 text-emerald-200" />
                              <span>Convert to Helper</span>
                            </button>
                            <button
                              type="button"
                              onClick={handleStartConvertToCustomer}
                              className="py-2 px-3.5 rounded-xl bg-slate-700 hover:bg-slate-800 text-white font-extrabold text-xs transition-all flex items-center space-x-1.5 whitespace-nowrap shadow-md cursor-pointer"
                            >
                              <User className="w-4 h-4 text-slate-300" />
                              <span>Convert to Customer</span>
                            </button>
                            <button
                              type="button"
                              onClick={handleToggleSuperAdminRoleInModal}
                              className="py-2 px-3.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-extrabold text-xs transition-all flex items-center space-x-1 whitespace-nowrap shadow-md cursor-pointer"
                            >
                              <ShieldCheck className="w-4 h-4 text-purple-200" />
                              <span>Promote to Super Admin</span>
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center space-x-2 flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={handleToggleAdminRoleInModal}
                              className="py-2 px-4 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-extrabold text-xs transition-all flex items-center space-x-1 whitespace-nowrap shadow-md cursor-pointer"
                            >
                              <Shield className="w-4 h-4" />
                              <span>Make Admin</span>
                            </button>
                            {!user.isHelper ? (
                              <button
                                type="button"
                                onClick={handleStartConvertToHelper}
                                className="py-2 px-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs transition-all flex items-center space-x-1.5 whitespace-nowrap shadow-md cursor-pointer"
                              >
                                <Bike className="w-4 h-4 text-emerald-200" />
                                <span>Convert to Helper</span>
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={handleStartConvertToCustomer}
                                className="py-2 px-3.5 rounded-xl bg-slate-700 hover:bg-slate-800 text-white font-extrabold text-xs transition-all flex items-center space-x-1.5 whitespace-nowrap shadow-md cursor-pointer"
                              >
                                <User className="w-4 h-4 text-slate-300" />
                                <span>Convert to Customer Only</span>
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  ) : (
                    <p className="text-xs text-slate-400 italic">
                      শুধুমাত্র <strong className="text-amber-400 font-extrabold">Super Admin</strong> অন্য ব্যবহারকারীদের অ্যাডমিন হিসেবে যোগ করতে বা রোল সরাতে পারবেন।
                    </p>
                  )}
                </div>

                {/* 0.05 Service Zone / Area Assignment (For Admins and Helpers) */}
                {(user.isAdmin || user.isHelper || user.role === 'admin' || user.role === 'helper') && (
                  <div className="p-4 rounded-2xl bg-gradient-to-br from-emerald-950 via-slate-900 to-slate-900 text-white border border-emerald-500/30 space-y-3 shadow-soft">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center space-x-2">
                        <div className="w-8 h-8 rounded-xl bg-emerald-600/30 border border-emerald-400/40 text-emerald-400 flex items-center justify-center font-bold">
                          <MapPin className="w-4 h-4" />
                        </div>
                        <div>
                          <h4 className="font-extrabold text-xs uppercase tracking-wider text-emerald-300">
                            সার্ভিস এলাকা / জোন নির্ধারণ (Zone Assignment)
                          </h4>
                          <p className="text-[11px] text-slate-400">
                            {user.isAdmin
                              ? 'অ্যাডমিনকে নির্দিষ্ট জোনে অ্যাসাইন করলে তিনি শুধুমাত্র ঐ জোনের ডাটা (Orders, Helpers, Shops) দেখতে পাবেন।'
                              : 'হেলপারকে নির্দিষ্ট জোনে অ্যাসাইন করুন। কোনো জোন না থাকলে হেলপার রিকোয়েস্ট পাবেন না।'}
                          </p>
                        </div>
                      </div>

                      <span className="text-[10px] font-black px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                        {userServeAllAreas
                          ? 'Global Coverage (All Zones)'
                          : `${userAssignedAreas.length} টি জোন অ্যাসাইন`}
                      </span>
                    </div>

                    {/* Zone checklist */}
                    {(() => {
                      const allAreas = fallbackStore.pricingSettings.allowedDeliveryAreas || [];
                      if (allAreas.length === 0) {
                        return (
                          <div className="p-3 rounded-xl bg-white/5 border border-white/10 text-center text-xs text-slate-400">
                            এখনো কোনো সার্ভিস এলাকা বা জোন তৈরি করা হয়নি।
                          </div>
                        );
                      }

                      return (
                        <div className="space-y-2.5 pt-1">
                          {/* Quick Switch to Another Zone */}
                          <div className="flex items-center justify-between p-2.5 rounded-xl bg-emerald-950/60 border border-emerald-500/30 flex-wrap gap-2">
                            <div className="flex items-center space-x-1.5 text-xs text-emerald-300 font-bold">
                              <MapPin className="w-3.5 h-3.5 text-emerald-400" />
                              <span>অন্য জোনে সরাসরি পরিবর্তন করুন:</span>
                            </div>
                            <select
                              value={userAssignedAreas.length === 1 && !userServeAllAreas ? userAssignedAreas[0] : ''}
                              onChange={(e) => {
                                if (e.target.value) {
                                  setUserAssignedAreas([e.target.value]);
                                  setUserServeAllAreas(false);
                                }
                              }}
                              className="bg-slate-800 text-white text-xs font-bold rounded-lg px-2.5 py-1 border border-emerald-500/40 focus:outline-none cursor-pointer"
                            >
                              <option value="">-- অন্য জোন নির্বাচন করুন --</option>
                              {allAreas.map((a) => (
                                <option key={a.id} value={a.id}>
                                  📍 {a.name}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                            {allAreas.map((area) => {
                              const isChecked = userAssignedAreas.includes(area.id);
                              return (
                                <label
                                  key={area.id}
                                  className={`flex items-center justify-between p-2.5 rounded-xl border cursor-pointer transition-all ${
                                    isChecked && !userServeAllAreas
                                      ? 'bg-emerald-900/40 border-emerald-400/60 text-white'
                                      : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'
                                  }`}
                                >
                                  <div className="flex items-center space-x-2 min-w-0">
                                    <input
                                      type="checkbox"
                                      disabled={userServeAllAreas}
                                      checked={isChecked && !userServeAllAreas}
                                      onChange={() => {
                                        setUserAssignedAreas((prev) =>
                                          prev.includes(area.id)
                                            ? prev.filter((id) => id !== area.id)
                                            : [...prev, area.id]
                                        );
                                      }}
                                      className="w-4 h-4 rounded text-emerald-500 focus:ring-emerald-400 border-slate-600 bg-slate-800"
                                    />
                                    <div className="truncate">
                                      <span className="text-xs font-bold block truncate">
                                        {area.name}
                                      </span>
                                      <span className="text-[10px] text-slate-400">
                                        {area.country || 'Bangladesh'}
                                      </span>
                                    </div>
                                  </div>
                                  <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-white/10 text-slate-300 shrink-0 ml-1">
                                    {area.coordinates?.length || 0} pts
                                  </span>
                                </label>
                              );
                            })}
                          </div>

                          {/* Serve All Areas Toggle */}
                          <label className="flex items-center space-x-2 p-2.5 rounded-xl bg-white/5 border border-white/10 cursor-pointer hover:bg-white/10 transition-colors">
                            <input
                              type="checkbox"
                              checked={userServeAllAreas}
                              onChange={(e) => {
                                setUserServeAllAreas(e.target.checked);
                                if (e.target.checked) setUserAssignedAreas([]);
                              }}
                              className="w-4 h-4 rounded text-emerald-500 focus:ring-emerald-400 border-slate-600 bg-slate-800"
                            />
                            <div className="text-xs">
                              <span className="font-extrabold text-white block">
                                🌐 উন্মুক্ত / সকল সার্ভিস এলাকা (All Zones Access)
                              </span>
                              <span className="text-[10px] text-slate-400 block">
                                এই ব্যবহারকারীর জন্য কোনো নির্দিষ্ট জোন সীমাবদ্ধ থাকবে না।
                              </span>
                            </div>
                          </label>

                          <div className="flex items-center justify-end pt-1">
                            <button
                              type="button"
                              onClick={handleSaveZoneAssignment}
                              disabled={isSavingAreas}
                              className="py-2 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-extrabold text-xs shadow-md transition-all active:scale-95 flex items-center space-x-1.5 cursor-pointer"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>{isSavingAreas ? 'সেভ হচ্ছে...' : 'জোন অ্যাসাইনমেন্ট সেভ করুন'}</span>
                            </button>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* 0.1 Reward Coins Balance Management */}
                <div className="p-4 rounded-2xl bg-gradient-to-br from-amber-50 to-yellow-50/60 border border-amber-200/80 space-y-3 shadow-xs">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <h4 className="font-extrabold text-xs text-amber-950 uppercase tracking-wider flex items-center space-x-1.5">
                      <Coins className="w-4 h-4 text-amber-600" />
                      <span>Reward Coins & Loyalty Management</span>
                    </h4>
                    <span className="px-2.5 py-0.5 rounded-full bg-amber-200/60 text-amber-950 font-black text-[10px]">
                      বর্তমান ব্যালেন্স: 🪙 {user.coins ?? 0} কয়েন
                    </span>
                  </div>

                  <form onSubmit={handleSaveCoins} className="p-3 bg-white rounded-xl border border-amber-300 space-y-2.5">
                    <div className="flex flex-col sm:flex-row gap-2 items-center">
                      <div className="w-full sm:w-48 relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm">🪙</span>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={coinsInput}
                          onChange={(e) => setCoinsInput(e.target.value)}
                          className="w-full pl-9 pr-3 py-2 bg-amber-50/50 border border-amber-300 rounded-xl text-xs font-black text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                          placeholder="Coins..."
                          required
                        />
                      </div>
                      <input
                        type="text"
                        placeholder="পরিবর্তনের কারণ (ঐচ্ছিক)..."
                        value={coinsReasonInput}
                        onChange={(e) => setCoinsReasonInput(e.target.value)}
                        className="flex-1 w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-amber-500"
                      />
                      <button
                        type="submit"
                        disabled={savingCoins}
                        className="w-full sm:w-auto px-4 py-2 bg-amber-500 hover:bg-amber-600 text-purple-950 font-black rounded-xl text-xs transition-all shadow-xs flex items-center justify-center space-x-1 whitespace-nowrap cursor-pointer active:scale-95"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>{savingCoins ? 'আপডেট হচ্ছে...' : 'কয়েন আপডেট করুন'}</span>
                      </button>
                    </div>

                    <div className="flex flex-wrap gap-1 items-center">
                      <span className="text-[10px] font-bold text-gray-400 mr-1">Quick:</span>
                      {[-50, -10, 10, 50, 100].map((delta) => (
                        <button
                          key={delta}
                          type="button"
                          onClick={() => {
                            const currentVal = parseInt(coinsInput, 10) || 0;
                            setCoinsInput(String(Math.max(0, currentVal + delta)));
                          }}
                          className={`px-2 py-0.5 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                            delta > 0
                              ? 'bg-emerald-100 hover:bg-emerald-200 text-emerald-900'
                              : 'bg-red-100 hover:bg-red-200 text-red-900'
                          }`}
                        >
                          {delta > 0 ? `+${delta}` : `${delta}`}
                        </button>
                      ))}
                    </div>
                  </form>
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
                          <div className="p-3 bg-red-50 rounded-xl border border-red-200">
                            <p className="text-red-900 font-bold text-xs">
                              🔒 অ্যাডমিন নোট: "{user.adminBlockNote || user.blockedReason || 'অ্যাডমিন স্ট্যাটাস'}"
                            </p>
                            <span className="text-[10px] text-red-600 font-medium block mt-0.5">
                              (শুধুমাত্র অ্যাডমিন দেখতে পান)
                            </span>
                          </div>
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
                            ব্যবহারকারী ব্লক করা হলে সে নতুন রিকোয়েস্ট পাঠাতে বা অর্ডার গ্রহণ করতে পারবে না।
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
                                ব্লকের কারণ ও অ্যাডমিন নোট (Admin Internal Note - Required):
                              </label>
                              <input
                                type="text"
                                placeholder="e.g. Fraudulent behavior, fake order, customer misconduct..."
                                value={blockReasonInput}
                                onChange={(e) => setBlockReasonInput(e.target.value)}
                                className="w-full p-3 bg-white border border-red-200 rounded-xl text-xs font-medium focus:outline-none"
                                required
                              />
                              <p className="text-[10px] text-red-700">
                                🔒 এই নোটটি শুধুমাত্র অ্যাডমিন দেখতে পাবেন। ব্যবহারকারীর কাছে অ্যাডমিন সেটিংসের মেসেজ যাবে।
                              </p>
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

            {/* Helper Eligibility Section */}
            {user.isHelper && (
              <div className="p-4 rounded-2xl bg-white border border-gray-200 space-y-3">
                <h4 className="font-extrabold text-xs text-gray-900 uppercase tracking-wider flex items-center space-x-1.5">
                  <Bike className="w-4 h-4 text-indigo-700" />
                  <span>Helper Eligibility Management</span>
                </h4>
                <p className="text-gray-600">
                  এই ব্যবহারকারী বর্তমানে একজন হেলপার (Helper)। আপনি চাইলে তার হেলপার যোগ্যতা/এলিজিবিলিটি বাতিল করতে পারেন।
                </p>
                <button
                  onClick={async () => {
                    const confirmed = await showConfirm(
                      'হেলপার যোগ্যতা বাতিল',
                      `আপনি কি নিশ্চিত যে ${user.displayName}-এর হেলপার যোগ্যতা বাতিল করতে চান?`,
                      'হ্যাঁ, বাতিল করুন',
                      'ফিরে যান'
                    );
                    if (!confirmed) return;
                    await fallbackStore.removeHelperEligibility(user.uid);
                    showAlert('সফল', 'হেলপার যোগ্যতা বাতিল করা হয়েছে।', 'success');
                    if (onUserUpdated) onUserUpdated();
                  }}
                  className="py-2.5 px-5 bg-orange-600 hover:bg-orange-700 text-white font-extrabold rounded-xl text-xs shadow-sm transition-all flex items-center space-x-1.5"
                >
                  <Ban className="w-4 h-4" />
                  <span>Remove Helper Eligibility</span>
                </button>
              </div>
            )}

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
              className="py-2.5 px-6 rounded-2xl bg-rose-50 hover:bg-rose-100 font-extrabold text-xs text-rose-600 border border-rose-200 active:scale-95 transition-colors"
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

      {/* Role Conversion Modal for Helper with Zone Assignment */}
      {convertingTargetRole === 'helper' && user && (
        <div className="fixed inset-0 z-[10030] bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-lg bg-slate-900 border border-emerald-500/30 rounded-3xl p-6 text-white shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center justify-center">
                  <Bike className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-white">হেলপারে রূপান্তর ও জোন নির্ধারণ</h3>
                  <p className="text-[11px] text-slate-400">Convert to Helper & Assign Zone</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setConvertingTargetRole(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/30 text-xs text-emerald-200">
              ব্যবহারকারী <strong>{user.displayName}</strong>-কে Helper রোলে রূপান্তর করা হবে। একই সাথে হেলপারের সার্ভিস জোন নির্ধারণ করুন।
            </div>

            {/* Zone Selection Checklist */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-300">সার্ভিস জোন নির্বাচন করুন:</span>
                <span className="text-[10px] font-black text-emerald-400">
                  {convertServeAll ? 'All Zones' : `${convertTargetAreas.length} selected`}
                </span>
              </div>

              {/* Quick Dropdown */}
              {fallbackStore.pricingSettings.allowedDeliveryAreas && fallbackStore.pricingSettings.allowedDeliveryAreas.length > 0 && (
                <div className="flex items-center justify-between p-2 rounded-xl bg-slate-800/80 border border-slate-700">
                  <span className="text-[11px] text-slate-400 font-bold">অন্য জোনে দ্রুত অ্যাসাইন করুন:</span>
                  <select
                    value={convertTargetAreas.length === 1 && !convertServeAll ? convertTargetAreas[0] : ''}
                    onChange={(e) => {
                      if (e.target.value) {
                        setConvertTargetAreas([e.target.value]);
                        setConvertServeAll(false);
                      }
                    }}
                    className="bg-slate-900 text-white text-xs font-bold rounded-lg px-2.5 py-1 border border-slate-700 focus:outline-none cursor-pointer"
                  >
                    <option value="">-- জোন নির্বাচন / পরিবর্তন করুন --</option>
                    {fallbackStore.pricingSettings.allowedDeliveryAreas.map((a) => (
                      <option key={a.id} value={a.id}>
                        📍 {a.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                {(fallbackStore.pricingSettings.allowedDeliveryAreas || []).map((area) => {
                  const isChecked = convertTargetAreas.includes(area.id);
                  return (
                    <label
                      key={area.id}
                      className={`flex items-center justify-between p-2.5 rounded-xl border cursor-pointer transition-all ${
                        isChecked && !convertServeAll
                          ? 'bg-emerald-900/40 border-emerald-400/60 text-white'
                          : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'
                      }`}
                    >
                      <div className="flex items-center space-x-2 truncate">
                        <input
                          type="checkbox"
                          disabled={convertServeAll}
                          checked={isChecked && !convertServeAll}
                          onChange={() => {
                            setConvertTargetAreas((prev) =>
                              prev.includes(area.id)
                                ? prev.filter((id) => id !== area.id)
                                : [...prev, area.id]
                            );
                          }}
                          className="w-4 h-4 rounded text-emerald-500 focus:ring-emerald-400 border-slate-600 bg-slate-800"
                        />
                        <span className="text-xs font-bold truncate">{area.name}</span>
                      </div>
                    </label>
                  );
                })}
              </div>

              {/* Serve All Areas Toggle */}
              <label className="flex items-center space-x-2 p-2.5 rounded-xl bg-white/5 border border-white/10 cursor-pointer">
                <input
                  type="checkbox"
                  checked={convertServeAll}
                  onChange={(e) => {
                    setConvertServeAll(e.target.checked);
                    if (e.target.checked) setConvertTargetAreas([]);
                  }}
                  className="w-4 h-4 rounded text-emerald-500 focus:ring-emerald-400 border-slate-600 bg-slate-800"
                />
                <div className="text-xs">
                  <span className="font-extrabold text-white block">🌐 উন্মুক্ত সকল জোন (Serve All Areas)</span>
                  <span className="text-[10px] text-slate-400">এই হেলপার সকল এলাকার অর্ডার দেখতে পারবেন</span>
                </div>
              </label>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setConvertingTargetRole(null)}
                className="py-2 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs cursor-pointer"
              >
                বাতিল
              </button>
              <button
                type="button"
                onClick={handleConfirmConvertToHelper}
                disabled={isConvertingUserRole || (!convertServeAll && convertTargetAreas.length === 0)}
                className="py-2 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-extrabold text-xs shadow-md transition-all flex items-center space-x-1.5 cursor-pointer"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{isConvertingUserRole ? 'রূপান্তর হচ্ছে...' : 'রূপান্তর নিশ্চিত করুন'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
