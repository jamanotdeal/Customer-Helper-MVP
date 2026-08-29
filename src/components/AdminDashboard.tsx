'use client';

import React, { useEffect, useState } from 'react';
import { Order, HelperApplication, StoreApplication, WithdrawalRequest, PricingSettings, UserProfile, Shop, OrderFeedback, AdminCustomModalConfig, FeeSuggestion } from '@/types';
import { fallbackStore } from '@/lib/firebase';
import { useModal } from './CustomModal';
import { getOrderAcceptanceDurationText, getElapsedTime } from '@/lib/timeUtils';
import {
  ShieldCheck,
  ShieldAlert,
  AlertCircle,
  Users,
  ShoppingBag,
  DollarSign,
  Settings,
  Check,
  X,
  Layers,
  ArrowUpRight,
  Sparkles,
  Bike,
  Clock,
  MapPin,
  RefreshCw,
  Search,
  ArrowUpDown,
  Filter,
  User,
  ChevronRight,
  UserCheck,
  Phone,
  Ban,
  Tag,
  Trash2,
  TrendingUp,
  BarChart2,
  Bell,
  CheckCircle2,
  XCircle,
  Plus,
  Edit,
  Calendar,
  Globe,
  Download,
  Store,
  Star,
  MessageSquare,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { PaginationControl } from './admin/PaginationControl';
import { AdminOrderDetailsModal } from './admin/AdminOrderDetailsModal';
import { AssignHelperModal } from './admin/AssignHelperModal';
import { CustomerHistoryModal } from './admin/CustomerHistoryModal';
import { HelperHistoryModal } from './admin/HelperHistoryModal';
import { UserDetailsModal } from './admin/UserDetailsModal';
import { RevenueAnalytics } from './admin/RevenueAnalytics';
import { AdminPushNotificationModal } from './admin/AdminPushNotificationModal';
import { AdminHelperAppModal } from './admin/AdminHelperAppModal';
import { TimePickerInput } from './admin/TimePickerInput';
import { AdminHelperMapView } from './admin/AdminHelperMapView';
import { DraggableTabsContainer } from './admin/DraggableTabsContainer';
import { AddShopModal } from './AddShopModal';
import { UserActionDropdown } from './admin/UserActionDropdown';
import { AdminCustomModalFormModal } from './admin/AdminCustomModalFormModal';
import { AdminShopMapView } from './admin/AdminShopMapView';
import { AdminShopDetailsModal } from './admin/AdminShopDetailsModal';
import { AdminStoreAppDetailsModal } from './admin/AdminStoreAppDetailsModal';

interface AdminDashboardProps {
  initialSelectedOrderId?: string | null;
  onClearInitialOrder?: () => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  initialSelectedOrderId,
  onClearInitialOrder,
}) => {
  const { user: currentUser } = useAuth();
  const { showAlert, showConfirm } = useModal();
  const [activeTab, setActiveTab] = useState<
    'EXCEPTIONS' | 'ORDERS' | 'USERS_LIST' | 'REVENUE' | 'CUSTOMERS' | 'HELPERS' | 'WITHDRAWALS' | 'SHOPS' | 'FEEDBACK' | 'CUSTOM_MODALS' | 'PRICING' | 'SETTINGS'
  >('EXCEPTIONS');
  const [helperSubView, setHelperSubView] = useState<'MAP' | 'APPLICATIONS' | 'TABLE'>('MAP');
  const [shopSubView, setShopSubView] = useState<'MAP' | 'TABLE' | 'APPLICATIONS'>('MAP');
  const [selectedShopDetails, setSelectedShopDetails] = useState<Shop | null>(null);
  const [selectedStoreApp, setSelectedStoreApp] = useState<import('@/types').StoreApplication | null>(null);

  // Realtime Data state
  const [orders, setOrders] = useState<Order[]>([]);
  const [allOrders, setAllOrders] = useState<Order[]>([]);
  const [showHighDurationModal, setShowHighDurationModal] = useState<boolean>(false);
  const [applications, setApplications] = useState<HelperApplication[]>([]);
  const [storeApplications, setStoreApplications] = useState<StoreApplication[]>([]);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [shops, setShops] = useState<Shop[]>([]);
  const [feedbacks, setFeedbacks] = useState<OrderFeedback[]>([]);
  const [customModals, setCustomModals] = useState<AdminCustomModalConfig[]>([]);
  const [pricing, setPricing] = useState<PricingSettings>(fallbackStore.pricingSettings);
  const [allowedAdminTabs, setAllowedAdminTabs] = useState<string[]>([]);

  const [showAddShopModal, setShowAddShopModal] = useState<boolean>(false);
  const [editingShop, setEditingShop] = useState<Shop | null>(null);

  const [showCustomModalForm, setShowCustomModalForm] = useState<boolean>(false);
  const [editingCustomModal, setEditingCustomModal] = useState<AdminCustomModalConfig | null>(null);

  const [placeholdersText, setPlaceholdersText] = useState<string>('');
  const [confirmationMsg, setConfirmationMsg] = useState<string>('');
  const [servicesText, setServicesText] = useState<string>('');
  // Single-box format: "ServiceName = placeholder text" (one per line)
  const [serviceHintsText, setServiceHintsText] = useState<string>('');
  const [eduEmailDomainsText, setEduEmailDomainsText] = useState<string>('@diu.edu.bd');
  const [dedicatedDelayMins, setDedicatedDelayMins] = useState<number>(7);
  const [receiverRule, setReceiverRule] = useState<'commuter_first' | 'dedicated_first' | 'both_simultaneous'>('commuter_first');
  const [allowedHelperTypes, setAllowedHelperTypes] = useState<'dedicated_only' | 'commuters_only' | 'both'>('both');
  const [helperRadiusKm, setHelperRadiusKm] = useState<number>(3.5);
  const [mapLocationPref, setMapLocationPref] = useState<'BD' | 'GLOBAL' | 'CUSTOM'>('BD');
  const [customCountryCode, setCustomCountryCode] = useState<string>('bd');

  // PWA Install Prompt Admin Controls
  const [pwaInstallPromptEnabled, setPwaInstallPromptEnabled] = useState<boolean>(true);

  // Payback instructions & Store types
  const [bkashInstructions, setBkashInstructions] = useState<string>('');
  const [nagadInstructions, setNagadInstructions] = useState<string>('');
  const [rocketInstructions, setRocketInstructions] = useState<string>('');
  const [bankInstructions, setBankInstructions] = useState<string>('');
  const [cashInstructions, setCashInstructions] = useState<string>('');
  const [storeTypesText, setStoreTypesText] = useState<string>('');
  // Store application form placeholders (admin configurable)
  const [storeFormPh, setStoreFormPh] = useState<{
    storeName: string;
    storeDescription: string;
    ownerName: string;
    ownerPhone: string;
    managerName: string;
    managerPhone: string;
    commissionPercent: string;
  }>({
    storeName: '',
    storeDescription: '',
    ownerName: '',
    ownerPhone: '',
    managerName: '',
    managerPhone: '',
    commissionPercent: '',
  });
  const [pwaInstallPromptTitle, setPwaInstallPromptTitle] = useState<string>('Install Jamanot App');
  const [pwaInstallPromptDescription, setPwaInstallPromptDescription] = useState<string>('আরও দ্রুত আপডেট, ভালো সার্ভিস এবং লাইভ ট্র্যাকিংয়ের জন্য আপনার ফোনে জামানত অ্যাপ ইনস্টল করুন!');
  const [pwaInstallButtonText, setPwaInstallButtonText] = useState<string>('Install Jamanot');

  // Permission Alert Modal Content Controls
  const [locPermModalTitle, setLocPermModalTitle] = useState<string>('লোকেশন পারমিশন আবশ্যক (Location Required)');
  const [locPermModalBody, setLocPermModalBody] = useState<string>('কম্পিউটার হেলপার (Commuter Helper) মোড চালু করতে ডিভাইসের জিপিএস লোকেশন পারমিশন দেওয়া আবশ্যক। অনুগ্রহ করে ব্রাউজার সেটিংসে Location Allow করুন।');
  const [notifPermModalTitle, setNotifPermModalTitle] = useState<string>('নোটিফিকেশন পারমিশন আবশ্যক (Notification Required)');
  const [notifPermModalBody, setNotifPermModalBody] = useState<string>('জরুরি আপডেট ও অর্ডারের নোটিফিকেশন পাওয়ার জন্য ব্রাউজার বা ডিভাইসে নোটিফিকেশন পারমিশন দেওয়া আবশ্যক।');

  // Map Picker Guide Overlay Admin Controls
  const [mapPickerGuideText, setMapPickerGuideText] = useState<string>('যে location select করতে চান, সেখান পিন (icon) টি নিয়ে বসান, বা ওই place-এ click করুন। তারপর specific ভাবে building, market-এর নাম add করুন map-এর নিচের যে input box টি আছে সেখানে।');
  const [mapPickerPickupGuideText, setMapPickerPickupGuideText] = useState<string>('যে দোকান বা স্থান থেকে আনতে বা কাজ করতে হবে, সেই স্থানে ম্যাপের পিন সরিয়ে নিয়ে যান অথবা ক্লিক করুন। দোকানের নাম বা বিস্তারিত ঠিকানা নিচের input box-এ লিখুন।');
  const [mapPickerDeliveryGuideText, setMapPickerDeliveryGuideText] = useState<string>('আপনার বাসা বা ডেলিভারি পাওয়ার স্থানে পিন সরিয়ে নিন। ডেলিভারি ঠিকানা নির্ভুল হলে হেল্পার ঠিক সময়ে পৌঁছাতে পারবেন। নিচের box-এ বাসার নাম বা ফ্ল্যাট নম্বর যোগ করুন।');
  const [mapPickerGuideOkText, setMapPickerGuideOkText] = useState<string>('ঠিক আছে');
  const [mapPickerGuideShowCount, setMapPickerGuideShowCount] = useState<number>(5);
  const [noSavePickupServicesText, setNoSavePickupServicesText] = useState<string>('মিক্স কিছু কাজ করে দিন\nনা, অন্য একটা কাজ করে দিন\nআমার একটা জিনিস দিয়ে আসুন');

  // Helper Center contact info
  const [helperCenterEnabled, setHelperCenterEnabled] = useState<boolean>(true);
  const [helperCenterOfficeAddress, setHelperCenterOfficeAddress] = useState<string>('');
  const [helperCenterPhone1, setHelperCenterPhone1] = useState<string>('');
  const [helperCenterPhone2, setHelperCenterPhone2] = useState<string>('');
  const [helperCenterEmail, setHelperCenterEmail] = useState<string>('');
  const [helperCenterFacebook, setHelperCenterFacebook] = useState<string>('');
  const [helperCenterLinkedin, setHelperCenterLinkedin] = useState<string>('');
  const [helperCenterInstagram, setHelperCenterInstagram] = useState<string>('');
  const [helperCenterMapEmbedUrl, setHelperCenterMapEmbedUrl] = useState<string>('');
  const [helperCenterNote, setHelperCenterNote] = useState<string>('');
  const [googleAnalyticsId, setGoogleAnalyticsId] = useState<string>('');
  const [microsoftClarityId, setMicrosoftClarityId] = useState<string>('');

  // Fee Details Calculator & Policy Admin States
  const [feeCalculatorBasePrice, setFeeCalculatorBasePrice] = useState<number | string>(20);
  const [feeCalculatorPerKmRate, setFeeCalculatorPerKmRate] = useState<number | string>(10);
  const [feeCalculatorPerKgRate, setFeeCalculatorPerKgRate] = useState<number | string>(5);
  const [feeCalculatorReturnFee, setFeeCalculatorReturnFee] = useState<number | string>(15);
  const [feeCalculatorReturnPercent, setFeeCalculatorReturnPercent] = useState<number | string>(20);
  const [feeCalculatorProcessingFee, setFeeCalculatorProcessingFee] = useState<number | string>(5);
  const [feeCalculatorProcessingFeeType, setFeeCalculatorProcessingFeeType] = useState<'flat' | 'percent'>('flat');
  const [feeCalculatorMinFee, setFeeCalculatorMinFee] = useState<number | string>(25);
  const [feeCalculatorMaxLimit, setFeeCalculatorMaxLimit] = useState<number | string>(70);
  const [feeCalculatorMaxLimitMessage, setFeeCalculatorMaxLimitMessage] = useState<string>('');
  const [feeCalculatorCompanyDetails, setFeeCalculatorCompanyDetails] = useState<string>('');
  const [feeSuggestions, setFeeSuggestions] = useState<FeeSuggestion[]>([]);
  const [showFeeSuggestionsModal, setShowFeeSuggestionsModal] = useState<boolean>(false);
  const [feeSuggestionsModalPage, setFeeSuggestionsModalPage] = useState<number>(1);
  const [feeSuggestionsModalPageSize, setFeeSuggestionsModalPageSize] = useState<number>(5);

  // Modals state
  const [showPushNotificationModal, setShowPushNotificationModal] = useState<boolean>(false);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [assignHelperOrder, setAssignHelperOrder] = useState<Order | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<{ id: string; name: string; phone?: string } | null>(null);
  const [selectedHelper, setSelectedHelper] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    if (initialSelectedOrderId) {
      setActiveTab('ORDERS');
      setSelectedOrderId(initialSelectedOrderId);
      if (onClearInitialOrder) {
        onClearInitialOrder();
      }
    }
  }, [initialSelectedOrderId, onClearInitialOrder]);

  // CRUD Helper Application states
  const [showAddAppModal, setShowAddAppModal] = useState<boolean>(false);
  const [editingApp, setEditingApp] = useState<HelperApplication | null>(null);


  // Search, Filter & Pagination states
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [withdrawalStatusFilter, setWithdrawalStatusFilter] = useState<string>('ALL');
  const [sortBy, setSortBy] = useState<'NEWEST' | 'OLDEST' | 'FEE_HIGH' | 'FEE_LOW' | 'ORDERS_HIGH' | 'SPENT_HIGH'>('NEWEST');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Needs Attention — per-section pagination
  const [excCancelPage, setExcCancelPage] = useState(1);
  const [excCancelPageSize, setExcCancelPageSize] = useState(10);
  const [excFeeAdjPage, setExcFeeAdjPage] = useState(1);
  const [excFeeAdjPageSize, setExcFeeAdjPageSize] = useState(10);
  const [excNotAcceptedPage, setExcNotAcceptedPage] = useState(1);
  const [excNotAcceptedPageSize, setExcNotAcceptedPageSize] = useState(10);
  const [excDelayedPage, setExcDelayedPage] = useState(1);
  const [excDelayedPageSize, setExcDelayedPageSize] = useState(10);
  const [excHelperAppPage, setExcHelperAppPage] = useState(1);
  const [excHelperAppPageSize, setExcHelperAppPageSize] = useState(10);
  const [excStoreAppPage, setExcStoreAppPage] = useState(1);
  const [excStoreAppPageSize, setExcStoreAppPageSize] = useState(10);
  const [excPendingWdPage, setExcPendingWdPage] = useState(1);
  const [excPendingWdPageSize, setExcPendingWdPageSize] = useState(10);

  // Tab-specific Date Filters
  const [ordersStartDate, setOrdersStartDate] = useState('');
  const [ordersEndDate, setOrdersEndDate] = useState('');

  const [usersStartDate, setUsersStartDate] = useState('');
  const [usersEndDate, setUsersEndDate] = useState('');
  const [audienceFilter, setAudienceFilter] = useState<string>('ALL');

  const [appsStartDate, setAppsStartDate] = useState('');
  const [appsEndDate, setAppsEndDate] = useState('');

  const [withdrawalsStartDate, setWithdrawalsStartDate] = useState('');
  const [withdrawalsEndDate, setWithdrawalsEndDate] = useState('');

  // Reset page number on tab / search / filter / sort / date changes
  useEffect(() => {
    setCurrentPage(1);
  }, [
    activeTab,
    searchQuery,
    statusFilter,
    withdrawalStatusFilter,
    sortBy,
    ordersStartDate,
    ordersEndDate,
    usersStartDate,
    usersEndDate,
    audienceFilter,
    appsStartDate,
    appsEndDate,
    withdrawalsStartDate,
    withdrawalsEndDate,
  ]);

  useEffect(() => {
    const syncAdminData = () => {
      const freshOrders = Array.from(fallbackStore.orders.values());
      setOrders(freshOrders);
      // Also merge into allOrders so Mutually Discussed changes are reflected immediately
      setAllOrders((prev) => {
        const copy = [...prev];
        freshOrders.forEach((o) => {
          const idx = copy.findIndex((item) => item.id === o.id);
          if (idx > -1) {
            copy[idx] = o;
          } else {
            copy.unshift(o);
          }
        });
        const seen = new Set<string>();
        return copy.filter((o) => {
          if (seen.has(o.id)) return false;
          seen.add(o.id);
          return true;
        });
      });
      setApplications(Array.from(fallbackStore.helperApplications.values()));
      setStoreApplications(Array.from(fallbackStore.storeApplications.values()));
      setWithdrawals(Array.from(fallbackStore.withdrawals.values()));
      setUsers(Array.from(fallbackStore.users.values()));
      setShops(Array.from(fallbackStore.shops.values()));
      const settings = { ...fallbackStore.pricingSettings };
      setPricing(settings);
      setPlaceholdersText((settings.inputPlaceholders || []).join('\n'));
      setConfirmationMsg(settings.orderConfirmationMessage || '');
      setServicesText((settings.services || []).join('\n'));
      setEduEmailDomainsText((settings.eduEmailDomains || ['@diu.edu.bd']).join(', '));
      setDedicatedDelayMins(settings.dedicatedHelperDelayMinutes ?? 7);
      setReceiverRule(settings.orderReceiverRule || 'commuter_first');
      setAllowedHelperTypes(settings.allowedHelperTypes || 'both');
      setHelperRadiusKm(settings.helperRadiusKm ?? 3.5);
      setMapLocationPref(settings.mapLocationPreference || 'BD');
      setCustomCountryCode(settings.customCountryCode || 'bd');
      setPwaInstallPromptEnabled(settings.pwaInstallPromptEnabled !== false);
      setPwaInstallPromptTitle(settings.pwaInstallPromptTitle || 'Install Jamanot App');
      setPwaInstallPromptDescription(
        settings.pwaInstallPromptDescription ||
        'আরও দ্রুত আপডেট, ভালো সার্ভিস এবং লাইভ ট্র্যাকিংয়ের জন্য আপনার ফোনে জামানত অ্যাপ ইনস্টল করুন!'
      );
      setPwaInstallButtonText(settings.pwaInstallButtonText || 'Install Jamanot');
      setLocPermModalTitle(settings.locationPermissionModalTitle || 'লোকেশন পারমিশন আবশ্যক (Location Required)');
      setLocPermModalBody(
        settings.locationPermissionModalBody ||
        'কম্পিউটার হেলপার (Commuter Helper) মোড চালু করতে ডিভাইসের জিপিএস লোকেশন পারমিশন দেওয়া আবশ্যক। অনুগ্রহ করে ব্রাউজার সেটিংসে Location Allow করুন।'
      );
      setNotifPermModalTitle(settings.notificationPermissionModalTitle || 'নোটিফিকেশন পারমিশন আবশ্যক (Notification Required)');
      setNotifPermModalBody(
        settings.notificationPermissionModalBody ||
        'জরুরি আপডেট ও অর্ডারের নোটিফিকেশন পাওয়ার জন্য ব্রাউজার বা ডিভাইসে নোটিফিকেশন পারমিশন দেওয়া আবশ্যক।'
      );
      // Convert the hints map back to the single-box "Key = Value" format
      const hints = settings.serviceDescriptionHints || {};
      setServiceHintsText(
        Object.entries(hints)
          .map(([k, v]) => `${k} = ${v}`)
          .join('\n')
      );

      // Payback & Store types sync
      setBkashInstructions(settings.bkashInstructions || '');
      setNagadInstructions(settings.nagadInstructions || '');
      setRocketInstructions(settings.rocketInstructions || '');
      setBankInstructions(settings.bankInstructions || '');
      setCashInstructions(settings.cashInstructions || '');
      setStoreTypesText((settings.storeTypes || []).join('\n'));

      // Store form placeholders sync
      const sfp = settings.storeFormPlaceholders || {};
      setStoreFormPh({
        storeName: sfp.storeName || '',
        storeDescription: sfp.storeDescription || '',
        ownerName: sfp.ownerName || '',
        ownerPhone: sfp.ownerPhone || '',
        managerName: sfp.managerName || '',
        managerPhone: sfp.managerPhone || '',
        commissionPercent: sfp.commissionPercent || '',
      });

      // Map picker guide overlay sync
      setMapPickerGuideText(settings.mapPickerGuideText || 'যে location select করতে চান, সেখান পিন (icon) টি নিয়ে বসান, বা ওই place-এ click করুন। তারপর specific ভাবে building, market-এর নাম add করুন map-এর নিচের যে input box টি আছে সেখানে।');
      setMapPickerPickupGuideText(settings.mapPickerPickupGuideText || 'যে দোকান বা স্থান থেকে আনতে বা কাজ করতে হবে, সেই স্থানে ম্যাপের পিন সরিয়ে নিয়ে যান অথবা ক্লিক করুন।');
      setMapPickerDeliveryGuideText(settings.mapPickerDeliveryGuideText || 'আপনার বাসা বা ডেলিভারি পাওয়ার স্থানে পিন সরিয়ে নিন।');
      setMapPickerGuideOkText(settings.mapPickerGuideOkText || 'ঠিক আছে');
      setMapPickerGuideShowCount(settings.mapPickerGuideShowCount ?? 5);
      setNoSavePickupServicesText((settings.noSavePickupLocationServices || [
        'মিক্স কিছু কাজ করে দিন',
        'না, অন্য একটা কাজ করে দিন',
        'আমার একটা জিনিস দিয়ে আসুন',
      ]).join('\n'));

      // Helper Center state sync
      setHelperCenterEnabled(settings.helperCenterEnabled !== false);
      setHelperCenterOfficeAddress(settings.helperCenterOfficeAddress || '');
      setHelperCenterPhone1(settings.helperCenterPhone1 || '');
      setHelperCenterPhone2(settings.helperCenterPhone2 || '');
      setHelperCenterEmail(settings.helperCenterEmail || '');
      setHelperCenterFacebook(settings.helperCenterFacebook || '');
      setHelperCenterLinkedin(settings.helperCenterLinkedin || '');
      setHelperCenterInstagram(settings.helperCenterInstagram || '');
      setHelperCenterMapEmbedUrl(settings.helperCenterMapEmbedUrl || '');
      setHelperCenterNote(settings.helperCenterNote || '');
      setGoogleAnalyticsId(settings.googleAnalyticsId || '');
      setMicrosoftClarityId(settings.microsoftClarityId || '');
      setAllowedAdminTabs(settings.allowedAdminTabs || []);

      // Fee Calculator & Suggestions sync
      setFeeCalculatorBasePrice(settings.feeCalculatorBasePrice ?? 20);
      setFeeCalculatorPerKmRate(settings.feeCalculatorPerKmRate ?? 10);
      setFeeCalculatorPerKgRate(settings.feeCalculatorPerKgRate ?? 5);
      setFeeCalculatorReturnFee(settings.feeCalculatorReturnFee ?? 15);
      setFeeCalculatorReturnPercent(settings.feeCalculatorReturnPercent ?? 20);
      setFeeCalculatorProcessingFee(settings.feeCalculatorProcessingFee ?? 5);
      setFeeCalculatorProcessingFeeType(settings.feeCalculatorProcessingFeeType || 'flat');
      setFeeCalculatorMinFee(settings.feeCalculatorMinFee ?? 25);
      setFeeCalculatorMaxLimit(settings.feeCalculatorMaxLimit ?? 70);
      setFeeCalculatorMaxLimitMessage(settings.feeCalculatorMaxLimitMessage || '');
      setFeeCalculatorCompanyDetails(settings.feeCalculatorCompanyDetails || '');
      setFeeSuggestions(Array.from(fallbackStore.feeSuggestions.values()));
    };

    syncAdminData();
    const unsub = fallbackStore.subscribe(syncAdminData);
    return () => {
      unsub();
    };
  }, []);

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const list = await fallbackStore.getAllOrders();
        setAllOrders(list);
      } catch (err) {
        console.warn('Error fetching all orders for overall analysis:', err);
      }
    };
    fetchAll();
  }, []);

  useEffect(() => {
    setAllOrders((prev) => {
      const copy = [...prev];
      orders.forEach((o) => {
        const idx = copy.findIndex((item) => item.id === o.id);
        if (idx > -1) {
          copy[idx] = o;
        } else {
          copy.unshift(o);
        }
      });
      const seen = new Set<string>();
      return copy.filter((o) => {
        if (seen.has(o.id)) return false;
        seen.add(o.id);
        return true;
      });
    });
  }, [orders]);

  // Needs Attention Queue calculations
  const cancellingRequests = orders.filter(
    (o) =>
      (o.cancellationRequest && o.cancellationRequest.status === 'PENDING') ||
      (o.status === 'CANCELED' && new Date().getTime() - new Date(o.cancelledAt || o.updatedAt).getTime() < 86400000)
  );

  const notAcceptedRequests = orders.filter((o) => o.status === 'PENDING');
  const feeAdjustmentsPending = orders.filter(
    (o) => o.feeAdjustment && o.feeAdjustment.status === 'PENDING'
  );
  const pendingApps = applications.filter((a) => a.status === 'PENDING');
  const pendingWds = withdrawals.filter((w) => w.status === 'PENDING');
  const pendingStoreApps = storeApplications.filter((a) => a.status === 'PENDING');

  const delayedOrders = allOrders.filter(
    (o) =>
      o.status !== 'DELIVERED' &&
      o.status !== 'CANCELED' &&
      !o.mutuallyDiscussed &&
      (new Date().getTime() - new Date(o.createdAt).getTime() >= 3600000)
  );

  const totalExceptionsCount =
    cancellingRequests.filter(o => o.cancellationRequest?.status === 'PENDING').length +
    notAcceptedRequests.length +
    feeAdjustmentsPending.length +
    pendingApps.length +
    pendingWds.length +
    pendingStoreApps.length +
    delayedOrders.length;

  const avgDeliveryTimeMins = React.useMemo(() => {
    const delivered = allOrders.filter(o => o.status === 'DELIVERED');
    let totalMs = 0;
    let count = 0;
    delivered.forEach(o => {
      if (o.deliveredAt && (o.acceptedAt || o.createdAt)) {
        const diff = new Date(o.deliveredAt).getTime() - new Date(o.acceptedAt || o.createdAt).getTime();
        if (diff > 0) {
          totalMs += diff;
          count++;
        }
      }
    });
    return count > 0 ? Math.round(totalMs / (1000 * 60 * count)) : 0;
  }, [allOrders]);

  const totalPendingPayoutAmount = pendingWds.reduce((sum, w) => sum + w.amount, 0);
  const approvedHelpersCount = applications.filter((a) => a.status === 'APPROVED').length;

  const handleApproveApp = (appId: string) => {
    fallbackStore.approveHelperApp(appId);
    setApplications(Array.from(fallbackStore.helperApplications.values()));
    setUsers(Array.from(fallbackStore.users.values()));
    showAlert('হেলপার অনুমোদিত', 'হেলপার আবেদন সফলভাবে অনুমোদন করা হয়েছে।', 'success');
  };

  const handleDeleteApp = async (appId: string) => {
    const isConfirmed = await showConfirm(
      'আবেদন মুছে ফেলার নিশ্চিতকরণ',
      'আপনি কি নিশ্চিতভাবে এই হেলপার আবেদনটি মুছে ফেলতে চান? এটি আবেদনকারীর হেলপার স্ট্যাটাস বাতিল করতে পারে।',
      'হ্যাঁ, মুছে ফেলুন',
      'বাতিল'
    );
    if (isConfirmed) {
      await fallbackStore.deleteHelperApp(appId);
      setApplications(Array.from(fallbackStore.helperApplications.values()));
      setUsers(Array.from(fallbackStore.users.values()));
      showAlert('সফল', 'হেলপার আবেদনটি সফলভাবে মুছে ফেলা হয়েছে।', 'success');
    }
  };

  const handleApproveWd = (wdId: string) => {
    fallbackStore.approveWithdrawal(wdId);
    showAlert('উইথড্রয়াল অনুমোদিত', 'পেমেন্ট পেআউট অনুমোদন সফল হয়েছে।', 'success');
  };

  const handleRejectWd = (wdId: string) => {
    fallbackStore.rejectWithdrawal(wdId);
    showAlert('উইথড্রয়াল বাতিল', 'উইথড্রয়াল আবেদন বাতিল করা হয়েছে।', 'info');
  };

  const handleApproveCancellation = (orderId: string) => {
    const order = fallbackStore.orders.get(orderId);
    if (!order) return;
    fallbackStore.updateOrder(order.id, (o) => ({
      ...o,
      status: 'CANCELED',
      cancelledAt: new Date().toISOString(),
      cancellationRequest: o.cancellationRequest
        ? { ...o.cancellationRequest, status: 'APPROVED' }
        : undefined,
      statusHistory: [
        ...o.statusHistory,
        {
          id: `sh-${Date.now()}`,
          status: 'CANCELED',
          timestamp: new Date().toISOString(),
          actor: 'Admin',
          note: 'Cancellation approved by Admin',
        },
      ],
    }));
    showAlert('ক্যানসেলেশন মঞ্জুর', 'অর্ডার ক্যানসেলেশন মনঞ্জুর করা হয়েছে।', 'info');
  };

  const handleRejectCancellation = (orderId: string) => {
    const order = fallbackStore.orders.get(orderId);
    if (!order) return;
    fallbackStore.updateOrder(order.id, (o) => ({
      ...o,
      cancellationRequest: o.cancellationRequest
        ? { ...o.cancellationRequest, status: 'REJECTED' }
        : undefined,
      statusHistory: [
        ...o.statusHistory,
        {
          id: `sh-${Date.now()}`,
          status: o.status,
          timestamp: new Date().toISOString(),
          actor: 'Admin',
          note: 'Cancellation request rejected by Admin',
        },
      ],
    }));
    showAlert('রিকোয়েস্ট অগ্রাহ্য', 'ক্যানসেলেশন রিকোয়েস্ট রিজেক্ট করা হয়েছে।', 'info');
  };

  const handleApproveFeeAdjustment = (orderId: string) => {
    const order = fallbackStore.orders.get(orderId);
    if (!order || !order.feeAdjustment) return;
    fallbackStore.updateOrder(order.id, (o) => ({
      ...o,
      deliveryFee: o.feeAdjustment!.amount,
      feeAdjustment: { ...o.feeAdjustment!, status: 'APPROVED' },
      statusHistory: [
        ...o.statusHistory,
        {
          id: `sh-${Date.now()}`,
          status: o.status,
          timestamp: new Date().toISOString(),
          actor: 'Admin',
          note: `Approved fee adjustment to ৳${o.feeAdjustment!.amount}`,
        },
      ],
    }));
    showAlert('ফি সমন্বয় অনুমোদিত', 'ডেলিভারি ফি আপডেট করা হয়েছে।', 'success');
  };

  const handleRejectFeeAdjustment = (orderId: string) => {
    const order = fallbackStore.orders.get(orderId);
    if (!order || !order.feeAdjustment) return;
    fallbackStore.updateOrder(order.id, (o) => ({
      ...o,
      feeAdjustment: { ...o.feeAdjustment!, status: 'REJECTED' },
      statusHistory: [
        ...o.statusHistory,
        {
          id: `sh-${Date.now()}`,
          status: o.status,
          timestamp: new Date().toISOString(),
          actor: 'Admin',
          note: 'Rejected fee adjustment',
        },
      ],
    }));
    showAlert('ফি সমন্বয় বাতিল', 'ডেলিভারি ফি সমন্বয় বাতিল করা হয়েছে।', 'info');
  };

  /** Parses "ServiceName = placeholder" lines into a Record<string,string> */
  const parseServiceHintsText = (raw: string): Record<string, string> => {
    const result: Record<string, string> = {};
    raw.split('\n').forEach((line) => {
      const eqIdx = line.indexOf('=');
      if (eqIdx < 1) return;
      const key = line.slice(0, eqIdx).trim();
      const val = line.slice(eqIdx + 1).trim();
      if (key && val) result[key] = val;
    });
    return result;
  };

  const handleSavePricing = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedList = placeholdersText
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    const parsedServices = servicesText
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    const cleanedHints = parseServiceHintsText(serviceHintsText);

    const parsedEduDomains = eduEmailDomainsText
      .split(',')
      .map((d) => d.trim())
      .filter((d) => d.length > 0);

    const updatedPricing: PricingSettings = {
      ...pricing,
      inputPlaceholders: parsedList.length > 0 ? parsedList : undefined,
      orderConfirmationMessage: confirmationMsg.trim() || undefined,
      services: parsedServices.length > 0 ? parsedServices : undefined,
      serviceDescriptionHints: Object.keys(cleanedHints).length > 0 ? cleanedHints : undefined,
      eduEmailDomains: parsedEduDomains.length > 0 ? parsedEduDomains : ['@diu.edu.bd'],
      dedicatedHelperDelayMinutes: Number(dedicatedDelayMins) || 7,
      orderReceiverRule: receiverRule,
      allowedHelperTypes: allowedHelperTypes,
      helperRadiusKm: Number(helperRadiusKm) || 3.5,
      mapLocationPreference: mapLocationPref,
      customCountryCode: customCountryCode.trim().toLowerCase() || 'bd',
      pwaInstallPromptEnabled: pwaInstallPromptEnabled,
      pwaInstallPromptTitle: pwaInstallPromptTitle.trim() || undefined,
      pwaInstallPromptDescription: pwaInstallPromptDescription.trim() || undefined,
      pwaInstallButtonText: pwaInstallButtonText.trim() || undefined,
      locationPermissionModalTitle: locPermModalTitle.trim() || undefined,
      locationPermissionModalBody: locPermModalBody.trim() || undefined,
      notificationPermissionModalTitle: notifPermModalTitle.trim() || undefined,
      notificationPermissionModalBody: notifPermModalBody.trim() || undefined,
      bkashInstructions: bkashInstructions.trim() || undefined,
      nagadInstructions: nagadInstructions.trim() || undefined,
      rocketInstructions: rocketInstructions.trim() || undefined,
      bankInstructions: bankInstructions.trim() || undefined,
      cashInstructions: cashInstructions.trim() || undefined,
      storeTypes: storeTypesText.split('\n').map(s => s.trim()).filter(Boolean).length > 0
        ? storeTypesText.split('\n').map(s => s.trim()).filter(Boolean)
        : undefined,
      // Store form placeholders
      storeFormPlaceholders: {
        storeName: storeFormPh.storeName.trim() || undefined,
        storeDescription: storeFormPh.storeDescription.trim() || undefined,
        ownerName: storeFormPh.ownerName.trim() || undefined,
        ownerPhone: storeFormPh.ownerPhone.trim() || undefined,
        managerName: storeFormPh.managerName.trim() || undefined,
        managerPhone: storeFormPh.managerPhone.trim() || undefined,
        commissionPercent: storeFormPh.commissionPercent.trim() || undefined,
      },
      // Map picker guide overlay
      mapPickerGuideText: mapPickerGuideText.trim() || undefined,
      mapPickerPickupGuideText: mapPickerPickupGuideText.trim() || undefined,
      mapPickerDeliveryGuideText: mapPickerDeliveryGuideText.trim() || undefined,
      mapPickerGuideOkText: mapPickerGuideOkText.trim() || undefined,
      mapPickerGuideShowCount: Number(mapPickerGuideShowCount) || 5,
      noSavePickupLocationServices: noSavePickupServicesText.split('\n').map(s => s.trim()).filter(Boolean),
      // Helper center settings
      helperCenterEnabled: helperCenterEnabled,
      helperCenterOfficeAddress: helperCenterOfficeAddress.trim() || undefined,
      helperCenterPhone1: helperCenterPhone1.trim() || undefined,
      helperCenterPhone2: helperCenterPhone2.trim() || undefined,
      helperCenterEmail: helperCenterEmail.trim() || undefined,
      helperCenterFacebook: helperCenterFacebook.trim() || undefined,
      helperCenterLinkedin: helperCenterLinkedin.trim() || undefined,
      helperCenterInstagram: helperCenterInstagram.trim() || undefined,
      helperCenterMapEmbedUrl: helperCenterMapEmbedUrl.trim() || undefined,
      helperCenterNote: helperCenterNote.trim() || undefined,
      googleAnalyticsId: googleAnalyticsId.trim() || undefined,
      microsoftClarityId: microsoftClarityId.trim() || undefined,
      // Fee Calculator settings
      feeCalculatorBasePrice: Number(feeCalculatorBasePrice) || 20,
      feeCalculatorPerKmRate: Number(feeCalculatorPerKmRate) || 10,
      feeCalculatorPerKgRate: Number(feeCalculatorPerKgRate) || 5,
      feeCalculatorReturnFee: Number(feeCalculatorReturnFee) || 15,
      feeCalculatorReturnPercent: feeCalculatorReturnPercent !== '' ? Number(feeCalculatorReturnPercent) : 0,
      feeCalculatorProcessingFee: feeCalculatorProcessingFee !== '' ? Number(feeCalculatorProcessingFee) : 0,
      feeCalculatorProcessingFeeType,
      feeCalculatorMinFee: Number(feeCalculatorMinFee) || 25,
      feeCalculatorMaxLimit: feeCalculatorMaxLimit !== '' ? Number(feeCalculatorMaxLimit) : 70,
      feeCalculatorMaxLimitMessage: feeCalculatorMaxLimitMessage.trim() || undefined,
      feeCalculatorCompanyDetails: feeCalculatorCompanyDetails.trim() || undefined,
      allowedAdminTabs: allowedAdminTabs,
    };

    await fallbackStore.savePricingSettings(updatedPricing);
    await showAlert('সেটিংস আপডেট', 'পিকআপ/ডেলিভারি, কমিশন, এডুকেশন ডোমেইন, ম্যাপ এরিয়া ফিল্টার, হেলপার নোটিফিকেশন সময়সীমা এবং হেল্প সেন্টার সেটিংস সফলভাবে আপডেট হয়েছে।', 'success');
  };

  /**
   * Returns a Set of order IDs that are the customer's very first order.
   * An order is "first" when no other order from the same customerId was
   * placed before it (earlier createdAt). This is computed against the
   * full orders list available in the component.
   */
  const getFirstOrderIds = (orderList: Order[]): Set<string> => {
    // Map: customerId -> earliest createdAt timestamp
    const earliest: Record<string, string> = {};
    const firstId: Record<string, string> = {};
    orderList.forEach((o) => {
      if (!earliest[o.customerId] || o.createdAt < earliest[o.customerId]) {
        earliest[o.customerId] = o.createdAt;
        firstId[o.customerId] = o.id;
      }
    });
    return new Set(Object.values(firstId));
  };

  const handleToggleAdminRole = async (targetUser: UserProfile, makeAdmin: boolean) => {
    if (!currentUser?.isSuperAdmin) {
      showAlert('অনুমতি নেই', 'শুধুমাত্র Super Admin অন্য ব্যবহারকারীদের অ্যাডমিন বানাতে বা সরাতে পারবেন।', 'error');
      return;
    }
    const actionText = makeAdmin ? 'অ্যাডমিন করার অনুমতি দিতে' : 'অ্যাডমিন স্ট্যাটাস অপসারণ করতে';
    const confirmed = await showConfirm(
      'অ্যাডমিন রোল নিশ্চিতকরণ',
      `আপনি কি ${targetUser.displayName}-কে ${actionText} চান?`,
      makeAdmin ? 'হ্যাঁ, অ্যাডমিন করুন' : 'হ্যাঁ, রোল সরান',
      'বাতিল'
    );
    if (!confirmed) return;

    await fallbackStore.setAdminRole(targetUser.uid, makeAdmin);
    setUsers(Array.from(fallbackStore.users.values()));
    showAlert(
      'রোল আপডেট সম্পন্ন',
      `${targetUser.displayName} ${makeAdmin ? 'এখন একজন Admin।' : 'এর Admin রোল সরানো হয়েছে।'}`,
      'success'
    );
  };

  // --- Filtering & Sorting Helper Functions ---

  // 1. Process Orders List (Search, Filter by Status, Sort by Newest default)
  const getProcessedOrders = (rawOrders: Order[]) => {
    let list = [...rawOrders];

    // Date range filter
    if (ordersStartDate) {
      const startMs = new Date(`${ordersStartDate}T00:00:00`).getTime();
      list = list.filter((o) => new Date(o.createdAt).getTime() >= startMs);
    }
    if (ordersEndDate) {
      const endMs = new Date(`${ordersEndDate}T23:59:59.999`).getTime();
      list = list.filter((o) => new Date(o.createdAt).getTime() <= endMs);
    }

    // Search query filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (o) =>
          o.id.toLowerCase().includes(q) ||
          (o.title || '').toLowerCase().includes(q) ||
          o.customerName.toLowerCase().includes(q) ||
          (o.customerPhone && o.customerPhone.includes(q)) ||
          (o.helperName && o.helperName.toLowerCase().includes(q)) ||
          (o.deliveryLocation?.address && o.deliveryLocation.address.toLowerCase().includes(q)) ||
          (o.items || []).some((it) => it.name && it.name.toLowerCase().includes(q))
      );
    }

    // Status filter
    if (statusFilter !== 'ALL') {
      if (statusFilter === 'UNASSIGNED') {
        list = list.filter((o) => !o.helperId && o.status !== 'CANCELED' && o.status !== 'DELIVERED');
      } else if (statusFilter === 'DELIVERY_BACK') {
        list = list.filter((o) => !!o.needDeliveryBack);
      } else {
        list = list.filter((o) => o.status === statusFilter);
      }
    }

    // Sorting (Default Latest First)
    list.sort((a, b) => {
      if (sortBy === 'OLDEST') {
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      }
      if (sortBy === 'FEE_HIGH') {
        return b.deliveryFee - a.deliveryFee;
      }
      if (sortBy === 'FEE_LOW') {
        return a.deliveryFee - b.deliveryFee;
      }
      // NEWEST default
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    return list;
  };

  // 2. Customer Aggregated List
  const getProcessedCustomers = () => {
    const customerMap = new Map<
      string,
      {
        id: string;
        name: string;
        phone: string;
        email?: string;
        createdAt: string;
        totalOrders: number;
        completedOrders: number;
        canceledOrders: number;
        activeOrders: number;
        totalSpent: number;
      }
    >();

    // Seed from users list
    users.forEach((u) => {
      customerMap.set(u.uid, {
        id: u.uid,
        name: u.displayName || 'Anonymous User',
        phone: u.alternativePhone || 'N/A',
        email: u.email,
        createdAt: u.createdAt || new Date().toISOString(),
        totalOrders: 0,
        completedOrders: 0,
        canceledOrders: 0,
        activeOrders: 0,
        totalSpent: 0,
      });
    });

    // Aggregate from orders
    orders.forEach((o) => {
      const existing = customerMap.get(o.customerId) || {
        id: o.customerId,
        name: o.customerName || 'Customer',
        phone: o.customerPhone || 'N/A',
        createdAt: o.createdAt,
        totalOrders: 0,
        completedOrders: 0,
        canceledOrders: 0,
        activeOrders: 0,
        totalSpent: 0,
      };

      existing.totalOrders += 1;
      if (o.status === 'DELIVERED') {
        existing.completedOrders += 1;
        existing.totalSpent += (o.productCost || 0) + o.deliveryFee;
      } else if (o.status === 'CANCELED') {
        existing.canceledOrders += 1;
      } else {
        existing.activeOrders += 1;
      }

      customerMap.set(o.customerId, existing);
    });

    let list = Array.from(customerMap.values());

    // Search query filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.phone.includes(q) ||
          c.id.toLowerCase().includes(q) ||
          (c.email && c.email.toLowerCase().includes(q))
      );
    }

    // Sorting
    list.sort((a, b) => {
      if (sortBy === 'ORDERS_HIGH') return b.totalOrders - a.totalOrders;
      if (sortBy === 'SPENT_HIGH') return b.totalSpent - a.totalSpent;
      if (sortBy === 'OLDEST') return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    return list;
  };

  // 3. Helper Aggregated List
  const getProcessedHelpers = () => {
    const helperMap = new Map<
      string,
      {
        id: string;
        name: string;
        phone: string;
        email?: string;
        nid?: string;
        status: string;
        completedJobs: number;
        activeOrders: number;
        totalEarned: number;
        balance: number;
        totalWithdrawn: number;
        createdAt: string;
        avgDeliveryTimeMins?: number;
      }
    >();

    // Seed from helper applications & wallets
    applications.forEach((app) => {
      const w = fallbackStore.getHelperWallet(app.userId);
      helperMap.set(app.userId, {
        id: app.userId,
        name: app.legalName || app.userName,
        phone: app.email,
        nid: app.nid,
        status: app.status,
        completedJobs: 0,
        activeOrders: 0,
        totalEarned: w.totalEarned,
        balance: w.balance,
        totalWithdrawn: w.totalWithdrawn,
        createdAt: app.createdAt,
      });
    });

    const helperDurations = new Map<string, { totalMs: number; count: number }>();

    // Aggregate from orders (using allOrders for complete history)
    allOrders.forEach((o) => {
      if (!o.helperId) return;
      const w = fallbackStore.getHelperWallet(o.helperId);
      const existing = helperMap.get(o.helperId) || {
        id: o.helperId,
        name: o.helperName || 'Helper',
        phone: 'N/A',
        status: 'APPROVED',
        completedJobs: 0,
        activeOrders: 0,
        totalEarned: w.totalEarned,
        balance: w.balance,
        totalWithdrawn: w.totalWithdrawn,
        createdAt: o.createdAt,
      };

      if (o.status === 'DELIVERED') {
        existing.completedJobs += 1;
        if (o.deliveredAt && (o.acceptedAt || o.createdAt)) {
          const duration = new Date(o.deliveredAt).getTime() - new Date(o.acceptedAt || o.createdAt).getTime();
          if (duration > 0) {
            const current = helperDurations.get(o.helperId) || { totalMs: 0, count: 0 };
            current.totalMs += duration;
            current.count += 1;
            helperDurations.set(o.helperId, current);
          }
        }
      } else if (o.status !== 'CANCELED') {
        existing.activeOrders += 1;
      }

      helperMap.set(o.helperId, existing);
    });

    // Calculate average delivery time for each helper
    helperMap.forEach((helper, helperId) => {
      const stats = helperDurations.get(helperId);
      if (stats && stats.count > 0) {
        helper.avgDeliveryTimeMins = Math.round(stats.totalMs / (1000 * 60 * stats.count));
      }
    });

    let list = Array.from(helperMap.values());

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (h) =>
          h.name.toLowerCase().includes(q) ||
          h.phone.includes(q) ||
          (h.nid && h.nid.includes(q)) ||
          h.id.toLowerCase().includes(q)
      );
    }

    // Sorting
    list.sort((a, b) => {
      if (sortBy === 'ORDERS_HIGH') return b.completedJobs - a.completedJobs;
      if (sortBy === 'SPENT_HIGH') return b.totalEarned - a.totalEarned;
      if (sortBy === 'OLDEST') return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    return list;
  };

  // 4. Unified Users List with Live Running States
  const getProcessedUsersList = () => {
    let list = users.map((u) => {
      const activeReq = orders.find(
        (o) => (o.customerId === u.uid || (u.alternativePhone && o.customerPhone === u.alternativePhone)) &&
          o.status !== 'DELIVERED' &&
          o.status !== 'CANCELED'
      );
      const activeDel = orders.find(
        (o) => o.helperId === u.uid && o.status !== 'DELIVERED' && o.status !== 'CANCELED'
      );

      const userOrders = orders.filter((o) => o.customerId === u.uid);
      const customerOrdersCount = userOrders.length;
      const helperOrdersCount = orders.filter((o) => o.helperId === u.uid).length;

      const registrationDate = u.createdAt ? new Date(u.createdAt) : new Date();
      const now = new Date();
      const diffTime = Math.abs(now.getTime() - registrationDate.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) || 1;

      const weeklyOrderRate = (customerOrdersCount / diffDays) * 7;
      const monthlyOrderRate = (customerOrdersCount / diffDays) * 30;

      let daysSinceLastOrder: number | null = null;
      if (userOrders.length > 0) {
        const sortedUserOrders = [...userOrders].sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        const lastOrderDate = new Date(sortedUserOrders[0].createdAt);
        const diffLastOrder = Math.abs(now.getTime() - lastOrderDate.getTime());
        daysSinceLastOrder = Math.floor(diffLastOrder / (1000 * 60 * 60 * 24));
      }

      // Determine segments
      const segments: string[] = [];
      if (diffDays <= 7) {
        segments.push('NEW_REGISTERED');
      }
      if (customerOrdersCount === 0) {
        segments.push('NEVER_ORDERED');
      } else {
        if (customerOrdersCount >= 2) {
          segments.push('MULTIPLE_ORDERS');
        }
        if (weeklyOrderRate >= 2) {
          segments.push('WEEKLY_2_ORDERS');
        } else if (weeklyOrderRate >= 1) {
          segments.push('WEEKLY_1_ORDERS');
        } else if (weeklyOrderRate > 0) {
          segments.push('RARE_ORDERS_WEEK');
        }
        if (monthlyOrderRate > 0 && monthlyOrderRate < 1) {
          segments.push('RARE_ORDERS_MONTH');
        }
        if (daysSinceLastOrder !== null) {
          if (daysSinceLastOrder >= 14) {
            segments.push('INACTIVE_2_WEEKS');
          } else if (daysSinceLastOrder >= 7) {
            segments.push('INACTIVE_1_WEEK');
          }
        }
      }

      return {
        user: u,
        activeReq,
        activeDel,
        customerOrdersCount,
        weeklyOrderRate,
        monthlyOrderRate,
        daysSinceLastOrder,
        segments,
        totalOrdersCount: customerOrdersCount + helperOrdersCount,
      };
    });

    // Date range filter
    if (usersStartDate) {
      const startMs = new Date(`${usersStartDate}T00:00:00`).getTime();
      list = list.filter((item) => new Date(item.user.createdAt).getTime() >= startMs);
    }
    if (usersEndDate) {
      const endMs = new Date(`${usersEndDate}T23:59:59.999`).getTime();
      list = list.filter((item) => new Date(item.user.createdAt).getTime() <= endMs);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (item) =>
          (item.user.displayName || '').toLowerCase().includes(q) ||
          (item.user.email || '').toLowerCase().includes(q) ||
          (item.user.alternativePhone && item.user.alternativePhone.includes(q)) ||
          (item.user.uid || '').toLowerCase().includes(q) ||
          (item.user.labels && item.user.labels.some((lbl) => (lbl || '').toLowerCase().includes(q)))
      );
    }

    if (statusFilter !== 'ALL') {
      if (statusFilter === 'CUSTOMER') {
        list = list.filter((item) => item.user.role === 'customer' || !item.user.isHelper);
      } else if (statusFilter === 'HELPER') {
        list = list.filter((item) => item.user.isHelper || item.user.role === 'helper');
      } else if (statusFilter === 'ADMIN') {
        list = list.filter((item) => item.user.isAdmin || item.user.role === 'admin');
      } else if (statusFilter === 'BLOCKED') {
        list = list.filter((item) => item.user.isBlocked);
      } else if (statusFilter === 'LABELED') {
        list = list.filter((item) => item.user.labels && item.user.labels.length > 0);
      }
    }

    if (audienceFilter !== 'ALL') {
      list = list.filter((item) => item.segments.includes(audienceFilter));
    }

    list.sort((a, b) => {
      if (sortBy === 'OLDEST') return new Date(a.user.createdAt).getTime() - new Date(b.user.createdAt).getTime();
      if (sortBy === 'ORDERS_HIGH') return b.totalOrdersCount - a.totalOrdersCount;
      return new Date(b.user.createdAt).getTime() - new Date(a.user.createdAt).getTime();
    });

    return list;
  };

  // Generic Pagination Calculator
  function paginateList<T>(items: T[]) {
    const totalPages = Math.ceil(items.length / pageSize) || 1;
    const paginatedItems = items.slice((currentPage - 1) * pageSize, currentPage * pageSize);
    return { totalPages, paginatedItems, totalItems: items.length };
  }

  const isSuperAdmin = currentUser?.isSuperAdmin;
  const isAdmin = currentUser?.isAdmin;
  const isNormalAdmin = isAdmin && !isSuperAdmin;

  const tabsList = [
    { key: 'EXCEPTIONS', label: 'Needs Attention', icon: AlertCircle, color: 'text-amber-500' },
    { key: 'ORDERS', label: 'All Orders', icon: ShoppingBag, color: 'text-emerald-600' },
    { key: 'USERS_LIST', label: 'User Lists', icon: Users, color: 'text-purple-600' },
    { key: 'HELPERS', label: 'Helpers', icon: Bike, color: 'text-emerald-600' },
    { key: 'SHOPS', label: 'Shops', icon: Store, color: 'text-purple-600' },
    { key: 'FEEDBACK', label: 'Order Feedback', icon: Star, color: 'text-amber-500' },
    { key: 'CUSTOM_MODALS', label: 'Custom Modals', icon: Sparkles, color: 'text-purple-600' },
    { key: 'CUSTOMERS', label: 'Customers', icon: User, color: 'text-indigo-600' },
    { key: 'REVENUE', label: 'Revenue Analytics', icon: TrendingUp, color: 'text-emerald-600' },
    { key: 'WITHDRAWALS', label: 'Helper Commissions', icon: DollarSign, color: 'text-purple-600' },
    { key: 'PRICING', label: 'Pricing', icon: DollarSign, color: 'text-emerald-600' },
    { key: 'SETTINGS', label: 'Settings', icon: Settings, color: 'text-purple-600' },
  ];

  const isTabAllowed = (tabKey: string) => {
    if (isSuperAdmin) return true;
    return allowedAdminTabs.includes(tabKey);
  };

  // Redirect normal admin if activeTab is not allowed
  useEffect(() => {
    if (isNormalAdmin) {
      if (!allowedAdminTabs.includes(activeTab)) {
        if (allowedAdminTabs.length > 0) {
          setActiveTab(allowedAdminTabs[0] as any);
        }
      }
    }
  }, [activeTab, allowedAdminTabs, isNormalAdmin]);

  if (isNormalAdmin && allowedAdminTabs.length === 0) {
    return (
      <div className="max-w-md mx-auto my-12 p-8 bg-white rounded-3xl border border-gray-150 shadow-soft text-center space-y-4">
        <div className="w-16 h-16 bg-red-50 text-red-650 rounded-2xl flex items-center justify-center mx-auto">
          <AlertCircle className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-extrabold text-gray-900">Access Restricted</h2>
        <p className="text-sm text-gray-600">
          You do not have permission to access any admin dashboard tabs. Please contact the Super Admin to grant you permissions.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6 animate-in fade-in duration-200">
      {/* Top Banner & Header */}
      <div className="bg-gradient-to-r from-purple-950 via-indigo-950 to-purple-900 rounded-3xl p-6 text-white shadow-xl shadow-purple-950/10 border border-purple-800/30">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-3 mb-1">
              <div className="p-2.5 rounded-2xl bg-purple-500/20 border border-purple-400/30 backdrop-blur-md">
                <ShieldCheck className="w-6 h-6 text-purple-300" />
              </div>
              <div>
                <h1 className="font-extrabold text-xl md:text-2xl tracking-tight text-white font-sans">
                  Jamanot Admin Dashboard
                </h1>
                <p className="text-xs md:text-sm text-purple-200 font-medium">
                  Real-time operations, scalable pagination, helper assignment & analytics control.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center flex-wrap gap-2">
            <button
              onClick={() => setShowPushNotificationModal(true)}
              className="text-xs font-extrabold px-3 py-2 rounded-2xl bg-purple-600 hover:bg-purple-500 text-white flex items-center space-x-2 shadow-lg shadow-purple-950/40 transition-all border border-purple-400/30 active:scale-95"
            >
              <Bell className="w-4 h-4 text-purple-200" />
              <span className="hidden sm:inline">Send Push Notification</span>
              <span className="sm:hidden">Notify</span>
            </button>

            <span className="text-xs font-extrabold px-3 py-2 rounded-2xl bg-amber-400 text-purple-950 flex items-center space-x-1.5 shadow-md">
              <AlertCircle className="w-4 h-4" />
              <span className="hidden sm:inline">Needs Attention: {totalExceptionsCount}</span>
              <span className="sm:hidden">{totalExceptionsCount} Alerts</span>
            </span>
          </div>
        </div>
      </div>

      {/* Metrics Summary Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Needs Attention Metric */}
        <div
          onClick={() => isTabAllowed('EXCEPTIONS') && setActiveTab('EXCEPTIONS')}
          className={`p-5 rounded-3xl border transition-all ${
            isTabAllowed('EXCEPTIONS')
              ? `cursor-pointer ${totalExceptionsCount > 0
                  ? 'bg-red-50/80 border-red-200 hover:border-red-400 shadow-soft'
                  : 'bg-white border-gray-100 hover:border-gray-300 shadow-soft'
                }`
              : 'opacity-50 cursor-not-allowed bg-gray-50 border-gray-100'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-extrabold text-gray-500 uppercase tracking-wider">
              Needs Attention
            </span>
            <div className={`p-2 rounded-2xl ${totalExceptionsCount > 0 ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-600'}`}>
              <AlertCircle className="w-5 h-5" />
            </div>
          </div>
          <div className="flex items-baseline space-x-2">
            <span className="text-3xl font-extrabold text-gray-900">{totalExceptionsCount}</span>
            <span className="text-xs text-gray-500">pending action</span>
          </div>
        </div>

        {/* Total Orders Metric */}
        <div
          onClick={() => isTabAllowed('ORDERS') && setActiveTab('ORDERS')}
          className={`p-5 rounded-3xl border shadow-soft transition-all ${
            isTabAllowed('ORDERS')
              ? 'bg-white border-gray-100 hover:border-emerald-300 cursor-pointer'
              : 'opacity-50 cursor-not-allowed bg-gray-50 border-gray-100'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-extrabold text-gray-500 uppercase tracking-wider">
              Total Orders
            </span>
            <div className="p-2 rounded-2xl bg-emerald-100 text-emerald-700">
              <ShoppingBag className="w-5 h-5" />
            </div>
          </div>
          <div className="flex items-baseline space-x-2">
            <span className="text-3xl font-extrabold text-gray-900">{allOrders.length}</span>
            <span className="text-xs text-gray-500">total in system</span>
          </div>
        </div>

        {/* Average Delivery Time Metric */}
        <div
          onClick={() => setShowHighDurationModal(true)}
          className="p-5 rounded-3xl border shadow-soft bg-white border-gray-100 hover:border-purple-400 cursor-pointer transition-all"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-extrabold text-gray-500 uppercase tracking-wider">
              Avg Delivery Time
            </span>
            <div className="p-2 rounded-2xl bg-purple-100 text-purple-700">
              <Clock className="w-5 h-5" />
            </div>
          </div>
          <div className="flex items-baseline space-x-2">
            <span className="text-3xl font-extrabold text-gray-900">
              {avgDeliveryTimeMins > 0 ? `${avgDeliveryTimeMins}m` : 'N/A'}
            </span>
            <span className="text-xs text-gray-500">per order</span>
          </div>
        </div>

        {/* Customer Accounts Metric */}
        <div
          onClick={() => isTabAllowed('USERS_LIST') && setActiveTab('USERS_LIST')}
          className={`p-5 rounded-3xl border shadow-soft transition-all ${
            isTabAllowed('USERS_LIST')
              ? 'bg-white border-gray-100 hover:border-purple-300 cursor-pointer'
              : 'opacity-50 cursor-not-allowed bg-gray-50 border-gray-100'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-extrabold text-gray-500 uppercase tracking-wider">
              Customer Accounts
            </span>
            <div className="p-2 rounded-2xl bg-purple-100 text-purple-700">
              <User className="w-5 h-5" />
            </div>
          </div>
          <div className="flex items-baseline space-x-2">
            <span className="text-3xl font-extrabold text-gray-900">{users.length}</span>
            <span className="text-xs text-purple-700 font-semibold">registered users</span>
          </div>
        </div>

        {/* Active Helpers Metric */}
        <div
          onClick={() => {
            if (isTabAllowed('HELPERS')) {
              setActiveTab('HELPERS');
              setHelperSubView('APPLICATIONS');
            }
          }}
          className={`p-5 rounded-3xl border shadow-soft transition-all ${
            isTabAllowed('HELPERS')
              ? 'bg-white border-gray-100 hover:border-indigo-300 cursor-pointer'
              : 'opacity-50 cursor-not-allowed bg-gray-50 border-gray-100'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-extrabold text-gray-500 uppercase tracking-wider">
              Active Helpers
            </span>
            <div className="p-2 rounded-2xl bg-indigo-100 text-indigo-700">
              <Bike className="w-5 h-5" />
            </div>
          </div>
          <div className="flex items-baseline space-x-2">
            <span className="text-3xl font-extrabold text-gray-900">{approvedHelpersCount}</span>
            <span className="text-xs text-amber-600 font-semibold">({pendingApps.length} pending app)</span>
          </div>
        </div>
      </div>

      {/* Navigation Tabs Bar */}
      <DraggableTabsContainer containerClassName="w-full" activeKey={activeTab}>
        {isTabAllowed('EXCEPTIONS') && (
          <button
            onClick={() => setActiveTab('EXCEPTIONS')}
            data-active={activeTab === 'EXCEPTIONS'}
            className={`py-3 px-4 rounded-xl whitespace-nowrap transition-all flex items-center space-x-2 shrink-0 ${activeTab === 'EXCEPTIONS'
                ? 'bg-white text-purple-950 shadow-md border border-gray-200/80 font-black'
                : 'text-gray-600 hover:text-gray-900 font-semibold'
              }`}
          >
            <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
            <span>Needs Attention</span>
            {totalExceptionsCount > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-red-500 text-white text-[10px] shrink-0 font-bold">
                {totalExceptionsCount}
              </span>
            )}
          </button>
        )}

        {isTabAllowed('ORDERS') && (
          <button
            onClick={() => setActiveTab('ORDERS')}
            data-active={activeTab === 'ORDERS'}
            className={`py-3 px-4 rounded-xl whitespace-nowrap transition-all flex items-center space-x-2 shrink-0 ${activeTab === 'ORDERS'
                ? 'bg-white text-purple-950 shadow-md border border-gray-200/80 font-black'
                : 'text-gray-600 hover:text-gray-900 font-semibold'
              }`}
          >
            <ShoppingBag className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>All Orders ({orders.length})</span>
          </button>
        )}

        {isTabAllowed('USERS_LIST') && (
          <button
            onClick={() => setActiveTab('USERS_LIST')}
            data-active={activeTab === 'USERS_LIST'}
            className={`py-3 px-4 rounded-xl whitespace-nowrap transition-all flex items-center space-x-2 shrink-0 ${activeTab === 'USERS_LIST'
                ? 'bg-white text-purple-950 shadow-md border border-gray-200/80 font-black'
                : 'text-gray-600 hover:text-gray-900 font-semibold'
              }`}
          >
            <Users className="w-4 h-4 text-purple-600 shrink-0" />
            <span>User Lists ({users.length})</span>
          </button>
        )}

        {isTabAllowed('HELPERS') && (
          <button
            onClick={() => setActiveTab('HELPERS')}
            data-active={activeTab === 'HELPERS'}
            className={`py-3 px-4 rounded-xl whitespace-nowrap transition-all flex items-center space-x-2 shrink-0 ${activeTab === 'HELPERS'
                ? 'bg-white text-purple-950 shadow-md border border-gray-200/80 font-black'
                : 'text-gray-600 hover:text-gray-900 font-semibold'
              }`}
          >
            <Bike className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>Helpers ({approvedHelpersCount || getProcessedHelpers().length})</span>
            {pendingApps.length > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-amber-500 text-white text-[10px] shrink-0 font-bold">
                {pendingApps.length} app
              </span>
            )}
          </button>
        )}

        {isTabAllowed('SHOPS') && (
          <button
            onClick={() => setActiveTab('SHOPS')}
            data-active={activeTab === 'SHOPS'}
            className={`py-3 px-4 rounded-xl whitespace-nowrap transition-all flex items-center space-x-2 shrink-0 ${activeTab === 'SHOPS'
                ? 'bg-white text-purple-950 shadow-md border border-gray-200/80 font-black'
                : 'text-gray-600 hover:text-gray-900 font-semibold'
              }`}
          >
            <Store className="w-4 h-4 text-purple-600 shrink-0" />
            <span>Shops ({shops.length})</span>
          </button>
        )}

        {isTabAllowed('FEEDBACK') && (
          <button
            onClick={() => setActiveTab('FEEDBACK')}
            data-active={activeTab === 'FEEDBACK'}
            className={`py-3 px-4 rounded-xl whitespace-nowrap transition-all flex items-center space-x-2 shrink-0 ${activeTab === 'FEEDBACK'
                ? 'bg-white text-purple-950 shadow-md border border-gray-200/80 font-black'
                : 'text-gray-600 hover:text-gray-900 font-semibold'
              }`}
          >
            <Star className="w-4 h-4 text-amber-500 shrink-0" />
            <span>Order Feedback ({feedbacks.length})</span>
          </button>
        )}

        {isTabAllowed('CUSTOM_MODALS') && (
          <button
            onClick={() => setActiveTab('CUSTOM_MODALS')}
            data-active={activeTab === 'CUSTOM_MODALS'}
            className={`py-3 px-4 rounded-xl whitespace-nowrap transition-all flex items-center space-x-2 shrink-0 ${activeTab === 'CUSTOM_MODALS'
                ? 'bg-white text-purple-950 shadow-md border border-gray-200/80 font-black'
                : 'text-gray-600 hover:text-gray-900 font-semibold'
              }`}
          >
            <Sparkles className="w-4 h-4 text-purple-600 shrink-0" />
            <span>Custom Modals ({customModals.length})</span>
          </button>
        )}

        {isTabAllowed('CUSTOMERS') && (
          <button
            onClick={() => setActiveTab('CUSTOMERS')}
            data-active={activeTab === 'CUSTOMERS'}
            className={`py-3 px-4 rounded-xl whitespace-nowrap transition-all flex items-center space-x-2 shrink-0 ${activeTab === 'CUSTOMERS'
                ? 'bg-white text-purple-950 shadow-md border border-gray-200/80 font-black'
                : 'text-gray-600 hover:text-gray-900 font-semibold'
              }`}
          >
            <User className="w-4 h-4 text-indigo-600 shrink-0" />
            <span>Customers</span>
          </button>
        )}

        {isTabAllowed('REVENUE') && (
          <button
            onClick={() => setActiveTab('REVENUE')}
            data-active={activeTab === 'REVENUE'}
            className={`py-3 px-4 rounded-xl whitespace-nowrap transition-all flex items-center space-x-2 shrink-0 ${activeTab === 'REVENUE'
                ? 'bg-white text-purple-950 shadow-md border border-gray-200/80 font-black'
                : 'text-gray-600 hover:text-gray-900 font-semibold'
              }`}
          >
            <TrendingUp className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>Revenue Analytics</span>
          </button>
        )}

        {isTabAllowed('WITHDRAWALS') && (
          <button
            onClick={() => setActiveTab('WITHDRAWALS')}
            data-active={activeTab === 'WITHDRAWALS'}
            className={`py-3 px-4 rounded-xl whitespace-nowrap transition-all flex items-center space-x-2 shrink-0 ${activeTab === 'WITHDRAWALS'
                ? 'bg-white text-purple-950 shadow-md border border-gray-200/80 font-black'
                : 'text-gray-600 hover:text-gray-900 font-semibold'
              }`}
          >
            <DollarSign className="w-4 h-4 text-purple-600 shrink-0" />
            <span>Helper Commissions ({pendingWds.length})</span>
          </button>
        )}

        {isTabAllowed('PRICING') && (
          <button
            onClick={() => setActiveTab('PRICING')}
            data-active={activeTab === 'PRICING'}
            className={`py-3 px-4 rounded-xl whitespace-nowrap transition-all flex items-center space-x-2 shrink-0 ${activeTab === 'PRICING'
                ? 'bg-white text-purple-950 shadow-md border border-gray-200/80 font-black'
                : 'text-gray-600 hover:text-gray-900 font-semibold'
              }`}
          >
            <DollarSign className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>Pricing</span>
          </button>
        )}

        {isTabAllowed('SETTINGS') && (
          <button
            onClick={() => setActiveTab('SETTINGS')}
            data-active={activeTab === 'SETTINGS'}
            className={`py-3 px-4 rounded-xl whitespace-nowrap transition-all flex items-center space-x-2 shrink-0 ${activeTab === 'SETTINGS'
                ? 'bg-white text-purple-950 shadow-md border border-gray-200/80 font-black'
                : 'text-gray-600 hover:text-gray-900 font-semibold'
              }`}
          >
            <Settings className="w-4 h-4 text-purple-600 shrink-0" />
            <span>Settings</span>
          </button>
        )}
      </DraggableTabsContainer>

      {/* Global Search & Sorting Bar (Visible on list tabs) */}
      {activeTab !== 'PRICING' && activeTab !== 'SETTINGS' && (
        <div className="bg-white p-4 rounded-3xl border border-gray-100 shadow-soft flex flex-col gap-3">
          {/* Search Box */}
          <div className="relative w-full">
            <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-3.5" />
            <input
              type="text"
              placeholder="Search orders, customers, helpers, phone..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-2xl text-xs font-semibold focus:outline-none focus:bg-white focus:border-purple-600 focus:ring-4 focus:ring-purple-600/10 transition-all"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full">
            {/* Status Filter (for Orders / Exceptions) */}
            {(activeTab === 'ORDERS' || activeTab === 'EXCEPTIONS') && (
              <div className="flex items-center space-x-1.5 text-xs font-bold text-gray-600">
                <Filter className="w-4 h-4 text-gray-400" />
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold text-gray-800 focus:outline-none focus:border-purple-600"
                >
                  <option value="ALL">All Statuses</option>
                  {activeTab === 'ORDERS' && <option value="UNASSIGNED">Unassigned Orders</option>}
                  {activeTab === 'ORDERS' && <option value="DELIVERY_BACK">🔁 Need Delivery Back</option>}
                  <option value="PENDING">Pending (Not Accepted)</option>
                  <option value="ACCEPTED">Accepted</option>
                  <option value="PURCHASED_EXECUTED">Purchased / Executed</option>
                  <option value="ON_THE_WAY">On The Way</option>
                  <option value="ARRIVED">Arrived</option>
                  <option value="DELIVERED">Delivered</option>
                  <option value="CANCELED">Canceled</option>
                </select>
              </div>
            )}

            {activeTab === 'USERS_LIST' && (
              <>
                <div className="flex items-center space-x-1.5 text-xs font-bold text-gray-600">
                  <Filter className="w-4 h-4 text-gray-400" />
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold text-gray-800 focus:outline-none focus:border-purple-600"
                  >
                    <option value="ALL">All Roles</option>
                    <option value="CUSTOMER">Customers Only</option>
                    <option value="HELPER">Helpers Only</option>
                    <option value="ADMIN">Admins Only</option>
                    <option value="BLOCKED">Blocked Users</option>
                    <option value="LABELED">Labeled Users</option>
                  </select>
                </div>

                <div className="flex items-center space-x-1.5 text-xs font-bold text-gray-600">
                  <Users className="w-4 h-4 text-purple-600 shrink-0" />
                  <select
                    value={audienceFilter}
                    onChange={(e) => setAudienceFilter(e.target.value)}
                    className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold text-gray-800 focus:outline-none focus:border-purple-600"
                  >
                    <option value="ALL">All Audiences</option>
                    <option value="MULTIPLE_ORDERS">Ordered Multiple Times (2+ orders)</option>
                    <option value="WEEKLY_2_ORDERS">Frequent: Weekly 2+ Orders</option>
                    <option value="WEEKLY_1_ORDERS">Frequent: Weekly 1+ Orders</option>
                    <option value="RARE_ORDERS_WEEK">Rare: &lt;1 order/week</option>
                    <option value="RARE_ORDERS_MONTH">Rare: &lt;1 order/month</option>
                    <option value="INACTIVE_1_WEEK">Inactive: No order since 1 week</option>
                    <option value="INACTIVE_2_WEEKS">Inactive: No order since 2 weeks</option>
                    <option value="NEVER_ORDERED">Never Ordered (0 orders)</option>
                    <option value="NEW_REGISTERED">New Registered (last 7 days)</option>
                  </select>
                </div>
              </>
            )}

            {activeTab === 'WITHDRAWALS' && (
              <div className="flex items-center space-x-1.5 text-xs font-bold text-gray-600">
                <Filter className="w-4 h-4 text-gray-400" />
                <select
                  value={withdrawalStatusFilter}
                  onChange={(e) => setWithdrawalStatusFilter(e.target.value)}
                  className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold text-gray-800 focus:outline-none focus:border-purple-600"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="PENDING">Pending Payouts</option>
                  <option value="APPROVED">Approved Payouts</option>
                  <option value="REJECTED">Rejected Payouts</option>
                </select>
              </div>
            )}

            {/* Sorting Selector (Default: NEWEST) */}
            <div className="flex items-center space-x-1.5 text-xs font-bold text-gray-600">
              <ArrowUpDown className="w-4 h-4 text-gray-400" />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold text-gray-800 focus:outline-none focus:border-purple-600"
              >
                <option value="NEWEST">Latest First (Default)</option>
                <option value="OLDEST">Oldest First</option>
                {activeTab === 'ORDERS' && (
                  <>
                    <option value="FEE_HIGH">Delivery Fee (High to Low)</option>
                    <option value="FEE_LOW">Delivery Fee (Low to High)</option>
                  </>
                )}
                {(activeTab === 'CUSTOMERS' || activeTab === 'HELPERS') && (
                  <>
                    <option value="ORDERS_HIGH">Most Orders / Completed</option>
                    <option value="SPENT_HIGH">Highest Spent / Earned</option>
                  </>
                )}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* --- TAB 1: NEEDS ATTENTION TAB --- */}
      {activeTab === 'EXCEPTIONS' && isTabAllowed('EXCEPTIONS') && (() => {
        const notAccepted = getProcessedOrders(notAcceptedRequests);
        const cancelling = getProcessedOrders(cancellingRequests);
        const feeAdjustments = getProcessedOrders(feeAdjustmentsPending);
        const firstOrderIds = getFirstOrderIds(orders);

        // Per-section pagination helpers
        const paginate = <T,>(list: T[], page: number, size: number) => ({
          items: list.slice((page - 1) * size, page * size),
          totalPages: Math.max(1, Math.ceil(list.length / size)),
        });
        const pc = paginate(cancelling, excCancelPage, excCancelPageSize);
        const pfa = paginate(feeAdjustments, excFeeAdjPage, excFeeAdjPageSize);
        const pna = paginate(notAccepted, excNotAcceptedPage, excNotAcceptedPageSize);
        const pdl = paginate(delayedOrders, excDelayedPage, excDelayedPageSize);
        const pha = paginate(pendingApps, excHelperAppPage, excHelperAppPageSize);
        const psa = paginate(pendingStoreApps, excStoreAppPage, excStoreAppPageSize);
        const pwd = paginate(pendingWds, excPendingWdPage, excPendingWdPageSize);

        const hasExceptions =
          cancelling.length > 0 ||
          notAccepted.length > 0 ||
          feeAdjustments.length > 0 ||
          pendingApps.length > 0 ||
          pendingWds.length > 0 ||
          pendingStoreApps.length > 0 ||
          delayedOrders.length > 0;

        return (
          <div className="space-y-6">
            {!hasExceptions ? (
              <div className="py-16 bg-white rounded-3xl border border-gray-100 text-center p-8 shadow-soft space-y-3">
                <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
                  <Check className="w-8 h-8" />
                </div>
                <h4 className="font-extrabold text-gray-900 text-base">সবকিছু ঠিকঠাক চলছে!</h4>
                <p className="text-xs text-gray-500 max-w-sm mx-auto">
                  এই মুহূর্তে কোনো হেলপার রিকোয়েস্ট ক্যানসেলেশন, পেন্ডিং উইথড্রয়াল, ফি সমন্বয় বা হেলপার আবেদন নেই।
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* 1. Cancellation Requests (Order Related) */}
                {cancelling.length > 0 && (
                  <div className="bg-white rounded-3xl border border-gray-100 shadow-soft overflow-hidden">
                    <div className="p-5 border-b border-gray-100 bg-amber-50/50 flex items-center justify-between">
                      <h3 className="font-extrabold text-sm text-gray-900 flex items-center space-x-2">
                        <XCircle className="w-4 h-4 text-red-600" />
                        <span>Order Cancellation Requests ({cancelling.length})</span>
                      </h3>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs text-gray-600 min-w-[650px]">
                        <thead className="bg-gray-50 text-gray-700 uppercase font-extrabold text-[10px] tracking-wider border-b border-gray-100">
                          <tr>
                            <th className="py-3 px-5">Order ID</th>
                            <th className="py-3 px-5">Requested By</th>
                            <th className="py-3 px-5">Reason / Feedback</th>
                            <th className="py-3 px-5 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 font-medium">
                          {pc.items.map((ord) => (
                            <tr key={ord.id} className="hover:bg-gray-50/80 transition-colors">
                              <td className="py-3.5 px-5 font-bold text-gray-900">
                                <button
                                  onClick={() => setSelectedOrderId(ord.id)}
                                  className="text-purple-900 hover:text-purple-950 hover:underline font-extrabold"
                                >
                                  #{ord.id}
                                </button>
                              </td>
                              <td className="py-3.5 px-5 uppercase font-bold text-red-800">
                                {ord.cancellationRequest?.requestedBy || (ord.status === 'CANCELED' ? 'customer' : 'N/A')}
                              </td>
                              <td className="py-3.5 px-5 text-gray-600 italic font-normal max-w-xs truncate">
                                {ord.cancellationRequest?.reason || 'Direct cancellation / no feedback'}
                              </td>
                              <td className="py-3.5 px-5 text-right">
                                <div className="flex justify-end items-center space-x-1.5 flex-wrap gap-1">
                                  <button
                                    onClick={() => setSelectedOrderId(ord.id)}
                                    className="py-1.5 px-3 rounded-xl bg-purple-900 hover:bg-purple-950 text-white font-extrabold text-xs shadow-sm transition-all"
                                  >
                                    Details
                                  </button>
                                  {ord.cancellationRequest?.status === 'PENDING' && (
                                    <>
                                      <button
                                        onClick={() => handleApproveCancellation(ord.id)}
                                        className="py-1.5 px-3 rounded-xl bg-red-600 hover:bg-red-700 text-white font-extrabold text-xs shadow-sm transition-all"
                                      >
                                        Approve
                                      </button>
                                      <button
                                        onClick={() => handleRejectCancellation(ord.id)}
                                        className="py-1.5 px-3 rounded-xl bg-gray-200 hover:bg-gray-300 text-gray-800 font-extrabold text-xs transition-all"
                                      >
                                        Reject
                                      </button>
                                    </>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <PaginationControl
                      currentPage={Math.min(excCancelPage, pc.totalPages)}
                      totalPages={pc.totalPages}
                      totalItems={cancelling.length}
                      pageSize={excCancelPageSize}
                      onPageChange={(p) => setExcCancelPage(p)}
                      onPageSizeChange={(s) => { setExcCancelPageSize(s); setExcCancelPage(1); }}
                      pageSizeOptions={[5, 10, 25]}
                    />
                  </div>
                )}

                {/* 2. Pending Fee Adjustments (Order Related) */}
                {feeAdjustments.length > 0 && (
                  <div className="bg-white rounded-3xl border border-gray-100 shadow-soft overflow-hidden">
                    <div className="p-5 border-b border-gray-100 bg-amber-50/50 flex items-center justify-between">
                      <h3 className="font-extrabold text-sm text-gray-900 flex items-center space-x-2">
                        <TrendingUp className="w-4 h-4 text-indigo-700" />
                        <span>Pending Fee Adjustments ({feeAdjustments.length})</span>
                      </h3>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs text-gray-600 min-w-[600px]">
                        <thead className="bg-gray-50 text-gray-700 uppercase font-extrabold text-[10px] tracking-wider border-b border-gray-100">
                          <tr>
                            <th className="py-3 px-5">Order ID</th>
                            <th className="py-3 px-5">Customer & Helper</th>
                            <th className="py-3 px-5">Fee Adjustment</th>
                            <th className="py-3 px-5">Reason</th>
                            <th className="py-3 px-5 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 font-medium">
                          {pfa.items.map((ord) => (
                            <tr key={ord.id} className="hover:bg-gray-50/80 transition-colors">
                              <td className="py-3.5 px-5 font-bold text-gray-900">#{ord.id}</td>
                              <td className="py-3.5 px-5">
                                <div className="font-extrabold text-gray-900">{ord.customerName}</div>
                                <div className="text-[11px] text-purple-950 font-bold">Helper: {ord.helperName}</div>
                              </td>
                              <td className="py-3.5 px-5">
                                <span className="text-gray-400 line-through mr-1.5">৳{ord.deliveryFee}</span>
                                <span className="font-black text-emerald-700">৳{ord.feeAdjustment?.amount}</span>
                              </td>
                              <td className="py-3.5 px-5 text-gray-600 italic font-normal max-w-xs truncate">{ord.feeAdjustment?.reason}</td>
                              <td className="py-3.5 px-5 text-right">
                                <div className="flex justify-end space-x-1.5">
                                  <button
                                    onClick={() => handleApproveFeeAdjustment(ord.id)}
                                    className="py-1.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs shadow-sm transition-all"
                                  >
                                    Approve
                                  </button>
                                  <button
                                    onClick={() => handleRejectFeeAdjustment(ord.id)}
                                    className="py-1.5 px-3 rounded-xl bg-gray-200 hover:bg-gray-300 text-gray-800 font-extrabold text-xs transition-all"
                                  >
                                    Reject
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <PaginationControl
                      currentPage={Math.min(excFeeAdjPage, pfa.totalPages)}
                      totalPages={pfa.totalPages}
                      totalItems={feeAdjustments.length}
                      pageSize={excFeeAdjPageSize}
                      onPageChange={(p) => setExcFeeAdjPage(p)}
                      onPageSizeChange={(s) => { setExcFeeAdjPageSize(s); setExcFeeAdjPage(1); }}
                      pageSizeOptions={[5, 10, 25]}
                    />
                  </div>
                )}

                {/* 3. Unaccepted / Pending Requests (Order Related) */}
                {notAccepted.length > 0 && (
                  <div className="bg-white rounded-3xl border border-gray-100 shadow-soft overflow-hidden">
                    <div className="p-5 border-b border-gray-100 bg-amber-50/50 flex items-center justify-between">
                      <h3 className="font-extrabold text-sm text-gray-900 flex items-center space-x-2">
                        <Clock className="w-4 h-4 text-amber-600" />
                        <span>Pending Orders (Not Accepted) ({notAccepted.length})</span>
                      </h3>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs text-gray-600 min-w-[580px]">
                        <thead className="bg-gray-50 text-gray-700 uppercase font-extrabold text-[10px] tracking-wider border-b border-gray-100">
                          <tr>
                            <th className="py-3.5 px-5">Order ID</th>
                            <th className="py-3.5 px-5">Customer</th>
                            <th className="py-3.5 px-5">Title & Items</th>
                            <th className="py-3.5 px-5">Fee</th>
                            <th className="py-3.5 px-5 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 font-medium">
                          {pna.items.map((ord) => {
                            const isFirst = firstOrderIds.has(ord.id);
                            return (
                              <tr key={ord.id} className="hover:bg-gray-50/80 transition-colors">
                                <td className="py-3.5 px-5 font-bold text-gray-900">#{ord.id}</td>
                                <td className="py-3.5 px-5">
                                  <div className="font-extrabold text-gray-900 flex items-center gap-1.5 flex-wrap">
                                    {ord.customerName}
                                    {isFirst && (
                                      <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-amber-400 text-amber-950 text-[9px] font-black uppercase tracking-wide shadow-sm shrink-0">
                                        🥇 1st Order
                                      </span>
                                    )}
                                    {(() => {
                                      const custUser = fallbackStore.users.get(ord.customerId) || users.find((u) => u.uid === ord.customerId);
                                      if (!custUser?.labels || custUser.labels.length === 0) return null;
                                      return custUser.labels.map((lbl) => (
                                        <span key={lbl} className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-amber-100 text-purple-950 font-extrabold text-[9px] border border-amber-200 shrink-0">
                                          🏷️ {lbl}
                                        </span>
                                      ));
                                    })()}
                                  </div>
                                  <div className="text-[11px] text-gray-400">{ord.customerPhone}</div>
                                </td>
                                <td className="py-3.5 px-5">
                                  <div className="font-bold text-gray-900 max-w-xs truncate">{ord.title || ord.items?.[0]?.name || 'Order'}</div>
                                  <div className="text-[11px] text-gray-500">{(ord.items || []).length} items</div>
                                </td>
                                <td className="py-3.5 px-5 font-extrabold text-emerald-700">৳{ord.deliveryFee}</td>
                                <td className="py-3.5 px-5 text-right">
                                  <div className="flex justify-end space-x-2">
                                    <button
                                      onClick={() => setAssignHelperOrder(ord)}
                                      className="py-1.5 px-3 rounded-xl bg-purple-900 hover:bg-purple-950 text-white font-extrabold text-xs shadow-sm transition-all"
                                    >
                                      Assign Helper
                                    </button>
                                    <button
                                      onClick={() => setSelectedOrderId(ord.id)}
                                      className="py-1.5 px-3 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-800 font-extrabold text-xs transition-all"
                                    >
                                      Details
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                    <PaginationControl
                      currentPage={Math.min(excNotAcceptedPage, pna.totalPages)}
                      totalPages={pna.totalPages}
                      totalItems={notAccepted.length}
                      pageSize={excNotAcceptedPageSize}
                      onPageChange={(p) => setExcNotAcceptedPage(p)}
                      onPageSizeChange={(s) => { setExcNotAcceptedPageSize(s); setExcNotAcceptedPage(1); }}
                      pageSizeOptions={[5, 10, 25]}
                    />
                  </div>
                )}

                {/* 3.5 Delayed Orders (> 1 hour) */}
                {delayedOrders.length > 0 && (
                  <div className="bg-white rounded-3xl border border-gray-100 shadow-soft overflow-hidden animate-in fade-in duration-200">
                    <div className="p-5 border-b border-gray-100 bg-red-50/50 flex items-center justify-between">
                      <h3 className="font-extrabold text-sm text-gray-900 flex items-center space-x-2">
                        <Clock className="w-4 h-4 text-red-650 animate-pulse" />
                        <span>Delayed Orders (&gt; 1 hour) ({delayedOrders.length})</span>
                      </h3>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs text-gray-600 min-w-[650px]">
                        <thead className="bg-gray-50 text-gray-700 uppercase font-extrabold text-[10px] tracking-wider border-b border-gray-100">
                          <tr>
                            <th className="py-3 px-5">Order ID</th>
                            <th className="py-3 px-5">Customer & Helper</th>
                            <th className="py-3 px-5">Status</th>
                            <th className="py-3 px-5">Elapsed Time</th>
                            <th className="py-3 px-5 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 font-medium">
                          {pdl.items.map((ord) => {
                            const elapsedMins = Math.round((new Date().getTime() - new Date(ord.createdAt).getTime()) / (1000 * 60));
                            const hrs = Math.floor(elapsedMins / 60);
                            const mins = elapsedMins % 60;
                            const elapsedText = `${hrs}h ${mins}m`;

                            return (
                              <tr key={ord.id} className="hover:bg-gray-50/80 transition-colors">
                                <td className="py-3.5 px-5 font-bold text-gray-900">
                                  <button
                                    onClick={() => setSelectedOrderId(ord.id)}
                                    className="text-purple-900 hover:text-purple-950 hover:underline font-extrabold"
                                  >
                                    #{ord.id}
                                  </button>
                                </td>
                                <td className="py-3.5 px-5">
                                  <div className="font-extrabold text-gray-900">{ord.customerName}</div>
                                  <div className="text-[11px] text-purple-950 font-bold">
                                    Helper: {ord.helperName || 'Not Assigned'}
                                  </div>
                                </td>
                                <td className="py-3.5 px-5">
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-100 text-amber-800">
                                    {ord.status}
                                  </span>
                                </td>
                                <td className="py-3.5 px-5 font-black text-red-650">
                                  {elapsedText}
                                </td>
                                <td className="py-3.5 px-5 text-right">
                                  <div className="flex justify-end items-center space-x-1.5 flex-wrap gap-1">
                                    <button
                                      onClick={() => setSelectedOrderId(ord.id)}
                                      className="py-1.5 px-3 rounded-xl bg-purple-900 hover:bg-purple-950 text-white font-extrabold text-xs shadow-sm transition-all"
                                    >
                                      Details
                                    </button>
                                    <button
                                      onClick={async () => {
                                        const confirmed = await showConfirm(
                                          'Mutually Discussed নিশ্চিতকরণ',
                                          `আপনি কি এই অর্ডারের আলোচনা সম্পন্ন হয়েছে বলে চিহ্নিত করতে চান? এটি এই তালিকা থেকে অর্ডারটি সরিয়ে দেবে।`,
                                          'হ্যাঁ, আলোচনা হয়েছে',
                                          'বাতিল'
                                        );
                                        if (confirmed) {
                                          await fallbackStore.updateOrder(ord.id, (o) => ({
                                            ...o,
                                            mutuallyDiscussed: true,
                                          }));
                                          showAlert('সফল', 'অর্ডারটি mutually discussed হিসেবে চিহ্নিত করা হয়েছে।', 'success');
                                        }
                                      }}
                                      className="py-1.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs shadow-sm transition-all animate-pulse"
                                    >
                                      Mutually Discussed
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <PaginationControl
                      currentPage={Math.min(excDelayedPage, pdl.totalPages)}
                      totalPages={pdl.totalPages}
                      totalItems={delayedOrders.length}
                      pageSize={excDelayedPageSize}
                      onPageChange={(p) => setExcDelayedPage(p)}
                      onPageSizeChange={(s) => { setExcDelayedPageSize(s); setExcDelayedPage(1); }}
                      pageSizeOptions={[5, 10, 25]}
                    />
                  </div>
                )}

                {/* 4. Pending Helper Applications */}
                {pendingApps.length > 0 && (
                  <div className="bg-white rounded-3xl border border-gray-100 shadow-soft overflow-hidden">
                    <div className="p-5 border-b border-gray-100 bg-amber-50/50 flex items-center justify-between">
                      <h3 className="font-extrabold text-sm text-gray-900 flex items-center space-x-2">
                        <Users className="w-4 h-4 text-purple-700" />
                        <span>Pending Helper Applications ({pendingApps.length})</span>
                      </h3>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs text-gray-600 min-w-[550px]">
                        <thead className="bg-gray-50 text-gray-700 uppercase font-extrabold text-[10px] tracking-wider border-b border-gray-100">
                          <tr>
                            <th className="py-3 px-5">Legal Name</th>
                            <th className="py-3 px-5">NID #</th>
                            <th className="py-3 px-5">WhatsApp</th>
                            <th className="py-3 px-5">Vehicles / Assets</th>
                            <th className="py-3 px-5 text-right">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 font-medium">
                          {pha.items.map((app) => (
                            <tr key={app.id} className="hover:bg-gray-50/80 transition-colors">
                              <td className="py-3.5 px-5 font-bold text-gray-900">{app.legalName}</td>
                              <td className="py-3.5 px-5 font-mono">{app.nid}</td>
                              <td className="py-3.5 px-5 text-emerald-700 font-bold">{app.whatsapp}</td>
                              <td className="py-3.5 px-5">
                                <div className="flex gap-1 text-[10px] font-bold">
                                  {app.hasSmartphone && <span className="px-1.5 py-0.5 rounded bg-gray-100">Phone</span>}
                                  {app.hasCycle && <span className="px-1.5 py-0.5 rounded bg-gray-100">Cycle</span>}
                                  {app.hasBike && <span className="px-1.5 py-0.5 rounded bg-gray-100">Bike</span>}
                                </div>
                              </td>
                              <td className="py-3.5 px-5 text-right">
                                <button
                                  onClick={() => handleApproveApp(app.id)}
                                  className="py-1.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs shadow-sm transition-all"
                                >
                                  Approve Helper
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <PaginationControl
                      currentPage={Math.min(excHelperAppPage, pha.totalPages)}
                      totalPages={pha.totalPages}
                      totalItems={pendingApps.length}
                      pageSize={excHelperAppPageSize}
                      onPageChange={(p) => setExcHelperAppPage(p)}
                      onPageSizeChange={(s) => { setExcHelperAppPageSize(s); setExcHelperAppPage(1); }}
                      pageSizeOptions={[5, 10, 25]}
                    />
                  </div>
                )}

                {/* 5. Pending Store Applications */}
                {pendingStoreApps.length > 0 && (
                  <div className="bg-white rounded-3xl border border-gray-100 shadow-soft overflow-hidden">
                    <div className="p-5 border-b border-gray-100 bg-orange-50/50 flex items-center justify-between">
                      <h3 className="font-extrabold text-sm text-gray-900 flex items-center space-x-2">
                        <Store className="w-4 h-4 text-orange-600" />
                        <span>Pending Store Applications ({pendingStoreApps.length})</span>
                      </h3>
                      <button
                        onClick={() => { setActiveTab('SHOPS'); setShopSubView('APPLICATIONS'); }}
                        className="text-xs font-extrabold text-orange-700 hover:text-orange-900 underline"
                      >
                        View All →
                      </button>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs text-gray-600 min-w-[600px]">
                        <thead className="bg-gray-50 text-gray-700 uppercase font-extrabold text-[10px] tracking-wider border-b border-gray-100">
                          <tr>
                            <th className="py-3 px-5">Store</th>
                            <th className="py-3 px-5">Owner</th>
                            <th className="py-3 px-5">Location</th>
                            <th className="py-3 px-5">Type</th>
                            <th className="py-3 px-5 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 font-medium">
                          {psa.items.map((app) => (
                            <tr key={app.id} className="hover:bg-gray-50/80 transition-colors">
                              <td className="py-3.5 px-5">
                                <div className="font-extrabold text-gray-900">{app.storeName}</div>
                                <div className="text-[10px] text-gray-400">{new Date(app.createdAt).toLocaleDateString('bn-BD')}</div>
                              </td>
                              <td className="py-3.5 px-5">
                                <div className="font-bold text-gray-900">{app.ownerName}</div>
                                <div className="text-[11px] text-emerald-700">{app.ownerWhatsapp}</div>
                              </td>
                              <td className="py-3.5 px-5 max-w-[150px]">
                                <div className="text-[11px] text-gray-700 truncate">{app.location?.address || '—'}</div>
                              </td>
                              <td className="py-3.5 px-5">
                                <span className="px-2 py-0.5 rounded-full bg-orange-50 text-orange-800 font-bold text-[10px]">{app.storeType}</span>
                              </td>
                              <td className="py-3.5 px-5 text-right space-x-1.5">
                                <button
                                  onClick={async () => {
                                    const confirmed = await showConfirm(
                                      'স্টোর অনুমোদন',
                                      `"${app.storeName}" দোকানটি অনুমোদন করবেন?`,
                                      'হ্যাঁ, অনুমোদন করুন', 'বাতিল'
                                    );
                                    if (confirmed) {
                                      await fallbackStore.approveStoreApp(app.id);
                                      setStoreApplications(Array.from(fallbackStore.storeApplications.values()));
                                      setUsers(Array.from(fallbackStore.users.values()));
                                      setShops(Array.from(fallbackStore.shops.values()));
                                      showAlert('অনুমোদন সম্পন্ন', `"${app.storeName}" অনুমোদিত হয়েছে।`, 'success');
                                    }
                                  }}
                                  className="py-1.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs shadow-sm transition-all"
                                >
                                  Approve
                                </button>
                                <button
                                  onClick={async () => {
                                    const reason = await showConfirm(
                                      'স্টোর প্রত্যাখ্যান',
                                      `"${app.storeName}" এর আবেদন প্রত্যাখ্যান করবেন?`,
                                      'হ্যাঁ, প্রত্যাখ্যান করুন', 'বাতিল'
                                    );
                                    if (reason) {
                                      await fallbackStore.rejectStoreApp(app.id);
                                      setStoreApplications(Array.from(fallbackStore.storeApplications.values()));
                                      showAlert('প্রত্যাখ্যান সম্পন্ন', `"${app.storeName}" প্রত্যাখ্যাত হয়েছে।`, 'info');
                                    }
                                  }}
                                  className="py-1.5 px-2.5 rounded-xl bg-red-50 hover:bg-red-100 text-red-700 font-bold text-xs"
                                >
                                  Reject
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <PaginationControl
                      currentPage={Math.min(excStoreAppPage, psa.totalPages)}
                      totalPages={psa.totalPages}
                      totalItems={pendingStoreApps.length}
                      pageSize={excStoreAppPageSize}
                      onPageChange={(p) => setExcStoreAppPage(p)}
                      onPageSizeChange={(s) => { setExcStoreAppPageSize(s); setExcStoreAppPage(1); }}
                      pageSizeOptions={[5, 10, 25]}
                    />
                  </div>
                )}

                {/* 6. Pending Paybacks */}
                {pendingWds.length > 0 && (
                  <div className="bg-white rounded-3xl border border-gray-100 shadow-soft overflow-hidden">
                    <div className="p-5 border-b border-gray-100 bg-amber-50/50 flex items-center justify-between">
                      <h3 className="font-extrabold text-sm text-gray-900 flex items-center space-x-2">
                        <DollarSign className="w-4 h-4 text-emerald-600" />
                        <span>Pending Commission Paybacks ({pendingWds.length})</span>
                      </h3>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs text-gray-600 min-w-[580px]">
                        <thead className="bg-gray-50 text-gray-700 uppercase font-extrabold text-[10px] tracking-wider border-b border-gray-100">
                          <tr>
                            <th className="py-3 px-5">Helper Name</th>
                            <th className="py-3 px-5">Amount</th>
                            <th className="py-3 px-5">Method</th>
                            <th className="py-3 px-5">Mobile / TxID</th>
                            <th className="py-3 px-5 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 font-medium">
                          {pwd.items.map((w) => (
                            <tr key={w.id} className="hover:bg-gray-50/80 transition-colors">
                              <td className="py-3.5 px-5 font-bold text-gray-900">{w.helperName}</td>
                              <td className="py-3.5 px-5 font-extrabold text-purple-800">৳{w.amount}</td>
                              <td className="py-3.5 px-5 uppercase font-bold text-gray-700">{w.paymentMethod}</td>
                              <td className="py-3.5 px-5 font-mono">{w.accountNumber}</td>
                              <td className="py-3.5 px-5 text-right">
                                <div className="flex justify-end space-x-1.5">
                                  <button
                                    onClick={() => handleApproveWd(w.id)}
                                    className="py-1.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs shadow-sm transition-all"
                                  >
                                    Approve
                                  </button>
                                  <button
                                    onClick={() => handleRejectWd(w.id)}
                                    className="py-1.5 px-3 rounded-xl bg-gray-200 hover:bg-gray-300 text-gray-800 font-extrabold text-xs transition-all"
                                  >
                                    Reject
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <PaginationControl
                      currentPage={Math.min(excPendingWdPage, pwd.totalPages)}
                      totalPages={pwd.totalPages}
                      totalItems={pendingWds.length}
                      pageSize={excPendingWdPageSize}
                      onPageChange={(p) => setExcPendingWdPage(p)}
                      onPageSizeChange={(s) => { setExcPendingWdPageSize(s); setExcPendingWdPage(1); }}
                      pageSizeOptions={[5, 10, 25]}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })()}

      {/* --- TAB 2: ALL ORDERS TAB --- */}
      {activeTab === 'ORDERS' && isTabAllowed('ORDERS') && (() => {
        const processed = getProcessedOrders(orders);
        const { totalPages, paginatedItems, totalItems } = paginateList(processed);
        const firstOrderIds = getFirstOrderIds(orders);

        return (
          <div className="bg-white rounded-3xl border border-gray-100 shadow-soft overflow-hidden space-y-2">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-extrabold text-base text-gray-900">System Orders Master List</h3>
              <span className="text-xs font-bold px-3 py-1 rounded-full bg-emerald-50 text-emerald-800">
                {totalItems} orders found (Latest first)
              </span>
            </div>

            {/* Date Range Filter Bar */}
            <div className="p-4 bg-gray-50/50 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center space-x-2">
                <Calendar className="w-4 h-4 text-purple-700" />
                <span className="font-extrabold text-gray-900">Filter by Date Range</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center space-x-1 bg-white border border-gray-200 rounded-xl px-2.5 py-1">
                  <span className="text-gray-400 text-[10px] uppercase font-bold">From:</span>
                  <input
                    type="date"
                    value={ordersStartDate}
                    onChange={(e) => setOrdersStartDate(e.target.value)}
                    className="bg-transparent text-gray-800 font-extrabold focus:outline-none text-[11px]"
                  />
                </div>
                <div className="flex items-center space-x-1 bg-white border border-gray-200 rounded-xl px-2.5 py-1">
                  <span className="text-gray-400 text-[10px] uppercase font-bold">To:</span>
                  <input
                    type="date"
                    value={ordersEndDate}
                    onChange={(e) => setOrdersEndDate(e.target.value)}
                    className="bg-transparent text-gray-800 font-extrabold focus:outline-none text-[11px]"
                  />
                </div>
                {(ordersStartDate || ordersEndDate) && (
                  <button
                    onClick={() => {
                      setOrdersStartDate('');
                      setOrdersEndDate('');
                    }}
                    className="px-2.5 py-1 rounded-xl bg-red-50 hover:bg-red-100 text-red-650 font-bold transition-all"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            {/* Desktop Table View */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-gray-600 min-w-[700px]">
                <thead className="bg-gray-50 text-gray-700 uppercase font-extrabold text-[10px] tracking-wider border-b border-gray-100">
                  <tr>
                    <th className="py-3.5 px-5">Order ID</th>
                    <th className="py-3.5 px-5">Customer</th>
                    <th className="py-3.5 px-5">Title & Items</th>
                    <th className="py-3.5 px-5">Assigned Helper</th>
                    <th className="py-3.5 px-5">Fee</th>
                    <th className="py-3.5 px-5">Status</th>
                    <th className="py-3.5 px-5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 font-medium">
                  {paginatedItems.map((ord) => (
                    <tr
                      key={ord.id}
                      className="hover:bg-gray-50/80 transition-colors cursor-pointer"
                      onClick={() => setSelectedOrderId(ord.id)}
                    >
                      <td className="py-4 px-5 font-bold text-gray-900">#{ord.id}</td>
                      <td className="py-4 px-5">
                        <div className="font-extrabold text-gray-900 flex items-center gap-1.5 flex-wrap">
                          {ord.customerName}
                          {firstOrderIds.has(ord.id) && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-amber-400 text-amber-950 text-[9px] font-black uppercase tracking-wide shadow-sm shrink-0">
                              🥇 1st Order
                            </span>
                          )}
                          {(() => {
                            const custUser = fallbackStore.users.get(ord.customerId) || users.find((u) => u.uid === ord.customerId);
                            if (!custUser?.labels || custUser.labels.length === 0) return null;
                            return custUser.labels.map((lbl) => (
                              <span key={lbl} className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-amber-100 text-purple-950 font-extrabold text-[9px] border border-amber-200 shrink-0">
                                🏷️ {lbl}
                              </span>
                            ));
                          })()}
                        </div>
                        <div className="text-[11px] text-gray-400">{ord.customerPhone}</div>
                      </td>
                      <td className="py-4 px-5">
                        <div className="font-bold text-gray-900 max-w-xs truncate">{ord.title || ord.items?.[0]?.name || 'Order'}</div>
                        <div className="text-[11px] text-gray-500">{(ord.items || []).length} items</div>
                      </td>
                      <td className="py-4 px-5">
                        {ord.helperName ? (
                          <div>
                            <div className="font-bold text-purple-900 flex items-center gap-1 flex-wrap">
                              <span className="flex items-center space-x-1">
                                <Bike className="w-3.5 h-3.5 text-indigo-600" />
                                <span>{ord.helperName}</span>
                              </span>
                              {(() => {
                                const hUser = ord.helperId ? (fallbackStore.users.get(ord.helperId) || users.find((u) => u.uid === ord.helperId)) : null;
                                if (!hUser?.labels || hUser.labels.length === 0) return null;
                                return hUser.labels.map((lbl) => (
                                  <span key={lbl} className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-indigo-100 text-indigo-950 font-extrabold text-[9px] border border-indigo-200 shrink-0">
                                    🏷️ {lbl}
                                  </span>
                                ));
                              })()}
                            </div>
                            {getOrderAcceptanceDurationText(ord) && (
                              <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100 mt-0.5 inline-block">
                                Accepted in: {getOrderAcceptanceDurationText(ord)}
                              </span>
                            )}
                          </div>
                        ) : (
                          <div>
                            <span className="text-amber-600 font-bold text-[11px] block">Unassigned</span>
                            <span className="text-[10px] text-amber-700 font-semibold">Pending {getElapsedTime(ord.createdAt)}</span>
                          </div>
                        )}
                      </td>
                      <td className="py-4 px-5 font-extrabold text-emerald-700">৳{ord.deliveryFee}</td>
                      <td className="py-4 px-5">
                        <div className="flex flex-col gap-1">
                          <span
                            className={`px-2.5 py-1 rounded-full font-extrabold text-[10px] w-fit ${ord.status === 'DELIVERED'
                                ? 'bg-emerald-100 text-emerald-800'
                                : ord.status === 'CANCELED'
                                  ? 'bg-red-100 text-red-800'
                                  : 'bg-amber-100 text-amber-800'
                              }`}
                          >
                            {ord.status}
                          </span>
                          {ord.needDeliveryBack && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 text-[9px] font-black uppercase tracking-wide w-fit border border-indigo-200">
                              🔁 Return
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-4 px-5 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-end space-x-2">
                          <button
                            onClick={() => setAssignHelperOrder(ord)}
                            className="py-1.5 px-3 rounded-xl bg-purple-900 hover:bg-purple-950 text-white font-extrabold text-xs shadow-sm transition-all"
                          >
                            Assign Helper
                          </button>
                          <button
                            onClick={() => setSelectedOrderId(ord.id)}
                            className="py-1.5 px-3 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-800 font-extrabold text-xs transition-all"
                          >
                            Details
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            <PaginationControl
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={totalItems}
              pageSize={pageSize}
              onPageChange={(p) => setCurrentPage(p)}
              onPageSizeChange={(s) => {
                setPageSize(s);
                setCurrentPage(1);
              }}
            />
          </div>
        );
      })()}

      {/* --- TAB 3: UNIFIED USER LISTS TAB --- */}
      {activeTab === 'USERS_LIST' && isTabAllowed('USERS_LIST') && (() => {
        const processed = getProcessedUsersList();
        const { totalPages, paginatedItems, totalItems } = paginateList(processed);

        return (
          <div className="bg-white rounded-3xl border border-gray-100 shadow-soft overflow-hidden">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-extrabold text-base text-gray-900">Registered Users Master List</h3>
              <span className="text-xs font-bold px-3 py-1 rounded-full bg-purple-50 text-purple-800">
                {totalItems} total users recorded
              </span>
            </div>

            {/* Date Range Filter Bar */}
            <div className="p-4 bg-gray-50/50 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center space-x-2">
                <Calendar className="w-4 h-4 text-purple-700" />
                <span className="font-extrabold text-gray-900">Filter by Registration Date Range</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center space-x-1 bg-white border border-gray-200 rounded-xl px-2.5 py-1">
                  <span className="text-gray-400 text-[10px] uppercase font-bold">From:</span>
                  <input
                    type="date"
                    value={usersStartDate}
                    onChange={(e) => setUsersStartDate(e.target.value)}
                    className="bg-transparent text-gray-800 font-extrabold focus:outline-none text-[11px]"
                  />
                </div>
                <div className="flex items-center space-x-1 bg-white border border-gray-200 rounded-xl px-2.5 py-1">
                  <span className="text-gray-400 text-[10px] uppercase font-bold">To:</span>
                  <input
                    type="date"
                    value={usersEndDate}
                    onChange={(e) => setUsersEndDate(e.target.value)}
                    className="bg-transparent text-gray-800 font-extrabold focus:outline-none text-[11px]"
                  />
                </div>
                {(usersStartDate || usersEndDate) && (
                  <button
                    onClick={() => {
                      setUsersStartDate('');
                      setUsersEndDate('');
                    }}
                    className="px-2.5 py-1 rounded-xl bg-red-50 hover:bg-red-100 text-red-650 font-bold transition-all"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-gray-600 min-w-[750px]">
                <thead className="bg-gray-50 text-gray-700 uppercase font-extrabold text-[10px] tracking-wider border-b border-gray-100">
                  <tr>
                    <th className="py-3.5 px-5">User Profile</th>
                    <th className="py-3.5 px-5">Role & Badges</th>
                    <th className="py-3.5 px-5">Order Stats & Patterns</th>
                    <th className="py-3.5 px-5">Live Current Running State</th>
                    <th className="py-3.5 px-5">Audience Segments</th>
                    <th className="py-3.5 px-5">Status</th>
                    <th className="py-3.5 px-5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 font-medium">
                  {paginatedItems.map((item) => {
                    const u = item.user;
                    return (
                      <tr
                        key={u.uid}
                        className="hover:bg-gray-50/80 transition-colors cursor-pointer"
                        onClick={() => setSelectedUserId(u.uid)}
                      >
                        <td className="py-4 px-5">
                          <div className="font-extrabold text-gray-900 flex items-center space-x-2">
                            <span>{u.displayName}</span>
                          </div>
                          <div className="text-[11px] text-gray-400 font-mono">{u.email || u.uid}</div>
                          {u.alternativePhone && (
                            <div className="text-[11px] text-gray-500">Phone: {u.alternativePhone}</div>
                          )}
                        </td>

                        <td className="py-4 px-5">
                          <div className="flex flex-wrap gap-1">
                            <span className="px-2 py-0.5 rounded-full bg-purple-100 text-purple-900 font-extrabold text-[10px] uppercase">
                              {u.role}
                            </span>
                            {u.isHelper && (
                              <span className="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-900 font-extrabold text-[10px] uppercase">
                                Helper
                              </span>
                            )}
                            {u.isSuperAdmin ? (
                              <span className="px-2 py-0.5 rounded-full bg-amber-400 text-purple-950 font-black text-[10px] uppercase tracking-wider flex items-center space-x-1 shadow-sm">
                                <ShieldCheck className="w-3 h-3" />
                                <span>Super Admin</span>
                              </span>
                            ) : u.isAdmin ? (
                              <span className="px-2 py-0.5 rounded-full bg-slate-900 text-white font-extrabold text-[10px] uppercase">
                                Admin
                              </span>
                            ) : null}
                          </div>
                        </td>

                        <td className="py-4 px-5 font-bold">
                          <div className="text-gray-900 font-extrabold text-[11px]">
                            Placed: <span className="text-purple-700">{item.customerOrdersCount} orders</span>
                          </div>
                          {item.customerOrdersCount > 0 && (
                            <div className="text-gray-500 font-bold text-[10px] space-y-0.5 mt-1">
                              <div>Weekly: {item.weeklyOrderRate.toFixed(2)}/wk</div>
                              <div>Monthly: {item.monthlyOrderRate.toFixed(2)}/mo</div>
                              {item.daysSinceLastOrder !== null && (
                                <div className={item.daysSinceLastOrder >= 7 ? "text-amber-600 font-black" : ""}>
                                  Last Order: {item.daysSinceLastOrder}d ago
                                </div>
                              )}
                            </div>
                          )}
                          {item.customerOrdersCount === 0 && (
                            <span className="text-gray-400 italic text-[10px]">No orders</span>
                          )}
                        </td>

                        <td className="py-4 px-5">
                          {item.activeReq ? (
                            <span className="px-2.5 py-1 rounded-full bg-amber-100 text-amber-950 font-extrabold text-[10px]">
                              Req: #{item.activeReq.id} ({item.activeReq.status})
                            </span>
                          ) : item.activeDel ? (
                            <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-950 font-extrabold text-[10px]">
                              Del: #{item.activeDel.id} ({item.activeDel.status})
                            </span>
                          ) : (
                            <span className="text-gray-400 font-bold text-[11px]">Idle / No active request</span>
                          )}
                        </td>

                        <td className="py-4 px-5">
                          <div className="flex flex-wrap gap-1 max-w-[180px]">
                            {item.segments.map((seg) => {
                              let label = seg;
                              let color = 'bg-gray-100 text-gray-700';
                              if (seg === 'MULTIPLE_ORDERS') { label = 'Ordered 2+ Times'; color = 'bg-emerald-50 text-emerald-700 border border-emerald-200'; }
                              else if (seg === 'WEEKLY_2_ORDERS') { label = 'Weekly 2+ Orders'; color = 'bg-purple-150 text-purple-800 font-black'; }
                              else if (seg === 'WEEKLY_1_ORDERS') { label = 'Weekly 1+ Order'; color = 'bg-indigo-50 text-indigo-700'; }
                              else if (seg === 'RARE_ORDERS_WEEK') { label = 'Rare (<1/wk)'; color = 'bg-yellow-50 text-yellow-800 border border-yellow-200'; }
                              else if (seg === 'RARE_ORDERS_MONTH') { label = 'Rare (<1/mo)'; color = 'bg-amber-150 text-amber-800'; }
                              else if (seg === 'INACTIVE_1_WEEK') { label = 'Inactive 1wk'; color = 'bg-red-50 text-red-650 border border-red-200 font-bold'; }
                              else if (seg === 'INACTIVE_2_WEEKS') { label = 'Inactive 2wk+'; color = 'bg-red-100 text-red-800 font-extrabold'; }
                              else if (seg === 'NEVER_ORDERED') { label = 'Never Ordered'; color = 'bg-gray-100 text-gray-550 border border-gray-200'; }
                              else if (seg === 'NEW_REGISTERED') { label = 'New (last 7d)'; color = 'bg-blue-50 text-blue-700 border border-blue-200'; }
                              return (
                                <span key={seg} className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${color}`}>
                                  {label}
                                </span>
                              );
                            })}
                            {u.labels && u.labels.map((lbl) => (
                              <span key={lbl} className="px-2 py-0.5 rounded-md bg-amber-100 text-purple-950 font-bold text-[10px]">
                                {lbl}
                              </span>
                            ))}
                          </div>
                        </td>

                        <td className="py-4 px-5">
                          {u.isBlocked ? (
                            <span className="px-2.5 py-1 rounded-full bg-red-100 text-red-800 font-extrabold text-[10px]">
                              BLOCKED
                            </span>
                          ) : (
                            <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 font-extrabold text-[10px]">
                              ACTIVE
                            </span>
                          )}
                        </td>

                        <td className="py-4 px-5 text-right" onClick={(e) => e.stopPropagation()}>
                          <UserActionDropdown
                            user={u}
                            currentUser={currentUser}
                            onViewProfile={(uid) => setSelectedUserId(uid)}
                            onToggleAdmin={(targetUser, makeAdmin) => handleToggleAdminRole(targetUser, makeAdmin)}
                            onToggleBlock={async (targetUser) => {
                              if (targetUser.isBlocked) {
                                const confirmed = await showConfirm(
                                  'আনব্লক নিশ্চিতকরণ',
                                  `আপনি কি ${targetUser.displayName}-কে আনব্লক করতে চান?`,
                                  'হ্যাঁ, আনব্লক করুন',
                                  'বাতিল'
                                );
                                if (!confirmed) return;
                                await fallbackStore.blockUser(targetUser.uid, false);
                                setUsers(Array.from(fallbackStore.users.values()));
                                showAlert('আনব্লক সম্পন্ন', 'ব্যবহারকারী একাউন্ট পুনরায় সক্রিয় করা হয়েছে।', 'success');
                              } else {
                                setSelectedUserId(targetUser.uid);
                              }
                            }}
                            onDeleteUser={async (targetUser) => {
                              const confirmed = await showConfirm(
                                'একাউন্ট ডিলিট স্থায়ী সতর্কতা',
                                `আপনি কি নিশ্চিত যে ${targetUser.displayName}-এর প্রোফাইল স্থায়ীভাবে ডিলিট করতে চান? এই প্রক্রিয়া ফিরিয়ে আনা সম্ভব নয়।`,
                                'হ্যাঁ, ডিলিট করুন',
                                'বাতিল'
                              );
                              if (!confirmed) return;
                              await fallbackStore.deleteUser(targetUser.uid);
                              setUsers(Array.from(fallbackStore.users.values()));
                              showAlert('ডিলিট সম্পন্ন', 'ব্যবহারকারী প্রোফাইল সিস্টেম থেকে মুছে ফেলা হয়েছে।', 'success');
                            }}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <PaginationControl
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={totalItems}
              pageSize={pageSize}
              onPageChange={(p) => setCurrentPage(p)}
              onPageSizeChange={(s) => {
                setPageSize(s);
                setCurrentPage(1);
              }}
            />
          </div>
        );
      })()}

      {/* --- TAB 4: REVENUE ANALYTICS TAB --- */}
      {activeTab === 'REVENUE' && isTabAllowed('REVENUE') && (
        <RevenueAnalytics orders={allOrders} pricing={pricing} shops={shops} />
      )}

      {/* --- TAB 3: CUSTOMERS STATS TAB --- */}
      {activeTab === 'CUSTOMERS' && isTabAllowed('CUSTOMERS') && (() => {
        const processed = getProcessedCustomers();
        const { totalPages, paginatedItems, totalItems } = paginateList(processed);

        return (
          <div className="bg-white rounded-3xl border border-gray-100 shadow-soft overflow-hidden">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-extrabold text-base text-gray-900">Customer Statistics & Order Histories</h3>
              <span className="text-xs font-bold px-3 py-1 rounded-full bg-purple-50 text-purple-800">
                {totalItems} total customers
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-gray-600 min-w-[650px]">
                <thead className="bg-gray-50 text-gray-700 uppercase font-extrabold text-[10px] tracking-wider border-b border-gray-100">
                  <tr>
                    <th className="py-3.5 px-5">Customer Name</th>
                    <th className="py-3.5 px-5">Phone Number</th>
                    <th className="py-3.5 px-5">Total Orders Placed</th>
                    <th className="py-3.5 px-5">Completed Orders</th>
                    <th className="py-3.5 px-5">Total Spent</th>
                    <th className="py-3.5 px-5 text-right">Order History</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 font-medium">
                  {paginatedItems.map((c) => (
                    <tr
                      key={c.id}
                      className="hover:bg-gray-50/80 transition-colors cursor-pointer"
                      onClick={() => setSelectedCustomer({ id: c.id, name: c.name, phone: c.phone })}
                    >
                      <td className="py-4 px-5 font-extrabold text-gray-900">{c.name}</td>
                      <td className="py-4 px-5 font-bold text-gray-700">{c.phone}</td>
                      <td className="py-4 px-5 font-black text-gray-900">{c.totalOrders} orders</td>
                      <td className="py-4 px-5 font-bold text-emerald-600">{c.completedOrders} completed</td>
                      <td className="py-4 px-5 font-extrabold text-purple-900">৳{c.totalSpent}</td>
                      <td className="py-4 px-5 text-right" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => setSelectedCustomer({ id: c.id, name: c.name, phone: c.phone })}
                          className="py-1.5 px-3 rounded-xl bg-purple-900 hover:bg-purple-950 text-white font-extrabold text-xs shadow-sm transition-all"
                        >
                          View Full History
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            <PaginationControl
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={totalItems}
              pageSize={pageSize}
              onPageChange={(p) => setCurrentPage(p)}
              onPageSizeChange={(s) => {
                setPageSize(s);
                setCurrentPage(1);
              }}
            />
          </div>
        );
      })()}

      {/* --- TAB 4: HELPER STATS TAB --- */}
      {activeTab === 'HELPERS' && isTabAllowed('HELPERS') && (() => {
        const processed = getProcessedHelpers();
        const { totalPages, paginatedItems, totalItems } = paginateList(processed);

        const handleUpdateHelperType = async (userId: string, newType: 'commuter' | 'dedicated') => {
          const helperUser = fallbackStore.users.get(userId);
          if (helperUser) {
            const updated = { ...helperUser, helperType: newType, isHelper: true };
            await fallbackStore.saveUser(updated);
            setUsers(Array.from(fallbackStore.users.values()));
            showAlert(
              'স্ট্যাটাস পরিবর্তিত',
              `${helperUser.displayName}-এর হেলপার টাইপ ${newType === 'dedicated' ? 'Dedicated Rider' : 'Commuter Helper'} হিসেবে সেট করা হয়েছে।`,
              'success'
            );
          }
        };

        return (
          <div className="space-y-6">
            {/* View Mode Header Switcher */}
            <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-soft flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="font-extrabold text-base sm:text-lg text-gray-900 flex items-center gap-2">
                  <Bike className="w-5 h-5 text-emerald-600" />
                  <span>Helper Fleet Operations & Earth Location Map</span>
                </h3>
                <p className="text-xs text-gray-500 font-medium mt-0.5">
                  Monitor commuter helpers & dedicated riders live on Google satellite earth map.
                </p>
              </div>

              <div className="flex items-center gap-1.5 bg-gray-100 p-1.5 rounded-2xl border border-gray-200 text-xs font-extrabold shrink-0 flex-wrap">
                <button
                  type="button"
                  onClick={() => setHelperSubView('MAP')}
                  className={`px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 ${helperSubView === 'MAP'
                      ? 'bg-purple-950 text-white shadow-md'
                      : 'text-gray-600 hover:text-gray-900'
                    }`}
                >
                  <Globe className="w-4 h-4 text-emerald-400" />
                  <span>🗺️ Earth Map</span>
                </button>

                <button
                  type="button"
                  onClick={() => setHelperSubView('APPLICATIONS')}
                  className={`px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 ${helperSubView === 'APPLICATIONS'
                      ? 'bg-purple-950 text-white shadow-md'
                      : 'text-gray-600 hover:text-gray-900'
                    }`}
                >
                  <Users className="w-4 h-4 text-amber-400" />
                  <span>📄 Applications ({pendingApps.length})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setHelperSubView('TABLE')}
                  className={`px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 ${helperSubView === 'TABLE'
                      ? 'bg-purple-950 text-white shadow-md'
                      : 'text-gray-600 hover:text-gray-900'
                    }`}
                >
                  <Users className="w-4 h-4 text-indigo-400" />
                  <span>📋 Registered Fleet</span>
                </button>
              </div>
            </div>

            {/* Live Earth Satellite Map View Component */}
            {helperSubView === 'MAP' && (
              <AdminHelperMapView
                users={users}
                orders={orders}
                applications={applications}
                onSelectHelper={(h) => setSelectedHelper(h)}
                onSelectUser={(uid) => setSelectedUserId(uid)}
                onUpdateHelperType={handleUpdateHelperType}
              />
            )}

            {/* Helper Applications Sub-View */}
            {helperSubView === 'APPLICATIONS' && (() => {
              let filtered = [...applications];
              if (appsStartDate) {
                const startMs = new Date(`${appsStartDate}T00:00:00`).getTime();
                filtered = filtered.filter((a) => new Date(a.createdAt).getTime() >= startMs);
              }
              if (appsEndDate) {
                const endMs = new Date(`${appsEndDate}T23:59:59.999`).getTime();
                filtered = filtered.filter((a) => new Date(a.createdAt).getTime() <= endMs);
              }
              if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase().trim();
                filtered = filtered.filter(
                  (a) =>
                    (a.legalName || '').toLowerCase().includes(q) ||
                    (a.userName || '').toLowerCase().includes(q) ||
                    (a.nid && a.nid.includes(q)) ||
                    (a.email || '').toLowerCase().includes(q)
                );
              }
              filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
              const { totalPages, paginatedItems, totalItems } = paginateList(filtered);

              return (
                <div className="bg-white rounded-3xl border border-gray-100 shadow-soft overflow-hidden">
                  <div className="p-5 border-b border-gray-100 flex items-center justify-between">
                    <div>
                      <h3 className="font-extrabold text-base text-gray-900">Helper Registrations & Applications</h3>
                      <span className="text-xs font-bold px-3 py-1 rounded-full bg-indigo-50 text-indigo-800">
                        {totalItems} total registered
                      </span>
                    </div>
                    <button
                      onClick={() => setShowAddAppModal(true)}
                      className="py-2 px-4 rounded-xl bg-purple-900 hover:bg-purple-950 text-white font-extrabold text-xs shadow-md transition-all flex items-center space-x-1.5"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Add Application</span>
                    </button>
                  </div>

                  {/* Desktop Table View */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs text-gray-600 min-w-[750px]">
                      <thead className="bg-gray-50 text-gray-700 uppercase font-extrabold text-[10px] tracking-wider border-b border-gray-100">
                        <tr>
                          <th className="py-3.5 px-5">Legal Name</th>
                          <th className="py-3.5 px-5">NID #</th>
                          <th className="py-3.5 px-5">Contact Email</th>
                          <th className="py-3.5 px-5">Vehicles / Assets</th>
                          <th className="py-3.5 px-5">Status</th>
                          <th className="py-3.5 px-5 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 font-medium">
                        {paginatedItems.map((app) => (
                          <tr key={app.id} className="hover:bg-gray-50/80 transition-colors">
                            <td className="py-4 px-5">
                              <div className="font-extrabold text-gray-900">{app.legalName}</div>
                              <div className="text-[11px] text-gray-400">{app.userName}</div>
                              {app.whatsapp && (
                                <div className="text-[11px] text-emerald-700 font-bold">WA: {app.whatsapp}</div>
                              )}
                            </td>
                            <td className="py-4 px-5 font-bold text-gray-900">{app.nid}</td>
                            <td className="py-4 px-5">{app.email}</td>
                            <td className="py-4 px-5">
                              <div className="flex flex-wrap gap-1">
                                {app.hasSmartphone && <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-800 text-[10px] font-bold">Smartphone</span>}
                                {app.hasCycle && <span className="px-2 py-0.5 rounded bg-green-50 text-green-800 text-[10px] font-bold">Cycle</span>}
                                {app.hasBike && <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-800 text-[10px] font-bold">Bike</span>}
                              </div>
                            </td>
                            <td className="py-4 px-5">
                              <span
                                className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold ${app.status === 'APPROVED'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : app.status === 'REJECTED' || app.status === 'CANCELED'
                                      ? 'bg-red-100 text-red-800'
                                      : 'bg-amber-100 text-amber-800'
                                  }`}
                              >
                                {app.status}
                              </span>
                            </td>
                            <td className="py-4 px-5 text-right space-x-1.5">
                              {app.status === 'PENDING' && (
                                <button
                                  onClick={() => handleApproveApp(app.id)}
                                  className="py-1.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs shadow-sm transition-all"
                                >
                                  Approve
                                </button>
                              )}
                              <button
                                onClick={() => setEditingApp(app)}
                                className="py-1.5 px-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => handleDeleteApp(app.id)}
                                className="py-1.5 px-2.5 rounded-xl bg-red-50 hover:bg-red-100 text-red-600 font-bold text-xs"
                              >
                                Delete
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <PaginationControl
                    currentPage={currentPage}
                    totalPages={totalPages}
                    totalItems={totalItems}
                    pageSize={pageSize}
                    onPageChange={(p) => setCurrentPage(p)}
                    onPageSizeChange={(s) => {
                      setPageSize(s);
                      setCurrentPage(1);
                    }}
                  />
                </div>
              );
            })()}

            {/* Helper Performance Table View Component */}
            {helperSubView === 'TABLE' && (
              <div className="bg-white rounded-3xl border border-gray-100 shadow-soft overflow-hidden">
                <div className="p-5 border-b border-gray-100 flex items-center justify-between">
                  <h3 className="font-extrabold text-base text-gray-900">Helper Statistics & Performance Histories</h3>
                  <span className="text-xs font-bold px-3 py-1 rounded-full bg-indigo-50 text-indigo-800">
                    {totalItems} helpers recorded
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-gray-600 min-w-[700px]">
                    <thead className="bg-gray-50 text-gray-700 uppercase font-extrabold text-[10px] tracking-wider border-b border-gray-100">
                      <tr>
                        <th className="py-3.5 px-5">Helper Name</th>
                        <th className="py-3.5 px-5">Helper Type / Status</th>
                        <th className="py-3.5 px-5">NID #</th>
                        <th className="py-3.5 px-5">Completed Jobs</th>
                        <th className="py-3.5 px-5">Active Assigned Jobs</th>
                        <th className="py-3.5 px-5">Avg Delivery</th>
                        <th className="py-3.5 px-5">Total Earned</th>
                        <th className="py-3.5 px-5">Wallet Balance</th>
                        <th className="py-3.5 px-5 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 font-medium">
                      {paginatedItems.map((h) => {
                        const helperUser = fallbackStore.users.get(h.id);
                        const helperType = helperUser?.helperType || 'commuter';
                        const isEdu = helperUser?.isEduVerified;

                        return (
                          <tr
                            key={h.id}
                            className="hover:bg-gray-50/80 transition-colors cursor-pointer"
                            onClick={() => setSelectedHelper({ id: h.id, name: h.name })}
                          >
                            <td className="py-4 px-5">
                              <div className="flex items-center gap-1.5">
                                <span className="font-extrabold text-gray-900">{h.name}</span>
                                {isEdu && (
                                  <span className="inline-flex items-center gap-0.5 text-[9px] font-black bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded-full border border-blue-200" title="Edu Email Verified">
                                    <Check className="w-2.5 h-2.5 text-blue-600" />
                                    <span>Edu</span>
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="py-4 px-5" onClick={(e) => e.stopPropagation()}>
                              <select
                                value={helperType}
                                onChange={async (e) => {
                                  const newType = e.target.value as 'commuter' | 'dedicated';
                                  if (helperUser) {
                                    const updated = { ...helperUser, helperType: newType, isHelper: true };
                                    await fallbackStore.saveUser(updated);
                                    setUsers(Array.from(fallbackStore.users.values()));
                                    showAlert('স্ট্যাটাস পরিবর্তিত', `${h.name}-এর হেলপার টাইপ ${newType === 'dedicated' ? 'Dedicated Rider' : 'Commuter Helper'} হিসেবে সেট করা হয়েছে।`, 'success');
                                  }
                                }}
                                className="px-2 py-1 bg-slate-100 border border-slate-300 rounded-lg text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-500"
                              >
                                <option value="commuter">🚲 Commuter Helper</option>
                                <option value="dedicated">⚡ Dedicated Rider</option>
                              </select>
                            </td>
                            <td className="py-4 px-5 font-bold text-gray-700">{h.nid || 'N/A'}</td>
                            <td className="py-4 px-5 font-black text-emerald-600">{h.completedJobs} jobs</td>
                            <td className="py-4 px-5 font-bold text-amber-600">{h.activeOrders} active</td>
                            <td className="py-4 px-5 font-black text-blue-700">
                              {h.avgDeliveryTimeMins != null
                                ? `${Math.floor(h.avgDeliveryTimeMins / 60) > 0 ? `${Math.floor(h.avgDeliveryTimeMins / 60)}h ` : ''}${h.avgDeliveryTimeMins % 60}m`
                                : '—'}
                            </td>
                            <td className="py-4 px-5 font-extrabold text-indigo-900">৳{h.totalEarned}</td>
                            <td className="py-4 px-5 font-extrabold text-purple-900">৳{h.balance}</td>
                            <td className="py-4 px-5 text-right space-x-1" onClick={(e) => e.stopPropagation()}>
                              <button
                                onClick={() => setSelectedUserId(h.id)}
                                className="py-1.5 px-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs transition-all"
                              >
                                Profile
                              </button>
                              <button
                                onClick={() => setSelectedHelper({ id: h.id, name: h.name })}
                                className="py-1.5 px-3 rounded-xl bg-purple-900 hover:bg-purple-950 text-white font-extrabold text-xs shadow-sm transition-all"
                              >
                                History
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Pagination Controls */}
                <PaginationControl
                  currentPage={currentPage}
                  totalPages={totalPages}
                  totalItems={totalItems}
                  pageSize={pageSize}
                  onPageChange={(p) => setCurrentPage(p)}
                  onPageSizeChange={(s) => {
                    setPageSize(s);
                    setCurrentPage(1);
                  }}
                />
              </div>
            )}
          </div>
        );
      })()}



      {/* --- TAB 6: WITHDRAWALS TAB --- */}
      {activeTab === 'WITHDRAWALS' && isTabAllowed('WITHDRAWALS') && (() => {
        let filtered = [...withdrawals];
        if (withdrawalStatusFilter !== 'ALL') {
          filtered = filtered.filter((w) => w.status === withdrawalStatusFilter);
        }
        if (withdrawalsStartDate) {
          const startMs = new Date(`${withdrawalsStartDate}T00:00:00`).getTime();
          filtered = filtered.filter((w) => new Date(w.createdAt).getTime() >= startMs);
        }
        if (withdrawalsEndDate) {
          const endMs = new Date(`${withdrawalsEndDate}T23:59:59.999`).getTime();
          filtered = filtered.filter((w) => new Date(w.createdAt).getTime() <= endMs);
        }
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase().trim();
          filtered = filtered.filter(
            (w) =>
              w.helperName.toLowerCase().includes(q) ||
              w.paymentMethod?.toLowerCase().includes(q) ||
              w.accountNumber?.includes(q) ||
              w.id.toLowerCase().includes(q)
          );
        }
        filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        const { totalPages, paginatedItems, totalItems } = paginateList(filtered);

        return (
          <div className="bg-white rounded-3xl border border-gray-100 shadow-soft overflow-hidden">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-extrabold text-base text-gray-900">Helper Commission Payback Requests</h3>
              <span className="text-xs font-bold px-3 py-1 rounded-full bg-purple-50 text-purple-800">
                {totalItems} total payback requests
              </span>
            </div>

            {/* Date Range Filter Bar */}
            <div className="p-4 bg-gray-50/50 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center space-x-2">
                <Calendar className="w-4 h-4 text-purple-700" />
                <span className="font-extrabold text-gray-900">Filter by Request Date Range</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center space-x-1 bg-white border border-gray-200 rounded-xl px-2.5 py-1">
                  <span className="text-gray-400 text-[10px] uppercase font-bold">From:</span>
                  <input
                    type="date"
                    value={withdrawalsStartDate}
                    onChange={(e) => setWithdrawalsStartDate(e.target.value)}
                    className="bg-transparent text-gray-800 font-extrabold focus:outline-none text-[11px]"
                  />
                </div>
                <div className="flex items-center space-x-1 bg-white border border-gray-200 rounded-xl px-2.5 py-1">
                  <span className="text-gray-400 text-[10px] uppercase font-bold">To:</span>
                  <input
                    type="date"
                    value={withdrawalsEndDate}
                    onChange={(e) => setWithdrawalsEndDate(e.target.value)}
                    className="bg-transparent text-gray-800 font-extrabold focus:outline-none text-[11px]"
                  />
                </div>
                {(withdrawalsStartDate || withdrawalsEndDate) && (
                  <button
                    onClick={() => {
                      setWithdrawalsStartDate('');
                      setWithdrawalsEndDate('');
                    }}
                    className="px-2.5 py-1 rounded-xl bg-red-50 hover:bg-red-100 text-red-650 font-bold transition-all"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-gray-600 min-w-[700px]">
                <thead className="bg-gray-50 text-gray-700 uppercase font-extrabold text-[10px] tracking-wider border-b border-gray-100">
                  <tr>
                    <th className="py-3.5 px-5">Helper Name</th>
                    <th className="py-3.5 px-5">Amount (৳)</th>
                    <th className="py-3.5 px-5">Payment Method</th>
                    <th className="py-3.5 px-5">Mobile / TxID</th>
                    <th className="py-3.5 px-5">Status</th>
                    <th className="py-3.5 px-5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 font-medium">
                  {paginatedItems.map((w) => (
                    <tr key={w.id} className="hover:bg-gray-50/80 transition-colors">
                      <td className="py-4 px-5 font-extrabold text-gray-900">{w.helperName}</td>
                      <td className="py-4 px-5 font-extrabold text-purple-800">৳{w.amount}</td>
                      <td className="py-4 px-5 font-bold uppercase">{w.paymentMethod}</td>
                      <td className="py-4 px-5">{w.accountNumber}</td>
                      <td className="py-4 px-5">
                        <span
                          className={`px-2.5 py-1 rounded-full font-extrabold text-[10px] ${w.status === 'APPROVED'
                              ? 'bg-emerald-100 text-emerald-800'
                              : w.status === 'REJECTED'
                                ? 'bg-red-100 text-red-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                        >
                          {w.status}
                        </span>
                      </td>
                      <td className="py-4 px-5 text-right">
                        {w.status === 'PENDING' ? (
                          <div className="flex justify-end space-x-2">
                            <button
                              onClick={() => handleApproveWd(w.id)}
                              className="py-1.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs shadow-sm"
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => handleRejectWd(w.id)}
                              className="py-1.5 px-3 rounded-xl bg-gray-200 hover:bg-gray-300 text-gray-800 font-extrabold text-xs"
                            >
                              Reject
                            </button>
                          </div>
                        ) : (
                          <span className="text-gray-400 text-xs">Processed</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            <PaginationControl
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={totalItems}
              pageSize={pageSize}
              onPageChange={(p) => setCurrentPage(p)}
              onPageSizeChange={(s) => {
                setPageSize(s);
                setCurrentPage(1);
              }}
            />
          </div>
        );
      })()}

      {/* --- TAB 7: PRICING TAB --- */}
      {activeTab === 'PRICING' && isTabAllowed('PRICING') && (
        <form onSubmit={handleSavePricing} className="bg-white rounded-3xl border border-gray-100 p-6 shadow-soft space-y-6">
          <div className="border-b border-gray-100 pb-4">
            <h3 className="font-extrabold text-lg text-gray-900 flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-emerald-600" />
              <span>Admin Configurable Pricing & Payback Settings</span>
            </h3>
            <p className="text-xs text-gray-500">Configure global helper commission percentages, minimum withdrawal limits, and commission payback instructions.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="text-xs font-bold text-gray-700 block mb-1.5">
                Helper Commission Percentage (%)
              </label>
              <input
                type="number"
                value={pricing.helperCommissionPercent}
                onChange={(e) =>
                  setPricing({ ...pricing, helperCommissionPercent: Number(e.target.value) })
                }
                className="w-full p-3.5 rounded-2xl border border-gray-200 text-sm font-extrabold outline-none focus:border-emerald-600 focus:ring-4 focus:ring-emerald-600/10"
                required
              />
              <p className="text-[11px] text-gray-500 mt-1.5">
                Percentage of delivery fee awarded to helper (e.g. 80 means 80% to helper, 20% platform share).
              </p>
            </div>

            <div>
              <label className="text-xs font-bold text-gray-700 block mb-1.5">
                Minimum Withdrawal Amount (৳)
              </label>
              <input
                type="number"
                min={10}
                value={pricing.minWithdrawalAmount ?? 100}
                onChange={(e) =>
                  setPricing({ ...pricing, minWithdrawalAmount: Number(e.target.value) })
                }
                className="w-full p-3.5 rounded-2xl border border-gray-200 text-sm font-extrabold outline-none focus:border-emerald-600 focus:ring-4 focus:ring-emerald-600/10"
                required
              />
              <p className="text-[11px] text-gray-500 mt-1.5">
                Minimum wallet balance required for helper withdrawal request. Default is ৳100.
              </p>
            </div>
          </div>

          {/* Commission Payback Instructions */}
          <div className="p-5 rounded-3xl bg-slate-50/80 border border-slate-200 space-y-4">
            <h4 className="font-extrabold text-sm text-slate-800 uppercase tracking-wider flex items-center space-x-2">
              <DollarSign className="w-5 h-5 text-indigo-700" />
              <span>Commission Payback Instructions (কমিশন পরিশোধের নির্দেশাবলী)</span>
            </h4>
            <p className="text-[11px] text-gray-500 font-medium">
              হেলপার যখন পেব্যাক (Payback) মোডাল খুলবে, তখন মেথড অনুযায়ী এই তথ্যসমূহ দেখানো হবে।
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold text-gray-750 block mb-1">bKash Payback Info</label>
                <input
                  type="text"
                  value={bkashInstructions}
                  onChange={(e) => setBkashInstructions(e.target.value)}
                  placeholder="e.g. bKash Personal: 018XXXXXXXX..."
                  className="w-full p-3 rounded-2xl border border-gray-200 bg-white text-xs font-semibold outline-none focus:border-purple-600"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-750 block mb-1">Nagad Payback Info</label>
                <input
                  type="text"
                  value={nagadInstructions}
                  onChange={(e) => setNagadInstructions(e.target.value)}
                  placeholder="e.g. Nagad Personal: 018XXXXXXXX..."
                  className="w-full p-3 rounded-2xl border border-gray-200 bg-white text-xs font-semibold outline-none focus:border-purple-600"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-755 block mb-1">Rocket Payback Info</label>
                <input
                  type="text"
                  value={rocketInstructions}
                  onChange={(e) => setRocketInstructions(e.target.value)}
                  placeholder="e.g. Rocket Personal: 018XXXXXXXX..."
                  className="w-full p-3 rounded-2xl border border-gray-200 bg-white text-xs font-semibold outline-none focus:border-purple-600"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-755 block mb-1">Bank Account Payback Info</label>
                <input
                  type="text"
                  value={bankInstructions}
                  onChange={(e) => setBankInstructions(e.target.value)}
                  placeholder="e.g. Bank Account: Bank Name, A/C..."
                  className="w-full p-3 rounded-2xl border border-gray-200 bg-white text-xs font-semibold outline-none focus:border-purple-600"
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-bold text-gray-755 block mb-1">Cash Payback Info</label>
              <input
                type="text"
                value={cashInstructions}
                onChange={(e) => setCashInstructions(e.target.value)}
                placeholder="e.g. Pay Cash directly at Jamanot office desk..."
                className="w-full p-3.5 rounded-2xl border border-gray-200 bg-white text-xs font-semibold outline-none focus:border-purple-600"
              />
            </div>
          </div>

          {/* ── Fee Details Calculator Settings ── */}
          <div className="border border-emerald-200 rounded-2xl p-5 bg-emerald-50/30 space-y-4">
            <h4 className="font-extrabold text-sm text-emerald-950 flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-emerald-700" />
              <span>Fee Details Page Calculator Settings (ফি ক্যালকুলেটর সেটিংস)</span>
            </h4>
            <p className="text-[11px] text-gray-600">
              গ্রাহক ও হেলপারদের "Fee Details" পেজের লাইভ ফি গণনা সূত্র এবং কোম্পানি সার্ভিস ফি বিবরণ নিয়ন্ত্রণ করুন।
            </p>

             <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">Rate per KM (প্রতি কিমি চার্জ ৳):</label>
                <input
                  type="number"
                  value={feeCalculatorPerKmRate}
                  onChange={(e) => setFeeCalculatorPerKmRate(Number(e.target.value))}
                  className="w-full p-3 rounded-xl border border-gray-200 text-xs font-extrabold outline-none focus:border-emerald-600"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">Rate per KG Weight (ওজন চার্জ ৳):</label>
                <input
                  type="number"
                  value={feeCalculatorPerKgRate}
                  onChange={(e) => setFeeCalculatorPerKgRate(Number(e.target.value))}
                  className="w-full p-3 rounded-xl border border-gray-200 text-xs font-extrabold outline-none focus:border-emerald-600"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">Return Charge (% ডেলিভারি ফি-এর শতাংশ):</label>
                <input
                  type="number"
                  min="0"
                  value={feeCalculatorReturnPercent}
                  onChange={(e) => setFeeCalculatorReturnPercent(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="খালি রাখলে অপশনটি হাইড হবে"
                  className="w-full p-3 rounded-xl border border-gray-200 text-xs font-extrabold outline-none focus:border-emerald-600"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">Processing Fee (প্রসেসিং ফি):</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min="0"
                    value={feeCalculatorProcessingFee}
                    onChange={(e) => setFeeCalculatorProcessingFee(e.target.value === '' ? '' : Number(e.target.value))}
                    placeholder="খালি রাখলে ইনপুটটি হাইড হবে"
                    className="w-full p-3 rounded-xl border border-gray-200 text-xs font-extrabold outline-none focus:border-emerald-600"
                  />
                  <select
                    value={feeCalculatorProcessingFeeType}
                    onChange={(e) => setFeeCalculatorProcessingFeeType(e.target.value as 'flat' | 'percent')}
                    className="p-3 rounded-xl border border-gray-200 text-xs font-bold bg-white focus:border-emerald-600 shrink-0"
                  >
                    <option value="flat">৳ (Flat)</option>
                    <option value="percent">% (Percent)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">Minimum Fee (সর্বনিম্ন ফি ৳):</label>
                <input
                  type="number"
                  value={feeCalculatorMinFee}
                  onChange={(e) => setFeeCalculatorMinFee(Number(e.target.value))}
                  className="w-full p-3 rounded-xl border border-gray-200 text-xs font-extrabold outline-none focus:border-emerald-600"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">Delivery Fee Alert Limit (সর্বোচ্চ ফি লিমিট ৳):</label>
                <input
                  type="number"
                  min="0"
                  value={feeCalculatorMaxLimit}
                  onChange={(e) => setFeeCalculatorMaxLimit(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="e.g. 70"
                  className="w-full p-3 rounded-xl border border-gray-200 text-xs font-extrabold outline-none focus:border-emerald-600"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-gray-700 block mb-1">
                High Delivery Fee Limitation Message (ফি লিমিট অতিক্রম করলে কাস্টমারকে দেখানো বার্তা):
              </label>
              <textarea
                value={feeCalculatorMaxLimitMessage}
                onChange={(e) => setFeeCalculatorMaxLimitMessage(e.target.value)}
                placeholder="যেমন: মোট ডেলিভারি ফি ৳৭০-এর বেশি হলে অনুগ্রহ করে সরাসরি অফিসে বা কাস্টমার কেয়ারে যোগাযোগ করুন।"
                rows={2}
                className="w-full p-3.5 rounded-2xl border border-gray-200 text-xs font-medium outline-none focus:border-emerald-600 mb-3"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-gray-700 block mb-1">
                Company Fee Breakdown & Details Description (কোম্পানি ফি বিস্তারিত টেক্সট):
              </label>
              <textarea
                value={feeCalculatorCompanyDetails}
                onChange={(e) => setFeeCalculatorCompanyDetails(e.target.value)}
                placeholder="কোম্পানির সার্ভিস ফি-এর বিস্তারিত বর্ণনা লিখুন..."
                rows={5}
                className="w-full p-3.5 rounded-2xl border border-gray-200 text-xs font-medium outline-none focus:border-emerald-600"
              />
            </div>
          </div>

          {/* ── Fee Suggestions Preview (First 2-3 items) ── */}
          <div className="border border-purple-200 rounded-2xl p-5 bg-purple-50/20 space-y-4">
            <h4 className="font-extrabold text-sm text-purple-950 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-purple-700" />
                <span>Customer & Helper Fee Suggestions (কাস্টমার ও হেলপার মতামত)</span>
              </span>
              <span className="text-xs bg-purple-100 text-purple-800 font-extrabold px-2.5 py-1 rounded-full">
                {feeSuggestions.length}টি মতামত
              </span>
            </h4>

            {feeSuggestions.length === 0 ? (
              <div className="p-6 text-center text-xs text-gray-500 bg-white rounded-2xl border border-gray-100">
                এখনো কোনো ফি সংক্রান্ত প্রস্তাবনা বা মতামত আসেনি।
              </div>
            ) : (
              <div className="space-y-3">
                <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-purple-900 text-white font-bold">
                        <th className="p-3">তারিখ</th>
                        <th className="p-3">ব্যবহারকারী</th>
                        <th className="p-3">রোল</th>
                        <th className="p-3">ক্যাটাগরি</th>
                        <th className="p-3">মতামত/পরামর্শ</th>
                        <th className="p-3 text-right">অ্যাকশন</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {feeSuggestions.slice(0, 3).map((sug) => (
                        <tr key={sug.id} className="hover:bg-gray-50/80">
                          <td className="p-3 whitespace-nowrap text-gray-500 font-medium">
                            {new Date(sug.createdAt).toLocaleDateString()}
                          </td>
                          <td className="p-3 font-bold text-gray-900">
                            {sug.userName}
                            {sug.userPhone && <span className="block text-[10px] text-gray-500 font-normal">{sug.userPhone}</span>}
                          </td>
                          <td className="p-3">
                            <span
                              className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                                sug.userRole === 'helper'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-blue-100 text-blue-800'
                              }`}
                            >
                              {sug.userRole === 'helper' ? 'Helper' : 'Customer'}
                            </span>
                          </td>
                          <td className="p-3 font-semibold text-gray-700">{sug.category}</td>
                          <td className="p-3 text-gray-800 font-medium max-w-xs leading-relaxed">{sug.message}</td>
                          <td className="p-3 text-right whitespace-nowrap">
                            <button
                              type="button"
                              onClick={async () => {
                                const confirmed = await showConfirm(
                                  'মুছে ফেলার নিশ্চিতকরণ',
                                  'আপনি কি এই প্রস্তাবনাটি মুছে ফেলতে চান?',
                                  'হ্যাঁ, মুছুন',
                                  'বাতিল'
                                );
                                if (confirmed) {
                                  await fallbackStore.deleteFeeSuggestion(sug.id);
                                  setFeeSuggestions(Array.from(fallbackStore.feeSuggestions.values()));
                                }
                              }}
                              className="p-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 transition-colors"
                              title="Delete suggestion"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-1">
                  <p className="text-xs text-gray-500 font-medium">
                    {feeSuggestions.length <= 3 
                      ? `মোট ${feeSuggestions.length}টির মধ্যে ${feeSuggestions.length}টি মতামত দেখানো হচ্ছে` 
                      : `প্রথম ৩টি মতামত দেখানো হচ্ছে (মোট ${feeSuggestions.length}টি)`}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setFeeSuggestionsModalPage(1);
                      setShowFeeSuggestionsModal(true);
                    }}
                    className="py-2.5 px-4 rounded-xl bg-purple-900 hover:bg-purple-950 active:scale-98 text-white font-extrabold text-xs shadow-sm transition-all flex items-center gap-1.5"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>সকল মতামত দেখুন (Load More)</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          <button
            type="submit"
            className="w-full py-4 rounded-2xl bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold text-sm shadow-md transition-all flex items-center justify-center space-x-2"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>Save Pricing Configurations</span>
          </button>
        </form>
      )}

      {/* --- TAB 8: SETTINGS TAB --- */}
      {activeTab === 'SETTINGS' && isTabAllowed('SETTINGS') && (
        <form onSubmit={handleSavePricing} className="bg-white rounded-3xl border border-gray-100 p-6 shadow-soft space-y-6">
          <div className="border-b border-gray-100 pb-4">
            <h3 className="font-extrabold text-lg text-gray-900 flex items-center gap-2">
              <Settings className="w-5 h-5 text-purple-600" />
              <span>Admin Platform Configuration & System Settings</span>
            </h3>
            <p className="text-xs text-gray-500">Configure helper active order limits, third-party analytics, map region preference, PWA prompts, permissions, and helper center info.</p>
          </div>

          <div>
            <label className="text-xs font-bold text-gray-700 block mb-1.5">
              Max Active Orders per Helper
            </label>
            <input
              type="number"
              min={1}
              max={50}
              value={pricing.helperActiveOrderLimit ?? 5}
              onChange={(e) =>
                setPricing({ ...pricing, helperActiveOrderLimit: Number(e.target.value) })
              }
              className="w-full p-3.5 rounded-2xl border border-gray-200 text-sm font-extrabold outline-none focus:border-purple-600 focus:ring-4 focus:ring-purple-600/10"
              required
            />
            <p className="text-[11px] text-gray-500 mt-1.5">
              A helper cannot accept new requests once they hit this limit. Default is 5.
            </p>
          </div>

          {/* Third-party Analytics Integrations */}
          <div className="p-5 rounded-3xl bg-emerald-50/70 border border-emerald-200 space-y-4">
            <h4 className="font-extrabold text-sm text-emerald-900 uppercase tracking-wider flex items-center space-x-2">
              <span>Third-party Analytics Integrations</span>
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1.5">
                  Google Analytics Measurement ID (GA4)
                </label>
                <input
                  type="text"
                  value={googleAnalyticsId}
                  onChange={(e) => setGoogleAnalyticsId(e.target.value)}
                  placeholder="e.g. G-XXXXXXX"
                  className="w-full p-3.5 rounded-2xl border border-gray-200 text-sm font-semibold outline-none focus:border-emerald-600 focus:ring-4 focus:ring-emerald-600/10 bg-white"
                />
                <p className="text-[11px] text-gray-500 mt-1.5">
                  Dynamic Google Analytics Measurement ID (GA4). Leave blank to disable.
                </p>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1.5">
                  Microsoft Clarity Project ID
                </label>
                <input
                  type="text"
                  value={microsoftClarityId}
                  onChange={(e) => setMicrosoftClarityId(e.target.value)}
                  placeholder="e.g. clarityId"
                  className="w-full p-3.5 rounded-2xl border border-gray-200 text-sm font-semibold outline-none focus:border-emerald-600 focus:ring-4 focus:ring-emerald-600/10 bg-white"
                />
                <p className="text-[11px] text-gray-500 mt-1.5">
                  Dynamic Microsoft Clarity tracking code ID. Leave blank to disable.
                </p>
              </div>
            </div>
          </div>

          {/* Commuter vs Dedicated Helper & Edu Email Settings */}
          <div className="p-5 rounded-3xl bg-blue-50/70 border border-blue-200 space-y-4">
            <h4 className="font-extrabold text-sm text-blue-900 uppercase tracking-wider flex items-center space-x-2">
              <Bike className="w-5 h-5 text-blue-700" />
              <span>Commuter vs Dedicated Helper & Edu Email Settings</span>
            </h4>
            <p className="text-[11px] text-blue-700">
              এডুকেশন ইমেইল ভেরিফাইড ব্যাজ ডোমেইন তালিকা এবং হেলপার নোটিফিকেশন টাইমিং ও অর্ডারের সিরিয়াল নির্ধারণ করুন।
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1.5">
                  Education Email Domains (Comma separated)
                </label>
                <input
                  type="text"
                  value={eduEmailDomainsText}
                  onChange={(e) => setEduEmailDomainsText(e.target.value)}
                  placeholder="যেমন: @diu.edu.bd, @bracu.ac.bd"
                  className="w-full p-3.5 rounded-2xl border border-gray-200 bg-white text-sm font-semibold outline-none focus:border-purple-600"
                />
                <p className="text-[10px] text-gray-500 mt-1">
                  এই ডোমেইনের ইউজারগণ ভেরিফাইড ব্যাজ পাবেন।
                </p>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1.5">
                  Helper Location Radius Limit (km)
                </label>
                <input
                  type="number"
                  step="0.5"
                  min={0.5}
                  max={50}
                  value={helperRadiusKm}
                  onChange={(e) => setHelperRadiusKm(Number(e.target.value))}
                  className="w-full p-3.5 rounded-2xl border border-gray-200 bg-white text-sm font-extrabold outline-none focus:border-purple-600"
                />
                <p className="text-[10px] text-gray-500 mt-1">
                  অর্ডার পিকআপ/ডেলিভারি থেকে কত কি.মি. (Radius) ভেতরের হেলপারগণ রিকোয়েস্ট ও নোটিফিকেশন পাবেন (ডিফল্ট: 3.5 km)।
                </p>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1.5">
                  Dedicated Helper Delay (Minutes)
                </label>
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={dedicatedDelayMins}
                  onChange={(e) => setDedicatedDelayMins(Number(e.target.value))}
                  className="w-full p-3.5 rounded-2xl border border-gray-200 bg-white text-sm font-extrabold outline-none focus:border-purple-600"
                />
                <p className="text-[10px] text-gray-500 mt-1">
                  অর্ডার পিকআপ না হলে কত মিনিট পর ডেডিকেটেড রাইডার নোটিফিকেশন পাবে (ডিফল্ট: 7 মিনিট)।
                </p>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1.5">
                  "Admin Accepted" Banner Delay (Minutes)
                </label>
                <input
                  type="number"
                  min={0}
                  max={60}
                  value={pricing.adminAcceptedDelayMinutes ?? 5}
                  onChange={(e) =>
                    setPricing({ ...pricing, adminAcceptedDelayMinutes: Number(e.target.value) })
                  }
                  className="w-full p-3.5 rounded-2xl border border-gray-200 bg-white text-sm font-extrabold outline-none focus:border-purple-600"
                />
                <p className="text-[10px] text-gray-500 mt-1">
                  অর্ডার কত মিনিট PENDING থাকলে গ্রাহকের কাছে "Admin Accepted" স্ট্যাটাস দেখানো হবে (ডিফল্ট: 5)। 0 দিলে কখনো দেখাবে না।
                </p>
              </div>


              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1.5">
                  Order Receiver Routing Rule
                </label>
                <select
                  value={receiverRule}
                  onChange={(e) => setReceiverRule(e.target.value as any)}
                  className="w-full p-3.5 rounded-2xl border border-gray-200 bg-white text-sm font-extrabold outline-none focus:border-purple-600"
                >
                  <option value="commuter_first">Commuter First (সময় পার হলে Dedicated পাবে & Commuter থেকে ব্যানিশ)</option>
                  <option value="dedicated_first">Dedicated First Only</option>
                  <option value="both_simultaneous">Both Simultaneously (সবাই একসাথে)</option>
                </select>
                <p className="text-[10px] text-gray-500 mt-1">
                  কাদের প্রথমে নোটিফিকেশন যাবে তা নির্বাচন করুন।
                </p>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1.5">
                  Who Can Receive Requests (হেলপার রিসিভার টাইপ)
                </label>
                <select
                  value={allowedHelperTypes}
                  onChange={(e) => setAllowedHelperTypes(e.target.value as any)}
                  className="w-full p-3.5 rounded-2xl border border-gray-200 bg-white text-sm font-extrabold outline-none focus:border-purple-600"
                >
                  <option value="both">Both Commuter & Dedicated Helpers (উভয়ই)</option>
                  <option value="dedicated_only">Dedicated Helpers Only (শুধুমাত্র ডেডিকেটেড হেলপার)</option>
                  <option value="commuters_only">Commuter Helpers Only (শুধুমাত্র কমিউটার হেলপার)</option>
                </select>
                <p className="text-[10px] text-gray-500 mt-1">
                  কোন ধরনের হেলপাররা রিকোয়েস্ট দেখতে এবং গ্রহণ করতে পারবেন তা নির্ধারণ করুন।
                </p>
              </div>
            </div>
          </div>

          {/* Map & Location Search Region Preference Settings */}
          <div className="p-5 rounded-3xl bg-emerald-50/80 border border-emerald-200 space-y-4">
            <h4 className="font-extrabold text-sm text-emerald-900 uppercase tracking-wider flex items-center space-x-2">
              <MapPin className="w-5 h-5 text-emerald-700" />
              <span>Map & Location Search Region Preference (ম্যাপ ও স্থান খোঁজার এরিয়া ফিল্টার)</span>
            </h4>
            <p className="text-[11px] text-emerald-800 font-medium">
              ম্যাপের স্থান এবং সার্চ এরিয়া ফিল্টার পছন্দ সেট করুন। ডিফল্টভাবে কেবল বাংলাদেশি স্থান এবং লোকেশন সার্চ ফিল্টার হবে।
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1.5">
                  Location & Geocoding Search Preference
                </label>
                <select
                  value={mapLocationPref}
                  onChange={(e) => setMapLocationPref(e.target.value as any)}
                  className="w-full p-3.5 rounded-2xl border border-gray-200 bg-white text-sm font-extrabold outline-none focus:border-emerald-600"
                >
                  <option value="BD">🇧🇩 Bangladesh Only (বাংলাদেশ - শুধুমাত্র বাংলাদেশি এলাকা)</option>
                  <option value="GLOBAL">🌐 Global / Worldwide (গ্লোবাল - বিশ্বব্যাপী সকল স্থান)</option>
                  <option value="CUSTOM">🏳️ Custom Country Code (অন্যান্য দেশ - নির্দিষ্ট কান্ট্রি কোড)</option>
                </select>
                <p className="text-[10px] text-gray-500 mt-1">
                  বাংলাদেশ ফিল্টার নির্বাচন থাকলে স্থান অনুসন্ধান (Search) শুধুমাত্র বাংলাদেশি ফলাফল রিটার্ন করবে।
                </p>
              </div>

              {mapLocationPref === 'CUSTOM' && (
                <div>
                  <label className="text-xs font-bold text-gray-700 block mb-1.5">
                    Custom Country Code (2-letter ISO e.g. us, in, uk)
                  </label>
                  <input
                    type="text"
                    value={customCountryCode}
                    onChange={(e) => setCustomCountryCode(e.target.value)}
                    placeholder="e.g., in, us, uk, sa"
                    className="w-full p-3.5 rounded-2xl border border-gray-200 bg-white text-sm font-extrabold outline-none focus:border-emerald-600 uppercase"
                  />
                  <p className="text-[10px] text-gray-500 mt-1">
                    নির্দিষ্ট দেশের ২-অক্ষরের ISO কান্ট্রি কোড লিখুন।
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* PWA App Installation Prompt Settings */}
          <div className="p-5 rounded-3xl bg-indigo-50/80 border border-indigo-200 space-y-4">
            <h4 className="font-extrabold text-sm text-indigo-950 uppercase tracking-wider flex items-center space-x-2">
              <Download className="w-5 h-5 text-indigo-700" />
              <span>PWA App Installation Prompt Controls (ইনস্টল পপআপ নিয়ন্ত্রণ)</span>
            </h4>
            <p className="text-[11px] text-indigo-900 font-medium">
              অর্ডার সফলভাবে জমা হওয়ার পর গ্রাহককে ইনস্টল পপআপ দেখানোর সিদ্ধান্ত ও টেক্সট কাস্টমাইজ করুন।
            </p>

            <div className="flex items-center space-x-3 p-3 bg-white rounded-2xl border border-indigo-100">
              <input
                type="checkbox"
                id="pwaInstallPromptEnabled"
                checked={pwaInstallPromptEnabled}
                onChange={(e) => setPwaInstallPromptEnabled(e.target.checked)}
                className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500 border-gray-300"
              />
              <label htmlFor="pwaInstallPromptEnabled" className="text-xs font-bold text-gray-900 cursor-pointer">
                অর্ডার সফল হলে গ্রাহককে PWA অ্যাপ ইনস্টল পপআপ (Popup) দেখান (Enable Install Prompt)
              </label>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1.5">
                  পপআপ টাইটেল (Popup Title)
                </label>
                <input
                  type="text"
                  value={pwaInstallPromptTitle}
                  onChange={(e) => setPwaInstallPromptTitle(e.target.value)}
                  placeholder="Install Jamanot App"
                  className="w-full p-3.5 rounded-2xl border border-gray-200 bg-white text-sm font-semibold outline-none focus:border-indigo-600"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1.5">
                  ইনস্টল বাটন টেক্সট (Button Text)
                </label>
                <input
                  type="text"
                  value={pwaInstallButtonText}
                  onChange={(e) => setPwaInstallButtonText(e.target.value)}
                  placeholder="Install Jamanot"
                  className="w-full p-3.5 rounded-2xl border border-gray-200 bg-white text-sm font-semibold outline-none focus:border-indigo-600"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-gray-700 block mb-1.5">
                পপআপ বিবরণ / সুবিধা (Popup Description)
              </label>
              <textarea
                value={pwaInstallPromptDescription}
                onChange={(e) => setPwaInstallPromptDescription(e.target.value)}
                placeholder="আরও দ্রুত আপডেট, ভালো সার্ভিস এবং লাইভ ট্র্যাকিংয়ের জন্য আপনার ফোনে জামানত অ্যাপ ইনস্টল করুন!"
                rows={2}
                className="w-full p-3.5 rounded-2xl border border-gray-200 bg-white text-xs font-medium outline-none focus:border-indigo-600 leading-relaxed font-sans"
              />
            </div>
          </div>

          {/* Permission Asking Modal Content Admin Controls */}
          <div className="p-5 rounded-3xl bg-amber-50/80 border border-amber-200 space-y-4">
            <h4 className="font-extrabold text-sm text-amber-950 uppercase tracking-wider flex items-center space-x-2">
              <ShieldCheck className="w-5 h-5 text-amber-700" />
              <span>Permission Alert Modal Content Controls (পারমিশন মোডাল টেক্সট নিয়ন্ত্রণ)</span>
            </h4>
            <p className="text-[11px] text-amber-900 font-medium">
              লোকেশন এবং নোটিফিকেশন পারমিশন চাইবার সময় গ্রাহককে দেখানো কাস্টম টাইটেল এবং বিবরণ এডিট করুন।
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1.5">
                  লোকেশন পারমিশন মোডাল টাইটেল (Location Permission Title)
                </label>
                <input
                  type="text"
                  value={locPermModalTitle}
                  onChange={(e) => setLocPermModalTitle(e.target.value)}
                  placeholder="লোকেশন পারমিশন আবশ্যক (Location Required)"
                  className="w-full p-3.5 rounded-2xl border border-gray-200 bg-white text-sm font-semibold outline-none focus:border-amber-600"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1.5">
                  নোটিফিকেশন পারমিশন মোডাল টাইটেল (Notification Permission Title)
                </label>
                <input
                  type="text"
                  value={notifPermModalTitle}
                  onChange={(e) => setNotifPermModalTitle(e.target.value)}
                  placeholder="নোটিফিকেশন পারমিশন আবশ্যক (Notification Required)"
                  className="w-full p-3.5 rounded-2xl border border-gray-200 bg-white text-sm font-semibold outline-none focus:border-amber-600"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1.5">
                  লোকেশন পারমিশন মোডাল বিবরণ (Location Permission Message)
                </label>
                <textarea
                  value={locPermModalBody}
                  onChange={(e) => setLocPermModalBody(e.target.value)}
                  placeholder="কম্পিউটার হেলপার মোড চালু করতে জিপিএস পারমিশন আবশ্যক..."
                  rows={3}
                  className="w-full p-3.5 rounded-2xl border border-gray-200 bg-white text-xs font-medium outline-none focus:border-amber-600 leading-relaxed font-sans"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1.5">
                  নোটিফিকেশন পারমিশন মোডাল বিবরণ (Notification Permission Message)
                </label>
                <textarea
                  value={notifPermModalBody}
                  onChange={(e) => setNotifPermModalBody(e.target.value)}
                  placeholder="জরুরি আপডেট পেতে ব্রাউজারে নোটিফিকেশন পারমিশন আবশ্যক..."
                  rows={3}
                  className="w-full p-3.5 rounded-2xl border border-gray-200 bg-white text-xs font-medium outline-none focus:border-amber-600 leading-relaxed font-sans"
                />
              </div>
            </div>
          </div>

          {/* Order Timing Controls Block */}
          <div className="p-5 rounded-3xl bg-slate-50 border border-slate-200 space-y-4">
            <h4 className="font-extrabold text-sm text-slate-800 uppercase tracking-wider flex items-center space-x-2">
              <Clock className="w-5 h-5 text-purple-700" />
              <span>Order Timing & Form Controls</span>
            </h4>
            <p className="text-[11px] text-gray-500">
              গ্রাহকদের অর্ডার করার সময়সীমা নিয়ন্ত্রণ করুন। অর্ডার বন্ধ থাকলে গ্রাহকদের একটি কাস্টম বার্তা দেখানো হবে।
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1.5">
                  Order Accept Type
                </label>
                <select
                  value={pricing.orderTimingType || 'always_on'}
                  onChange={(e) =>
                    setPricing({
                      ...pricing,
                      orderTimingType: e.target.value as any,
                    })
                  }
                  className="w-full p-3.5 rounded-2xl border border-gray-200 bg-white text-sm font-extrabold outline-none focus:border-purple-600"
                >
                  <option value="always_on">Always Open (সরাসরি चालू)</option>
                  <option value="always_off">Always Closed (সাময়িকভাবে বন্ধ)</option>
                  <option value="custom_range">Custom Time Range (নির্দিষ্ট সময়সীমা)</option>
                </select>
              </div>

              {pricing.orderTimingType === 'custom_range' && (
                <>
                  <TimePickerInput
                    label="Open From (শুরু)"
                    value={pricing.orderTimingStart || '08:00'}
                    onChange={(val) => setPricing({ ...pricing, orderTimingStart: val })}
                  />

                  <TimePickerInput
                    label="Close At (শেষ)"
                    value={pricing.orderTimingEnd || '22:00'}
                    onChange={(val) => setPricing({ ...pricing, orderTimingEnd: val })}
                  />
                </>
              )}
            </div>

            <div>
              <label className="text-xs font-bold text-gray-700 block mb-1.5">
                অর্ডার বন্ধ থাকাকালীন নোটিশ বার্তা (Closed Message shown to Customer):
              </label>
              <input
                type="text"
                value={pricing.orderTimingMessage || 'অনুরোধ গ্রহণ সাময়িকভাবে বন্ধ আছে। পরে আবার চেষ্টা করুন।'}
                onChange={(e) =>
                  setPricing({ ...pricing, orderTimingMessage: e.target.value })
                }
                placeholder="যেমন: আমাদের সার্ভিস এখন বন্ধ আছে। সকাল ৮ টা থেকে রাত ১০ টার মধ্যে অর্ডার করুন।"
                className="w-full p-3.5 rounded-2xl border border-gray-200 text-sm font-semibold outline-none focus:border-purple-600 focus:ring-4 focus:ring-purple-600/10"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-gray-700 block mb-1.5">
              সার্ভিস ড্রপডাউন অপশন সমূহ (প্রতি লাইনে ১টি):
            </label>
            <textarea
              value={servicesText}
              onChange={(e) => setServicesText(e.target.value)}
              placeholder="প্রতিটি সার্ভিস আলাদা লাইনে লিখুন..."
              rows={6}
              className="w-full p-4 rounded-2xl border border-gray-200 text-xs font-medium outline-none focus:border-purple-600 focus:ring-4 focus:ring-purple-600/10 leading-relaxed font-sans"
            />
            <p className="text-[11px] text-gray-500 mt-1.5">
              রিকোয়েস্ট ফর্মের সার্ভিস ড্রপডাউনে এই সার্ভিসগুলো দেখাবে।
            </p>
          </div>

          {/* Per-service description placeholder hints — single textarea, "Key = Value" per line */}
          <div>
            <label className="text-xs font-bold text-gray-700 block mb-1.5">
              সার্ভিস অনুযায়ী বিবরণ প্লেসহোল্ডার (প্রতি লাইনে: সার্ভিস নাম = প্লেসহোল্ডার টেক্সট):
            </label>
            <textarea
              value={serviceHintsText}
              onChange={(e) => setServiceHintsText(e.target.value)}
              placeholder={`উদাহরণ:\nবাজার-সদাই করে দিন = (গ্যাস, শাকসবজি, মাছ-মাংস — যা যা লাগবে লিখুন)\nখাবার এনে দিন = (কোন রেস্তোরাঁ থেকে, কোন খাবার, কত পরিমাণ)`}
              rows={6}
              className="w-full p-4 rounded-2xl border border-gray-200 text-xs font-medium outline-none focus:border-purple-600 focus:ring-4 focus:ring-purple-600/10 leading-relaxed font-sans"
            />
            <p className="text-[11px] text-gray-500 mt-1.5">
              প্রতিটি লাইনে <strong>সার্ভিস নাম = প্লেসহোল্ডার টেক্সট</strong> ফরম্যাটে লিখুন। গ্রাহক ওই সার্ভিস সিলেক্ট করলে ডান পাশের টেক্সটটি description textarea-তে দেখাবে।
            </p>
          </div>

          <div>
            <label className="text-xs font-bold text-gray-700 block mb-1.5">
              হোম পেজ রিকোয়েস্ট ইনপুট প্লেসহোল্ডার সমূহ (প্রতি লাইনে ১টি):
            </label>
            <textarea
              value={placeholdersText}
              onChange={(e) => setPlaceholdersText(e.target.value)}
              placeholder="প্রতিটি প্লেসহোল্ডার আলাদা লাইনে লিখুন..."
              rows={6}
              className="w-full p-4 rounded-2xl border border-gray-200 text-xs font-medium outline-none focus:border-purple-600 focus:ring-4 focus:ring-purple-600/10 leading-relaxed font-sans"
            />
            <p className="text-[11px] text-gray-500 mt-1.5">
              ব্যবহারকারী রিকোয়েস্ট ইনপুট বক্সে এই প্লেসহোল্ডার লেখাগুলি পরপর পরিবর্তন (rotate) হতে দেখবে।
            </p>
          </div>

          <div>
            <label className="text-xs font-bold text-gray-700 block mb-1.5">
              অর্ডার সাবমিটের পর কনফার্মেশন বার্তা (Thank You message):
            </label>
            <input
              type="text"
              value={confirmationMsg}
              onChange={(e) => setConfirmationMsg(e.target.value)}
              placeholder="যেমন: আপনার অনুরোধ পেয়েছি! শীঘ্রই একজন হেলপার গ্রহণ করবে।"
              className="w-full p-3.5 rounded-2xl border border-gray-200 text-sm font-medium outline-none focus:border-purple-600 focus:ring-4 focus:ring-purple-600/10"
            />
            <p className="text-[11px] text-gray-500 mt-1.5">
              গ্রাহক অর্ডার সফলভাবে জমা দেওয়ার পর এই বার্তাটি &ldquo;ধন্যবাদ!&rdquo; শিরোনামসহ পপআপে দেখাবে।
            </p>
          </div>

          {/* Dynamic Store / Shop Types */}
          <div>
            <label className="text-xs font-bold text-gray-700 block mb-1.5">
              দোকানের ধরন সমূহের তালিকা (Store Types dropdown - প্রতি লাইনে ১টি):
            </label>
            <textarea
              value={storeTypesText}
              onChange={(e) => setStoreTypesText(e.target.value)}
              placeholder="Grocery & Supermarket&#10;Pharmacy & Medicine&#10;Restaurant & Fast Food"
              rows={6}
              className="w-full p-4 rounded-2xl border border-gray-200 text-xs font-medium outline-none focus:border-purple-600 focus:ring-4 focus:ring-purple-600/10 leading-relaxed font-sans"
            />
            <p className="text-[11px] text-gray-500 mt-1.5">
              হেলপার যখন নতুন দোকান যোগ করবে তখন ড্রপডাউনে এই অপশনগুলো আসবে।
            </p>
          </div>

          {/* ── Store Application Form Placeholders ── */}
          <div className="border border-orange-100 rounded-2xl p-4 bg-orange-50/30 space-y-3">
            <h4 className="font-extrabold text-sm text-orange-900 flex items-center gap-2">
              <Store className="w-4 h-4 text-orange-700" />
              স্টোর আবেদন ফর্মের প্লেসহোল্ডার (Store Application Form Placeholders)
            </h4>
            <p className="text-[11px] text-orange-800 font-medium">
              স্টোর আবেদন ফর্মের প্রতিটি ইনপুটে কাস্টম প্লেসহোল্ডার লিখুন। খালি রাখলে ডিফল্ট প্লেসহোল্ডার ব্যবহার হবে।
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">দোকানের নাম (Store Name):</label>
                <input
                  type="text"
                  value={storeFormPh.storeName}
                  onChange={(e) => setStoreFormPh({ ...storeFormPh, storeName: e.target.value })}
                  placeholder="যেমন: আলম জেনারেল স্টোর"
                  className="w-full p-3 rounded-2xl border border-gray-200 bg-white text-xs font-medium outline-none focus:border-orange-500"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">পণ্য/সেবার বিবরণ (Description):</label>
                <input
                  type="text"
                  value={storeFormPh.storeDescription}
                  onChange={(e) => setStoreFormPh({ ...storeFormPh, storeDescription: e.target.value })}
                  placeholder="যেমন: চাল, ডাল, তেল, শ্যাম্পু, সাবান..."
                  className="w-full p-3 rounded-2xl border border-gray-200 bg-white text-xs font-medium outline-none focus:border-orange-500"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">মালিকের নাম (Owner Name):</label>
                <input
                  type="text"
                  value={storeFormPh.ownerName}
                  onChange={(e) => setStoreFormPh({ ...storeFormPh, ownerName: e.target.value })}
                  placeholder="মালিকের পুরো নাম"
                  className="w-full p-3 rounded-2xl border border-gray-200 bg-white text-xs font-medium outline-none focus:border-orange-500"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">মালিকের ফোন (Owner Phone):</label>
                <input
                  type="text"
                  value={storeFormPh.ownerPhone}
                  onChange={(e) => setStoreFormPh({ ...storeFormPh, ownerPhone: e.target.value })}
                  placeholder="মালিকের হোয়াটসঅ্যাপ নম্বর (01XXXXXXXXX)"
                  className="w-full p-3 rounded-2xl border border-gray-200 bg-white text-xs font-medium outline-none focus:border-orange-500"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">ম্যানেজারের নাম (Manager Name):</label>
                <input
                  type="text"
                  value={storeFormPh.managerName}
                  onChange={(e) => setStoreFormPh({ ...storeFormPh, managerName: e.target.value })}
                  placeholder="ম্যানেজারের পুরো নাম"
                  className="w-full p-3 rounded-2xl border border-gray-200 bg-white text-xs font-medium outline-none focus:border-orange-500"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">ম্যানেজারের ফোন (Manager Phone):</label>
                <input
                  type="text"
                  value={storeFormPh.managerPhone}
                  onChange={(e) => setStoreFormPh({ ...storeFormPh, managerPhone: e.target.value })}
                  placeholder="ম্যানেজারের হোয়াটসঅ্যাপ নম্বর (01XXXXXXXXX)"
                  className="w-full p-3 rounded-2xl border border-gray-200 bg-white text-xs font-medium outline-none focus:border-orange-500"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">কমিশন শতাংশ (Commission %):</label>
                <input
                  type="text"
                  value={storeFormPh.commissionPercent}
                  onChange={(e) => setStoreFormPh({ ...storeFormPh, commissionPercent: e.target.value })}
                  placeholder="যেমন: ৫"
                  className="w-full p-3 rounded-2xl border border-gray-200 bg-white text-xs font-medium outline-none focus:border-orange-500"
                />
              </div>
            </div>
          </div>

          {/* ── Map Picker Guide Overlay Settings ── */}
          <div className="border border-purple-100 rounded-2xl p-4 bg-purple-50/30 space-y-3">
            <h4 className="font-extrabold text-sm text-purple-900 flex items-center gap-2">
              <MapPin className="w-4 h-4 text-purple-700" />
              ম্যাপ গাইড ওভারলে সেটিংস (Map Guide Overlay)
            </h4>
            <div>
              <label className="text-xs font-bold text-gray-700 block mb-1.5">
                পিকআপ (যেখান থেকে আনতে হবে) modal-এর গাইড টেক্সট:
              </label>
              <textarea
                value={mapPickerPickupGuideText}
                onChange={(e) => setMapPickerPickupGuideText(e.target.value)}
                placeholder="যে দোকান বা স্থান থেকে আনতে হবে..."
                rows={3}
                className="w-full p-4 rounded-2xl border border-gray-200 text-xs font-medium outline-none focus:border-purple-600 focus:ring-4 focus:ring-purple-600/10 leading-relaxed font-sans"
              />
              <p className="text-[11px] text-gray-500 mt-1">
                "কোথা থেকে আনতে হবে" map modal-এ দেখানো হবে।
              </p>
            </div>
            <div>
              <label className="text-xs font-bold text-gray-700 block mb-1.5">
                ডেলিভারি স্থান modal-এর গাইড টেক্সট:
              </label>
              <textarea
                value={mapPickerDeliveryGuideText}
                onChange={(e) => setMapPickerDeliveryGuideText(e.target.value)}
                placeholder="আপনার বাসা বা ডেলিভারি পাওয়ার স্থানে পিন সরিয়ে নিন..."
                rows={3}
                className="w-full p-4 rounded-2xl border border-gray-200 text-xs font-medium outline-none focus:border-purple-600 focus:ring-4 focus:ring-purple-600/10 leading-relaxed font-sans"
              />
              <p className="text-[11px] text-gray-500 mt-1">
                "ডেলিভারি ঠিকানা" map modal-এ দেখানো হবে।
              </p>
            </div>
            <div>
              <label className="text-xs font-bold text-gray-700 block mb-1.5">
                সাধারণ গাইড টেক্সট (fallback — উপরের দুটি খালি থাকলে দেখাবে):
              </label>
              <textarea
                value={mapPickerGuideText}
                onChange={(e) => setMapPickerGuideText(e.target.value)}
                placeholder="যে location select করতে চান, সেখান পিন টি নিয়ে বসান..."
                rows={3}
                className="w-full p-4 rounded-2xl border border-gray-200 text-xs font-medium outline-none focus:border-purple-600 focus:ring-4 focus:ring-purple-600/10 leading-relaxed font-sans"
              />
              <p className="text-[11px] text-gray-500 mt-1">
                উপরের দুটি খালি রাখলে এই টেক্সটটি উভয় modal-এ দেখানো হবে।
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1.5">
                  OK বাটনের লেবেল:
                </label>
                <input
                  type="text"
                  value={mapPickerGuideOkText}
                  onChange={(e) => setMapPickerGuideOkText(e.target.value)}
                  placeholder="ঠিক আছে"
                  className="w-full px-3.5 py-2.5 rounded-2xl border border-gray-200 text-xs font-medium outline-none focus:border-purple-600 focus:ring-4 focus:ring-purple-600/10"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1.5">
                  কতবার দেখাবে (প্রতি user):
                </label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={mapPickerGuideShowCount}
                  onChange={(e) => setMapPickerGuideShowCount(Number(e.target.value))}
                  className="w-full px-3.5 py-2.5 rounded-2xl border border-gray-200 text-xs font-medium outline-none focus:border-purple-600 focus:ring-4 focus:ring-purple-600/10"
                />
                <p className="text-[11px] text-gray-500 mt-1">Default: 5 বার</p>
              </div>
            </div>
            <div>
              <label className="text-xs font-bold text-gray-700 block mb-1.5">
                যে service-এর pickup location সংরক্ষণ হবে না (প্রতি লাইনে ১টি service নাম):
              </label>
              <textarea
                value={noSavePickupServicesText}
                onChange={(e) => setNoSavePickupServicesText(e.target.value)}
                placeholder="মিক্স কিছু কাজ করে দিন&#10;না, অন্য একটা কাজ করে দিন&#10;আমার একটা জিনিস দিয়ে আসুন"
                rows={5}
                className="w-full p-4 rounded-2xl border border-gray-200 text-xs font-medium outline-none focus:border-purple-600 focus:ring-4 focus:ring-purple-600/10 leading-relaxed font-sans"
              />
              <p className="text-[11px] text-gray-500 mt-1">
                এই service-গুলো select করলে pickup location পরবর্তীতে আর auto-fill হবে না।
              </p>
            </div>
          </div>

          {/* ── Helper Center Settings ── */}
          <div className="border border-purple-105 rounded-2xl p-4 bg-purple-50/20 space-y-4">
            <h4 className="font-extrabold text-sm text-purple-900 flex items-center gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-purple-700"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" /></svg>
              Helper Center Contact Settings (হেল্প সেন্টার ও যোগাযোগের তথ্য)
            </h4>

            <div className="flex items-center space-x-3">
              <input
                type="checkbox"
                id="helperCenterEnabled"
                checked={helperCenterEnabled}
                onChange={(e) => setHelperCenterEnabled(e.target.checked)}
                className="w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
              />
              <label htmlFor="helperCenterEnabled" className="text-xs font-bold text-gray-700 cursor-pointer">
                Enable Helper Center Page (গ্রাহকদের জন্য পেজটি সচল রাখুন)
              </label>
            </div>

            <div>
              <label className="text-xs font-bold text-gray-700 block mb-1.5">
                Office Address (অফিস ঠিকানা):
              </label>
              <textarea
                value={helperCenterOfficeAddress}
                onChange={(e) => setHelperCenterOfficeAddress(e.target.value)}
                placeholder="যেমন: লেভেল ৪, রহমান টাওয়ার, আশুলিয়া বাজার, ঢাকা..."
                rows={2}
                className="w-full p-3.5 rounded-2xl border border-gray-200 text-xs font-medium outline-none focus:border-purple-600 focus:ring-4 focus:ring-purple-600/10 leading-relaxed"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1.5">
                  Contact Number 1 (মোবাইল ১ - হোয়াটসঅ্যাপ সহ):
                </label>
                <input
                  type="text"
                  value={helperCenterPhone1}
                  onChange={(e) => setHelperCenterPhone1(e.target.value)}
                  placeholder="01XXXXXXXXX"
                  className="w-full px-3.5 py-2.5 rounded-2xl border border-gray-200 text-xs font-medium outline-none focus:border-purple-600 focus:ring-4 focus:ring-purple-600/10"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1.5">
                  Contact Number 2 (মোবাইল ২):
                </label>
                <input
                  type="text"
                  value={helperCenterPhone2}
                  onChange={(e) => setHelperCenterPhone2(e.target.value)}
                  placeholder="01XXXXXXXXX"
                  className="w-full px-3.5 py-2.5 rounded-2xl border border-gray-200 text-xs font-medium outline-none focus:border-purple-600 focus:ring-4 focus:ring-purple-600/10"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1.5">
                  Official Email Address (ইমেইল):
                </label>
                <input
                  type="email"
                  value={helperCenterEmail}
                  onChange={(e) => setHelperCenterEmail(e.target.value)}
                  placeholder="support@jamanot.com"
                  className="w-full px-3.5 py-2.5 rounded-2xl border border-gray-200 text-xs font-medium outline-none focus:border-purple-600 focus:ring-4 focus:ring-purple-600/10"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1.5">
                  Map View URL (ম্যাপ বা লোকেশন লিংক):
                </label>
                <input
                  type="text"
                  value={helperCenterMapEmbedUrl}
                  onChange={(e) => setHelperCenterMapEmbedUrl(e.target.value)}
                  placeholder="https://maps.google.com/..."
                  className="w-full px-3.5 py-2.5 rounded-2xl border border-gray-200 text-xs font-medium outline-none focus:border-purple-600 focus:ring-4 focus:ring-purple-600/10"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1.5">
                  Facebook Page Link (ফেসবুক লিংক):
                </label>
                <input
                  type="text"
                  value={helperCenterFacebook}
                  onChange={(e) => setHelperCenterFacebook(e.target.value)}
                  placeholder="https://facebook.com/jamanot..."
                  className="w-full px-3.5 py-2.5 rounded-2xl border border-gray-200 text-xs font-medium outline-none focus:border-purple-600 focus:ring-4 focus:ring-purple-600/10"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1.5">
                  LinkedIn Page Link (লিংকডইন):
                </label>
                <input
                  type="text"
                  value={helperCenterLinkedin}
                  onChange={(e) => setHelperCenterLinkedin(e.target.value)}
                  placeholder="https://linkedin.com/company/jamanot..."
                  className="w-full px-3.5 py-2.5 rounded-2xl border border-gray-200 text-xs font-medium outline-none focus:border-purple-600 focus:ring-4 focus:ring-purple-600/10"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1.5">
                  Instagram Link (ইনস্টাগ্রাম):
                </label>
                <input
                  type="text"
                  value={helperCenterInstagram}
                  onChange={(e) => setHelperCenterInstagram(e.target.value)}
                  placeholder="https://instagram.com/jamanot..."
                  className="w-full px-3.5 py-2.5 rounded-2xl border border-gray-200 text-xs font-medium outline-none focus:border-purple-600 focus:ring-4 focus:ring-purple-600/10"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-gray-700 block mb-1.5">
                Help Center Description Note (বিশেষ কোনো নির্দেশনা):
              </label>
              <input
                type="text"
                value={helperCenterNote}
                onChange={(e) => setHelperCenterNote(e.target.value)}
                placeholder="যেমন: যেকোনো প্রয়োজনে আমাদের অফিসে সরাসরি যোগাযোগ করতে পারেন।"
                className="w-full p-3.5 rounded-2xl border border-gray-200 text-xs font-semibold outline-none focus:border-purple-600 focus:ring-4 focus:ring-purple-600/10"
              />
            </div>
          </div>

          {currentUser?.isSuperAdmin && (
            <div className="p-5 rounded-3xl bg-purple-50/70 border border-purple-200 space-y-4">
              <h4 className="font-extrabold text-sm text-purple-900 uppercase tracking-wider flex items-center space-x-2">
                <ShieldCheck className="w-5 h-5 text-purple-750" />
                <span>Normal Admin Permissions Control</span>
              </h4>
              <p className="text-[11px] text-purple-750">
                সিলেক্ট করুন একজন সাধারণ অ্যাডমিন (Normal Admin) কোন কোন ট্যাবগুলো অ্যাক্সেস করতে পারবেন। সুপার অ্যাডমিন (Super Admin) সবসময় সব ট্যাব অ্যাক্সেস করতে পারবেন।
              </p>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {tabsList.map((t) => {
                  const isChecked = allowedAdminTabs.includes(t.key);
                  return (
                    <label key={t.key} className="flex items-center space-x-2.5 p-3 rounded-2xl border border-gray-200 bg-white hover:bg-purple-50/20 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setAllowedAdminTabs([...allowedAdminTabs, t.key]);
                          } else {
                            setAllowedAdminTabs(allowedAdminTabs.filter((k) => k !== t.key));
                          }
                        }}
                        className="rounded border-gray-300 text-purple-650 focus:ring-purple-500 w-4 h-4"
                      />
                      <span className="text-xs font-bold text-gray-700">{t.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          <button
            type="submit"
            className="w-full py-4 rounded-2xl bg-purple-900 hover:bg-purple-950 text-white font-extrabold text-sm shadow-md transition-all flex items-center justify-center space-x-2"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>Save System Settings</span>
          </button>
        </form>
      )}

      {/* --- TAB 8: SHOPS TAB --- */}
      {activeTab === 'SHOPS' && isTabAllowed('SHOPS') && (() => {
        let filteredShops = [...shops];
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase().trim();
          filteredShops = filteredShops.filter(
            (s) =>
              (s.name || '').toLowerCase().includes(q) ||
              (s.type || '').toLowerCase().includes(q) ||
              (s.contactPerson || '').toLowerCase().includes(q) ||
              (s.whatsapp && s.whatsapp.includes(q)) ||
              (s.location?.address || '').toLowerCase().includes(q)
          );
        }
        filteredShops.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        const { totalPages, paginatedItems, totalItems } = paginateList(filteredShops);

        return (
          <div className="space-y-4">
            {/* Top Sub-View Header & Controls */}
            <div className="bg-white rounded-3xl p-4 border border-gray-100 shadow-soft flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center space-x-2">
                <div className="p-2.5 rounded-2xl bg-purple-100 text-purple-900">
                  <Store className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-gray-900">Registered Store / Shop List</h3>
                  <span className="text-xs font-bold text-purple-700">
                    {totalItems} stores registered
                  </span>
                </div>
              </div>

              {/* Sub-view Toggles & Add Shop Button */}
              <div className="flex items-center space-x-2 flex-wrap gap-2">
                <div className="flex bg-gray-100 p-1 rounded-2xl">
                  <button
                    type="button"
                    onClick={() => setShopSubView('MAP')}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-extrabold transition-all flex items-center space-x-1.5 ${
                      shopSubView === 'MAP'
                        ? 'bg-purple-900 text-white shadow-md'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    <Globe className="w-3.5 h-3.5" />
                    <span>Map View</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setShopSubView('TABLE')}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-extrabold transition-all flex items-center space-x-1.5 ${
                      shopSubView === 'TABLE'
                        ? 'bg-purple-900 text-white shadow-md'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    <Layers className="w-3.5 h-3.5" />
                    <span>Table View</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setShopSubView('APPLICATIONS')}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-extrabold transition-all flex items-center space-x-1.5 ${
                      shopSubView === 'APPLICATIONS'
                        ? 'bg-orange-600 text-white shadow-md'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    <AlertCircle className="w-3.5 h-3.5" />
                    <span>Applications</span>
                    {pendingStoreApps.length > 0 && (
                      <span className="px-1.5 py-0.5 rounded-full bg-red-500 text-white text-[9px] font-black">
                        {pendingStoreApps.length}
                      </span>
                    )}
                  </button>
                </div>

                {shopSubView !== 'APPLICATIONS' && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingShop(null);
                      setShowAddShopModal(true);
                    }}
                    className="py-2 px-4 rounded-2xl bg-purple-900 hover:bg-purple-950 text-white font-extrabold text-xs shadow-md transition-all flex items-center space-x-1.5"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Add New Shop</span>
                  </button>
                )}
              </div>
            </div>

            {/* Sub-View Content */}
            {shopSubView === 'APPLICATIONS' ? (
              /* ── Store Applications Sub-View ── */
              (() => {
                let filteredStoreApps = [...storeApplications];
                if (searchQuery.trim()) {
                  const q = searchQuery.toLowerCase().trim();
                  filteredStoreApps = filteredStoreApps.filter(
                    (a) =>
                      (a.storeName || '').toLowerCase().includes(q) ||
                      (a.ownerName || '').toLowerCase().includes(q) ||
                      (a.ownerWhatsapp || '').includes(q) ||
                      (a.userName || '').toLowerCase().includes(q) ||
                      (a.storeType || '').toLowerCase().includes(q)
                  );
                }
                if (statusFilter !== 'ALL') {
                  filteredStoreApps = filteredStoreApps.filter((a) => a.status === statusFilter);
                }
                filteredStoreApps.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
                const { totalPages: appTotalPages, paginatedItems: appPaginatedItems, totalItems: appTotalItems } = paginateList(filteredStoreApps);

                return (
                  <div className="space-y-3">
                    <div className="bg-white rounded-3xl border border-gray-100 shadow-soft overflow-hidden">
                      <div className="p-5 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <h3 className="font-extrabold text-base text-gray-900">Store Applications</h3>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-orange-50 text-orange-800">
                              {appTotalItems} total
                            </span>
                            <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-amber-50 text-amber-800">
                              {filteredStoreApps.filter(a => a.status === 'PENDING').length} pending
                            </span>
                            <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800">
                              {filteredStoreApps.filter(a => a.status === 'APPROVED').length} approved
                            </span>
                          </div>
                        </div>
                        <select
                          value={statusFilter}
                          onChange={(e) => setStatusFilter(e.target.value)}
                          className="py-2 px-3 rounded-xl border border-gray-200 text-xs font-bold text-gray-700 bg-white"
                        >
                          <option value="ALL">All Status</option>
                          <option value="PENDING">Pending</option>
                          <option value="APPROVED">Approved</option>
                          <option value="REJECTED">Rejected</option>
                          <option value="CANCELED">Canceled</option>
                        </select>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs text-gray-600 min-w-[800px]">
                          <thead className="bg-gray-50 text-gray-700 uppercase font-extrabold text-[10px] tracking-wider border-b border-gray-100">
                            <tr>
                              <th className="py-3.5 px-4">Store</th>
                              <th className="py-3.5 px-4">Owner</th>
                              <th className="py-3.5 px-4">Manager</th>
                              <th className="py-3.5 px-4">Location</th>
                              <th className="py-3.5 px-4">Commission</th>
                              <th className="py-3.5 px-4">Status</th>
                              <th className="py-3.5 px-4 text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100 font-medium">
                            {appPaginatedItems.map((app) => (
                              <tr key={app.id} className="hover:bg-gray-50/80 transition-colors">
                                <td className="py-4 px-4">
                                  <div className="font-extrabold text-gray-900">{app.storeName}</div>
                                  <div className="text-[11px] text-orange-700 font-bold">{app.storeType}</div>
                                  <div className="text-[10px] text-gray-400 mt-0.5">{new Date(app.createdAt).toLocaleDateString('bn-BD')}</div>
                                </td>
                                <td className="py-4 px-4">
                                  <div className="font-bold text-gray-900">{app.ownerName}</div>
                                  <div className="text-[11px] text-emerald-700">{app.ownerWhatsapp}</div>
                                  <div className="text-[10px] text-gray-400">{app.userName}</div>
                                </td>
                                <td className="py-4 px-4">
                                  <div className="font-bold text-gray-900">{app.managerName}</div>
                                  <div className="text-[11px] text-emerald-700">{app.managerWhatsapp}</div>
                                </td>
                                <td className="py-4 px-4 max-w-[150px]">
                                  <div className="text-[11px] text-gray-700 truncate">{app.location?.address || '—'}</div>
                                  {app.location?.lat && (
                                    <a
                                      href={`https://maps.google.com/?q=${app.location.lat},${app.location.lng}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-[10px] text-blue-600 font-bold hover:underline"
                                    >
                                      View on Map
                                    </a>
                                  )}
                                </td>
                                <td className="py-4 px-4">
                                  {app.commissionPercent > 0 ? (
                                    <span className="font-extrabold text-emerald-700">{app.commissionPercent}%</span>
                                  ) : <span className="text-gray-400">—</span>}
                                </td>
                                <td className="py-4 px-4">
                                  <span className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold ${
                                    app.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-800' :
                                    app.status === 'REJECTED' || app.status === 'CANCELED' ? 'bg-red-100 text-red-800' :
                                    'bg-amber-100 text-amber-800'
                                  }`}>
                                    {app.status}
                                  </span>
                                  {app.reviewNote && (
                                    <div className="text-[10px] text-gray-400 mt-0.5 max-w-[100px] truncate">{app.reviewNote}</div>
                                  )}
                                </td>
                                <td className="py-4 px-4 text-right">
                                  <div className="flex items-center justify-end gap-1.5 flex-wrap">
                                    {/* Details button — always visible */}
                                    <button
                                      type="button"
                                      onClick={() => setSelectedStoreApp(app)}
                                      className="py-1.5 px-3 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-extrabold text-xs shadow-sm transition-all flex items-center gap-1"
                                    >
                                      <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                                      Details
                                    </button>
                                    {app.status === 'PENDING' && (
                                      <>
                                        <button
                                          onClick={async () => {
                                            const confirmed = await showConfirm(
                                              'স্টোর অনুমোদন',
                                              `"${app.storeName}" দোকানটি অনুমোদন করবেন?`,
                                              'হ্যাঁ, অনুমোদন করুন', 'বাতিল'
                                            );
                                            if (confirmed) {
                                              await fallbackStore.approveStoreApp(app.id);
                                              setStoreApplications(Array.from(fallbackStore.storeApplications.values()));
                                              setUsers(Array.from(fallbackStore.users.values()));
                                              setShops(Array.from(fallbackStore.shops.values()));
                                              showAlert('অনুমোদন সম্পন্ন', `"${app.storeName}" অনুমোদিত হয়েছে।`, 'success');
                                            }
                                          }}
                                          className="py-1.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs shadow-sm transition-all"
                                        >
                                          Approve
                                        </button>
                                        <button
                                          onClick={async () => {
                                            const confirmed = await showConfirm(
                                              'স্টোর প্রত্যাখ্যান',
                                              `"${app.storeName}" এর আবেদন প্রত্যাখ্যান করবেন?`,
                                              'হ্যাঁ, প্রত্যাখ্যান করুন', 'বাতিল'
                                            );
                                            if (confirmed) {
                                              await fallbackStore.rejectStoreApp(app.id);
                                              setStoreApplications(Array.from(fallbackStore.storeApplications.values()));
                                              showAlert('প্রত্যাখ্যান সম্পন্ন', `"${app.storeName}" এর আবেদন প্রত্যাখ্যাত হয়েছে।`, 'info');
                                            }
                                          }}
                                          className="py-1.5 px-2.5 rounded-xl bg-red-50 hover:bg-red-100 text-red-700 font-bold text-xs"
                                        >
                                          Reject
                                        </button>
                                      </>
                                    )}
                                    {app.status !== 'PENDING' && (
                                      <button
                                        type="button"
                                        onClick={async () => {
                                          const confirmed = await showConfirm(
                                            'আবেদন ডিলিট',
                                            `"${app.storeName}" এর আবেদনটি মুছে ফেলবেন?`,
                                            'হ্যাঁ, ডিলিট করুন', 'বাতিল'
                                          );
                                          if (confirmed) {
                                            await fallbackStore.deleteStoreApp(app.id);
                                            setStoreApplications(Array.from(fallbackStore.storeApplications.values()));
                                            setUsers(Array.from(fallbackStore.users.values()));
                                            setShops(Array.from(fallbackStore.shops.values()));
                                            showAlert('সফল', 'আবেদনটি মুছে ফেলা হয়েছে।', 'success');
                                          }
                                        }}
                                        className="py-1.5 px-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs shadow-sm transition-all"
                                      >
                                        Delete
                                      </button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            ))}
                            {appPaginatedItems.length === 0 && (
                              <tr>
                                <td colSpan={7} className="py-12 text-center text-gray-400 font-semibold">
                                  <Store className="w-8 h-8 mx-auto mb-2 text-gray-200" />
                                  কোনো স্টোর আবেদন নেই
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>

                      <PaginationControl
                        currentPage={currentPage}
                        totalPages={appTotalPages}
                        totalItems={appTotalItems}
                        pageSize={pageSize}
                        onPageChange={(p) => setCurrentPage(p)}
                        onPageSizeChange={(s) => { setPageSize(s); setCurrentPage(1); }}
                      />
                    </div>
                  </div>
                );
              })()
            ) : shopSubView === 'MAP' ? (
              <AdminShopMapView
                shops={filteredShops}
                onSelectShop={(s) => setSelectedShopDetails(s)}
                onAddShop={() => {
                  setEditingShop(null);
                  setShowAddShopModal(true);
                }}
              />
            ) : (
              <div className="bg-white rounded-3xl border border-gray-100 shadow-soft overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-gray-600 min-w-[750px]">
                    <thead className="bg-gray-50 text-gray-700 uppercase font-extrabold text-[10px] tracking-wider border-b border-gray-100">
                      <tr>
                        <th className="py-3.5 px-5">Store Name</th>
                        <th className="py-3.5 px-5">Store Type</th>
                        <th className="py-3.5 px-5">Contact Person & WhatsApp</th>
                        <th className="py-3.5 px-5">Location Address</th>
                        <th className="py-3.5 px-5">Added By</th>
                        <th className="py-3.5 px-5 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 font-medium">
                      {paginatedItems.map((s) => (
                        <tr
                          key={s.id}
                          onClick={() => setSelectedShopDetails(s)}
                          className="hover:bg-purple-50/50 transition-colors cursor-pointer"
                        >
                          <td className="py-4 px-5">
                            <div className="font-extrabold text-gray-900 flex items-center space-x-2">
                              <Store className="w-4 h-4 text-purple-600 shrink-0" />
                              <span>{s.name}</span>
                            </div>
                          </td>
                          <td className="py-4 px-5">
                            <span className="px-2.5 py-1 rounded-full bg-purple-50 text-purple-900 font-bold text-[10px]">
                              {s.type}
                            </span>
                          </td>
                          <td className="py-4 px-5">
                            <div className="font-bold text-gray-800">{s.contactPerson}</div>
                            <div className="text-[11px] text-emerald-700 font-extrabold">WA: {s.whatsapp}</div>
                          </td>
                          <td className="py-4 px-5">
                            <div className="text-gray-800 font-semibold max-w-xs">{s.location.address}</div>
                            {typeof s.location.lat === 'number' && typeof s.location.lng === 'number' && (
                              <div className="text-[10px] text-gray-400 font-mono">
                                {s.location.lat.toFixed(4)}, {s.location.lng.toFixed(4)}
                              </div>
                            )}
                          </td>
                          <td className="py-4 px-5 text-gray-500 font-medium">
                            {s.addedByHelperName || 'Admin'}
                          </td>
                          <td className="py-4 px-5 text-right" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-end space-x-1.5">
                              <button
                                type="button"
                                onClick={() => setSelectedShopDetails(s)}
                                className="p-1.5 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-800 font-bold text-xs"
                                title="View Details"
                              >
                                <Globe className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingShop(s);
                                  setShowAddShopModal(true);
                                }}
                                className="p-1.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs"
                              >
                                <Edit className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={async () => {
                                  const confirmed = await showConfirm(
                                    'দোকান ডিলিট নিশ্চিতকরণ',
                                    `আপনি কি নিশ্চিতভাবে ${s.name} দোকানটি ডিলিট করতে চান?`,
                                    'হ্যাঁ, ডিলিট করুন',
                                    'বাতিল'
                                  );
                                  if (!confirmed) return;
                                  await fallbackStore.deleteShop(s.id);
                                  setShops(Array.from(fallbackStore.shops.values()));
                                  showAlert('সফল', 'দোকানের তথ্য মুছে ফেলা হয়েছে।', 'success');
                                }}
                                className="p-1.5 rounded-xl bg-red-50 hover:bg-red-100 text-red-600 font-bold text-xs"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <PaginationControl
                  currentPage={currentPage}
                  totalPages={totalPages}
                  totalItems={totalItems}
                  pageSize={pageSize}
                  onPageChange={(p) => setCurrentPage(p)}
                  onPageSizeChange={(s) => {
                    setPageSize(s);
                    setCurrentPage(1);
                  }}
                />
              </div>
            )}
          </div>
        );
      })()}

      {/* STORE APPLICATIONS merged into SHOPS > Applications sub-view */}
      {false && (() => {
        let filteredStoreApps = [...storeApplications];
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase().trim();
          filteredStoreApps = filteredStoreApps.filter(
            (a) =>
              (a.storeName || '').toLowerCase().includes(q) ||
              (a.ownerName || '').toLowerCase().includes(q) ||
              (a.ownerWhatsapp || '').includes(q) ||
              (a.userName || '').toLowerCase().includes(q) ||
              (a.storeType || '').toLowerCase().includes(q)
          );
        }
        if (statusFilter !== 'ALL') {
          filteredStoreApps = filteredStoreApps.filter((a) => a.status === statusFilter);
        }
        filteredStoreApps.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        const { totalPages, paginatedItems, totalItems } = paginateList(filteredStoreApps);

        return (
          <div className="space-y-4">
            <div className="bg-white rounded-3xl border border-gray-100 shadow-soft overflow-hidden">
              <div className="p-5 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-extrabold text-base text-gray-900">Store Applications</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-orange-50 text-orange-800">
                      {totalItems} total
                    </span>
                    <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-amber-50 text-amber-800">
                      {filteredStoreApps.filter(a => a.status === 'PENDING').length} pending
                    </span>
                    <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800">
                      {filteredStoreApps.filter(a => a.status === 'APPROVED').length} approved
                    </span>
                  </div>
                </div>
                {/* Status filter for store apps */}
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="py-2 px-3 rounded-xl border border-gray-200 text-xs font-bold text-gray-700 bg-white"
                >
                  <option value="ALL">All Status</option>
                  <option value="PENDING">Pending</option>
                  <option value="APPROVED">Approved</option>
                  <option value="REJECTED">Rejected</option>
                  <option value="CANCELED">Canceled</option>
                </select>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-gray-600 min-w-[800px]">
                  <thead className="bg-gray-50 text-gray-700 uppercase font-extrabold text-[10px] tracking-wider border-b border-gray-100">
                    <tr>
                      <th className="py-3.5 px-4">Store</th>
                      <th className="py-3.5 px-4">Owner</th>
                      <th className="py-3.5 px-4">Manager</th>
                      <th className="py-3.5 px-4">Location</th>
                      <th className="py-3.5 px-4">Commission</th>
                      <th className="py-3.5 px-4">Status</th>
                      <th className="py-3.5 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 font-medium">
                    {paginatedItems.map((app) => (
                      <tr key={app.id} className="hover:bg-gray-50/80 transition-colors">
                        <td className="py-4 px-4">
                          <div className="font-extrabold text-gray-900">{app.storeName}</div>
                          <div className="text-[11px] text-orange-700 font-bold">{app.storeType}</div>
                          <div className="text-[10px] text-gray-400 mt-0.5">{new Date(app.createdAt).toLocaleDateString('bn-BD')}</div>
                        </td>
                        <td className="py-4 px-4">
                          <div className="font-bold text-gray-900">{app.ownerName}</div>
                          <div className="text-[11px] text-emerald-700">{app.ownerWhatsapp}</div>
                          <div className="text-[10px] text-gray-400">{app.userName}</div>
                        </td>
                        <td className="py-4 px-4">
                          <div className="font-bold text-gray-900">{app.managerName}</div>
                          <div className="text-[11px] text-emerald-700">{app.managerWhatsapp}</div>
                        </td>
                        <td className="py-4 px-4 max-w-[150px]">
                          <div className="text-[11px] text-gray-700 truncate">{app.location?.address || '—'}</div>
                          {app.location?.lat && (
                            <a
                              href={`https://maps.google.com/?q=${app.location.lat},${app.location.lng}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[10px] text-blue-600 font-bold hover:underline"
                            >
                              View on Map
                            </a>
                          )}
                        </td>
                        <td className="py-4 px-4">
                          {app.commissionPercent > 0 ? (
                            <span className="font-extrabold text-emerald-700">{app.commissionPercent}%</span>
                          ) : <span className="text-gray-400">—</span>}
                        </td>
                        <td className="py-4 px-4">
                          <span className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold ${
                            app.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-800' :
                            app.status === 'REJECTED' || app.status === 'CANCELED' ? 'bg-red-100 text-red-800' :
                            'bg-amber-100 text-amber-800'
                          }`}>
                            {app.status}
                          </span>
                          {app.reviewNote && (
                            <div className="text-[10px] text-gray-400 mt-0.5 max-w-[100px] truncate">{app.reviewNote}</div>
                          )}
                        </td>
                        <td className="py-4 px-4 text-right space-x-1.5">
                          {app.status === 'PENDING' && (
                            <>
                              <button
                                onClick={async () => {
                                  const confirmed = await showConfirm(
                                    'স্টোর অনুমোদন',
                                    `"${app.storeName}" দোকানটি অনুমোদন করবেন? এটি স্বয়ংক্রিয়ভাবে দোকানের তালিকায় যুক্ত হবে।`,
                                    'হ্যাঁ, অনুমোদন করুন', 'বাতিল'
                                  );
                                  if (confirmed) {
                                    await fallbackStore.approveStoreApp(app.id);
                                    setStoreApplications(Array.from(fallbackStore.storeApplications.values()));
                                    setUsers(Array.from(fallbackStore.users.values()));
                                    setShops(Array.from(fallbackStore.shops.values()));
                                    showAlert('অনুমোদন সম্পন্ন', `"${app.storeName}" অনুমোদিত হয়েছে এবং দোকানের তালিকায় যুক্ত হয়েছে।`, 'success');
                                  }
                                }}
                                className="py-1.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs shadow-sm transition-all"
                              >
                                Approve
                              </button>
                              <button
                                onClick={async () => {
                                  const reason = await showConfirm(
                                    'স্টোর প্রত্যাখ্যান',
                                    `"${app.storeName}" দোকানটির আবেদন প্রত্যাখ্যান করবেন?`,
                                    'হ্যাঁ, প্রত্যাখ্যান করুন', 'বাতিল'
                                  );
                                  if (reason) {
                                    await fallbackStore.rejectStoreApp(app.id);
                                    setStoreApplications(Array.from(fallbackStore.storeApplications.values()));
                                    showAlert('প্রত্যাখ্যান সম্পন্ন', `"${app.storeName}" এর আবেদন প্রত্যাখ্যাত হয়েছে।`, 'info');
                                  }
                                }}
                                className="py-1.5 px-2.5 rounded-xl bg-red-50 hover:bg-red-100 text-red-700 font-bold text-xs"
                              >
                                Reject
                              </button>
                            </>
                          )}
                          {app.status === 'APPROVED' && (
                            <span className="text-[10px] text-emerald-700 font-bold">✓ Active</span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {paginatedItems.length === 0 && (
                      <tr>
                        <td colSpan={7} className="py-12 text-center text-gray-400 font-semibold">
                          <Store className="w-8 h-8 mx-auto mb-2 text-gray-200" />
                          কোনো স্টোর আবেদন নেই
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <PaginationControl
                currentPage={currentPage}
                totalPages={totalPages}
                totalItems={totalItems}
                pageSize={pageSize}
                onPageChange={(p) => setCurrentPage(p)}
                onPageSizeChange={(s) => { setPageSize(s); setCurrentPage(1); }}
              />
            </div>
          </div>
        );
      })()}

      {/* --- TAB 9: ORDER FEEDBACK TAB --- */}
      {activeTab === 'FEEDBACK' && isTabAllowed('FEEDBACK') && (() => {
        const totalFeedbacks = feedbacks.length;
        const avgRider = totalFeedbacks > 0
          ? (feedbacks.reduce((sum, f) => sum + f.riderRating, 0) / totalFeedbacks).toFixed(1)
          : '0.0';
        const avgService = totalFeedbacks > 0
          ? (feedbacks.reduce((sum, f) => sum + f.serviceRating, 0) / totalFeedbacks).toFixed(1)
          : '0.0';
        const avgShop = totalFeedbacks > 0
          ? (feedbacks.reduce((sum, f) => sum + f.shopRating, 0) / totalFeedbacks).toFixed(1)
          : '0.0';

        let filteredFeedbacks = [...feedbacks];
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase().trim();
          filteredFeedbacks = filteredFeedbacks.filter(
            (f) =>
              f.orderId.toLowerCase().includes(q) ||
              (f.customerName && f.customerName.toLowerCase().includes(q)) ||
              (f.helperName && f.helperName.toLowerCase().includes(q)) ||
              (f.improvementComment && f.improvementComment.toLowerCase().includes(q))
          );
        }
        filteredFeedbacks.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        const { totalPages, paginatedItems, totalItems } = paginateList(filteredFeedbacks);

        return (
          <div className="space-y-6">
            {/* Feedback Analysis Stats Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 text-center">
              <div className="p-5 rounded-3xl bg-amber-50 border border-amber-200">
                <span className="text-xs font-extrabold text-amber-800 uppercase block">Rider Behavior Avg</span>
                <span className="text-3xl font-black text-amber-900 mt-1 block">⭐ {avgRider}</span>
                <span className="text-[10px] text-amber-700 font-bold block mt-1">based on {totalFeedbacks} ratings</span>
              </div>
              <div className="p-5 rounded-3xl bg-emerald-50 border border-emerald-200">
                <span className="text-xs font-extrabold text-emerald-800 uppercase block">Service Quality Avg</span>
                <span className="text-3xl font-black text-emerald-900 mt-1 block">⭐ {avgService}</span>
                <span className="text-[10px] text-emerald-700 font-bold block mt-1">overall delivery quality</span>
              </div>
              <div className="p-5 rounded-3xl bg-purple-50 border border-purple-200">
                <span className="text-xs font-extrabold text-purple-800 uppercase block">Shop Product Quality</span>
                <span className="text-3xl font-black text-purple-900 mt-1 block">⭐ {avgShop}</span>
                <span className="text-[10px] text-purple-700 font-bold block mt-1">store product satisfaction</span>
              </div>
              <div className="p-5 rounded-3xl bg-indigo-50 border border-indigo-200">
                <span className="text-xs font-extrabold text-indigo-800 uppercase block">Total Reviews</span>
                <span className="text-3xl font-black text-indigo-900 mt-1 block">{totalFeedbacks}</span>
                <span className="text-[10px] text-indigo-700 font-bold block mt-1">customer responses</span>
              </div>
            </div>

            {/* Feedback List Table */}
            <div className="bg-white rounded-3xl border border-gray-100 shadow-soft overflow-hidden">
              <div className="p-5 border-b border-gray-100 flex items-center justify-between">
                <h3 className="font-extrabold text-base text-gray-900">Customer Order Feedback Entries</h3>
                <span className="text-xs font-bold px-3 py-1 rounded-full bg-amber-50 text-amber-800">
                  {totalItems} total feedbacks
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-gray-600 min-w-[750px]">
                  <thead className="bg-gray-50 text-gray-700 uppercase font-extrabold text-[10px] tracking-wider border-b border-gray-100">
                    <tr>
                      <th className="py-3.5 px-5">Order ID & Customer</th>
                      <th className="py-3.5 px-5">Rider / Helper</th>
                      <th className="py-3.5 px-5">Rider Rating</th>
                      <th className="py-3.5 px-5">Service Rating</th>
                      <th className="py-3.5 px-5">Shop Rating</th>
                      <th className="py-3.5 px-5">Customer Comment</th>
                      <th className="py-3.5 px-5">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 font-medium">
                    {paginatedItems.map((fb) => (
                      <tr key={fb.id} className="hover:bg-gray-50/80 transition-colors">
                        <td className="py-4 px-5">
                          <div className="font-extrabold text-gray-900">#{fb.orderId}</div>
                          <div className="text-[11px] text-gray-500">{fb.customerName}</div>
                        </td>
                        <td className="py-4 px-5 font-bold text-gray-800">
                          {fb.helperName || 'Unassigned'}
                        </td>
                        <td className="py-4 px-5 font-extrabold text-amber-600">
                          ⭐ {fb.riderRating} / 5
                        </td>
                        <td className="py-4 px-5 font-extrabold text-emerald-600">
                          ⭐ {fb.serviceRating} / 5
                        </td>
                        <td className="py-4 px-5 font-extrabold text-purple-600">
                          ⭐ {fb.shopRating} / 5
                        </td>
                        <td className="py-4 px-5">
                          {fb.improvementComment ? (
                            <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-950 font-semibold max-w-xs text-[11px]">
                              &ldquo;{fb.improvementComment}&rdquo;
                            </div>
                          ) : (
                            <span className="text-gray-400 italic">No comment provided</span>
                          )}
                        </td>
                        <td className="py-4 px-5 text-gray-400 font-mono text-[11px]">
                          {new Date(fb.createdAt).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <PaginationControl
                currentPage={currentPage}
                totalPages={totalPages}
                totalItems={totalItems}
                pageSize={pageSize}
                onPageChange={(p) => setCurrentPage(p)}
                onPageSizeChange={(s) => {
                  setPageSize(s);
                  setCurrentPage(1);
                }}
              />
            </div>
          </div>
        );
      })()}

      {/* --- TAB 10: CUSTOM DYNAMIC MODALS TAB --- */}
      {activeTab === 'CUSTOM_MODALS' && isTabAllowed('CUSTOM_MODALS') && (() => {
        return (
          <div className="space-y-6">
            <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-soft flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="font-extrabold text-base sm:text-lg text-gray-900 flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-purple-600" />
                  <span>Custom Dynamic Modal Creator & Injector</span>
                </h3>
                <p className="text-xs text-gray-500 font-medium mt-0.5">
                  Create custom popup banners targeting specific users, triggers & frequency.
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setEditingCustomModal(null);
                  setShowCustomModalForm(true);
                }}
                className="py-2.5 px-4 rounded-2xl bg-purple-900 hover:bg-purple-950 text-white font-extrabold text-xs shadow-md transition-all flex items-center space-x-1.5 shrink-0"
              >
                <Plus className="w-4 h-4" />
                <span>Create New Custom Modal</span>
              </button>
            </div>

            {customModals.length === 0 ? (
              <div className="p-12 bg-white rounded-3xl border border-gray-100 text-center text-gray-400 space-y-2">
                <Sparkles className="w-10 h-10 mx-auto text-purple-300" />
                <p className="font-bold text-gray-700">কোনো ডায়নামিক কাস্টম পপআপ মোডাল যোগ করা হয়নি।</p>
                <p className="text-xs text-gray-500">
                  অ্যাডমিন নতুন পপআপ ব্যানার তৈরি করে নির্দিষ্ট ইউজার গ্রুপ ও ইভেন্টে প্রদর্শন করাতে পারেন।
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {customModals.map((modal) => (
                  <div
                    key={modal.id}
                    className={`p-5 rounded-3xl bg-white border transition-all shadow-soft flex flex-col justify-between ${modal.isEnabled ? 'border-purple-200' : 'border-gray-200 opacity-75'
                      }`}
                  >
                    <div className="space-y-3">
                      {modal.imageUrl && (
                        <div className="w-full h-32 rounded-2xl overflow-hidden bg-slate-900">
                          <img src={modal.imageUrl} alt={modal.title} className="w-full h-full object-cover" />
                        </div>
                      )}

                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h4 className="font-extrabold text-base text-gray-900 flex items-center gap-2">
                            <span>{modal.title}</span>
                            {modal.isEnabled ? (
                              <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-black uppercase">
                                Active
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 text-[10px] font-black uppercase">
                                Disabled
                              </span>
                            )}
                          </h4>
                          {modal.subtitle && (
                            <p className="text-xs text-purple-700 font-bold mt-0.5">{modal.subtitle}</p>
                          )}
                        </div>
                      </div>

                      <p className="text-xs text-gray-600 line-clamp-3 font-medium">
                        {modal.description}
                      </p>

                      <div className="flex flex-wrap gap-1.5 text-[10px] font-extrabold">
                        <span className="px-2.5 py-1 rounded-xl bg-purple-50 text-purple-900 border border-purple-200">
                          Target: {
                            modal.targetAudience === 'WEBSITE_USERS' ? 'Website Users' :
                            modal.targetAudience === 'MOBILE_APP_USERS' ? 'Mobile App Users' :
                            modal.targetAudience
                          }
                        </span>
                        <span className="px-2.5 py-1 rounded-xl bg-amber-50 text-amber-900 border border-amber-200">
                          Trigger: {modal.triggerEvent}
                        </span>
                        <span className="px-2.5 py-1 rounded-xl bg-indigo-50 text-indigo-900 border border-indigo-200">
                          Freq: {modal.displayFrequency}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-4 mt-4 border-t border-gray-100">
                      <button
                        type="button"
                        onClick={async () => {
                          const updated = { ...modal, isEnabled: !modal.isEnabled };
                          await fallbackStore.saveCustomModal(updated);
                          setCustomModals(Array.from(fallbackStore.customModals.values()));
                        }}
                        className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all ${modal.isEnabled
                            ? 'bg-amber-100 hover:bg-amber-200 text-amber-900'
                            : 'bg-emerald-100 hover:bg-emerald-200 text-emerald-900'
                          }`}
                      >
                        {modal.isEnabled ? 'Deactivate' : 'Activate'}
                      </button>

                      <div className="flex items-center space-x-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingCustomModal(modal);
                            setShowCustomModalForm(true);
                          }}
                          className="p-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            const confirmed = await showConfirm(
                              'পপআপ মোডাল ডিলিট নিশ্চিতকরণ',
                              `আপনি কি নিশ্চিতভাবে "${modal.title}" মোডালটি ডিলিট করতে চান?`,
                              'হ্যাঁ, ডিলিট করুন',
                              'বাতিল'
                            );
                            if (!confirmed) return;
                            await fallbackStore.deleteCustomModal(modal.id);
                            setCustomModals(Array.from(fallbackStore.customModals.values()));
                            showAlert('সফল', 'পপআপ মোডাল ডিলিট করা হয়েছে।', 'success');
                          }}
                          className="p-2 rounded-xl bg-red-50 hover:bg-red-100 text-red-600 font-bold"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })()}

      {/* --- ALL MODALS OVERLAYS --- */}

      {/* 1. Admin Order Details Modal */}
      {selectedOrderId && (
        <AdminOrderDetailsModal
          orderId={selectedOrderId}
          onClose={() => setSelectedOrderId(null)}
        />
      )}

      {/* 2. Assign Helper Modal */}
      {assignHelperOrder && (
        <AssignHelperModal
          order={assignHelperOrder}
          onClose={() => setAssignHelperOrder(null)}
          onAssigned={() => setAssignHelperOrder(null)}
        />
      )}

      {/* 3. Customer Order History Modal */}
      {selectedCustomer && (
        <CustomerHistoryModal
          customerId={selectedCustomer.id}
          customerName={selectedCustomer.name}
          customerPhone={selectedCustomer.phone}
          onClose={() => setSelectedCustomer(null)}
        />
      )}

      {/* 4. Helper Work History Modal */}
      {selectedHelper && (
        <HelperHistoryModal
          helperId={selectedHelper.id}
          helperName={selectedHelper.name}
          onClose={() => setSelectedHelper(null)}
        />
      )}

      {/* 4.5 High Duration Deliveries Modal */}
      {showHighDurationModal && (() => {
        const highDurationOrders = allOrders
          .filter(o => o.status === 'DELIVERED' && o.deliveredAt && (o.acceptedAt || o.createdAt))
          .map(o => {
            const durationMs = new Date(o.deliveredAt!).getTime() - new Date(o.acceptedAt || o.createdAt).getTime();
            return { ...o, durationMs };
          })
          .filter(o => o.durationMs > 0)
          .sort((a, b) => b.durationMs - a.durationMs)
          .slice(0, 20);

        const fmtDuration = (ms: number) => {
          const totalMins = Math.round(ms / 60000);
          const h = Math.floor(totalMins / 60);
          const m = totalMins % 60;
          return h > 0 ? `${h}h ${m}m` : `${m}m`;
        };

        return (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowHighDurationModal(false)} />
            <div className="relative w-full sm:max-w-2xl bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[90vh]">
              {/* Header */}
              <div className="p-5 border-b border-gray-100 flex items-center justify-between shrink-0">
                <div>
                  <h2 className="font-extrabold text-base text-gray-900 flex items-center gap-2">
                    <Clock className="w-5 h-5 text-purple-700" />
                    Top High-Duration Deliveries
                  </h2>
                  <p className="text-xs text-gray-400 mt-0.5">Most recent completed orders with longest delivery times</p>
                </div>
                <button
                  onClick={() => setShowHighDurationModal(false)}
                  className="p-2 rounded-xl hover:bg-gray-100 text-gray-500 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Summary stat */}
              <div className="px-5 py-3 bg-purple-50/60 border-b border-purple-100 shrink-0">
                <div className="flex items-center gap-6">
                  <div>
                    <div className="text-[10px] font-extrabold text-gray-500 uppercase tracking-wider">Overall Avg</div>
                    <div className="text-xl font-extrabold text-purple-900">
                      {avgDeliveryTimeMins > 0
                        ? `${Math.floor(avgDeliveryTimeMins / 60) > 0 ? `${Math.floor(avgDeliveryTimeMins / 60)}h ` : ''}${avgDeliveryTimeMins % 60}m`
                        : 'N/A'}
                    </div>
                  </div>
                  <div className="w-px h-8 bg-purple-200" />
                  <div>
                    <div className="text-[10px] font-extrabold text-gray-500 uppercase tracking-wider">Showing</div>
                    <div className="text-xl font-extrabold text-gray-900">Top {highDurationOrders.length}</div>
                  </div>
                </div>
              </div>

              {/* Table */}
              <div className="overflow-y-auto">
                {highDurationOrders.length === 0 ? (
                  <div className="p-10 text-center text-gray-400 text-sm font-medium">No completed orders with delivery time data yet.</div>
                ) : (
                  <table className="w-full text-xs text-left text-gray-600">
                    <thead className="bg-gray-50 text-gray-700 uppercase font-extrabold text-[10px] tracking-wider border-b border-gray-100 sticky top-0">
                      <tr>
                        <th className="py-3 px-5">#</th>
                        <th className="py-3 px-5">Order</th>
                        <th className="py-3 px-5">Customer / Helper</th>
                        <th className="py-3 px-5 text-right">Duration</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 font-medium">
                      {highDurationOrders.map((o, idx) => (
                        <tr
                          key={o.id}
                          className="hover:bg-purple-50/40 transition-colors cursor-pointer"
                          onClick={() => { setShowHighDurationModal(false); setSelectedOrderId(o.id); }}
                        >
                          <td className="py-3.5 px-5 font-extrabold text-gray-400">{idx + 1}</td>
                          <td className="py-3.5 px-5">
                            <div className="font-extrabold text-purple-900">#{o.id}</div>
                            <div className="text-[10px] text-gray-400">{new Date(o.deliveredAt!).toLocaleDateString()}</div>
                          </td>
                          <td className="py-3.5 px-5">
                            <div className="font-bold text-gray-900">{o.customerName}</div>
                            <div className="text-[11px] text-blue-700 font-bold">{o.helperName || '—'}</div>
                          </td>
                          <td className="py-3.5 px-5 text-right">
                            <span className={`font-extrabold text-sm ${o.durationMs >= 3600000 ? 'text-red-600' : 'text-amber-600'}`}>
                              {fmtDuration(o.durationMs)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* 5. Comprehensive User Details & History Modal */}
      {selectedUserId && (
        <UserDetailsModal
          userId={selectedUserId}
          onClose={() => setSelectedUserId(null)}
          onUserUpdated={() => setUsers(Array.from(fallbackStore.users.values()))}
        />
      )}

      {/* 6. Admin Custom Push Notification Modal */}
      {showPushNotificationModal && (
        <AdminPushNotificationModal
          onClose={() => setShowPushNotificationModal(false)}
        />
      )}

      {/* 7. Admin Helper Application Create/Edit Modals */}
      {(showAddAppModal || editingApp) && (
        <AdminHelperAppModal
          application={editingApp}
          users={users}
          onClose={() => {
            setShowAddAppModal(false);
            setEditingApp(null);
          }}
          onSaved={() => {
            setApplications(Array.from(fallbackStore.helperApplications.values()));
            setUsers(Array.from(fallbackStore.users.values()));
          }}
        />
      )}

      {/* 8. Add/Edit Shop Modal Overlay */}
      {showAddShopModal && (
        <AddShopModal
          shopToEdit={editingShop}
          onClose={() => {
            setShowAddShopModal(false);
            setEditingShop(null);
          }}
          onSaved={() => {
            setShops(Array.from(fallbackStore.shops.values()));
          }}
        />
      )}

      {/* 9. Create/Edit Dynamic Custom Modal Overlay */}
      {showCustomModalForm && (
        <AdminCustomModalFormModal
          modalToEdit={editingCustomModal}
          onClose={() => {
            setShowCustomModalForm(false);
            setEditingCustomModal(null);
          }}
          onSaved={() => {
            setCustomModals(Array.from(fallbackStore.customModals.values()));
          }}
        />
      )}

      {/* 10. Customer & Helper Fee Suggestions Paginated Custom Modal Overlay */}
      {showFeeSuggestionsModal && (() => {
        const totalItems = feeSuggestions.length;
        const totalPages = Math.ceil(totalItems / feeSuggestionsModalPageSize) || 1;
        const startIndex = (feeSuggestionsModalPage - 1) * feeSuggestionsModalPageSize;
        const paginatedSuggestions = feeSuggestions.slice(startIndex, startIndex + feeSuggestionsModalPageSize);

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
            <div className="bg-white rounded-3xl border border-gray-100 shadow-2xl max-w-4xl w-full p-6 space-y-4 max-h-[90vh] flex flex-col">
              {/* Header */}
              <div className="flex items-center justify-between border-b border-gray-100 pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-2xl bg-purple-100 text-purple-800">
                    <MessageSquare className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-base text-gray-900">
                      Customer & Helper Fee Suggestions (কাস্টমার ও হেলপার মতামত)
                    </h3>
                    <p className="text-xs text-gray-500 font-medium">
                      ফি সংক্রান্ত সমস্ত কাস্টমার ও হেলপার মতামত ও ফি ব্যাক প্রস্তাবনার তালিকা
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowFeeSuggestionsModal(false)}
                  className="p-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto space-y-4 pr-1">
                {paginatedSuggestions.length === 0 ? (
                  <div className="p-8 text-center text-xs text-gray-500 bg-gray-50 rounded-2xl">
                    কোনো প্রস্তাবনা বা মতামত পাওয়া যায়নি।
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white">
                    <table className="w-full text-left border-collapse text-xs min-w-[650px]">
                      <thead>
                        <tr className="bg-purple-900 text-white font-bold">
                          <th className="p-3.5">তারিখ</th>
                          <th className="p-3.5">ব্যবহারকারী</th>
                          <th className="p-3.5">রোল</th>
                          <th className="p-3.5">ক্যাটাগরি</th>
                          <th className="p-3.5">মতামত/পরামর্শ</th>
                          <th className="p-3.5 text-right">অ্যাকশন</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {paginatedSuggestions.map((sug) => (
                          <tr key={sug.id} className="hover:bg-gray-50/80 transition-colors">
                            <td className="p-3.5 whitespace-nowrap text-gray-500 font-medium">
                              {new Date(sug.createdAt).toLocaleDateString()}
                            </td>
                            <td className="p-3.5 font-bold text-gray-900">
                              {sug.userName}
                              {sug.userPhone && <span className="block text-[10px] text-gray-500 font-normal">{sug.userPhone}</span>}
                            </td>
                            <td className="p-3.5">
                              <span
                                className={`text-[10px] font-extrabold px-2.5 py-1 rounded-full ${
                                  sug.userRole === 'helper'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : 'bg-blue-100 text-blue-800'
                                }`}
                              >
                                {sug.userRole === 'helper' ? 'Helper' : 'Customer'}
                              </span>
                            </td>
                            <td className="p-3.5 font-semibold text-gray-700">{sug.category}</td>
                            <td className="p-3.5 text-gray-800 font-medium max-w-sm leading-relaxed whitespace-pre-line">{sug.message}</td>
                            <td className="p-3.5 text-right whitespace-nowrap">
                              <button
                                type="button"
                                onClick={async () => {
                                  const confirmed = await showConfirm(
                                    'মুছে ফেলার নিশ্চিতকরণ',
                                    'আপনি কি এই প্রস্তাবনাটি মুছে ফেলতে চান?',
                                    'হ্যাঁ, মুছুন',
                                    'বাতিল'
                                  );
                                  if (confirmed) {
                                    await fallbackStore.deleteFeeSuggestion(sug.id);
                                    setFeeSuggestions(Array.from(fallbackStore.feeSuggestions.values()));
                                  }
                                }}
                                className="p-2 rounded-xl bg-red-50 hover:bg-red-100 text-red-600 transition-colors"
                                title="Delete suggestion"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Modal Pagination Footer */}
              <div className="border-t border-gray-100 pt-3 flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="text-xs text-gray-500 font-semibold">
                  Showing {Math.min(startIndex + 1, totalItems)} to {Math.min(startIndex + feeSuggestionsModalPageSize, totalItems)} of {totalItems} entries
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    disabled={feeSuggestionsModalPage <= 1}
                    onClick={() => setFeeSuggestionsModalPage((p) => Math.max(1, p - 1))}
                    className="px-3 py-1.5 rounded-xl border border-gray-200 text-xs font-bold text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                  >
                    Previous
                  </button>
                  <span className="text-xs font-extrabold text-gray-800 px-2">
                    {feeSuggestionsModalPage} / {totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={feeSuggestionsModalPage >= totalPages}
                    onClick={() => setFeeSuggestionsModalPage((p) => Math.min(totalPages, p + 1))}
                    className="px-3 py-1.5 rounded-xl border border-gray-200 text-xs font-bold text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                  >
                    Next
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowFeeSuggestionsModal(false)}
                    className="ml-2 px-4 py-1.5 rounded-xl bg-purple-900 hover:bg-purple-950 text-white text-xs font-bold transition-all"
                  >
                    বন্ধ করুন
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {selectedShopDetails && (
        <AdminShopDetailsModal
          shop={selectedShopDetails}
          onClose={() => setSelectedShopDetails(null)}
          onEdit={(s) => {
            setEditingShop(s);
            setShowAddShopModal(true);
          }}
          onDeleted={() => {
            setShops(Array.from(fallbackStore.shops.values()));
            setSelectedShopDetails(null);
          }}
        />
      )}

      {selectedStoreApp && (
        <AdminStoreAppDetailsModal
          application={selectedStoreApp}
          onClose={() => setSelectedStoreApp(null)}
          onSaved={() => {
            setStoreApplications(Array.from(fallbackStore.storeApplications.values()));
            setUsers(Array.from(fallbackStore.users.values()));
            setShops(Array.from(fallbackStore.shops.values()));
            setSelectedStoreApp(null);
          }}
        />
      )}
    </div>
  );
};

