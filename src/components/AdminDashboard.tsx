'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Order, HelperApplication, StoreApplication, WithdrawalRequest, PricingSettings, UserProfile, Shop, OrderFeedback, AdminCustomModalConfig, FeeSuggestion, AllowedAreaPolygon, AppNotification, RewardClaim } from '@/types';
import { fallbackStore, db, versionOf } from '@/lib/firebase';
import { createUserOrderStats, sortByDate } from '@/lib/adminMetrics';
import { collection, query, where, orderBy, limit, sum } from 'firebase/firestore';
import { getDocs, getCountFromServer, getAggregateFromServer } from '@/lib/firestoreMetered';
import { useModal } from './CustomModal';
import { getOrderAcceptanceDurationText, getElapsedTime, getDeliveryDurationText, formatDurationMinutes } from '@/lib/timeUtils';
import { AreaDrawerModal } from './admin/AreaDrawerModal';
import { ApproveHelperModal } from './admin/ApproveHelperModal';
import {
  isOrderInZone,
  isOrderInAnyZone,
  isHelperInZone,
  isHelperInAnyZone,
  isAdminInZone,
  isAdminInAnyZone,
  isUserInZoneScope,
  getAreasForPoint,
} from '@/lib/geofenceUtils';
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
  Power,
  ArrowUpRight,
  ArrowRight,
  Sparkles,
  Bike,
  Clock,
  MapPin,
  RefreshCw,
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Filter,
  User,
  ChevronRight,
  UserCheck,
  Phone,
  Ban,
  Lock,
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
  Timer,
  Zap,
  Gift,
  Coins,
  Share2,
  Square,
  ThumbsUp,
  ThumbsDown,
  Send,
  Compass,
  ExternalLink,
  Package,
  Copy,
  CheckSquare,
  Image as ImageIcon,
  Upload,
  ChevronDown,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { PaginationControl } from './admin/PaginationControl';
import { AdminOrderDetailsModal } from './admin/AdminOrderDetailsModal';
import { AssignHelperModal } from './admin/AssignHelperModal';
import { CustomerHistoryModal } from './admin/CustomerHistoryModal';
import { HelperHistoryModal } from './admin/HelperHistoryModal';
import { AdminExportHelperModal } from './admin/AdminExportHelperModal';
import { UserDetailsModal } from './admin/UserDetailsModal';
import { RevenueAnalytics } from './admin/RevenueAnalytics';
import { GrowthAnalytics } from './admin/GrowthAnalytics';
import { AdminPushNotificationModal } from './admin/AdminPushNotificationModal';
import { AdminHelperAppModal } from './admin/AdminHelperAppModal';
import { TimePickerInput } from './admin/TimePickerInput';
import { AdminHelperMapView } from './admin/AdminHelperMapView';
import { DraggableTabsContainer } from './admin/DraggableTabsContainer';
import { AddShopModal } from './AddShopModal';
import { UserActionDropdown } from './admin/UserActionDropdown';
import { ShopActionDropdown } from './admin/ShopActionDropdown';
import { AdminCustomModalFormModal } from './admin/AdminCustomModalFormModal';
import { AdminStoreOrderDetailsModal } from './admin/AdminStoreOrderDetailsModal';
import { AdminShopMapView } from './admin/AdminShopMapView';
import { AdminShopDetailsModal } from './admin/AdminShopDetailsModal';
import { AdminStoreAppDetailsModal } from './admin/AdminStoreAppDetailsModal';
import { AdminStoreDisbursementModal } from './admin/AdminStoreDisbursementModal';
import { AdminNotificationHistory } from './admin/AdminNotificationHistory';
import { AdminRewardsManager } from './admin/AdminRewardsManager';
import { AdminAddressesManager } from './admin/AdminAddressesManager';
import { StoreProductManager } from './StoreProductManager';
import { AdminStoreItemsModal } from './admin/AdminStoreItemsModal';
import { AdminCategoriesManager } from './admin/AdminCategoriesManager';
import { OrderFeedbackAnalytics } from './admin/OrderFeedbackAnalytics';
import { AdminBlockModal } from './admin/AdminBlockModal';
import { BlockedUserModal } from './BlockedUserModal';
import { AsyncButton } from './ui/AsyncButton';
import { AdminDateRangeFilter } from './admin/AdminDateRangeFilter';
import { LifetimeDataNotice } from './admin/LifetimeDataNotice';
import { useAdminLifetimeData } from '@/hooks/useAdminLifetimeData';
import { AdminDateRange, rangeForPreset, rangeBoundsIso, isInRange, describeRange } from '@/lib/adminDateRange';
import { DEFAULT_SERVICES, DEFAULT_STORE_TYPES, parseStoreTypes, getStoreTypesForService, calculateHelperCommission } from '@/lib/pricing';
import {
  exportUsersToCSV,
  exportUsersToPDF,
  exportOrdersToCSV,
  exportOrdersToPDF,
  exportShopOrdersToCSV,
  exportShopOrdersToPDF,
  exportFeedbackToCSV,
  exportFeedbackToPDF,
} from '@/lib/exportUtils';
import { ShopOrder } from '@/types';

interface AdminDashboardProps {
  initialSelectedOrderId?: string | null;
  onClearInitialOrder?: () => void;
}

type AssignItemOverride = { name: string; price: string; photoUrl: string; category: string; };

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  initialSelectedOrderId,
  onClearInitialOrder,
}) => {
  const { user: currentUser } = useAuth();
  const isSuperAdmin = currentUser?.isSuperAdmin === true;
  const isAdmin = currentUser?.isAdmin === true;
  const isNormalAdmin = isAdmin && !isSuperAdmin;
  const { showAlert, showConfirm } = useModal();
  const [activeTab, setActiveTab] = useState<
    'EXCEPTIONS' | 'ORDERS' | 'STORE_ORDERS' | 'USERS_LIST' | 'REVENUE' | 'GROWTH' | 'HELPERS' | 'WITHDRAWALS' | 'SHOPS' | 'FEEDBACK' | 'CUSTOM_MODALS' | 'NOTIFICATIONS' | 'PRICING' | 'SETTINGS' | 'REWARDS' | 'ADDRESSES'
  >('EXCEPTIONS');
  const [helperSubView, setHelperSubView] = useState<'MAP' | 'AREAS' | 'APPLICATIONS' | 'TABLE'>('TABLE');
  const [shopSubView, setShopSubView] = useState<'MAP' | 'TABLE' | 'APPLICATIONS' | 'ITEMS' | 'CATEGORIES'>('TABLE');
  const [shopsSortField, setShopsSortField] = useState<'UNPAID' | 'SALES' | 'COMMISSION' | 'ORDERS' | 'NAME' | 'TYPE' | 'DATE' | 'FEATURED'>('UNPAID');
  const [shopsSortDirection, setShopsSortDirection] = useState<'ASC' | 'DESC'>('DESC');
  const [selectedShopDetails, setSelectedShopDetails] = useState<Shop | null>(null);
  const [selectedStoreApp, setSelectedStoreApp] = useState<import('@/types').StoreApplication | null>(null);
  const [disbursingShop, setDisbursingShop] = useState<Shop | null>(null);
  const [managingItemsShop, setManagingItemsShop] = useState<Shop | null>(null);
  const [selectedShopForItems, setSelectedShopForItems] = useState<string>('ALL');
  const [allStoreProducts, setAllStoreProducts] = useState<import('@/types').StoreProduct[]>([]);
  const [adminItemsSearchQuery, setAdminItemsSearchQuery] = useState<string>('');
  const [adminItemsCategoryFilter, setAdminItemsCategoryFilter] = useState<string>('ALL');
  const [adminItemsStockFilter, setAdminItemsStockFilter] = useState<'ALL' | 'IN_STOCK' | 'OUT_OF_STOCK'>('ALL');
  const [adminItemsStoreFilter, setAdminItemsStoreFilter] = useState<string>('ALL');
  const [adminItemsViewMode, setAdminItemsViewMode] = useState<'TABLE' | 'STORES'>('TABLE');
  const [adminItemsPage, setAdminItemsPage] = useState<number>(1);
  const [adminItemsPageSize, setAdminItemsPageSize] = useState<number>(20);
  // Multi-select & assign-to-store
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set());
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [assignTargetStoreId, setAssignTargetStoreId] = useState('');
  const [assignItemOverrides, setAssignItemOverrides] = useState<Record<string, AssignItemOverride>>({});
  const [assignSubmitting, setAssignSubmitting] = useState(false);

  const [orders, setOrders] = useState<Order[]>([]);
  const [allOrders, setAllOrders] = useState<Order[]>([]);
  const [shopOrders, setShopOrders] = useState<ShopOrder[]>([]);
  const [storeOrdersSearchQuery, setStoreOrdersSearchQuery] = useState<string>('');
  const [storeOrdersAppliedSearchQuery, setStoreOrdersAppliedSearchQuery] = useState<string>('');
  const [storeOrdersStatusFilter, setStoreOrdersStatusFilter] = useState<string>('ALL');
  const [storeOrdersShopFilter, setStoreOrdersShopFilter] = useState<string>('ALL');
  const [storeOrdersHelperFilter, setStoreOrdersHelperFilter] = useState<string>('ALL');
  const [storeOrdersSortBy, setStoreOrdersSortBy] = useState<'NEWEST' | 'OLDEST' | 'PRICE_HIGH' | 'PRICE_LOW'>('NEWEST');
  const [selectedStoreOrderIds, setSelectedStoreOrderIds] = useState<string[]>([]);
  const [isDeletingStoreOrders, setIsDeletingStoreOrders] = useState<boolean>(false);
  const [selectedShopOrderId, setSelectedShopOrderId] = useState<string | null>(null);
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
  const [exactTotalOrders, setExactTotalOrders] = useState<number | null>(null);
  const [exactTotalDeliveryFees, setExactTotalDeliveryFees] = useState<number | null>(null);
  const [exactTotalProductCosts, setExactTotalProductCosts] = useState<number | null>(null);
  const [exactTotalCollection, setExactTotalCollection] = useState<number | null>(null);
  const [exactCustomerAccounts, setExactCustomerAccounts] = useState<number | null>(null);
  const [exactActiveHelpers, setExactActiveHelpers] = useState<number | null>(null);
  const [exactShopsCount, setExactShopsCount] = useState<number | null>(null);
  const [exactFeedbacksCount, setExactFeedbacksCount] = useState<number | null>(null);
  const [exactCustomModalsCount, setExactCustomModalsCount] = useState<number | null>(null);
  const [exactWithdrawalsCount, setExactWithdrawalsCount] = useState<number | null>(null);
  const [serverAvgDeliveryTimeMins, setServerAvgDeliveryTimeMins] = useState<number | null>(null);
  const [serverAvgAcceptanceTimeMins, setServerAvgAcceptanceTimeMins] = useState<number | null>(null);

  const [showAddShopModal, setShowAddShopModal] = useState<boolean>(false);
  const [editingShop, setEditingShop] = useState<Shop | null>(null);
  const [adminProductShop, setAdminProductShop] = useState<Shop | null>(null);

  const [showCustomModalForm, setShowCustomModalForm] = useState<boolean>(false);
  const [editingCustomModal, setEditingCustomModal] = useState<AdminCustomModalConfig | null>(null);

  const [placeholdersText, setPlaceholdersText] = useState<string>('');
  const [confirmationMsg, setConfirmationMsg] = useState<string>('');
  const [servicesText, setServicesText] = useState<string>('');
  // Single-box format: "ServiceName = placeholder text" (one per line)
  const [serviceHintsText, setServiceHintsText] = useState<string>('');
  const [eduEmailDomainsText, setEduEmailDomainsText] = useState<string>('@diu.edu.bd');
  const [dedicatedDelayMins, setDedicatedDelayMins] = useState<number | string>(7);
  const [receiverRule, setReceiverRule] = useState<'commuter_first' | 'dedicated_first' | 'both_simultaneous'>('commuter_first');
  const [allowedHelperTypes, setAllowedHelperTypes] = useState<'dedicated_only' | 'commuters_only' | 'both'>('both');
  const [helperRadiusKm, setHelperRadiusKm] = useState<number | string>(3.5);
  const [mapLocationPref, setMapLocationPref] = useState<'BD' | 'GLOBAL' | 'CUSTOM'>('BD');
  const [customCountryCode, setCustomCountryCode] = useState<string>('bd');

  // Geofencing Serving Areas
  const [allowedDeliveryAreasEnabled, setAllowedDeliveryAreasEnabled] = useState<boolean>(false);
  const [allowedDeliveryAreas, setAllowedDeliveryAreas] = useState<AllowedAreaPolygon[]>([]);
  const [outOfServiceAreaMessage, setOutOfServiceAreaMessage] = useState<string>('');
  const [showAreaDrawerModal, setShowAreaDrawerModal] = useState<boolean>(false);
  const [editingArea, setEditingArea] = useState<AllowedAreaPolygon | null>(null);

  // Zone scoping for Admins & Helper approvals
  const [selectedZoneFilter, setSelectedZoneFilter] = useState<string>(
    fallbackStore.adminZoneFilter || 'ALL'
  );
  const [approvingHelperApp, setApprovingHelperApp] = useState<HelperApplication | null>(null);

  const adminAssignedAreaIds = useMemo(() => {
    const directList = currentUser?.assignedAreaIds || (currentUser?.areaId ? [currentUser.areaId] : (currentUser as any)?.areaIds || []);
    const fleetList = allowedDeliveryAreas
      .filter((a) => a.assignedAdminIds?.includes(currentUser?.uid || ''))
      .map((a) => a.id);
    const combined = Array.from(new Set([...directList, ...fleetList])).filter(Boolean);
    return combined;
  }, [currentUser?.assignedAreaIds, currentUser?.areaId, (currentUser as any)?.areaIds, currentUser?.uid, allowedDeliveryAreas]);

  const assignedZoneNames = useMemo(() => {
    if (!adminAssignedAreaIds || adminAssignedAreaIds.length === 0) return '';
    const names = adminAssignedAreaIds
      .map((id) => allowedDeliveryAreas.find((a) => a.id === id)?.name || id)
      .filter(Boolean);
    return names.join(', ');
  }, [adminAssignedAreaIds, allowedDeliveryAreas]);

  // Sync / set default zone filter for non-super admins or listen to store
  useEffect(() => {
    if (!isSuperAdmin) {
      if (adminAssignedAreaIds.length === 1) {
        setSelectedZoneFilter(adminAssignedAreaIds[0]);
      } else if (adminAssignedAreaIds.length > 1) {
        if (selectedZoneFilter !== 'ALL' && !adminAssignedAreaIds.includes(selectedZoneFilter)) {
          setSelectedZoneFilter(adminAssignedAreaIds[0]);
        }
      }
    } else {
      const syncFromStore = () => {
        if (fallbackStore.adminZoneFilter && fallbackStore.adminZoneFilter !== selectedZoneFilter) {
          setSelectedZoneFilter(fallbackStore.adminZoneFilter);
        }
      };
      const unsub = fallbackStore.subscribe(syncFromStore);
      return () => unsub();
    }
  }, [isSuperAdmin, adminAssignedAreaIds, selectedZoneFilter]);

  // Effective active zone IDs to filter data by
  const targetZoneIds = useMemo(() => {
    if (isSuperAdmin) {
      if (selectedZoneFilter === 'ALL') return null; // view all zones
      return [selectedZoneFilter];
    }
    // For regular admins: strictly their assigned zones only, cannot change
    return adminAssignedAreaIds;
  }, [isSuperAdmin, selectedZoneFilter, adminAssignedAreaIds]);

  const isZoneFiltered = targetZoneIds !== null;

  // Payback instructions & Store types
  const [bkashInstructions, setBkashInstructions] = useState<string>('');
  const [nagadInstructions, setNagadInstructions] = useState<string>('');
  const [rocketInstructions, setRocketInstructions] = useState<string>('');
  const [bankInstructions, setBankInstructions] = useState<string>('');
  const [cashInstructions, setCashInstructions] = useState<string>('');
  const [storeTypesText, setStoreTypesText] = useState<string>('');
  const [serviceStoreTypeMap, setServiceStoreTypeMap] = useState<Record<string, string[]>>({});
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
  const [pwaInstallPromptEnabled, setPwaInstallPromptEnabled] = useState<boolean>(true);
  const [manualAuthEnabled, setManualAuthEnabled] = useState<boolean>(fallbackStore.pricingSettings?.manualAuthEnabled === true);
  const [pwaInstallPromptTitle, setPwaInstallPromptTitle] = useState<string>('Install Jamanot App');
  const [pwaInstallPromptDescription, setPwaInstallPromptDescription] = useState<string>('আরও দ্রুত আপডেট, ভালো সার্ভিস এবং লাইভ ট্র্যাকিংয়ের জন্য আপনার ফোনে জামানত অ্যাপ ইনস্টল করুন!');
  const [pwaInstallButtonText, setPwaInstallButtonText] = useState<string>('Install Jamanot');

  // In-App Browser (Facebook/Messenger) Prompt Admin Controls
  const [inAppBrowserPromptEnabled, setInAppBrowserPromptEnabled] = useState<boolean>(true);
  const [inAppBrowserPromptTitle, setInAppBrowserPromptTitle] = useState<string>('ব্রাউজারে ওপেন করুন');
  const [inAppBrowserPromptSubtitle, setInAppBrowserPromptSubtitle] = useState<string>('Open in Chrome or Safari');
  const [inAppBrowserPromptMessage, setInAppBrowserPromptMessage] = useState<string>(
    'লগইন ও নির্ভুল সেবার জন্য ওয়েবসাইটটি Chrome বা Safari ব্রাউজারে ওপেন করুন।'
  );

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
  const [mapPickerPickupPlaceholder, setMapPickerPickupPlaceholder] = useState<string>('যেমন: আরিফ স্টোর, আশুলিয়া বাজার.');
  const [mapPickerDeliveryPlaceholder, setMapPickerDeliveryPlaceholder] = useState<string>('যেমন: ৪এ, রহমান ভিলা, মডেল টাউন.');
  const [mapPickerAddressRequiredMessage, setMapPickerAddressRequiredMessage] = useState<string>('অনুগ্রহ করে নিচের বাক্সে বিস্তারিত ঠিকানা ম্যানুয়ালি লিখুন। এটি একটি বাধ্যতামূলক ফিল্ড।');
  const [noSavePickupServicesText, setNoSavePickupServicesText] = useState<string>('মিক্স কিছু কাজ করে দিন\nনা, অন্য একটা কাজ করে দিন\nআমার একটা জিনিস দিয়ে আসুন');

  // Helper Sidebar Mode option visibility
  const [showBecomeHelper, setShowBecomeHelper] = useState<boolean>(false);

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

  // Home Banner Slider & Search Not Found Message Admin States
  const [adminSlides, setAdminSlides] = useState<Array<{
    id?: string;
    title?: string;
    subtitle?: string;
    imageUrl?: string;
    hint?: string;
    link?: string;
  }>>([]);
  const [newSlideTitle, setNewSlideTitle] = useState<string>('');
  const [newSlideSubtitle, setNewSlideSubtitle] = useState<string>('');
  const [newSlideImageUrl, setNewSlideImageUrl] = useState<string>('');
  const [newSlideLink, setNewSlideLink] = useState<string>('');
  const [isUploadingSlideImage, setIsUploadingSlideImage] = useState<boolean>(false);
  const [searchNotFoundMsg, setSearchNotFoundMsg] = useState<string>('');

  const handleSlideImageFileChange = (file: File) => {
    setIsUploadingSlideImage(true);
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = document.createElement('img');
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 1200;
        const MAX_HEIGHT = 600;
        let width = img.width;
        let height = img.height;
        if (width > height) {
          if (width > MAX_WIDTH) {
            height = Math.round((height * MAX_WIDTH) / width);
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width = Math.round((width * MAX_HEIGHT) / height);
            height = MAX_HEIGHT;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
          setNewSlideImageUrl(dataUrl);
        } else {
          setNewSlideImageUrl(e.target?.result as string);
        }
        setIsUploadingSlideImage(false);
      };
      img.onerror = () => {
        setIsUploadingSlideImage(false);
      };
      img.src = e.target?.result as string;
    };
    reader.onerror = () => {
      setIsUploadingSlideImage(false);
    };
    reader.readAsDataURL(file);
  };

  const handleAddSlide = () => {
    if (!newSlideImageUrl.trim()) {
      showAlert('ছবি প্রয়োজন', 'অনুগ্রহ করে ব্যানার ছবি আপলোড করুন বা ছবির URL প্রদান করুন।', 'error');
      return;
    }
    const newSlide = {
      id: `slide_${Date.now()}`,
      title: newSlideTitle.trim() || undefined,
      subtitle: newSlideSubtitle.trim() || undefined,
      imageUrl: newSlideImageUrl.trim(),
      link: newSlideLink.trim() || undefined,
    };
    setAdminSlides((prev) => [...prev, newSlide]);
    setNewSlideTitle('');
    setNewSlideSubtitle('');
    setNewSlideImageUrl('');
    setNewSlideLink('');
  };

  const handleDeleteSlide = (index: number) => {
    setAdminSlides((prev) => prev.filter((_, idx) => idx !== index));
  };

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
  const [pricingFeeSuggestionsPage, setPricingFeeSuggestionsPage] = useState<number>(1);
  const [pricingFeeSuggestionsPageSize, setPricingFeeSuggestionsPageSize] = useState<number>(5);

  // Custom Store Pricing Admin States
  const [customStorePricingEnabled, setCustomStorePricingEnabled] = useState<boolean>(
    fallbackStore.pricingSettings?.customStorePricingEnabled === true
  );
  const [customStorePricingAmount, setCustomStorePricingAmount] = useState<number | string>(
    fallbackStore.pricingSettings?.customStorePricingAmount ?? 15
  );
  const [referralRewardCoins, setReferralRewardCoins] = useState<number | string>(
    fallbackStore.pricingSettings?.referralRewardCoins ?? 20
  );
  const [referredUserRewardCoins, setReferredUserRewardCoins] = useState<number | string>(
    fallbackStore.pricingSettings?.referredUserRewardCoins ?? 10
  );
  const [referredUserRewardOrderLimit, setReferredUserRewardOrderLimit] = useState<number | string>(
    fallbackStore.pricingSettings?.referredUserRewardOrderLimit ?? 1
  );
  const [referralMessageTemplate, setReferralMessageTemplate] = useState<string>(
    fallbackStore.pricingSettings?.referralMessageTemplate ??
      'আসসালামু আলাইকুম! জামানত (Jamanot) দিয়ে সহজে বাজার-সদাই ও প্রয়োজনীয় ডেলিভারি নিন। এখনই এই লিঙ্কে গিয়ে অর্ডার করুন: {link}'
  );

  // Modals state
  const [showPushNotificationModal, setShowPushNotificationModal] = useState<boolean>(false);
  const [editingNotification, setEditingNotification] = useState<AppNotification | null>(null);
  const [duplicateNotification, setDuplicateNotification] = useState<AppNotification | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [assignHelperOrder, setAssignHelperOrder] = useState<Order | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<{ id: string; name: string; phone?: string } | null>(null);
  const [selectedHelper, setSelectedHelper] = useState<{ id: string; name: string } | null>(null);
  const [showExportHelperModal, setShowExportHelperModal] = useState<boolean>(false);
  const [exportHelperTargetId, setExportHelperTargetId] = useState<string | null>(null);

  // Block User / Helper / Store with Admin Note Modal state
  const [blockTarget, setBlockTarget] = useState<{
    id: string;
    name: string;
    type: 'Customer' | 'Helper' | 'Store' | 'User';
  } | null>(null);

  // Blocked User Custom Modal Admin Configuration States
  const [blockedUserModalTitle, setBlockedUserModalTitle] = useState<string>(
    fallbackStore.pricingSettings?.blockedUserModalTitle || 'অ্যাকাউন্ট সাময়িকভাবে স্থগিত (Account Suspended)'
  );
  const [blockedUserModalSubtitle, setBlockedUserModalSubtitle] = useState<string>(
    fallbackStore.pricingSettings?.blockedUserModalSubtitle || 'আপনার অ্যাকাউন্টটি সাময়িকভাবে সীমাবদ্ধ করা হয়েছে'
  );
  const [blockedUserModalMessage, setBlockedUserModalMessage] = useState<string>(
    fallbackStore.pricingSettings?.blockedUserModalMessage ||
    'নিরাপত্তা বা নীতিমালা ভঙ্গের কারণে আপনার অ্যাকাউন্টটি সাময়িকভাবে স্থগিত করা হয়েছে। এই মুহূর্তে নতুন সার্ভিস রিকোয়েস্ট তৈরি বা নতুন অর্ডার গ্রহণ করা যাবে না। বিস্তারিত তথ্য বা সহায়তার জন্য অনুগ্রহ করে অ্যাডমিন বা সাপোর্টে যোগাযোগ করুন।'
  );
  const [blockedUserModalButtonText, setBlockedUserModalButtonText] = useState<string>(
    fallbackStore.pricingSettings?.blockedUserModalButtonText || 'সাপোর্টে যোগাযোগ করুন (Contact Support)'
  );
  const [blockedUserModalContactUrl, setBlockedUserModalContactUrl] = useState<string>(
    fallbackStore.pricingSettings?.blockedUserModalContactUrl || 'https://wa.me/8801800000000'
  );
  const [showBlockedUserModalPreview, setShowBlockedUserModalPreview] = useState<boolean>(false);

  // Quick User Coin Balance Editing state
  const [editingCoinsUser, setEditingCoinsUser] = useState<UserProfile | null>(null);
  const [coinsInputValue, setCoinsInputValue] = useState<number>(0);
  const [coinsReasonValue, setCoinsReasonValue] = useState<string>('');
  const [savingCoinsState, setSavingCoinsState] = useState<boolean>(false);

  const handleOpenEditCoins = (targetUser: UserProfile) => {
    setEditingCoinsUser(targetUser);
    setCoinsInputValue(targetUser.coins || 0);
    setCoinsReasonValue('');
  };

  const handleSaveCoinsModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCoinsUser) return;

    try {
      setSavingCoinsState(true);
      const targetCoins = Math.max(0, Math.floor(Number(coinsInputValue) || 0));
      await fallbackStore.updateUserCoins(
        editingCoinsUser.uid,
        targetCoins,
        coinsReasonValue.trim() || undefined
      );
      setUsers((prev) =>
        prev.map((u) => (u.uid === editingCoinsUser.uid ? { ...u, coins: targetCoins } : u))
      );
      showAlert(
        'কয়েন আপডেট সফল',
        `${editingCoinsUser.displayName}-এর কয়েন ব্যালেন্স সফলভাবে ${targetCoins} কয়েনে আপডেট করা হয়েছে!`,
        'success'
      );
      setEditingCoinsUser(null);
    } catch (err: any) {
      console.error('Error updating user coins from admin dashboard:', err);
      showAlert('ত্রুটি', 'কয়েন ব্যালেন্স আপডেট করতে ব্যর্থ হয়েছে।', 'error');
    } finally {
      setSavingCoinsState(false);
    }
  };

  // Multi-select state for bulk deletion of orders
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  const [isDeletingOrders, setIsDeletingOrders] = useState<boolean>(false);

  const handleToggleSelectOrder = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedOrderIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleToggleSelectAllOrders = (currentList: Order[]) => {
    const currentIds = currentList.map((o) => o.id);
    const allSelected = currentIds.every((id) => selectedOrderIds.includes(id));
    if (allSelected) {
      setSelectedOrderIds((prev) => prev.filter((id) => !currentIds.includes(id)));
    } else {
      setSelectedOrderIds((prev) => Array.from(new Set([...prev, ...currentIds])));
    }
  };

  const handleToggleSelectStoreOrder = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedStoreOrderIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleToggleSelectAllStoreOrders = (currentList: ShopOrder[]) => {
    const currentIds = currentList.map((so) => so.id);
    const allSelected = currentIds.every((id) => selectedStoreOrderIds.includes(id));
    if (allSelected) {
      setSelectedStoreOrderIds((prev) => prev.filter((id) => !currentIds.includes(id)));
    } else {
      setSelectedStoreOrderIds((prev) => Array.from(new Set([...prev, ...currentIds])));
    }
  };

  const handleBulkDeleteStoreOrders = async () => {
    if (selectedStoreOrderIds.length === 0) return;
    const isConfirmed = await showConfirm(
      'ডিলিট নিশ্চিতকরণ (Batch Delete Store Orders)',
      `আপনি কি নিশ্চিত যে নির্বাচিত ${selectedStoreOrderIds.length}টি স্টোর অর্ডার স্থায়ীভাবে ডিলিট করতে চান?`,
      'হ্যাঁ, ডিলিট করুন',
      'বাতিল'
    );
    if (!isConfirmed) return;

    setIsDeletingStoreOrders(true);
    try {
      await fallbackStore.deleteShopOrdersBulk(selectedStoreOrderIds);
      setShopOrders((prev) => prev.filter((so) => !selectedStoreOrderIds.includes(so.id)));
      setSelectedStoreOrderIds([]);
      await showAlert('সফল', `${selectedStoreOrderIds.length}টি স্টোর অর্ডার সফলভাবে ডিলিট করা হয়েছে।`, 'success');
    } catch (err: any) {
      showAlert('ত্রুটি', `স্টোর অর্ডার ডিলিট করতে সমস্যা হয়েছে: ${err?.message || err}`, 'error');
    } finally {
      setIsDeletingStoreOrders(false);
    }
  };

  const handleBulkDeleteOrders = async () => {
    if (selectedOrderIds.length === 0) return;
    const isConfirmed = await showConfirm(
      'ডিলিট নিশ্চিতকরণ (Batch Delete)',
      `আপনি কি নিশ্চিত যে নির্বাচিত ${selectedOrderIds.length}টি অর্ডার স্থায়ীভাবে ডিলিট করতে চান?`,
      'হ্যাঁ, ডিলিট করুন',
      'বাতিল'
    );
    if (!isConfirmed) return;

    setIsDeletingOrders(true);
    try {
      for (const id of selectedOrderIds) {
        await fallbackStore.deleteOrder(id);
      }
      setOrders((prev) => prev.filter((o) => !selectedOrderIds.includes(o.id)));
      setAllOrders((prev) => prev.filter((o) => !selectedOrderIds.includes(o.id)));
      if (serverOrders) {
        setServerOrders((prev) => (prev ? prev.filter((o) => !selectedOrderIds.includes(o.id)) : null));
      }
      setSelectedOrderIds([]);
      await showAlert('সফল', `${selectedOrderIds.length}টি অর্ডার সফলভাবে ডিলিট করা হয়েছে।`, 'success');
    } catch (err: any) {
      showAlert('ত্রুটি', `অর্ডার ডিলিট করতে সমস্যা হয়েছে: ${err?.message || err}`, 'error');
    } finally {
      setIsDeletingOrders(false);
    }
  };

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
  const [ordersSearchQuery, setOrdersSearchQuery] = useState('');
  const [ordersAppliedSearchQuery, setOrdersAppliedSearchQuery] = useState('');
  const [usersSearchQuery, setUsersSearchQuery] = useState('');
  const [usersAppliedSearchQuery, setUsersAppliedSearchQuery] = useState('');
  const [helpersSearchQuery, setHelpersSearchQuery] = useState('');
  const [helpersAppliedSearchQuery, setHelpersAppliedSearchQuery] = useState('');
  const [withdrawalsSearchQuery, setWithdrawalsSearchQuery] = useState('');
  const [withdrawalsAppliedSearchQuery, setWithdrawalsAppliedSearchQuery] = useState('');
  const [shopsSearchQuery, setShopsSearchQuery] = useState('');
  const [shopsAppliedSearchQuery, setShopsAppliedSearchQuery] = useState('');
  const [feedbackSearchQuery, setFeedbackSearchQuery] = useState('');
  const [feedbackAppliedSearchQuery, setFeedbackAppliedSearchQuery] = useState('');
  const [customModalsSearchQuery, setCustomModalsSearchQuery] = useState('');
  const [customModalsAppliedSearchQuery, setCustomModalsAppliedSearchQuery] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [appliedSearchQuery, setAppliedSearchQuery] = useState('');
  const [serverOrders, setServerOrders] = useState<Order[] | null>(null);
  const [serverUsers, setServerUsers] = useState<UserProfile[] | null>(null);
  const [serverShops, setServerShops] = useState<Shop[] | null>(null);
  const [serverWithdrawals, setServerWithdrawals] = useState<WithdrawalRequest[] | null>(null);
  const [serverFeedbacks, setServerFeedbacks] = useState<OrderFeedback[] | null>(null);
  const [serverCustomModals, setServerCustomModals] = useState<AdminCustomModalConfig[] | null>(null);
  const [isFetchingServer, setIsFetchingServer] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);
  const [shopsCategoryFilter, setShopsCategoryFilter] = useState<string>('ALL');
  const [shopsFeaturedFilter, setShopsFeaturedFilter] = useState<'ALL' | 'FEATURED' | 'NOT_FEATURED'>('ALL');
  const [shopsActiveFilter, setShopsActiveFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  const [shopsApprovalFilter, setShopsApprovalFilter] = useState<'ALL' | 'Approved' | 'Pending' | 'Rejected'>('ALL');
  const [usersCoinsFilter, setUsersCoinsFilter] = useState<string>('ALL');
  const [usersMinCoins, setUsersMinCoins] = useState<string>('');
  const [usersMaxCoins, setUsersMaxCoins] = useState<string>('');
  const [usersSortByCoins, setUsersSortByCoins] = useState<'NONE' | 'HIGH_TO_LOW' | 'LOW_TO_HIGH'>('NONE');
  const [usersSortColumn, setUsersSortColumn] = useState<'NAME' | 'ROLE' | 'COINS' | 'ORDERS' | 'ACTIVITY' | 'SEGMENTS' | 'STATUS' | 'DATE' | null>(null);
  const [usersSortDirection, setUsersSortDirection] = useState<'asc' | 'desc'>('desc');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [withdrawalStatusFilter, setWithdrawalStatusFilter] = useState<string>('ALL');
  const [withdrawalTypeFilter, setWithdrawalTypeFilter] = useState<string>('ALL');
  const [sortBy, setSortBy] = useState<'NEWEST' | 'OLDEST' | 'FEE_HIGH' | 'FEE_LOW' | 'ORDERS_HIGH' | 'SPENT_HIGH'>('NEWEST');
  const [ordersHelperFilter, setOrdersHelperFilter] = useState<string>('ALL');
  const [feedbackSortColumn, setFeedbackSortColumn] = useState<string>('createdAt');
  const [feedbackSortDirection, setFeedbackSortDirection] = useState<'asc' | 'desc'>('desc');
  const [replyingToFeedbackId, setReplyingToFeedbackId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState<string>('');
  const [replyShowUntil, setReplyShowUntil] = useState<string>('');
  const [replyShowFrom, setReplyShowFrom] = useState<string>('');
  const [savingReply, setSavingReply] = useState<boolean>(false);
  const [fleetSortColumn, setFleetSortColumn] = useState<string | null>(null);
  const [fleetSortDirection, setFleetSortDirection] = useState<'asc' | 'desc'>('asc');
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
  const [excRewardClaimPage, setExcRewardClaimPage] = useState(1);
  const [excRewardClaimPageSize, setExcRewardClaimPageSize] = useState(10);
  const [excBadFeedbackPage, setExcBadFeedbackPage] = useState(1);
  const [excBadFeedbackPageSize, setExcBadFeedbackPageSize] = useState(10);

  // The days the order lists (Orders, Store Orders) and the work-hours card
  // cover. Only those days are read from the server; today by default.
  const [dateRange, setDateRange] = useState<AdminDateRange>(() => rangeForPreset('TODAY'));
  const { startIso: rangeStartIso, endIso: rangeEndIso } = useMemo(
    () => rangeBoundsIso(dateRange.start, dateRange.end),
    [dateRange.start, dateRange.end]
  );
  const [rangeStatus, setRangeStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [rangeReload, setRangeReload] = useState(0);
  const rangeForceRef = useRef(false);

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
    appliedSearchQuery,
    statusFilter,
    withdrawalStatusFilter,
    sortBy,
    rangeStartIso,
    rangeEndIso,
    usersStartDate,
    usersEndDate,
    audienceFilter,
    appsStartDate,
    appsEndDate,
    withdrawalsStartDate,
    withdrawalsEndDate,
  ]);

  // What syncAdminData last copied out of the store. Every snapshot wakes this
  // subscriber, so copying (and re-rendering) only what actually changed is what
  // keeps a wallet or notification update from re-rendering every list here.
  const adminSyncSeenRef = useRef<Record<string, unknown>>({});
  // Bumped whenever something the helper wallets are computed from changes in
  // the store. Not all of it is mirrored into state here, so the memoised
  // helper list depends on this instead.
  const [walletInputsVersion, setWalletInputsVersion] = useState(0);

  useEffect(() => {
    const syncAdminData = () => {
      const seen = adminSyncSeenRef.current;
      const changed = (key: string, current: unknown) => {
        if (seen[key] === current) return false;
        seen[key] = current;
        return true;
      };

      // Everything fallbackStore.getHelperWallets reads. (An array, so that
      // every one of them is checked and recorded, not just the first hit.)
      const walletInputsChanged = [
        changed('wallet:orders', versionOf(fallbackStore.orders)),
        changed('wallet:withdrawals', versionOf(fallbackStore.withdrawals)),
        changed('wallet:shopOrders', versionOf(fallbackStore.shopOrders)),
        changed('wallet:shops', versionOf(fallbackStore.shops)),
        changed('wallet:storeApplications', versionOf(fallbackStore.storeApplications)),
        changed('wallet:pricing', fallbackStore.pricingSettings),
      ].some(Boolean);
      if (walletInputsChanged) setWalletInputsVersion((v) => v + 1);

      if (changed('orders', versionOf(fallbackStore.orders))) {
        const freshOrders = Array.from(fallbackStore.orders.values());
        setOrders(freshOrders);
        setAllOrders(freshOrders);
        setServerOrders((prev) => (prev ? freshOrders : null));
      }

      if (changed('helperApplications', versionOf(fallbackStore.helperApplications))) {
        const freshApps = Array.from(fallbackStore.helperApplications.values());
        setApplications((prev) => {
          if (prev.length > 0 && freshApps.length > prev.length) {
            const diff = freshApps.length - prev.length;
            setExactActiveHelpers((count) => (count !== null ? count : null));
          }
          return freshApps;
        });
      }

      if (changed('storeApplications', versionOf(fallbackStore.storeApplications))) {
        const freshStoreApps = Array.from(fallbackStore.storeApplications.values());
        setStoreApplications(freshStoreApps);
      }

      if (changed('withdrawals', versionOf(fallbackStore.withdrawals))) {
        const freshWds = Array.from(fallbackStore.withdrawals.values());
        setWithdrawals((prev) => {
          if (prev.length > 0 && freshWds.length > prev.length) {
            const diff = freshWds.length - prev.length;
            setExactWithdrawalsCount((count) => (count !== null ? count + diff : null));
          }
          return freshWds;
        });
      }

      if (changed('users', versionOf(fallbackStore.users))) {
        const freshUsers = Array.from(fallbackStore.users.values());
        setUsers((prev) => {
          if (prev.length > 0 && freshUsers.length > prev.length) {
            const diff = freshUsers.length - prev.length;
            setExactCustomerAccounts((count) => (count !== null ? count + diff : null));
          }
          return freshUsers;
        });
      }

      if (changed('shops', versionOf(fallbackStore.shops))) {
        const freshShops = Array.from(fallbackStore.shops.values());
        setShops((prev) => {
          if (prev.length > 0 && freshShops.length > prev.length) {
            const diff = freshShops.length - prev.length;
            setExactShopsCount((count) => (count !== null ? count + diff : null));
          }
          return freshShops;
        });
      }

      if (changed('shopOrders', versionOf(fallbackStore.shopOrders))) {
        const freshShopOrders = Array.from(fallbackStore.shopOrders.values());
        setShopOrders(freshShopOrders);
      }

      if (changed('orderFeedbacks', versionOf(fallbackStore.orderFeedbacks))) {
        const freshFeedbacks = Array.from(fallbackStore.orderFeedbacks.values());
        setFeedbacks((prev) => {
          if (prev.length > 0 && freshFeedbacks.length > prev.length) {
            const diff = freshFeedbacks.length - prev.length;
            setExactFeedbacksCount((count) => (count !== null ? count + diff : null));
          }
          return freshFeedbacks;
        });
      }

      if (changed('customModals', versionOf(fallbackStore.customModals))) {
        setCustomModals(Array.from(fallbackStore.customModals.values()));
      }

      if (changed('storeProducts', versionOf(fallbackStore.storeProducts))) {
        setAllStoreProducts(Array.from(fallbackStore.storeProducts.values()));
      }

      if (changed('feeSuggestions', versionOf(fallbackStore.feeSuggestions))) {
        setFeeSuggestions(Array.from(fallbackStore.feeSuggestions.values()));
      }

      // Settings are replaced as a whole object whenever they change. Re-seeding
      // the form fields only then also stops a stray snapshot from wiping
      // whatever the admin is typing into them.
      if (!changed('pricingSettings', fallbackStore.pricingSettings)) return;
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
      setAllowedDeliveryAreasEnabled(settings.allowedDeliveryAreasEnabled || false);
      setAllowedDeliveryAreas(settings.allowedDeliveryAreas || []);
      setOutOfServiceAreaMessage(settings.outOfServiceAreaMessage || '');
      setManualAuthEnabled(settings.manualAuthEnabled === true);
      setPwaInstallPromptEnabled(settings.pwaInstallPromptEnabled !== false);
      setPwaInstallPromptTitle(settings.pwaInstallPromptTitle || 'Install Jamanot App');
      setPwaInstallPromptDescription(
        settings.pwaInstallPromptDescription ||
        'আরও দ্রুত আপডেট, ভালো সার্ভিস এবং লাইভ ট্র্যাকিংয়ের জন্য আপনার ফোনে জামানত অ্যাপ ইনস্টল করুন!'
      );
      setPwaInstallButtonText(settings.pwaInstallButtonText || 'Install Jamanot');
      setInAppBrowserPromptEnabled(settings.inAppBrowserPromptEnabled !== false);
      setInAppBrowserPromptTitle(settings.inAppBrowserPromptTitle || 'ব্রাউজারে ওপেন করুন');
      setInAppBrowserPromptSubtitle(settings.inAppBrowserPromptSubtitle || 'Open in Chrome or Safari');
      setInAppBrowserPromptMessage(
        settings.inAppBrowserPromptMessage ||
        'লগইন ও নির্ভুল সেবার জন্য ওয়েবসাইটটি Chrome বা Safari ব্রাউজারে ওপেন করুন।'
      );
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
      setStoreTypesText(parseStoreTypes(settings.storeTypes).join('\n'));
      setServiceStoreTypeMap(settings.serviceStoreTypeMap || {});

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
      setMapPickerPickupPlaceholder(settings.mapPickerPickupPlaceholder || 'যেমন: আরিফ স্টোর, আশুলিয়া বাজার.');
      setMapPickerDeliveryPlaceholder(settings.mapPickerDeliveryPlaceholder || 'যেমন: ৪এ, রহমান ভিলা, মডেল টাউন.');
      setMapPickerAddressRequiredMessage(settings.mapPickerAddressRequiredMessage || 'অনুগ্রহ করে নিচের বাক্সে বিস্তারিত ঠিকানা ম্যানুয়ালি লিখুন। এটি একটি বাধ্যতামূলক ফিল্ড।');
      setNoSavePickupServicesText((settings.noSavePickupLocationServices || [
        'মিক্স কিছু কাজ করে দিন',
        'না, অন্য একটা কাজ করে দিন',
        'আমার একটা জিনিস দিয়ে আসুন',
      ]).join('\n'));

      // Helper Center state sync
      setShowBecomeHelper(Boolean(settings.showBecomeHelper));
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

      // Custom Store pricing sync
      setCustomStorePricingEnabled(settings.customStorePricingEnabled === true);
      setCustomStorePricingAmount(settings.customStorePricingAmount ?? 15);
      setReferralRewardCoins(settings.referralRewardCoins ?? 20);
      setReferredUserRewardCoins(settings.referredUserRewardCoins ?? 10);
      setReferredUserRewardOrderLimit(settings.referredUserRewardOrderLimit ?? 1);
      setReferralMessageTemplate(
        settings.referralMessageTemplate ??
          'আসসালামু আলাইকুম! জামানত (Jamanot) দিয়ে সহজে বাজার-সদাই ও প্রয়োজনীয় ডেলিভারি নিন। এখনই এই লিঙ্কে গিয়ে অর্ডার করুন: {link}'
      );

      // Home Banner Slides & Search Not Found Message sync
      setAdminSlides(settings.homeSlides || []);
      setSearchNotFoundMsg(settings.searchNotFoundMessage || '');
    };

    if (currentUser?.uid) {
      fallbackStore.initListenersForRole('admin', currentUser.uid);
    }
    syncAdminData();
    const unsub = fallbackStore.subscribe(syncAdminData);
    return () => {
      unsub();
    };
  }, [currentUser?.uid]);

  // Search input state is held locally; search queries are applied when user clicks the Search button or presses Enter

  // Orders come from the store: live queries first, the full history in the
  // background (fallbackStore.loadAdminOrderHistory). A search for an exact
  // order id is also looked up on the server, so it is found straight away
  // even while that history is still loading.
  useEffect(() => {
    if (activeTab !== 'ORDERS' && activeTab !== 'STORE_ORDERS') return;
    const rawQ = activeTab === 'ORDERS' ? ordersAppliedSearchQuery : storeOrdersAppliedSearchQuery;
    const q = rawQ.trim();
    if (!q || q.length < 2) return;
    setIsFetchingServer(true);
    fallbackStore
      .searchAdminOrdersFromServer(q)
      .catch((err) => {
        console.warn('[AdminDashboard] searchAdminOrdersFromServer error:', err);
      })
      .finally(() => {
        setIsFetchingServer(false);
      });
  }, [activeTab, ordersAppliedSearchQuery, storeOrdersAppliedSearchQuery]);

  // The selected days of orders — and of shop orders while Store Orders is
  // open — read from the server. Runs after the admin listeners above are set
  // up (a read started under another role is discarded). Asking for a range
  // already read, or one still in flight, costs nothing (see
  // loadAdminOrdersInRange); Retry and Refresh read it again.
  const needsShopOrderRange = activeTab === 'STORE_ORDERS';
  // The shops the Store Orders list can show (see realStoreOrders): only their
  // shop orders are read. Empty until the shops have loaded — then all are read.
  const receivingShopIds = useMemo(
    () => shops.filter((sh) => sh.id && sh.id !== 'myself' && sh.canReceiveOrders !== false).map((sh) => sh.id).sort().join(','),
    [shops]
  );
  useEffect(() => {
    if (!currentUser?.uid) return;
    let cancelled = false;
    const force = rangeForceRef.current;
    rangeForceRef.current = false;
    setRangeStatus('loading');
    const readOrders = () => {
      if (dateRange.preset === 'ALL_TIME') {
        return fallbackStore.ensureAdminLifetimeData(force);
      }
      return fallbackStore.loadAdminOrdersInRange(rangeStartIso, rangeEndIso, force);
    };
    // Store Orders reads its own list first and the orders (for the work-hours
    // card) after it. Read side by side, the far larger orders read held up
    // the store orders on the same connection: 30 days took 5–7 s on a phone.
    const shown = needsShopOrderRange
      ? fallbackStore.loadAdminShopOrdersInRange(rangeStartIso, rangeEndIso, force, receivingShopIds ? receivingShopIds.split(',') : undefined)
      : readOrders();
    if (needsShopOrderRange) {
      shown.catch(() => { }).then(() => { if (!cancelled) readOrders().catch(() => { /* logged by the store */ }); });
    }
    shown
      .then(() => { if (!cancelled) setRangeStatus('ready'); })
      .catch(() => { if (!cancelled) setRangeStatus('error'); });
    return () => { cancelled = true; };
    // receivingShopIds only matters while Store Orders is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.uid, rangeStartIso, rangeEndIso, needsShopOrderRange, needsShopOrderRange ? receivingShopIds : '', rangeReload, dateRange.preset]);

  const reloadRange = (force: boolean) => {
    rangeForceRef.current = force;
    setRangeReload((n) => n + 1);
  };

  useEffect(() => {
    const fetchUsers = async () => {
      if (activeTab !== 'USERS_LIST' && activeTab !== 'HELPERS') return;
      const currentQuery = activeTab === 'USERS_LIST' ? usersAppliedSearchQuery : helpersAppliedSearchQuery;
      const hasFilter = Boolean(currentQuery.trim() || usersStartDate || usersEndDate || audienceFilter !== 'ALL' || statusFilter !== 'ALL');
      const needsPageFetch = (currentPage - 1) * pageSize >= users.length;
      if (!hasFilter && !needsPageFetch && serverUsers !== null) {
        return;
      }

      setIsFetchingServer(true);
      try {
        const fetched = await fallbackStore.getAllUsers();
        setServerUsers(fetched);
      } catch (err) {
        console.error('Error fetching server users:', err);
      } finally {
        setIsFetchingServer(false);
      }
    };

    fetchUsers();
  }, [activeTab, usersAppliedSearchQuery, helpersAppliedSearchQuery, usersStartDate, usersEndDate, audienceFilter, statusFilter, usersCoinsFilter, usersMinCoins, usersMaxCoins, usersSortByCoins, currentPage, pageSize, users.length]);

  useEffect(() => {
    const fetchShops = async () => {
      if (activeTab !== 'SHOPS') return;
      const hasFilter = Boolean(shopsAppliedSearchQuery.trim() || shopsCategoryFilter !== 'ALL' || shopsFeaturedFilter !== 'ALL' || statusFilter !== 'ALL');
      const needsPageFetch = (currentPage - 1) * pageSize >= shops.length;
      if (!hasFilter && !needsPageFetch && serverShops !== null) {
        return;
      }

      setIsFetchingServer(true);
      try {
        const fetched = await fallbackStore.getAllShops();
        setServerShops(fetched);
      } catch (err) {
        console.error('Error fetching server shops:', err);
      } finally {
        setIsFetchingServer(false);
      }
    };

    fetchShops();
  }, [activeTab, shopsAppliedSearchQuery, shopsCategoryFilter, shopsFeaturedFilter, statusFilter, currentPage, pageSize, shops.length]);

  useEffect(() => {
    if (activeTab === 'SHOPS') {
      fallbackStore.loadStoreProducts();
      setAllStoreProducts(Array.from(fallbackStore.storeProducts.values()));
    }
  }, [activeTab]);

  useEffect(() => {
    const fetchWithdrawals = async () => {
      if (activeTab !== 'WITHDRAWALS') return;
      const hasFilter = Boolean(withdrawalsAppliedSearchQuery.trim() || withdrawalsStartDate || withdrawalsEndDate || withdrawalStatusFilter !== 'ALL' || withdrawalTypeFilter !== 'ALL');
      const needsPageFetch = (currentPage - 1) * pageSize >= withdrawals.length;
      if (!hasFilter && !needsPageFetch && serverWithdrawals !== null) {
        return;
      }

      setIsFetchingServer(true);
      try {
        const fetched = await fallbackStore.getAllWithdrawals();
        setServerWithdrawals(fetched);
      } catch (err) {
        console.error('Error fetching server withdrawals:', err);
      } finally {
        setIsFetchingServer(false);
      }
    };

    fetchWithdrawals();
  }, [activeTab, withdrawalsAppliedSearchQuery, withdrawalStatusFilter, withdrawalTypeFilter, withdrawalsStartDate, withdrawalsEndDate, currentPage, pageSize, withdrawals.length]);

  useEffect(() => {
    const fetchFeedbacks = async () => {
      if (activeTab !== 'FEEDBACK') return;
      const hasFilter = Boolean(feedbackAppliedSearchQuery.trim());
      const needsPageFetch = (currentPage - 1) * pageSize >= feedbacks.length;
      if (!hasFilter && !needsPageFetch && serverFeedbacks !== null) {
        return;
      }

      setIsFetchingServer(true);
      try {
        const fetched = await fallbackStore.getAllOrderFeedbacks();
        setServerFeedbacks(fetched);
      } catch (err) {
        console.error('Error fetching server feedbacks:', err);
      } finally {
        setIsFetchingServer(false);
      }
    };

    fetchFeedbacks();
  }, [activeTab, feedbackAppliedSearchQuery, currentPage, pageSize, feedbacks.length]);

  useEffect(() => {
    const fetchCustomModals = async () => {
      if (activeTab !== 'CUSTOM_MODALS') return;
      const hasFilter = Boolean(customModalsAppliedSearchQuery.trim());
      const needsPageFetch = (currentPage - 1) * pageSize >= customModals.length;
      if (!hasFilter && !needsPageFetch && serverCustomModals !== null) {
        return;
      }

      setIsFetchingServer(true);
      try {
        const fetched = await fallbackStore.getAllCustomModals();
        setServerCustomModals(fetched);
      } catch (err) {
        console.error('Error fetching server custom modals:', err);
      } finally {
        setIsFetchingServer(false);
      }
    };

    fetchCustomModals();
  }, [activeTab, customModalsAppliedSearchQuery, currentPage, pageSize, customModals.length]);

  // Note: Initial data is loaded via fallbackStore real-time snapshot subscription (first batch)

  useEffect(() => {
    setAllOrders(orders);
  }, [orders]);

  // On-demand refresh — called by the Refresh button or automatically after admin actions.
  // Subset targets a specific collection; omitting it refreshes all non-realtime collections.
  const handleAdminRefresh = async (
    subset?: Parameters<typeof fallbackStore.refreshAdminData>[0]
  ) => {
    setIsRefreshing(true);
    try {
      await fallbackStore.refreshAdminData(subset);
      reloadRange(true);
      // Sync local state from the updated store
      setUsers(Array.from(fallbackStore.users.values()));
      setWithdrawals(Array.from(fallbackStore.withdrawals.values()));
      setApplications(Array.from(fallbackStore.helperApplications.values()));
      setStoreApplications(Array.from(fallbackStore.storeApplications.values()));
      setShops(Array.from(fallbackStore.shops.values()));
      setFeedbacks(Array.from(fallbackStore.orderFeedbacks.values()));
      setCustomModals(Array.from(fallbackStore.customModals.values()));
      setFeeSuggestions(Array.from(fallbackStore.feeSuggestions.values()));
      setLastRefreshedAt(new Date());
    } catch (err) {
      console.error('Error refreshing admin data:', err);
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    const fetchExactCounts = async () => {
      try {
        const ordersColl = collection(db, 'orders');
        const usersColl = collection(db, 'users');
        const helpersQuery = query(usersColl, where('isHelper', '==', true));
        const shopsColl = collection(db, 'shops');
        const feedbackColl = collection(db, 'orderFeedbacks');
        const modalsColl = collection(db, 'customModals');
        const wdColl = collection(db, 'withdrawals');

        const [ordersSnap, usersSnap, helpersSnap, shopsSnap, feedbackSnap, modalsSnap, wdSnap, orderAggSnap] = await Promise.all([
          getCountFromServer(ordersColl),
          getCountFromServer(usersColl),
          getCountFromServer(helpersQuery),
          getCountFromServer(shopsColl),
          getCountFromServer(feedbackColl),
          getCountFromServer(modalsColl),
          getCountFromServer(wdColl),
          getAggregateFromServer(ordersColl, {
            totalDeliveryFees: sum('deliveryFee'),
            totalProductCosts: sum('productCost'),
          })
        ]);

        setExactTotalOrders(ordersSnap.data().count);
        setExactCustomerAccounts(usersSnap.data().count);
        setExactActiveHelpers(helpersSnap.data().count);
        setExactShopsCount(shopsSnap.data().count);
        setExactFeedbacksCount(feedbackSnap.data().count);
        setExactCustomModalsCount(modalsSnap.data().count);
        setExactWithdrawalsCount(wdSnap.data().count);

        const dFees = orderAggSnap.data().totalDeliveryFees || 0;
        const pCosts = orderAggSnap.data().totalProductCosts || 0;
        setExactTotalDeliveryFees(dFees);
        setExactTotalProductCosts(pCosts);
        setExactTotalCollection(dFees + pCosts);
      } catch (err) {
        console.error('Error fetching exact counts from server:', err);
      }
    };

    const fetchServerAvgDeliveryTime = async () => {
      try {
        const q = query(
          collection(db, 'orders'),
          where('status', '==', 'DELIVERED'),
          limit(50)
        );
        const snap = await getDocs(q);
        let totalMs = 0;
        let count = 0;
        snap.forEach((docSnap) => {
          const o = docSnap.data() as Order;
          if (o.deliveredAt && (o.acceptedAt || o.createdAt)) {
            const diff = new Date(o.deliveredAt).getTime() - new Date(o.acceptedAt || o.createdAt).getTime();
            if (diff > 0) {
              totalMs += diff;
              count++;
            }
          }
        });
        setServerAvgDeliveryTimeMins(count > 0 ? Math.round(totalMs / (1000 * 60 * count)) : 0);
      } catch (err) {
        console.error('Error fetching server average delivery time:', err);
      }
    };

    const fetchServerAvgAcceptanceTime = async () => {
      try {
        const q = query(
          collection(db, 'orders'),
          limit(50)
        );
        const snap = await getDocs(q);
        let totalMs = 0;
        let count = 0;
        snap.forEach((docSnap) => {
          const o = docSnap.data() as Order;
          if (o.acceptedAt && o.createdAt) {
            const diff = new Date(o.acceptedAt).getTime() - new Date(o.createdAt).getTime();
            if (diff > 0) {
              totalMs += diff;
              count++;
            }
          }
        });
        setServerAvgAcceptanceTimeMins(count > 0 ? Math.round(totalMs / (1000 * 60 * count)) : 0);
      } catch (err) {
        console.error('Error fetching server average acceptance time:', err);
      }
    };

    fetchExactCounts();
    fetchServerAvgDeliveryTime();
    fetchServerAvgAcceptanceTime();
  }, []);

  // "Delayed" depends on the clock, not just the data. These queues used to be
  // recomputed on every render, which kept that current by accident; now that
  // they are memoised, a once-a-minute tick does it on purpose.
  const [minuteTick, setMinuteTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setMinuteTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const scopedAllOrders = useMemo(() => {
    if (!isZoneFiltered || !targetZoneIds) return allOrders;
    return allOrders.filter((o) => isOrderInAnyZone(o, targetZoneIds, allowedDeliveryAreas, { users, shops }));
  }, [allOrders, isZoneFiltered, targetZoneIds, allowedDeliveryAreas, users, shops]);

  // Needs Attention Queue calculations — computed from overall allOrders dataset for complete accuracy across DB
  const { cancellingRequests, notAcceptedRequests, feeAdjustmentsPending, delayedOrders } = useMemo(() => {
    const now = Date.now();
    const cancelling: Order[] = [];
    const notAccepted: Order[] = [];
    const feeAdjustments: Order[] = [];
    const delayed: Order[] = [];
    scopedAllOrders.forEach((o) => {
      if (o.cancellationRequest && o.cancellationRequest.status === 'PENDING') cancelling.push(o);
      if (o.status === 'PENDING' && !o.helperId && o.cancellationRequest?.status !== 'APPROVED') notAccepted.push(o);
      if (o.feeAdjustment && o.feeAdjustment.status === 'PENDING') feeAdjustments.push(o);
      if (
        o.status !== 'DELIVERED' &&
        o.status !== 'CANCELED' &&
        !o.mutuallyDiscussed &&
        now - new Date(o.createdAt).getTime() >= 3600000
      ) {
        delayed.push(o);
      }
    });
    return {
      cancellingRequests: cancelling,
      notAcceptedRequests: notAccepted,
      feeAdjustmentsPending: feeAdjustments,
      delayedOrders: delayed,
    };
  }, [scopedAllOrders, minuteTick]);

  const pendingApps = useMemo(() => {
    let list = applications.filter((a) => a.status === 'PENDING');
    if (isZoneFiltered && targetZoneIds) {
      list = list.filter((a) => {
        if (a.assignedAreaIds && a.assignedAreaIds.some((id) => targetZoneIds.includes(id))) return true;
        if (a.preferredAreaId && targetZoneIds.includes(a.preferredAreaId)) return true;
        return !a.assignedAreaIds?.length && !a.preferredAreaId;
      });
    }
    return list;
  }, [applications, isZoneFiltered, targetZoneIds]);

  const pendingWds = useMemo(() => withdrawals.filter((w) => w.status === 'PENDING'), [withdrawals]);
  const pendingStoreApps = useMemo(() => storeApplications.filter((a) => a.status === 'PENDING'), [storeApplications]);

  const pendingRewardClaims = Array.from(fallbackStore.rewardClaims.values()).filter(
    (c) => c.status === 'PENDING'
  );

  const allOrdersById = React.useMemo(() => {
    const map = new Map<string, Order>();
    scopedAllOrders.forEach((o) => {
      if (!map.has(o.id)) map.set(o.id, o);
    });
    return map;
  }, [scopedAllOrders]);

  const badFeedbacks = React.useMemo(() => {
    return feedbacks
      .filter((f) => {
        if (!f || !f.id || f.mutuallyDiscussed) return false;
        const linkedOrder = allOrdersById.get(f.orderId);
        if (linkedOrder?.mutuallyDiscussed) return false;

        // ONLY strictly negative feedback:
        if (f.thumbsUp === false) return true;
        if (f.thumbsUp === true) return false; // Strictly exclude positive

        // If thumbsUp is undefined (legacy feedback), only include if score is strictly <= 2
        const ratings = [f.serviceRating, f.riderRating, f.shopRating].filter(
          (r) => typeof r === 'number' && r > 0
        );
        if (ratings.length > 0) {
          return ratings.some((r) => r <= 2);
        }
        return false;
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [feedbacks, allOrdersById]);

  const totalExceptionsCount =
    cancellingRequests.filter(o => o.cancellationRequest?.status === 'PENDING').length +
    notAcceptedRequests.length +
    feeAdjustmentsPending.length +
    pendingApps.length +
    pendingWds.length +
    pendingStoreApps.length +
    delayedOrders.length +
    pendingRewardClaims.length +
    badFeedbacks.length;

  const avgDeliveryTimeMins = React.useMemo(() => {
    const delivered = scopedAllOrders.filter(o => o.status === 'DELIVERED');
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
  }, [scopedAllOrders]);

  const avgAcceptanceTimeMins = React.useMemo(() => {
    let totalMs = 0;
    let count = 0;
    scopedAllOrders.forEach(o => {
      if (o.acceptedAt && o.createdAt) {
        const diff = new Date(o.acceptedAt).getTime() - new Date(o.createdAt).getTime();
        if (diff > 0) {
          totalMs += diff;
          count++;
        }
      }
    });
    return count > 0 ? Math.round(totalMs / (1000 * 60 * count)) : 0;
  }, [scopedAllOrders]);

  const overallReviewStats = React.useMemo(() => {
    const totalCount = exactFeedbacksCount !== null ? exactFeedbacksCount : feedbacks.length;
    if (feedbacks.length === 0) return { avgRating: '0.0', count: totalCount };

    const sumRatings = feedbacks.reduce((acc, f) => {
      const validRatings = [f.serviceRating, f.riderRating, f.shopRating].filter(
        (r) => typeof r === 'number' && r > 0
      );
      const avgSingle = validRatings.length > 0
        ? validRatings.reduce((a, b) => a + b, 0) / validRatings.length
        : (f.serviceRating || 5);
      return acc + avgSingle;
    }, 0);

    const avg = (sumRatings / feedbacks.length).toFixed(1);
    return { avgRating: avg, count: totalCount };
  }, [feedbacks, exactFeedbacksCount]);

  // Work hours of the orders placed on the selected days (see dateRange).
  const totalHoursOfWork = React.useMemo(() => {
    const delivered = scopedAllOrders.filter(o => o.status === 'DELIVERED' && isInRange(o.createdAt, rangeStartIso, rangeEndIso));
    let totalMs = 0;
    delivered.forEach(o => {
      if (o.deliveredAt && (o.acceptedAt || o.createdAt)) {
        const diff = new Date(o.deliveredAt).getTime() - new Date(o.acceptedAt || o.createdAt).getTime();
        if (diff > 0) {
          totalMs += diff;
        }
      }
    });
    const hours = totalMs / (1000 * 60 * 60);
    return hours > 0 ? (hours >= 10 ? Math.round(hours).toString() : hours.toFixed(1)) : '0';
  }, [scopedAllOrders, rangeStartIso, rangeEndIso]);

  const totalPendingPayoutAmount = pendingWds.reduce((sum, w) => sum + w.amount, 0);

  const approvedHelpersCount = useMemo(() => {
    let list = applications.filter((a) => a.status === 'APPROVED');
    if (isZoneFiltered && targetZoneIds) {
      list = list.filter((a) => {
        if (a.assignedAreaIds && a.assignedAreaIds.some((id) => targetZoneIds.includes(id))) return true;
        if (a.preferredAreaId && targetZoneIds.includes(a.preferredAreaId)) return true;
        const u = users.find((user) => user.uid === a.userId);
        if (u?.serveAllAreas) return true;
        return u?.assignedAreaIds?.some((id) => targetZoneIds.includes(id));
      });
    }
    return list.length;
  }, [applications, users, isZoneFiltered, targetZoneIds]);

  const handleApproveApp = (appOrId: HelperApplication | string) => {
    const app = typeof appOrId === 'string'
      ? applications.find((a) => a.id === appOrId) || fallbackStore.helperApplications.get(appOrId) || null
      : appOrId;
    if (app) {
      setApprovingHelperApp(app);
    } else if (typeof appOrId === 'string') {
      fallbackStore.approveHelperApp(appOrId);
      setApplications(Array.from(fallbackStore.helperApplications.values()));
      setUsers(Array.from(fallbackStore.users.values()));
      showAlert('হেলপার অনুমোদিত', 'হেলপার আবেদন সফলভাবে অনুমোদন করা হয়েছে।', 'success');
    }
  };

  const handleConfirmApproveHelper = async (
    appId: string,
    assignedAreaIds: string[],
    serveAllAreas?: boolean
  ) => {
    await fallbackStore.approveHelperApp(appId, assignedAreaIds, serveAllAreas);
    setApplications(Array.from(fallbackStore.helperApplications.values()));
    setUsers(Array.from(fallbackStore.users.values()));
    setAllowedDeliveryAreas([...(fallbackStore.pricingSettings.allowedDeliveryAreas || [])]);
    setPricing({ ...fallbackStore.pricingSettings });
    setApprovingHelperApp(null);
    showAlert(
      'হেলপার অনুমোদিত ও জোন নির্ধারিত',
      'হেলপার আবেদন অনুমোদন করা হয়েছে এবং সার্ভিস জোন সফলভাবে এসাইন করা হয়েছে।',
      'success'
    );
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

  const [editingWd, setEditingWd] = useState<WithdrawalRequest | null>(null);
  const [editWdStatus, setEditWdStatus] = useState<'PENDING' | 'APPROVED' | 'REJECTED'>('PENDING');
  const [editWdAmount, setEditWdAmount] = useState<string>('0');

  const handleApproveWd = async (wdId: string) => {
    const w = fallbackStore.withdrawals.get(wdId);
    const targetName = w?.helperName || 'অনুরোধকারী';
    const isConfirmed = await showConfirm(
      'পে-ব্যাক অনুমোদন নিশ্চিতকরণ',
      `আপনি কি নিশ্চিত যে ৳${w?.amount || ''} পে-ব্যাক অনুরোধটি (${targetName}) অনুমোদন করতে চান?`,
      'হ্যাঁ, অনুমোদন করুন',
      'বাতিল'
    );
    if (!isConfirmed) return;
    await fallbackStore.approveWithdrawal(wdId);
    showAlert('উইথড্রয়াল অনুমোদিত', 'পেমেন্ট পেআউট অনুমোদন সফল হয়েছে।', 'success');
  };

  const handleRejectWd = async (wdId: string) => {
    const w = fallbackStore.withdrawals.get(wdId);
    const targetName = w?.helperName || 'অনুরোধকারী';
    const isConfirmed = await showConfirm(
      'পে-ব্যাক বাতিল নিশ্চিতকরণ',
      `আপনি কি নিশ্চিত যে ৳${w?.amount || ''} পে-ব্যাক অনুরোধটি (${targetName}) বাতিল করতে চান?`,
      'হ্যাঁ, বাতিল করুন',
      'ফিরে যান'
    );
    if (!isConfirmed) return;
    await fallbackStore.rejectWithdrawal(wdId);
    showAlert('উইথড্রয়াল বাতিল', 'উইথড্রয়াল আবেদন বাতিল করা হয়েছে।', 'info');
  };

  const openEditWdModal = (w: WithdrawalRequest) => {
    setEditingWd(w);
    setEditWdStatus(w.status);
    setEditWdAmount(String(w.amount));
  };

  const handleSaveWdEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingWd) return;

    const newAmt = parseFloat(editWdAmount);
    if (isNaN(newAmt) || newAmt <= 0) {
      await showAlert('ভুল পরিমাণ', 'অনুগ্রহ করে সঠিক পরিমাণ সংখ্যায় লিখুন।', 'warning');
      return;
    }

    const isConfirmed = await showConfirm(
      'অনুরোধ আপডেট নিশ্চিতকরণ',
      `আপনি কি নিশ্চিত যে পে-ব্যাক অনুরোধের স্ট্যাটাস (${editWdStatus}) এবং পরিমাণ (৳${newAmt}) আপডেট করতে চান? এটি ওয়ালেট ব্যালেন্স ও রেভিনিউ ক্যালকুলেশন আপডেট করবে।`,
      'হ্যাঁ, আপডেট করুন',
      'বাতিল'
    );
    if (!isConfirmed) return;

    await fallbackStore.updateWithdrawalRequest(editingWd.id, {
      status: editWdStatus,
      amount: newAmt,
    });

    setEditingWd(null);
    showAlert('সফল', 'পে-ব্যাক অনুরোধ এবং ওয়ালেট সফলভাবে আপডেট করা হয়েছে।', 'success');
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
        : { requestedBy: 'customer', reason: 'Cancellation approved by Admin', status: 'APPROVED', createdAt: new Date().toISOString() },
      statusHistory: [
        ...(o.statusHistory || []),
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
        ...(o.statusHistory || []),
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
      lastEditedBy: 'admin',
      lastEditedAt: new Date().toISOString(),
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
      lastEditedBy: 'admin',
      lastEditedAt: new Date().toISOString(),
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
      dedicatedHelperDelayMinutes: dedicatedDelayMins !== '' && !isNaN(Number(dedicatedDelayMins)) ? Number(dedicatedDelayMins) : 7,
      orderReceiverRule: receiverRule,
      allowedHelperTypes: allowedHelperTypes,
      helperRadiusKm: helperRadiusKm !== '' && !isNaN(Number(helperRadiusKm)) ? Math.min(1000, Math.max(1, Number(helperRadiusKm))) : 3.5,
      mapLocationPreference: mapLocationPref,
      customCountryCode: customCountryCode.trim().toLowerCase() || 'bd',
      allowedDeliveryAreasEnabled: allowedDeliveryAreasEnabled,
      allowedDeliveryAreas: allowedDeliveryAreas,
      outOfServiceAreaMessage: outOfServiceAreaMessage.trim() || undefined,
      manualAuthEnabled: manualAuthEnabled,
      pwaInstallPromptEnabled: pwaInstallPromptEnabled,
      pwaInstallPromptTitle: pwaInstallPromptTitle.trim() || undefined,
      pwaInstallPromptDescription: pwaInstallPromptDescription.trim() || undefined,
      pwaInstallButtonText: pwaInstallButtonText.trim() || undefined,
      inAppBrowserPromptEnabled: inAppBrowserPromptEnabled,
      inAppBrowserPromptTitle: inAppBrowserPromptTitle.trim() || undefined,
      inAppBrowserPromptSubtitle: inAppBrowserPromptSubtitle.trim() || undefined,
      inAppBrowserPromptMessage: inAppBrowserPromptMessage.trim() || undefined,
      locationPermissionModalTitle: locPermModalTitle.trim() || undefined,
      locationPermissionModalBody: locPermModalBody.trim() || undefined,
      notificationPermissionModalTitle: notifPermModalTitle.trim() || undefined,
      notificationPermissionModalBody: notifPermModalBody.trim() || undefined,
      bkashInstructions: bkashInstructions.trim() || undefined,
      nagadInstructions: nagadInstructions.trim() || undefined,
      rocketInstructions: rocketInstructions.trim() || undefined,
      bankInstructions: bankInstructions.trim() || undefined,
      cashInstructions: cashInstructions.trim() || undefined,
      storeTypes: parseStoreTypes(storeTypesText),
      serviceStoreTypeMap: Object.keys(serviceStoreTypeMap).length > 0 ? serviceStoreTypeMap : undefined,
      // Blocked user custom notice & modal settings
      blockedUserModalTitle: blockedUserModalTitle.trim() || undefined,
      blockedUserModalSubtitle: blockedUserModalSubtitle.trim() || undefined,
      blockedUserModalMessage: blockedUserModalMessage.trim() || undefined,
      blockedUserModalButtonText: blockedUserModalButtonText.trim() || undefined,
      blockedUserModalContactUrl: blockedUserModalContactUrl.trim() || undefined,
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
      mapPickerPickupPlaceholder: mapPickerPickupPlaceholder.trim() || undefined,
      mapPickerDeliveryPlaceholder: mapPickerDeliveryPlaceholder.trim() || undefined,
      mapPickerAddressRequiredMessage: mapPickerAddressRequiredMessage.trim() || undefined,
      noSavePickupLocationServices: noSavePickupServicesText.split('\n').map(s => s.trim()).filter(Boolean),
      // Helper sidebar visibility settings
      showBecomeHelper: showBecomeHelper,
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
      feeCalculatorBasePrice: feeCalculatorBasePrice !== '' && !isNaN(Number(feeCalculatorBasePrice)) ? Number(feeCalculatorBasePrice) : 20,
      feeCalculatorPerKmRate: feeCalculatorPerKmRate !== '' && !isNaN(Number(feeCalculatorPerKmRate)) ? Number(feeCalculatorPerKmRate) : 10,
      feeCalculatorPerKgRate: feeCalculatorPerKgRate !== '' && !isNaN(Number(feeCalculatorPerKgRate)) ? Number(feeCalculatorPerKgRate) : 5,
      feeCalculatorReturnFee: feeCalculatorReturnFee !== '' && !isNaN(Number(feeCalculatorReturnFee)) ? Number(feeCalculatorReturnFee) : 15,
      feeCalculatorReturnPercent: feeCalculatorReturnPercent !== '' && !isNaN(Number(feeCalculatorReturnPercent)) ? Number(feeCalculatorReturnPercent) : 0,
      feeCalculatorProcessingFee: feeCalculatorProcessingFee !== '' && !isNaN(Number(feeCalculatorProcessingFee)) ? Number(feeCalculatorProcessingFee) : 0,
      feeCalculatorProcessingFeeType,
      feeCalculatorMinFee: feeCalculatorMinFee !== '' && !isNaN(Number(feeCalculatorMinFee)) ? Number(feeCalculatorMinFee) : 25,
      feeCalculatorMaxLimit: feeCalculatorMaxLimit !== '' && !isNaN(Number(feeCalculatorMaxLimit)) ? Number(feeCalculatorMaxLimit) : 70,
      feeCalculatorMaxLimitMessage: feeCalculatorMaxLimitMessage.trim() || undefined,
      feeCalculatorCompanyDetails: feeCalculatorCompanyDetails.trim() || undefined,
      customStorePricingEnabled: Boolean(customStorePricingEnabled),
      customStorePricingAmount: customStorePricingAmount !== '' && !isNaN(Number(customStorePricingAmount)) ? Number(customStorePricingAmount) : 15,
      referralRewardCoins: referralRewardCoins !== '' && !isNaN(Number(referralRewardCoins)) ? Number(referralRewardCoins) : 20,
      referredUserRewardCoins: referredUserRewardCoins !== '' && !isNaN(Number(referredUserRewardCoins)) ? Number(referredUserRewardCoins) : 10,
      referredUserRewardOrderLimit: referredUserRewardOrderLimit !== '' && !isNaN(Number(referredUserRewardOrderLimit)) ? Math.max(1, Number(referredUserRewardOrderLimit)) : 1,
      referralMessageTemplate: referralMessageTemplate.trim() || undefined,
      allowedAdminTabs: allowedAdminTabs,
      homeSlides: adminSlides.length > 0 ? adminSlides : undefined,
      searchNotFoundMessage: searchNotFoundMsg.trim() || undefined,
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

    try {
      const updatedUser = await fallbackStore.setAdminRole(targetUser.uid, makeAdmin, targetUser);
      setUsers(Array.from(fallbackStore.users.values()));
      setServerUsers((prev) => (prev ? prev.map((u) => (u.uid === targetUser.uid ? { ...u, ...updatedUser } : u)) : null));
      showAlert(
        'রোল আপডেট সম্পন্ন',
        `${targetUser.displayName} ${makeAdmin ? 'এখন একজন Admin।' : 'এর Admin রোল সরানো হয়েছে।'}`,
        'success'
      );
    } catch (err: any) {
      console.error('Error toggling admin role:', err);
      showAlert('ত্রুটি', 'অ্যাডমিন রোল পরিবর্তন করতে সমস্যা হয়েছে। অনুগ্রহ করে ইন্টারনেট সংযোগ পরীক্ষা করে পুনরায় চেষ্টা করুন।', 'error');
    }
  };

  const handleToggleSuperAdminRole = async (targetUser: UserProfile, makeSuperAdmin: boolean) => {
    if (!currentUser?.isSuperAdmin) {
      showAlert('অনুমতি নেই', 'শুধুমাত্র Super Admin অন্য কাউকে Super Admin বানাতে বা সরাতে পারবেন।', 'error');
      return;
    }
    const isPrimarySuperAdmin = targetUser.email && ['ajnasim72@gmail.com'].includes(targetUser.email.trim().toLowerCase());
    if (isPrimarySuperAdmin && targetUser.isSuperAdmin) {
      showAlert('সুরক্ষিত অ্যাকাউন্ট', 'মূল Super Admin এর রোল পরিবর্তন করা যাবে না।', 'warning');
      return;
    }
    const actionText = makeSuperAdmin ? 'Super Admin রোল প্রদান করতে' : 'Super Admin রোল অপসারণ করে সাধারণ Admin করতে';
    const confirmed = await showConfirm(
      'Super Admin রোল পরিবর্তন',
      `আপনি কি ${targetUser.displayName}-কে ${actionText} চান?`,
      makeSuperAdmin ? 'হ্যাঁ, Super Admin করুন' : 'হ্যাঁ, ডিমোট করুন',
      'বাতিল'
    );
    if (!confirmed) return;

    try {
      const updatedUser = await fallbackStore.setSuperAdminRole(targetUser.uid, makeSuperAdmin, targetUser);
      setUsers(Array.from(fallbackStore.users.values()));
      setServerUsers((prev) => (prev ? prev.map((u) => (u.uid === targetUser.uid ? { ...u, ...updatedUser } : u)) : null));
      showAlert(
        'রোল আপডেট সম্পন্ন',
        `${targetUser.displayName} ${makeSuperAdmin ? 'এখন একজন Super Admin।' : 'এখন একজন সাধারণ Admin হিসেবে সংরক্ষিত।'}`,
        'success'
      );
    } catch (err: any) {
      console.error('Error toggling super admin role:', err);
      showAlert('ত্রুটি', 'Super Admin রোল পরিবর্তন করতে সমস্যা হয়েছে।', 'error');
    }
  };

  const handleDeleteFeedback = async (feedbackId: string) => {
    const confirmed = await showConfirm(
      'Delete Feedback',
      'Are you sure you want to permanently delete this customer feedback entry?',
      'Delete',
      'Cancel'
    );
    if (!confirmed) return;

    try {
      await fallbackStore.deleteOrderFeedback(feedbackId);
      setFeedbacks((prev) => prev.filter((f) => f.id !== feedbackId));
      setAllOrders((prev) =>
        prev.map((o) => (o.feedback?.id === feedbackId ? { ...o, feedback: undefined } : o))
      );
      if (serverFeedbacks) {
        setServerFeedbacks((prev) => (prev ? prev.filter((f) => f.id !== feedbackId) : null));
      }
      setExactFeedbacksCount((prev) => (prev !== null && prev > 0 ? prev - 1 : null));
      showAlert('ফিডব্যাক ডিলিট সম্পন্ন', 'অর্ডার ফিডব্যাক সফলভাবে মুছে ফেলা হয়েছে।', 'success');
    } catch (err: any) {
      showAlert('Error', err?.message || 'Failed to delete feedback', 'error');
    }
  };

  const scopedUsers = React.useMemo(() => {
    if (!isZoneFiltered || !targetZoneIds) return users;
    const ordersSource = serverOrders !== null ? serverOrders : (allOrders.length > 0 ? allOrders : orders);
    return users.filter((u) => isUserInZoneScope(u, targetZoneIds, allowedDeliveryAreas, ordersSource));
  }, [users, isZoneFiltered, targetZoneIds, serverOrders, allOrders, orders, allowedDeliveryAreas]);

  const scopedApplications = React.useMemo(() => {
    if (!isZoneFiltered || !targetZoneIds) return applications;
    return applications.filter((a) => {
      if (a.assignedAreaIds && a.assignedAreaIds.some((id) => targetZoneIds.includes(id))) return true;
      if (a.preferredAreaId && targetZoneIds.includes(a.preferredAreaId)) return true;
      return false;
    });
  }, [applications, isZoneFiltered, targetZoneIds]);

  const scopedShops = React.useMemo(() => {
    if (!isZoneFiltered || !targetZoneIds) return shops;
    return shops.filter((s) => {
      if ((s as any).areaId && targetZoneIds.includes((s as any).areaId)) return true;
      if ((s as any).areaIds && (s as any).areaIds.some((aid: string) => targetZoneIds.includes(aid))) return true;
      if (s.location?.lat && s.location?.lng) {
        const matched = getAreasForPoint({ lat: s.location.lat, lng: s.location.lng }, allowedDeliveryAreas);
        return matched.some((a) => targetZoneIds.includes(a.id));
      }
      return false;
    });
  }, [shops, isZoneFiltered, targetZoneIds, allowedDeliveryAreas]);

  const helperOptions = React.useMemo(() => {
    const map = new Map<string, { id: string; name: string; phone?: string }>();
    const eligibleHelpers = scopedUsers.filter((u) => u.role === 'helper' || u.isHelper);

    scopedApplications.forEach((app) => {
      if (app.userId) {
        map.set(app.userId, {
          id: app.userId,
          name: app.legalName || app.userName || 'Helper',
          phone: app.email,
        });
      }
    });

    eligibleHelpers.forEach((u) => {
      const existing = map.get(u.uid);
      map.set(u.uid, {
        id: u.uid,
        name: u.displayName || existing?.name || 'Helper',
        phone: u.alternativePhone || existing?.phone,
      });
    });

    scopedAllOrders.forEach((o) => {
      if (o.helperId && !map.has(o.helperId)) {
        map.set(o.helperId, {
          id: o.helperId,
          name: o.helperName || 'Helper',
        });
      }
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [scopedApplications, scopedUsers, scopedAllOrders]);

  // --- Filtering & Sorting Helper Functions ---

  // 1. Process Orders List (Search, Filter by Status, Filter by Helper, Sort by Newest default)
  const getProcessedOrders = (rawOrders: Order[]) => {
    let list = [...rawOrders];

    // Zone scoping filter
    if (isZoneFiltered && targetZoneIds) {
      list = list.filter((o) => isOrderInAnyZone(o, targetZoneIds, allowedDeliveryAreas, { users, shops }));
    }

    // Date range — the days read from the server for this list.
    // When a search query is applied, matched orders outside the date range are kept.
    const hasSearch = Boolean(ordersAppliedSearchQuery.trim());
    const exactIdSearch = ordersAppliedSearchQuery.trim().replace(/^#/, '');
    if (!hasSearch) {
      list = list.filter((o) => isInRange(o.createdAt, rangeStartIso, rangeEndIso));
    } else {
      list = list.filter((o) => o.id === exactIdSearch || isInRange(o.createdAt, rangeStartIso, rangeEndIso) || true);
    }

    // Search query filter
    if (ordersAppliedSearchQuery.trim()) {
      const q = ordersAppliedSearchQuery.toLowerCase().trim();
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
      } else if (statusFilter === 'PAID') {
        list = list.filter((o) => o.isPaid || (o.status === 'DELIVERED' && (o.isHelperPaid || o.isStorePaid)));
      } else if (statusFilter === 'UNPAID') {
        list = list.filter((o) => o.status === 'DELIVERED' && !o.isPaid);
      } else {
        list = list.filter((o) => o.status === statusFilter);
      }
    }

    // Helper filter
    if (ordersHelperFilter !== 'ALL') {
      if (ordersHelperFilter === 'UNASSIGNED') {
        list = list.filter((o) => !o.helperId);
      } else {
        list = list.filter((o) => o.helperId === ordersHelperFilter || o.helperName === ordersHelperFilter);
      }
    }

    // Sorting (Default Latest First)
    if (sortBy === 'FEE_HIGH') {
      list.sort((a, b) => b.deliveryFee - a.deliveryFee);
    } else if (sortBy === 'FEE_LOW') {
      list.sort((a, b) => a.deliveryFee - b.deliveryFee);
    } else {
      list = sortByDate(list, (o) => o.createdAt, sortBy === 'OLDEST');
    }

    return list;
  };

  // 1b. Process Store Orders List (Search, Filter by Status, Filter by Shop, Filter by Helper, Sort)
  const getProcessedStoreOrders = (rawShopOrders: ShopOrder[]) => {
    let list = [...rawShopOrders];

    // Date range — when search is applied, we don't restrict to today
    const hasStoreSearch = Boolean(storeOrdersAppliedSearchQuery.trim());
    if (!hasStoreSearch) {
      list = list.filter((so) => isInRange(so.createdAt, rangeStartIso, rangeEndIso));
    }

    // Zone scoping filter
    if (isZoneFiltered && targetZoneIds) {
      list = list.filter((so) => {
        const parentOrder = fallbackStore.orders.get(so.parentOrderId) || allOrders.find((o) => o.id === so.parentOrderId);
        if (parentOrder) {
          return isOrderInAnyZone(parentOrder, targetZoneIds, allowedDeliveryAreas, { users, shops });
        }
        return false;
      });
    }

    // Search query filter
    if (storeOrdersAppliedSearchQuery.trim()) {
      const q = storeOrdersAppliedSearchQuery.toLowerCase().trim();
      list = list.filter(
        (so) =>
          so.id.toLowerCase().includes(q) ||
          (so.parentOrderId || '').toLowerCase().includes(q) ||
          (so.shopName || '').toLowerCase().includes(q) ||
          (so.helperName || '').toLowerCase().includes(q) ||
          (so.requestText || '').toLowerCase().includes(q) ||
          (so.sellerName || '').toLowerCase().includes(q) ||
          (so.sellerPhone && so.sellerPhone.includes(q)) ||
          (so.note && so.note.toLowerCase().includes(q)) ||
          (so.itemsWithPrice || []).some((it) => it.name && it.name.toLowerCase().includes(q))
      );
    }

    // Status filter
    if (storeOrdersStatusFilter !== 'ALL') {
      list = list.filter((so) => so.status === storeOrdersStatusFilter);
    }

    // Shop filter
    if (storeOrdersShopFilter !== 'ALL') {
      list = list.filter((so) => so.shopId === storeOrdersShopFilter || so.shopName === storeOrdersShopFilter);
    }

    // Helper filter
    if (storeOrdersHelperFilter !== 'ALL') {
      list = list.filter((so) => so.helperId === storeOrdersHelperFilter || so.helperName === storeOrdersHelperFilter);
    }

    // Sorting
    if (storeOrdersSortBy === 'PRICE_HIGH') {
      list.sort((a, b) => (b.price || 0) - (a.price || 0));
    } else if (storeOrdersSortBy === 'PRICE_LOW') {
      list.sort((a, b) => (a.price || 0) - (b.price || 0));
    } else {
      list = sortByDate(list, (so) => so.createdAt, storeOrdersSortBy === 'OLDEST');
    }

    return list;
  };


  // 2. Helper Aggregated List
  //
  // Memoised, and built in one pass over the orders. It used to be rebuilt on
  // every render — twice, when the table view was open — and looked up each
  // helper's wallet and each order's shop orders inside the loop over orders,
  // both of which walk whole collections themselves: opening the Helpers tab
  // blocked the app for ~11 s with 1,300 orders.
  type HelperRow = {
    id: string;
    name: string;
    phone: string;
    email?: string;
    nid?: string;
    status: string;
    completedJobs: number;
    activeOrders: number;
    storeOrdersCount: number;
    storeOrdersPercentage: number;
    totalEarned: number;
    balance: number;
    totalWithdrawn: number;
    createdAt: string;
    avgDeliveryTimeMins?: number;
  };
  const processedHelpers = React.useMemo((): HelperRow[] => {
    if (activeTab !== 'HELPERS' || helperSubView !== 'TABLE') return [];
    const helperMap = new Map<string, HelperRow>();

    const isAllTime = dateRange.preset === 'ALL_TIME';

    // Collect helper IDs from applications, registered users, and orders
    const helperIds = new Set<string>();
    applications.forEach((app) => helperIds.add(app.userId));
    users.forEach((u) => {
      if (u.isHelper || u.role === 'helper') helperIds.add(u.uid);
    });
    allOrders.forEach((o) => {
      if (o.helperId) helperIds.add(o.helperId);
    });

    const wallets = fallbackStore.getHelperWallets(helperIds);
    const ordersWithShopOrders = new Set<string>();
    fallbackStore.shopOrders.forEach((so) => {
      if (so.parentOrderId) ordersWithShopOrders.add(so.parentOrderId);
    });

    // Seed from helper applications & wallets
    applications.forEach((app) => {
      const w = wallets.get(app.userId) || { totalEarned: 0, balance: 0, totalWithdrawn: 0 };
      helperMap.set(app.userId, {
        id: app.userId,
        name: app.legalName || app.userName,
        phone: app.email,
        nid: app.nid,
        status: app.status,
        completedJobs: 0,
        activeOrders: 0,
        storeOrdersCount: 0,
        storeOrdersPercentage: 0,
        totalEarned: isAllTime ? w.totalEarned : 0,
        balance: w.balance,
        totalWithdrawn: isAllTime ? w.totalWithdrawn : 0,
        createdAt: app.createdAt,
      });
    });

    // Seed registered helper users
    users.forEach((u) => {
      if ((u.isHelper || u.role === 'helper') && !helperMap.has(u.uid)) {
        const w = wallets.get(u.uid) || { totalEarned: 0, balance: 0, totalWithdrawn: 0 };
        helperMap.set(u.uid, {
          id: u.uid,
          name: u.displayName || 'Helper',
          phone: u.phoneNumber || 'N/A',
          nid: (u as any).nid || '',
          status: 'APPROVED',
          completedJobs: 0,
          activeOrders: 0,
          storeOrdersCount: 0,
          storeOrdersPercentage: 0,
          totalEarned: isAllTime ? w.totalEarned : 0,
          balance: w.balance,
          totalWithdrawn: isAllTime ? w.totalWithdrawn : 0,
          createdAt: u.createdAt || new Date().toISOString(),
        });
      }
    });

    const helperDurations = new Map<string, { totalMs: number; count: number }>();
    const minFee = fallbackStore.pricingSettings.feeCalculatorMinFee ?? 20;

    // Aggregate from orders (filtered by date range if not ALL_TIME)
    allOrders.forEach((o) => {
      if (!o.helperId) return;

      const orderInDateRange = isAllTime || isInRange(o.createdAt, rangeStartIso, rangeEndIso) || isInRange(o.deliveredAt, rangeStartIso, rangeEndIso);
      if (!orderInDateRange) return;

      let existing = helperMap.get(o.helperId);
      if (!existing) {
        const w = wallets.get(o.helperId) || { totalEarned: 0, balance: 0, totalWithdrawn: 0 };
        existing = {
          id: o.helperId,
          name: o.helperName || 'Helper',
          phone: 'N/A',
          status: 'APPROVED',
          completedJobs: 0,
          activeOrders: 0,
          storeOrdersCount: 0,
          storeOrdersPercentage: 0,
          totalEarned: isAllTime ? w.totalEarned : 0,
          balance: w.balance,
          totalWithdrawn: isAllTime ? w.totalWithdrawn : 0,
          createdAt: o.createdAt,
        };
        helperMap.set(o.helperId, existing);
      }

      if (ordersWithShopOrders.has(o.id) || (o.selectedShopIds && o.selectedShopIds.length > 0) || o.isStoreOrder) {
        existing.storeOrdersCount += 1;
      }

      if (o.status === 'DELIVERED') {
        existing.completedJobs += 1;
        if (!isAllTime) {
          const baseFeeForHelper = o.isFreeDelivery
            ? Math.max(o.originalDeliveryFee || 0, minFee)
            : Math.max(o.deliveryFee || 0, minFee);
          const helperShare = calculateHelperCommission(baseFeeForHelper, fallbackStore.pricingSettings);
          existing.totalEarned += helperShare;
        }

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
    });

    // If not all time, aggregate helper withdrawals in date range
    if (!isAllTime) {
      fallbackStore.withdrawals.forEach((w) => {
        if (w.status === 'APPROVED' && isInRange(w.createdAt, rangeStartIso, rangeEndIso)) {
          const helper = helperMap.get(w.helperId);
          if (helper) {
            helper.totalWithdrawn += w.amount;
          }
        }
      });
    }

    // Calculate average delivery time & store orders percentage for each helper
    helperMap.forEach((helper, helperId) => {
      const stats = helperDurations.get(helperId);
      if (stats && stats.count > 0) {
        helper.avgDeliveryTimeMins = Math.round(stats.totalMs / (1000 * 60 * stats.count));
      }
      const totalJobs = helper.completedJobs + helper.activeOrders;
      helper.storeOrdersPercentage = totalJobs > 0 ? Math.round((helper.storeOrdersCount / totalJobs) * 100) : 0;
    });

    let list = Array.from(helperMap.values());

    // Zone filter for helpers
    if (isZoneFiltered && targetZoneIds) {
      list = list.filter((h) => {
        const u = users.find((user) => user.uid === h.id);
        if (u) {
          return isUserInZoneScope(u, targetZoneIds, allowedDeliveryAreas);
        }
        const app = applications.find((a) => a.userId === h.id);
        if (app) {
          if (app.assignedAreaIds?.some((id) => targetZoneIds.includes(id))) return true;
          if (app.preferredAreaId && targetZoneIds.includes(app.preferredAreaId)) return true;
        }
        return false;
      });
    }

    // Search
    if (helpersAppliedSearchQuery.trim()) {
      const q = helpersAppliedSearchQuery.toLowerCase().trim();
      list = list.filter(
        (h) =>
          h.name.toLowerCase().includes(q) ||
          h.phone.includes(q) ||
          (h.nid && h.nid.includes(q)) ||
          h.id.toLowerCase().includes(q) ||
          (h.email && h.email.toLowerCase().includes(q))
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
    // walletInputsVersion stands for everything the wallets are computed from
    // inside the store (orders, withdrawals, shop orders, shops, pricing).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, helperSubView, dateRange.preset, rangeStartIso, rangeEndIso, applications, users, allOrders, helpersAppliedSearchQuery, sortBy, walletInputsVersion, isZoneFiltered, targetZoneIds]);

  // 4. Unified Users List with Live Running States
  //
  // Memoised, with the orders indexed once (createUserOrderStats). It used to
  // search the whole order list four times for every user, on every render
  // (470 users × 1,300 orders × 4 ≈ 2.8 s per tab switch).
  const processedUsersList = React.useMemo(() => {
    if (activeTab !== 'USERS_LIST') return [];
    const usersList = serverUsers !== null ? serverUsers : users;
    const ordersSource = serverOrders !== null ? serverOrders : (allOrders.length > 0 ? allOrders : orders);

    const orderStatsOf = createUserOrderStats(ordersSource);

    let list = usersList.map((u) => {
      const { activeReq, activeDel, customerOrdersCount, helperOrdersCount, lastOrderMs } = orderStatsOf(u);

      const registrationDate = u.createdAt ? new Date(u.createdAt) : new Date();
      const now = new Date();
      const diffTime = Math.abs(now.getTime() - registrationDate.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) || 1;

      const weeklyOrderRate = (customerOrdersCount / diffDays) * 7;
      const monthlyOrderRate = (customerOrdersCount / diffDays) * 30;

      let daysSinceLastOrder: number | null = null;
      if (lastOrderMs !== null) {
        const diffLastOrder = Math.abs(now.getTime() - lastOrderMs);
        daysSinceLastOrder = Math.floor(diffLastOrder / (1000 * 60 * 60 * 24));
      }

      // Determine segments
      const segments: string[] = [];
      if (diffDays <= 7) {
        segments.push('NEW_REGISTERED');
      }
      if (customerOrdersCount === 0) {
        segments.push('NEVER_ORDERED');
        if (diffDays >= 14) {
          segments.push('INACTIVE_2_WEEKS');
          segments.push('INACTIVE_1_WEEK');
        } else if (diffDays >= 7) {
          segments.push('INACTIVE_1_WEEK');
        }
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
          if (daysSinceLastOrder >= 7) {
            segments.push('INACTIVE_1_WEEK');
          }
          if (daysSinceLastOrder >= 14) {
            segments.push('INACTIVE_2_WEEKS');
          }
        }
      }

      return {
        user: u,
        activeReq,
        activeDel,
        customerOrdersCount,
        helperOrdersCount,
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

    // Zone scoping filter for users
    if (isZoneFiltered && targetZoneIds) {
      list = list.filter((item) =>
        isUserInZoneScope(item.user, targetZoneIds, allowedDeliveryAreas, ordersSource)
      );
    }

    if (usersAppliedSearchQuery.trim()) {
      const q = usersAppliedSearchQuery.toLowerCase().trim();
      list = list.filter(
        (item) =>
          (item.user.displayName && item.user.displayName.toLowerCase().includes(q)) ||
          (item.user.uid && item.user.uid.toLowerCase().includes(q)) ||
          (item.user.email && item.user.email.toLowerCase().includes(q)) ||
          (item.user.alternativePhone && item.user.alternativePhone.includes(q))
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

    // Coins filter
    if (usersCoinsFilter === 'HAS_COINS') {
      list = list.filter((item) => (item.user.coins || 0) > 0);
    } else if (usersCoinsFilter === 'COINS_50_PLUS') {
      list = list.filter((item) => (item.user.coins || 0) >= 50);
    } else if (usersCoinsFilter === 'COINS_100_PLUS') {
      list = list.filter((item) => (item.user.coins || 0) >= 100);
    } else if (usersCoinsFilter === 'COINS_500_PLUS') {
      list = list.filter((item) => (item.user.coins || 0) >= 500);
    } else if (usersCoinsFilter === 'NO_COINS') {
      list = list.filter((item) => (item.user.coins || 0) === 0);
    } else if (usersCoinsFilter === 'CUSTOM') {
      if (usersMinCoins !== '') {
        const minVal = parseFloat(usersMinCoins) || 0;
        list = list.filter((item) => (item.user.coins || 0) >= minVal);
      }
      if (usersMaxCoins !== '') {
        const maxVal = parseFloat(usersMaxCoins) || 0;
        list = list.filter((item) => (item.user.coins || 0) <= maxVal);
      }
    }

    if (usersSortColumn) {
      list.sort((a, b) => {
        let comparison = 0;
        switch (usersSortColumn) {
          case 'NAME': {
            const nameA = (a.user.displayName || a.user.email || a.user.uid || '').toLowerCase();
            const nameB = (b.user.displayName || b.user.email || b.user.uid || '').toLowerCase();
            comparison = nameA.localeCompare(nameB);
            break;
          }
          case 'ROLE': {
            const roleRank = (u: UserProfile) => (u.isSuperAdmin ? '0' : u.isAdmin ? '1' : u.isHelper ? '2' : u.role || '3');
            comparison = roleRank(a.user).localeCompare(roleRank(b.user));
            break;
          }
          case 'COINS': {
            comparison = (a.user.coins || 0) - (b.user.coins || 0);
            break;
          }
          case 'ORDERS': {
            comparison = a.totalOrdersCount - b.totalOrdersCount;
            break;
          }
          case 'ACTIVITY': {
            const actA = a.activeDel ? 2 : a.activeReq ? 1 : 0;
            const actB = b.activeDel ? 2 : b.activeReq ? 1 : 0;
            comparison = actA - actB;
            break;
          }
          case 'SEGMENTS': {
            const segA = (a.segments || []).join(',');
            const segB = (b.segments || []).join(',');
            comparison = segA.localeCompare(segB);
            break;
          }
          case 'STATUS': {
            const statA = a.user.isBlocked ? 'blocked' : 'active';
            const statB = b.user.isBlocked ? 'blocked' : 'active';
            comparison = statA.localeCompare(statB);
            break;
          }
          case 'DATE': {
            const dateA = new Date(a.user.createdAt || 0).getTime();
            const dateB = new Date(b.user.createdAt || 0).getTime();
            comparison = dateA - dateB;
            break;
          }
          default:
            comparison = 0;
        }
        return usersSortDirection === 'asc' ? comparison : -comparison;
      });
    } else if (usersSortByCoins === 'HIGH_TO_LOW') {
      list.sort((a, b) => (b.user.coins || 0) - (a.user.coins || 0));
    } else if (usersSortByCoins === 'LOW_TO_HIGH') {
      list.sort((a, b) => (a.user.coins || 0) - (b.user.coins || 0));
    } else {
      list.sort((a, b) => {
        if (sortBy === 'OLDEST') return new Date(a.user.createdAt).getTime() - new Date(b.user.createdAt).getTime();
        if (sortBy === 'ORDERS_HIGH') return b.totalOrdersCount - a.totalOrdersCount;
        return new Date(b.user.createdAt).getTime() - new Date(a.user.createdAt).getTime();
      });
    }

    return list;
  }, [
    activeTab, serverUsers, users, serverOrders, allOrders, orders,
    usersStartDate, usersEndDate, usersAppliedSearchQuery, statusFilter, audienceFilter,
    usersCoinsFilter, usersMinCoins, usersMaxCoins, usersSortColumn, usersSortDirection, usersSortByCoins, sortBy,
    isZoneFiltered, targetZoneIds, allowedDeliveryAreas,
  ]);

  // The two big order lists, filtered and sorted once per change of their
  // inputs rather than on every render of this component (which every store
  // update, every keystroke in a search box and every open modal causes).
  const processedOrdersForTab = React.useMemo(
    () => (activeTab === 'ORDERS' ? getProcessedOrders(serverOrders !== null ? serverOrders : allOrders) : []),
    // getProcessedOrders reads exactly the filters listed here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeTab, serverOrders, allOrders, rangeStartIso, rangeEndIso, ordersAppliedSearchQuery, statusFilter, ordersHelperFilter, sortBy, isZoneFiltered, targetZoneIds, allowedDeliveryAreas, users, shops]
  );
  // Which order is each customer's first — for the "first order" badge.
  const firstOrderIds = React.useMemo(
    () => (activeTab === 'ORDERS' || activeTab === 'EXCEPTIONS' ? getFirstOrderIds(orders) : new Set<string>()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeTab, orders]
  );

  // Generic Pagination Calculator
  function paginateList<T>(items: T[], customPage?: number, customPageSize?: number, overrideTotalCount?: number) {
    const pageToUse = customPage ?? currentPage;
    const sizeToUse = customPageSize ?? pageSize;
    const totalCount = (overrideTotalCount !== undefined && overrideTotalCount > 0) ? Math.max(overrideTotalCount, items.length) : items.length;
    const totalPages = Math.ceil(totalCount / sizeToUse) || 1;
    const paginatedItems = items.slice((pageToUse - 1) * sizeToUse, pageToUse * sizeToUse);
    return { totalPages, paginatedItems, totalItems: totalCount };
  }

  const shopById = React.useMemo(() => {
    const map = new Map<string, Shop>();
    shops.forEach((shop) => {
      if (!map.has(shop.id)) map.set(shop.id, shop);
    });
    return map;
  }, [shops]);

  // Filter out custom costs and only include requests sent to registered shops that can receive orders in app
  const realStoreOrders = React.useMemo(() => {
    return shopOrders.filter((so) => {
      if (!so) return false;
      // Exclude custom cost orders (MySelf / seller custom entries)
      if (so.shopId === 'myself' || so.shopName === 'MySelf' || so.id?.startsWith('so-myself') || so.sellerName) {
        return false;
      }
      // Only include orders sent to a registered store that can receive/accept orders directly in app
      const targetShop = shopById.get(so.shopId) || fallbackStore.shops.get(so.shopId);
      if (!targetShop) return false;
      if (targetShop.canReceiveOrders === false) return false;
      return true;
    });
  }, [shopOrders, shopById]);

  const processedStoreOrdersForTab = React.useMemo(
    () => (activeTab === 'STORE_ORDERS' ? getProcessedStoreOrders(realStoreOrders) : []),
    // getProcessedStoreOrders reads exactly the filters listed here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeTab, realStoreOrders, rangeStartIso, rangeEndIso, storeOrdersAppliedSearchQuery, storeOrdersStatusFilter, storeOrdersShopFilter, storeOrdersHelperFilter, storeOrdersSortBy]
  );

  // Sales, commission and payout figures of every shop, for the Shops tab,
  // from the unified store financials (fallbackStore.getStoreFinancials) so
  // they match the shop details modal and the store's own wallet.
  // Computed only on the Shops tab and only when its inputs change.
  // "Today's sales" turns over at midnight, so the day is one of its inputs.
  const todayKey = new Date().toDateString();
  type ShopMetrics = {
    completed: number; rejected: number; running: number;
    totalSales: number; todaySales: number;
    commission: number; disbursedCommission: number; unpaidCommission: number;
    netSales: number; totalDisbursed: number; unpaidBalance: number;
  };
  const shopMetricsMap = React.useMemo(
    () => {
      const map = new Map<string, ShopMetrics>();
      if (activeTab !== 'SHOPS') return map;
      (serverShops !== null ? serverShops : shops).forEach((s) => {
        const fin = fallbackStore.getStoreFinancials(s);
        map.set(s.id, {
          completed: fin.completedOrders,
          rejected: fin.canceledOrders,
          running: fin.runningOrders,
          totalSales: fin.totalSales,
          todaySales: fin.todaySales,
          commission: fin.deliveredCommission,
          disbursedCommission: fin.disbursedCommission,
          unpaidCommission: fin.unpaidCommission,
          netSales: fin.deliveredNetSales,
          totalDisbursed: fin.totalDisbursed,
          unpaidBalance: fin.unpaidBalance,
        });
      });
      return map;
    },
    // walletInputsVersion covers the three store collections read above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeTab, serverShops, shops, walletInputsVersion, todayKey]
  );

  // Who is a store, for labelling and filtering withdrawals: looked up per
  // withdrawal, so a set and a map rather than a search of users and shops.
  const storeUserIds = React.useMemo(() => {
    const ids = new Set<string>();
    users.forEach((u) => {
      if (u.isStore || u.role === 'store') ids.add(u.uid);
    });
    return ids;
  }, [users]);
  const shopByOwnerId = React.useMemo(() => {
    const map = new Map<string, Shop>();
    shops.forEach((shop) => {
      if (shop.ownerUserId && !map.has(shop.ownerUserId)) map.set(shop.ownerUserId, shop);
    });
    return map;
  }, [shops]);

  const tabsList = [
    { key: 'EXCEPTIONS', label: 'Needs Attention', icon: AlertCircle, color: 'text-amber-500' },
    { key: 'GROWTH', label: 'Growth & Everyday Rates', icon: BarChart2, color: 'text-indigo-600' },
    { key: 'ORDERS', label: 'All Orders', icon: ShoppingBag, color: 'text-emerald-600' },
    { key: 'STORE_ORDERS', label: 'All Store Orders', icon: Store, color: 'text-purple-600' },
    { key: 'USERS_LIST', label: 'User Lists', icon: Users, color: 'text-purple-600' },
    { key: 'HELPERS', label: 'Helpers', icon: Bike, color: 'text-emerald-600' },
    { key: 'SHOPS', label: 'Shops', icon: Store, color: 'text-purple-600' },
    { key: 'FEEDBACK', label: 'Order Feedback', icon: Star, color: 'text-amber-500' },
    { key: 'CUSTOM_MODALS', label: 'Custom Modals', icon: Sparkles, color: 'text-purple-600' },
    { key: 'NOTIFICATIONS', label: 'Notification History', icon: Bell, color: 'text-purple-600' },
    { key: 'REVENUE', label: 'Revenue Analytics', icon: TrendingUp, color: 'text-emerald-600' },
    { key: 'WITHDRAWALS', label: 'Commissions Requests', icon: DollarSign, color: 'text-purple-600' },
    { key: 'PRICING', label: 'Pricing', icon: DollarSign, color: 'text-emerald-600' },
    { key: 'ADDRESSES', label: 'Server Addresses', icon: MapPin, color: 'text-teal-600' },
    { key: 'REWARDS', label: 'Coins & Rewards', icon: Gift, color: 'text-amber-500' },
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

  // Helper wallets, per-user order counts and the longest-delivery list are
  // summed over every order, so these views read the full history — on
  // demand, once per session — instead of every admin session doing it.
  const lifetimeData = useAdminLifetimeData(
    (activeTab === 'HELPERS' && dateRange.preset === 'ALL_TIME') || activeTab === 'USERS_LIST' || activeTab === 'SHOPS' || showHighDurationModal
  );

  // If no zone is assigned to a normal admin, he cannot see anything
  if (!isSuperAdmin && adminAssignedAreaIds.length === 0) {
    return (
      <div className="max-w-xl mx-auto my-16 p-8 sm:p-10 bg-white rounded-3xl border border-red-200 shadow-2xl text-center space-y-6 animate-in fade-in zoom-in-95 duration-200">
        <div className="w-20 h-20 bg-red-50 text-red-600 rounded-3xl flex items-center justify-center mx-auto shadow-inner border border-red-200">
          <MapPin className="w-10 h-10 animate-bounce text-red-500" />
        </div>
        <div className="space-y-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-100 text-red-800 text-xs font-black uppercase tracking-wider border border-red-200">
            <span>🔒 সার্ভিস জোন নির্ধারিত নেই</span>
          </div>
          <h2 className="text-2xl font-black text-gray-900 tracking-tight">
            অ্যাক্সেস সীমাবদ্ধ (No Zone Assigned)
          </h2>
          <p className="text-sm text-gray-600 max-w-md mx-auto leading-relaxed">
            আপনার অ্যাকাউন্টে কোনো সার্ভিস জোন বরাদ্দ করা হয়নি। অ্যাডমিন হিসেবে কোনো ডাটা (অর্ডার, হেলপার, অ্যাপ্লিকেশন ইত্যাদি) অ্যাক্সেস করতে হলে আপনাকে নির্দিষ্ট জোনে অ্যাসাইন থাকতে হবে।
          </p>
        </div>

        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-medium text-left space-y-1.5">
          <p className="font-extrabold flex items-center gap-1.5 text-amber-950">
            <span>ℹ️ পরবর্তী করণীয়:</span>
          </p>
          <p>
            অনুগ্রহ করে সুপার অ্যাডমিনের সাথে যোগাযোগ করুন। সুপার অ্যাডমিন আপনাকে নির্দিষ্ট কর্মএলাকা/জোনে অ্যাসাইন করার সাথে সাথেই আপনি শুধু সেই জোনের তথ্য দেখতে ও পরিচালনা করতে পারবেন।
          </p>
        </div>

        <div className="pt-2">
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-2.5 rounded-2xl bg-gray-900 hover:bg-gray-800 text-white text-xs font-black transition-all shadow-md active:scale-95 cursor-pointer"
          >
            পেজ রিফ্রেশ করুন
          </button>
        </div>
      </div>
    );
  }

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
      {/* Zone Scope & Administration Bar (Between Header and Main Dashboard Block) */}
      <div className="bg-white/90 backdrop-blur-md border border-purple-200/80 rounded-2xl p-3 sm:px-4 sm:py-3 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center space-x-2.5 min-w-0">
          <div className="p-2 rounded-xl bg-purple-50 text-purple-700 shrink-0 border border-purple-200/60 shadow-xs">
            <MapPin className="w-4 h-4 text-purple-700" />
          </div>
          <div className="min-w-0">
            <span className="text-[10px] font-black text-purple-700 uppercase tracking-wider block">
              {isSuperAdmin ? 'অ্যাডমিন জোন কন্ট্রোল (Zone Scope)' : 'আপনার বরাদ্দকৃত সার্ভিস এলাকা (Assigned Zone)'}
            </span>
            {isSuperAdmin ? (
              <span className="text-xs font-extrabold text-gray-900 block truncate">
                {selectedZoneFilter === 'ALL'
                  ? `🌐 সব জোন সক্রিয় (${allowedDeliveryAreas.length}টি এলাকা)`
                  : `📍 নির্বাচিত জোন: ${allowedDeliveryAreas.find((a) => a.id === selectedZoneFilter)?.name || selectedZoneFilter}`}
              </span>
            ) : assignedZoneNames ? (
              <span className="text-xs font-extrabold text-gray-900 block truncate">
                📍 {assignedZoneNames}
              </span>
            ) : (
              <span className="text-xs font-bold text-red-600 block">
                ⚠️ কোনো জোন বরাদ্দ করা হয়নি (No Zone Assigned)
              </span>
            )}
          </div>
        </div>

        {/* Dropdown Selector / Badges */}
        <div className="flex items-center space-x-2 self-start sm:self-center shrink-0">
          {isSuperAdmin ? (
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-50 border border-purple-200 text-purple-950 text-xs font-black shadow-xs">
              <span className="text-[11px] text-purple-700 font-bold hidden xs:inline">ফিল্টার:</span>
              <select
                value={selectedZoneFilter}
                onChange={(e) => {
                  const val = e.target.value;
                  setSelectedZoneFilter(val);
                  fallbackStore.setAdminZoneFilter(val);
                }}
                className="bg-transparent text-purple-950 font-black text-xs focus:outline-none cursor-pointer pr-1"
              >
                <option value="ALL">🌐 সব জোন (All Zones - {allowedDeliveryAreas.length})</option>
                {allowedDeliveryAreas.map((area) => (
                  <option key={area.id} value={area.id}>
                    📍 {area.name}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-950 text-xs font-black shadow-xs">
              <span className="text-[11px] text-emerald-700 font-bold">নির্ধারিত জোন:</span>
              <span className="text-xs font-extrabold text-emerald-900 truncate max-w-[240px]">
                {assignedZoneNames || 'কোনো জোন বরাদ্দ নেই'}
              </span>
            </div>
          )}
        </div>
      </div>

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
                <p className="text-xs md:text-sm text-purple-200 font-medium mt-1">
                  Real-time operations, scalable pagination, helper assignment & analytics control.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center flex-wrap gap-2">
            <button
              onClick={() => setShowPushNotificationModal(true)}
              className="text-xs font-extrabold px-3 py-2 rounded-2xl bg-purple-600 hover:bg-purple-500 text-white flex items-center space-x-2 shadow-lg shadow-purple-950/40 transition-all border border-purple-400/30 active:scale-95 cursor-pointer"
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
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-4 gap-4">
        {/* Needs Attention Metric */}
        <div
          onClick={() => isTabAllowed('EXCEPTIONS') && setActiveTab('EXCEPTIONS')}
          className={`p-5 rounded-3xl border transition-all ${isTabAllowed('EXCEPTIONS')
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
          className={`p-5 rounded-3xl border shadow-soft transition-all ${isTabAllowed('ORDERS')
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
            <span className="text-3xl font-extrabold text-gray-900">
              {isZoneFiltered ? scopedAllOrders.length : (exactTotalOrders !== null ? exactTotalOrders : allOrders.length)}
            </span>
            <span className="text-xs text-gray-500">{isZoneFiltered ? 'in selected zone' : 'total in system'}</span>
          </div>
        </div>

        {/* Average Order Acceptance Time Metric */}
        <div
          onClick={() => isTabAllowed('ORDERS') && setActiveTab('ORDERS')}
          className={`p-5 rounded-3xl border shadow-soft transition-all ${isTabAllowed('ORDERS')
              ? 'bg-white border-gray-100 hover:border-blue-300 cursor-pointer'
              : 'opacity-50 cursor-not-allowed bg-gray-50 border-gray-100'
            }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-extrabold text-gray-500 uppercase tracking-wider">
              Avg Accept Time
            </span>
            <div className="p-2 rounded-2xl bg-blue-100 text-blue-700">
              <Zap className="w-5 h-5" />
            </div>
          </div>
          <div className="flex items-baseline space-x-2">
            <span className="text-3xl font-extrabold text-gray-900">
              {(serverAvgAcceptanceTimeMins !== null ? serverAvgAcceptanceTimeMins : avgAcceptanceTimeMins) > 0
                ? formatDurationMinutes(serverAvgAcceptanceTimeMins !== null ? serverAvgAcceptanceTimeMins : avgAcceptanceTimeMins)
                : 'N/A'}
            </span>
            <span className="text-xs text-blue-600 font-semibold">order acceptance</span>
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
              {(serverAvgDeliveryTimeMins !== null ? serverAvgDeliveryTimeMins : avgDeliveryTimeMins) > 0
                ? formatDurationMinutes(serverAvgDeliveryTimeMins !== null ? serverAvgDeliveryTimeMins : avgDeliveryTimeMins)
                : 'N/A'}
            </span>
            <span className="text-xs text-gray-500">per order</span>
          </div>
        </div>

        {/* Total Hours of Work Metric */}
        <div
          onClick={() => isTabAllowed('ORDERS') && setActiveTab('ORDERS')}
          className={`p-5 rounded-3xl border shadow-soft transition-all ${isTabAllowed('ORDERS')
              ? 'bg-white border-gray-100 hover:border-teal-300 cursor-pointer'
              : 'opacity-50 cursor-not-allowed bg-gray-50 border-gray-100'
            }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-extrabold text-gray-500 uppercase tracking-wider">
              Total Work Hours
            </span>
            <div className="p-2 rounded-2xl bg-teal-100 text-teal-700">
              <Timer className="w-5 h-5" />
            </div>
          </div>
          <div className="flex items-baseline space-x-2">
            <span className="text-3xl font-extrabold text-gray-900">
              {totalHoursOfWork} <span className="text-lg font-bold text-gray-600">hrs</span>
            </span>
            <span className="text-xs text-teal-700 font-semibold">{rangeStatus === 'loading' ? 'loading…' : `orders placed ${describeRange(dateRange)}`}</span>
          </div>
        </div>

        {/* Overall Reviews Metric */}
        <div
          onClick={() => isTabAllowed('FEEDBACK') && setActiveTab('FEEDBACK')}
          className={`p-5 rounded-3xl border shadow-soft transition-all ${isTabAllowed('FEEDBACK')
              ? 'bg-white border-gray-100 hover:border-amber-300 cursor-pointer'
              : 'opacity-50 cursor-not-allowed bg-gray-50 border-gray-100'
            }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-extrabold text-gray-500 uppercase tracking-wider">
              Overall Reviews
            </span>
            <div className="p-2 rounded-2xl bg-amber-100 text-amber-700">
              <Star className="w-5 h-5 fill-amber-400 text-amber-500" />
            </div>
          </div>
          <div className="flex items-baseline space-x-2">
            <span className="text-3xl font-extrabold text-gray-900">
              {overallReviewStats.avgRating} <span className="text-amber-500 text-xl font-bold">★</span>
            </span>
            <span className="text-xs text-amber-700 font-semibold">({overallReviewStats.count} reviews)</span>
          </div>
        </div>

        {/* Customer Accounts Metric */}
        <div
          onClick={() => isTabAllowed('USERS_LIST') && setActiveTab('USERS_LIST')}
          className={`p-5 rounded-3xl border shadow-soft transition-all ${isTabAllowed('USERS_LIST')
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
            <span className="text-3xl font-extrabold text-gray-900">
              {exactCustomerAccounts !== null ? exactCustomerAccounts : users.length}
            </span>
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
          className={`p-5 rounded-3xl border shadow-soft transition-all ${isTabAllowed('HELPERS')
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
            <span className="text-3xl font-extrabold text-gray-900">
              {isZoneFiltered ? approvedHelpersCount : (exactActiveHelpers !== null ? exactActiveHelpers : approvedHelpersCount)}
            </span>
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

        {isTabAllowed('GROWTH') && (
          <button
            onClick={() => setActiveTab('GROWTH')}
            data-active={activeTab === 'GROWTH'}
            className={`py-3 px-4 rounded-xl whitespace-nowrap transition-all flex items-center space-x-2 shrink-0 ${activeTab === 'GROWTH'
              ? 'bg-white text-purple-950 shadow-md border border-gray-200/80 font-black'
              : 'text-gray-600 hover:text-gray-900 font-semibold'
              }`}
          >
            <BarChart2 className="w-4 h-4 text-indigo-600 shrink-0" />
            <span>Growth & Everyday Rates</span>
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
            <span>All Orders ({exactTotalOrders !== null ? exactTotalOrders : orders.length})</span>
          </button>
        )}

        {isTabAllowed('STORE_ORDERS') && (
          <button
            onClick={() => setActiveTab('STORE_ORDERS')}
            data-active={activeTab === 'STORE_ORDERS'}
            className={`py-3 px-4 rounded-xl whitespace-nowrap transition-all flex items-center space-x-2 shrink-0 ${activeTab === 'STORE_ORDERS'
              ? 'bg-white text-purple-950 shadow-md border border-gray-200/80 font-black'
              : 'text-gray-600 hover:text-gray-900 font-semibold'
              }`}
          >
            <Store className="w-4 h-4 text-purple-600 shrink-0" />
            <span>All Store Orders ({realStoreOrders.length})</span>
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
            <span>User Lists ({exactCustomerAccounts !== null ? exactCustomerAccounts : users.length})</span>
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
            <span>Helpers ({isZoneFiltered ? approvedHelpersCount : (exactActiveHelpers !== null ? exactActiveHelpers : approvedHelpersCount)})</span>
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
            <span>Shops ({exactShopsCount !== null ? exactShopsCount : shops.length})</span>
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
            <span>Order Feedback ({exactFeedbacksCount !== null ? exactFeedbacksCount : feedbacks.length})</span>
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
            <span>Custom Modals ({exactCustomModalsCount !== null ? exactCustomModalsCount : customModals.length})</span>
          </button>
        )}

        {isTabAllowed('NOTIFICATIONS') && (
          <button
            onClick={() => setActiveTab('NOTIFICATIONS')}
            data-active={activeTab === 'NOTIFICATIONS'}
            className={`py-3 px-4 rounded-xl whitespace-nowrap transition-all flex items-center space-x-2 shrink-0 ${activeTab === 'NOTIFICATIONS'
              ? 'bg-white text-purple-950 shadow-md border border-gray-200/80 font-black'
              : 'text-gray-600 hover:text-gray-900 font-semibold'
              }`}
          >
            <Bell className="w-4 h-4 text-purple-600 shrink-0" />
            <span>Notification History</span>
            {Array.from(fallbackStore.scheduledNotifications.values()).length > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-purple-600 text-white text-[10px] shrink-0 font-bold">
                {Array.from(fallbackStore.scheduledNotifications.values()).length} sched
              </span>
            )}
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
            <span>Commissions Requests ({exactWithdrawalsCount !== null ? exactWithdrawalsCount : withdrawals.length})</span>
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

        {isTabAllowed('ADDRESSES') && (
          <button
            onClick={() => setActiveTab('ADDRESSES')}
            data-active={activeTab === 'ADDRESSES'}
            className={`py-3 px-4 rounded-xl whitespace-nowrap transition-all flex items-center space-x-2 shrink-0 ${activeTab === 'ADDRESSES'
              ? 'bg-white text-teal-950 shadow-md border border-gray-200/80 font-black'
              : 'text-gray-600 hover:text-gray-900 font-semibold'
              }`}
          >
            <MapPin className="w-4 h-4 text-teal-600 shrink-0" />
            <span>Server Addresses</span>
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

        {isTabAllowed('REWARDS') && (
          <button
            onClick={() => setActiveTab('REWARDS')}
            data-active={activeTab === 'REWARDS'}
            className={`py-3 px-4 rounded-xl whitespace-nowrap transition-all flex items-center space-x-2 shrink-0 ${activeTab === 'REWARDS'
              ? 'bg-white text-purple-950 shadow-md border border-gray-200/80 font-black'
              : 'text-gray-600 hover:text-gray-900 font-semibold'
              }`}
          >
            <Coins className="w-4 h-4 text-amber-500 shrink-0" />
            <span>Coins & Rewards</span>
            {pendingRewardClaims.length > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-amber-500 text-white text-[10px] shrink-0 font-bold">
                {pendingRewardClaims.length}
              </span>
            )}
          </button>
        )}
      </DraggableTabsContainer>

      {/* Date range — the very top of the order lists and helper performance. Only these days are read. */}
      {(activeTab === 'ORDERS' || activeTab === 'STORE_ORDERS' || activeTab === 'HELPERS') && isTabAllowed(activeTab) && (
        <AdminDateRangeFilter
          value={dateRange}
          onChange={setDateRange}
          loading={rangeStatus === 'loading'}
          error={rangeStatus === 'error'}
          onRetry={() => reloadRange(true)}
          summary={
            activeTab === 'ORDERS'
              ? `${processedOrdersForTab.length} order${processedOrdersForTab.length === 1 ? '' : 's'}`
              : activeTab === 'STORE_ORDERS'
                ? `${processedStoreOrdersForTab.length} store order${processedStoreOrdersForTab.length === 1 ? '' : 's'}`
                : `${processedHelpers.length} helper${processedHelpers.length === 1 ? '' : 's'}`
          }
        />
      )}

      {/* Global Search & Sorting Bar (Visible on list tabs) */}
      {activeTab !== 'PRICING' && activeTab !== 'SETTINGS' && activeTab !== 'GROWTH' && activeTab !== 'REVENUE' && activeTab !== 'REWARDS' && activeTab !== 'ADDRESSES' && (() => {
        const getTabSearchStates = () => {
          switch (activeTab) {
            case 'ORDERS':
              return { value: ordersSearchQuery, onChange: setOrdersSearchQuery, onSearch: () => { setCurrentPage(1); setOrdersAppliedSearchQuery(ordersSearchQuery); }, placeholder: "Search orders by ID, customer name, phone, item name..." };
            case 'USERS_LIST':
              return { value: usersSearchQuery, onChange: setUsersSearchQuery, onSearch: () => { setCurrentPage(1); setUsersAppliedSearchQuery(usersSearchQuery); }, placeholder: "Search users by name, UID, email, phone..." };
            case 'HELPERS':
              return { value: helpersSearchQuery, onChange: setHelpersSearchQuery, onSearch: () => { setCurrentPage(1); setHelpersAppliedSearchQuery(helpersSearchQuery); }, placeholder: "Search helpers by name, phone, email, NID..." };
            case 'WITHDRAWALS':
              return { value: withdrawalsSearchQuery, onChange: setWithdrawalsSearchQuery, onSearch: () => { setCurrentPage(1); setWithdrawalsAppliedSearchQuery(withdrawalsSearchQuery); }, placeholder: "Search withdrawals by helper name, account number, ID..." };
            case 'SHOPS':
              return { value: shopsSearchQuery, onChange: setShopsSearchQuery, onSearch: () => { setCurrentPage(1); setShopsAppliedSearchQuery(shopsSearchQuery); }, placeholder: "Search shops by name, type, contact person, address..." };
            case 'FEEDBACK':
              return { value: feedbackSearchQuery, onChange: setFeedbackSearchQuery, onSearch: () => { setCurrentPage(1); setFeedbackAppliedSearchQuery(feedbackSearchQuery); }, placeholder: "Search feedback by rating, order ID, note..." };
            case 'CUSTOM_MODALS':
              return { value: customModalsSearchQuery, onChange: setCustomModalsSearchQuery, onSearch: () => { setCurrentPage(1); setCustomModalsAppliedSearchQuery(customModalsSearchQuery); }, placeholder: "Search custom modals by title, label, ID..." };
            default:
              return null;
          }
        };

        const searchStates = getTabSearchStates();
        if (!searchStates) return null;

        return (
          <div className="bg-white p-4 rounded-3xl border border-gray-100 shadow-soft flex flex-col gap-3">
            {/* Top row: Search + action buttons */}
            <div className="flex gap-2 w-full">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-3.5" />
                <input
                  type="text"
                  placeholder={searchStates.placeholder}
                  value={searchStates.value}
                  onChange={(e) => searchStates.onChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      searchStates.onSearch();
                    }
                  }}
                  className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-2xl text-xs font-semibold focus:outline-none focus:bg-white focus:border-purple-600 focus:ring-4 focus:ring-purple-600/10 transition-all"
                />
              </div>
              <button
                onClick={() => {
                  searchStates.onSearch();
                }}
                disabled={isFetchingServer}
                className="px-5 py-2.5 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-400 text-white font-extrabold text-xs rounded-2xl shadow-md transition-all active:scale-95 shrink-0 flex items-center gap-1.5"
              >
                {isFetchingServer && <RefreshCw className="w-3 h-3 animate-spin" />}
                {isFetchingServer ? 'Loading...' : 'Search'}
              </button>
              {/* Refresh button — visible on all non-realtime, non-settings tabs */}
              {(['ORDERS', 'USERS_LIST', 'HELPERS', 'WITHDRAWALS', 'SHOPS', 'FEEDBACK', 'CUSTOM_MODALS', 'REWARDS', 'REVENUE', 'GROWTH'] as string[]).includes(activeTab) && (
                <button
                  id="admin-refresh-btn"
                  onClick={() => handleAdminRefresh()}
                  disabled={isRefreshing}
                  title={lastRefreshedAt ? `Last refreshed: ${lastRefreshedAt.toLocaleTimeString()}` : 'Refresh data'}
                  className="px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-300 text-white font-extrabold text-xs rounded-2xl shadow-md transition-all active:scale-95 shrink-0 flex items-center gap-1.5"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
                  {isRefreshing ? 'Refreshing...' : lastRefreshedAt ? `Updated ${lastRefreshedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Refresh'}
                </button>
              )}
            </div>

          </div>
        );
      })()}

      {activeTab !== 'PRICING' && activeTab !== 'SETTINGS' && activeTab !== 'NOTIFICATIONS' && activeTab !== 'REWARDS' && (
        <div className="bg-white p-4 rounded-3xl border border-gray-100 shadow-soft flex flex-col gap-3 -mt-4 border-t-0 rounded-t-none">

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

            {/* Helper Filter (for Orders tab) */}
            {activeTab === 'ORDERS' && (
              <div className="flex items-center space-x-1.5 text-xs font-bold text-gray-600">
                <Bike className="w-4 h-4 text-purple-600 shrink-0" />
                <select
                  value={ordersHelperFilter}
                  onChange={(e) => {
                    setOrdersHelperFilter(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold text-gray-800 focus:outline-none focus:border-purple-600 max-w-[200px]"
                >
                  <option value="ALL">All Helpers</option>
                  <option value="UNASSIGNED">Unassigned Only</option>
                  {helperOptions.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.name} {h.phone && h.phone !== 'N/A' ? `(${h.phone})` : ''}
                    </option>
                  ))}
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
                    <option value="RARE_ORDERS_WEEK">Low Frequency: &lt;1 order/week</option>
                    <option value="RARE_ORDERS_MONTH">Low Frequency: &lt;1 order/month</option>
                    <option value="INACTIVE_1_WEEK">Inactive: No order since 1 week</option>
                    <option value="INACTIVE_2_WEEKS">Inactive: No order since 2 weeks</option>
                    <option value="NEVER_ORDERED">Never Ordered (0 orders)</option>
                    <option value="NEW_REGISTERED">New Registered (last 7 days)</option>
                  </select>
                </div>
              </>
            )}

            {activeTab === 'WITHDRAWALS' && (
              <div className="flex items-center space-x-2">
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
                <div className="flex items-center space-x-1.5 text-xs font-bold text-gray-600">
                  <select
                    value={withdrawalTypeFilter}
                    onChange={(e) => setWithdrawalTypeFilter(e.target.value)}
                    className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold text-gray-800 focus:outline-none focus:border-purple-600"
                  >
                    <option value="ALL">All Types (Helper & Store)</option>
                    <option value="HELPER">Helper Only</option>
                    <option value="STORE">Store Only</option>
                  </select>
                </div>
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
                {activeTab === 'HELPERS' && (
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

        // Per-section pagination helpers
        const paginate = <T,>(list: T[], page: number, size: number) => ({
          items: list.slice((page - 1) * size, page * size),
          totalPages: Math.max(1, Math.ceil(list.length / size)),
        });
        const pc = paginate(cancelling, excCancelPage, excCancelPageSize);
        const pfa = paginate(feeAdjustments, excFeeAdjPage, excFeeAdjPageSize);
        const pna = paginate(notAccepted, excNotAcceptedPage, excNotAcceptedPageSize);
        const pdl = paginate(delayedOrders, excDelayedPage, excDelayedPageSize);
        const pbf = paginate(badFeedbacks, excBadFeedbackPage, excBadFeedbackPageSize);
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
          delayedOrders.length > 0 ||
          pendingRewardClaims.length > 0 ||
          badFeedbacks.length > 0;

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
                                  <div className="font-bold text-gray-900 max-w-xs truncate">{ord.service || ord.title || ord.items?.[0]?.name || 'Order'}</div>
                                  <div className="text-[11px] text-gray-500">{(ord.items || []).length} items</div>
                                </td>
                                <td className="py-3.5 px-5 font-extrabold text-emerald-700">
                                  {ord.isFreeDelivery ? (
                                    <div>
                                      <span>৳0</span>
                                      <span className="block text-[9px] font-black text-amber-800 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded w-fit mt-0.5">
                                        🎁 Reward Claimed
                                      </span>
                                    </div>
                                  ) : (
                                    `৳${ord.deliveryFee}`
                                  )}
                                </td>
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

                {/* 3.6 Bad / Negative Customer Feedback */}
                {badFeedbacks.length > 0 && (
                  <div className="bg-white rounded-3xl border border-gray-100 shadow-soft overflow-hidden animate-in fade-in duration-200">
                    <div className="p-5 border-b border-gray-100 bg-red-50/60 flex items-center justify-between">
                      <h3 className="font-extrabold text-sm text-gray-900 flex items-center space-x-2">
                        <ThumbsDown className="w-4 h-4 text-red-600 animate-bounce" />
                        <span>Bad Feedback / Negative Reviews ({badFeedbacks.length})</span>
                      </h3>
                      <button
                        onClick={() => setActiveTab('FEEDBACK')}
                        className="text-xs font-extrabold text-red-700 hover:text-red-900 underline cursor-pointer"
                      >
                        Feedback Tab →
                      </button>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs text-gray-600 min-w-[650px]">
                        <thead className="bg-gray-50 text-gray-700 uppercase font-extrabold text-[10px] tracking-wider border-b border-gray-100">
                          <tr>
                            <th className="py-3 px-5">Order ID</th>
                            <th className="py-3 px-5">Customer</th>
                            <th className="py-3 px-5">Helper / Shop</th>
                            <th className="py-3 px-5">Feedback</th>
                            <th className="py-3 px-5">Reason / Comment</th>
                            <th className="py-3 px-5">Date</th>
                            <th className="py-3 px-5 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 font-medium">
                          {pbf.items.map((fb) => (
                            <tr key={fb.id} className="hover:bg-gray-50/80 transition-colors">
                              <td className="py-3.5 px-5 font-bold text-gray-900">
                                {fb.orderId ? (
                                  <button
                                    onClick={() => setSelectedOrderId(fb.orderId)}
                                    className="text-purple-900 hover:text-purple-950 hover:underline font-extrabold cursor-pointer"
                                  >
                                    #{fb.orderId}
                                  </button>
                                ) : (
                                  <span className="text-gray-400">N/A</span>
                                )}
                              </td>
                              <td className="py-3.5 px-5">
                                <div className="font-extrabold text-gray-900">{fb.customerName || 'Customer'}</div>
                                <div className="text-[10px] text-gray-400 font-mono">{fb.customerId}</div>
                              </td>
                              <td className="py-3.5 px-5">
                                <div className="font-bold text-gray-800">{fb.helperName || fb.shopName || 'Unassigned'}</div>
                              </td>
                              <td className="py-3.5 px-5">
                                {fb.thumbsUp === false ? (
                                  <div className="space-y-1">
                                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-red-100 text-red-800 font-extrabold text-[10px]">
                                      <ThumbsDown className="w-3 h-3" /> খারাপ লেগেছে
                                    </span>
                                    {fb.badReason && (
                                      <span className="block text-[10px] font-black text-red-700 bg-red-50 px-2 py-0.5 rounded border border-red-200 w-fit">
                                        {fb.badReason === 'RIDER' ? '🚴 রাইডার' : fb.badReason === 'PRODUCT' ? '🛍️ প্রোডাক্ট' : '🚴 রাইডার + 🛍️ প্রোডাক্ট'}
                                      </span>
                                    )}
                                  </div>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-red-600 font-extrabold text-xs">
                                    <Star className="w-3.5 h-3.5 fill-red-400 text-red-400" />
                                    {fb.serviceRating || fb.riderRating || 1}/5
                                  </span>
                                )}
                              </td>
                              <td className="py-3.5 px-5">
                                {fb.improvementComment ? (
                                  <div className="p-2 rounded-xl bg-red-50 border border-red-200 text-red-950 font-semibold max-w-xs text-[11px] leading-snug">
                                    &ldquo;{fb.improvementComment}&rdquo;
                                  </div>
                                ) : (
                                  <span className="text-gray-400 italic">No comment specified</span>
                                )}
                              </td>
                              <td className="py-3.5 px-5 text-gray-400 font-mono text-[10px]">
                                {new Date(fb.createdAt).toLocaleDateString('bn-BD')}
                              </td>
                              <td className="py-3.5 px-5 text-right">
                                <div className="flex justify-end items-center space-x-1.5 flex-wrap gap-1">
                                  {fb.orderId && (
                                    <button
                                      onClick={() => setSelectedOrderId(fb.orderId)}
                                      className="py-1.5 px-3 rounded-xl bg-purple-900 hover:bg-purple-950 text-white font-extrabold text-xs shadow-sm transition-all cursor-pointer"
                                    >
                                      Details
                                    </button>
                                  )}
                                  <button
                                    onClick={async () => {
                                      const confirmed = await showConfirm(
                                        'Mutually Discussed নিশ্চিতকরণ',
                                        `আপনি কি "${fb.customerName || 'কাস্টমার'}" এর ব্যাড ফিডব্যাকটি আলোচনা সম্পন্ন হয়েছে বলে চিহ্নিত করতে চান? এটি এই তালিকা থেকে সরিয়ে দেওয়া হবে।`,
                                        'হ্যাঁ, আলোচনা হয়েছে',
                                        'বাতিল'
                                      );
                                      if (confirmed) {
                                        await fallbackStore.updateOrderFeedbackMutuallyDiscussed(fb.id, true);
                                        setFeedbacks((prev) =>
                                          prev.map((f) => (f.id === fb.id ? { ...f, mutuallyDiscussed: true } : f))
                                        );
                                        setAllOrders((prev) =>
                                          prev.map((o) =>
                                            o.id === fb.orderId
                                              ? {
                                                ...o,
                                                mutuallyDiscussed: true,
                                                feedback: o.feedback ? { ...o.feedback, mutuallyDiscussed: true } : o.feedback,
                                              }
                                              : o
                                          )
                                        );
                                        showAlert('সফল', 'ফিডব্যাকটি mutually discussed হিসেবে চিহ্নিত করা হয়েছে।', 'success');
                                      }
                                    }}
                                    className="py-1.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs shadow-sm transition-all animate-pulse cursor-pointer"
                                  >
                                    Mutually Discussed
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <PaginationControl
                      currentPage={Math.min(excBadFeedbackPage, pbf.totalPages)}
                      totalPages={pbf.totalPages}
                      totalItems={badFeedbacks.length}
                      pageSize={excBadFeedbackPageSize}
                      onPageChange={(p) => setExcBadFeedbackPage(p)}
                      onPageSizeChange={(s) => { setExcBadFeedbackPageSize(s); setExcBadFeedbackPage(1); }}
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
                            <th className="py-3 px-5">Type</th>
                            <th className="py-3 px-5">Name</th>
                            <th className="py-3 px-5">Amount</th>
                            <th className="py-3 px-5">Method</th>
                            <th className="py-3 px-5">Note / Mobile / TxID</th>
                            <th className="py-3 px-5 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 font-medium">
                          {pwd.items.map((w) => {
                            const shop = shopByOwnerId.get(w.helperId);
                            const isStore = w.userType === 'store' || Boolean(shop) || storeUserIds.has(w.helperId);
                            const storeName = shop?.name;
                            return (
                              <tr key={w.id} className="hover:bg-gray-50/80 transition-colors">
                                <td className="py-3.5 px-5">
                                  <span
                                    className={`px-2 py-0.5 rounded-full font-extrabold text-[10px] ${isStore ? 'bg-purple-100 text-purple-800' : 'bg-emerald-100 text-emerald-800'
                                      }`}
                                  >
                                    {isStore ? 'Store' : 'Helper'}
                                  </span>
                                </td>
                                <td className="py-3.5 px-5">
                                  {storeName ? (
                                    <div>
                                      <span className="font-extrabold text-purple-950 block text-xs">{storeName}</span>
                                      <span className="text-[10px] text-gray-500 font-medium block">{w.helperName}</span>
                                    </div>
                                  ) : (
                                    <span className="font-bold text-gray-900">{w.helperName}</span>
                                  )}
                                </td>
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
                            );
                          })}
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
                {/* 7. Pending Reward Claims */}
                {pendingRewardClaims.length > 0 && (() => {
                  const prc = paginate(pendingRewardClaims, excRewardClaimPage, excRewardClaimPageSize);
                  return (
                    <div className="bg-white rounded-3xl border border-gray-100 shadow-soft overflow-hidden">
                      <div className="p-5 border-b border-gray-100 bg-yellow-50/50 flex items-center justify-between">
                        <h3 className="font-extrabold text-sm text-gray-900 flex items-center space-x-2">
                          <Coins className="w-4 h-4 text-amber-500" />
                          <span>Pending Reward Claims ({pendingRewardClaims.length})</span>
                        </h3>
                        <button
                          onClick={() => setActiveTab('REWARDS')}
                          className="text-xs font-extrabold text-amber-700 hover:text-amber-900 underline"
                        >
                          Manage All →
                        </button>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs text-gray-600 min-w-[600px]">
                          <thead className="bg-gray-50 text-gray-700 uppercase font-extrabold text-[10px] tracking-wider border-b border-gray-100">
                            <tr>
                              <th className="py-3 px-5">Customer</th>
                              <th className="py-3 px-5">Prize</th>
                              <th className="py-3 px-5">Coins</th>
                              <th className="py-3 px-5">Date</th>
                              <th className="py-3 px-5 text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100 font-medium">
                            {prc.items.map((claim) => (
                              <tr key={claim.id} className="hover:bg-gray-50/80 transition-colors">
                                <td className="py-3.5 px-5">
                                  <div className="font-extrabold text-gray-900">{claim.userName}</div>
                                  <div className="text-[11px] text-gray-500">{claim.userPhone || claim.userEmail || ''}</div>
                                </td>
                                <td className="py-3.5 px-5 font-bold text-gray-800">{claim.prizeTitle}</td>
                                <td className="py-3.5 px-5">
                                  <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 font-extrabold text-[11px]">
                                    🪙 {claim.requiredCoins}
                                  </span>
                                </td>
                                <td className="py-3.5 px-5 text-[11px] text-gray-500">
                                  {new Date(claim.createdAt).toLocaleDateString('bn-BD')}
                                </td>
                                <td className="py-3.5 px-5 text-right">
                                  <div className="flex justify-end items-center space-x-1.5">
                                    <button
                                      onClick={async () => {
                                        const confirmed = await showConfirm(
                                          'পুরস্কার দাবি অনুমোদন',
                                          `"সেবাপ্রাপ্তো:" ${claim.prizeTitle} দাবিটি অনুমোদন করবেন? ${claim.requiredCoins} কয়েন ব্যবহারকারীর একান্ট থেকে কাটা হবে।`,
                                          'হ্যাঁ, অনুমোদন করুন',
                                          'বাতিল'
                                        );
                                        if (confirmed) {
                                          await fallbackStore.approveRewardClaim(claim.id, 'অনুমোদিত', 'Admin');
                                          showAlert('অনুমোদিত', `দাবি অনুমোদিত এবং ${claim.requiredCoins} কয়েন কাটা হয়েছে।`, 'success');
                                        }
                                      }}
                                      className="py-1.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs shadow-sm transition-all"
                                    >
                                      Approve
                                    </button>
                                    <button
                                      onClick={async () => {
                                        const confirmed = await showConfirm(
                                          'দাবি বাতিল',
                                          `"সেবাপ্রাপ্তো:" ${claim.prizeTitle} দাবিটি প্রত্যাখ্যান করবেন?`,
                                          'হ্যাঁ, বাতিল করুন',
                                          'ফিরে যান'
                                        );
                                        if (confirmed) {
                                          await fallbackStore.rejectRewardClaim(claim.id, 'অনুরোধটি প্রক্রিয়াকরণ করা সম্ভব হয়নি।', 'Admin');
                                          showAlert('বাতিল', 'দাবি বাতিল করা হয়েছে।', 'info');
                                        }
                                      }}
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
                        currentPage={Math.min(excRewardClaimPage, prc.totalPages)}
                        totalPages={prc.totalPages}
                        totalItems={pendingRewardClaims.length}
                        pageSize={excRewardClaimPageSize}
                        onPageChange={(p) => setExcRewardClaimPage(p)}
                        onPageSizeChange={(s) => { setExcRewardClaimPageSize(s); setExcRewardClaimPage(1); }}
                        pageSizeOptions={[5, 10, 25]}
                      />
                    </div>
                  );
                })()}

              </div>
            )}
          </div>
        );
      })()}

      {/* The helper and user tables total every order ever placed. */}
      {(activeTab === 'HELPERS' || activeTab === 'USERS_LIST' || activeTab === 'SHOPS') && (
        <LifetimeDataNotice loading={lifetimeData.loading} error={lifetimeData.error} onRetry={lifetimeData.retry} />
      )}

      {/* --- TAB 2: ALL ORDERS TAB --- */}
      {activeTab === 'ORDERS' && isTabAllowed('ORDERS') && (() => {
        // Use serverOrders when available; fall back to allOrders (accumulates ALL fetched orders)
        const processed = processedOrdersForTab;
        // The list is one date range read in full, so its length is the total.
        const { totalPages, paginatedItems, totalItems } = paginateList(processed);

        return (
          <div className="bg-white rounded-3xl border border-gray-100 shadow-soft overflow-hidden space-y-2">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between flex-wrap gap-3">
              <div>
                <h3 className="font-extrabold text-base text-gray-900">System Orders Master List</h3>
                <p className="text-xs text-gray-500">Select multiple orders to batch delete or manage</p>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                {selectedOrderIds.length > 0 && (
                  <AsyncButton
                    onClick={handleBulkDeleteOrders}
                    isLoading={isDeletingOrders}
                    icon={<Trash2 className="w-4 h-4" />}
                    className="py-1.5 px-3.5 rounded-xl bg-red-600 hover:bg-red-700 active:scale-95 text-white font-extrabold text-xs shadow-md transition-all flex items-center space-x-1.5 disabled:opacity-50"
                  >
                    <span>Delete Selected ({selectedOrderIds.length})</span>
                  </AsyncButton>
                )}
                {/* Export Buttons */}
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => exportOrdersToCSV(processed)}
                    title="Export visible orders to Excel (CSV)"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold text-xs transition-all shadow-sm"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Excel</span>
                  </button>
                  <button
                    onClick={() => exportOrdersToPDF(processed)}
                    title="Export visible orders to PDF"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 active:scale-95 text-white font-bold text-xs transition-all shadow-sm"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>PDF</span>
                  </button>
                </div>
                <span className="text-xs font-bold px-3 py-1 rounded-full bg-emerald-50 text-emerald-800 flex items-center gap-2 flex-wrap">
                  <span>{exactTotalOrders !== null ? exactTotalOrders.toLocaleString() : totalItems} total orders</span>
                  {exactTotalCollection !== null && (
                    <>
                      <span className="text-emerald-300">•</span>
                      <span>Total Collection: ৳{exactTotalCollection.toLocaleString()}</span>
                    </>
                  )}
                </span>
              </div>
            </div>

            {/* Sub-Filters and Date Search Controls */}
            <div className="p-4 bg-gray-50/50 border-b border-gray-100 grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-[11px] font-bold text-gray-500 uppercase block mb-1">Status Filter</label>
                <select
                  value={statusFilter}
                  onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }}
                  className="w-full p-2 bg-white border border-gray-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-purple-600"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="PENDING">PENDING</option>
                  <option value="ACCEPTED">ACCEPTED</option>
                  <option value="PURCHASED_EXECUTED">PURCHASED_EXECUTED</option>
                  <option value="ON_THE_WAY">ON_THE_WAY</option>
                  <option value="ARRIVED">ARRIVED</option>
                  <option value="DELIVERED">DELIVERED</option>
                  <option value="PAID">PAID (Settled Orders)</option>
                  <option value="UNPAID">UNPAID (Pending Settlement)</option>
                  <option value="CANCELED">CANCELED</option>
                  <option value="UNASSIGNED">Unassigned Only</option>
                  <option value="DELIVERY_BACK">Return Orders Only</option>
                </select>
              </div>

              <div>
                <label className="text-[11px] font-bold text-gray-500 uppercase block mb-1">Filter by Helper</label>
                <select
                  value={ordersHelperFilter}
                  onChange={(e) => {
                    setOrdersHelperFilter(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full p-2 bg-white border border-gray-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-purple-600"
                >
                  <option value="ALL">All Helpers</option>
                  <option value="UNASSIGNED">Unassigned Only</option>
                  {helperOptions.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.name} {h.phone && h.phone !== 'N/A' ? `(${h.phone})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[11px] font-bold text-gray-500 uppercase block mb-1">Sort By</label>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="w-full p-2 bg-white border border-gray-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-purple-600"
                >
                  <option value="NEWEST">Newest First</option>
                  <option value="OLDEST">Oldest First</option>
                  <option value="FEE_HIGH">Delivery Fee (High to Low)</option>
                  <option value="FEE_LOW">Delivery Fee (Low to High)</option>
                </select>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-gray-600 min-w-[850px]">
                <thead className="bg-gray-50 text-gray-700 uppercase font-extrabold text-[10px] tracking-wider border-b border-gray-100">
                  <tr>
                    <th className="py-3 px-4 w-10 text-center">
                      <input
                        type="checkbox"
                        checked={
                          paginatedItems.length > 0 &&
                          paginatedItems.every((o) => selectedOrderIds.includes(o.id))
                        }
                        onChange={() => handleToggleSelectAllOrders(paginatedItems)}
                        className="rounded text-purple-600 focus:ring-purple-500 w-4 h-4 cursor-pointer"
                        title="Select All on page"
                      />
                    </th>
                    <th className="py-3 px-5">Order ID</th>
                    <th className="py-3 px-5">Customer</th>
                    <th className="py-3 px-5">Ordered Time</th>
                    <th className="py-3 px-5">Helper</th>
                    <th className="py-3 px-5">Delivery Fee</th>
                    <th className="py-3 px-5">Status</th>
                    <th className="py-3 px-5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 font-medium">
                  {paginatedItems.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-gray-400 font-semibold">
                        {rangeStatus === 'loading'
                          ? `Loading orders for ${describeRange(dateRange)}…`
                          : rangeStatus === 'error'
                            ? 'Could not load orders for these dates. Use Retry above.'
                            : `No orders match your criteria for ${describeRange(dateRange)}.`}
                      </td>
                    </tr>
                  ) : (
                    paginatedItems.map((ord) => (
                      <tr
                        key={ord.id}
                        className={`hover:bg-purple-50/40 cursor-pointer transition-colors ${selectedOrderIds.includes(ord.id) ? 'bg-purple-50/70' : ''
                          }`}
                        onClick={() => setSelectedOrderId(ord.id)}
                      >
                        <td className="py-4 px-4 w-10 text-center" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selectedOrderIds.includes(ord.id)}
                            onChange={(e) => handleToggleSelectOrder(ord.id, e as any)}
                            className="rounded text-purple-600 focus:ring-purple-500 w-4 h-4 cursor-pointer"
                          />
                        </td>
                        <td className="py-4 px-5 font-mono text-purple-950 font-bold text-xs">
                          #{ord.id}
                          <div className="text-[10px] text-gray-400 font-normal">{new Date(ord.createdAt).toLocaleDateString()}</div>
                        </td>
                        <td className="py-4 px-5">
                          <div className="font-extrabold text-gray-900 text-xs flex items-center gap-1.5 flex-wrap">
                            <span>{ord.customerName}</span>
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
                          <div className="text-[11px] text-gray-400 font-medium">{ord.customerPhone}</div>
                        </td>
                        <td className="py-4 px-5">
                          {(ord.service || ord.title) && (
                            <div className="font-bold text-gray-900 text-xs mb-0.5">{ord.service || ord.title}</div>
                          )}
                          <div className="text-[11px] text-gray-500 font-medium flex items-center gap-1">
                            <Clock className="w-3 h-3 text-purple-600 shrink-0" />
                            <span>Ordered at: {new Date(ord.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                        </td>
                        <td className="py-4 px-5">
                          {ord.helperName ? (
                            <div>
                              <div className="font-extrabold text-purple-900 text-xs flex items-center gap-1 flex-wrap">
                                <span className="flex items-center space-x-1">
                                  <Bike className="w-3 h-3 text-indigo-600" />
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
                              <span className="text-amber-600 font-extrabold text-xs block">Unassigned</span>
                              <span className="text-[10px] text-amber-700 font-semibold">Pending {getElapsedTime(ord)}</span>
                            </div>
                          )}
                        </td>
                        <td className="py-4 px-5 font-black text-emerald-700 text-xs">
                          {ord.isFreeDelivery ? (
                            <div>
                              <span>৳0</span>
                              <span className="block text-[9px] font-black text-amber-800 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded w-fit mt-0.5">
                                🎁 Reward Claimed
                              </span>
                            </div>
                          ) : (
                            `৳${ord.deliveryFee}`
                          )}
                        </td>
                        <td className="py-4 px-5">
                          <div className="flex flex-col gap-0.5">
                            <span
                              className={`px-2 py-0.5 rounded-full font-extrabold text-[10px] w-fit ${ord.status === 'DELIVERED'
                                ? 'bg-emerald-100 text-emerald-800'
                                : ord.status === 'CANCELED'
                                  ? 'bg-red-100 text-red-800'
                                  : 'bg-amber-100 text-amber-800'
                                }`}
                            >
                              {ord.status}
                            </span>
                            {ord.status === 'DELIVERED' && (
                              <span className="text-[10px] font-bold text-emerald-700 block">
                                in: {getDeliveryDurationText(ord)}
                              </span>
                            )}
                            {ord.status === 'CANCELED' && (
                              <span className="text-[10px] font-bold text-red-700 block">
                                in: {getDeliveryDurationText(ord)}
                              </span>
                            )}
                            {ord.status !== 'DELIVERED' && ord.status !== 'CANCELED' && (
                              <span className="text-[10px] font-bold text-amber-700 block">
                                {getElapsedTime(ord)}
                              </span>
                            )}
                            {ord.needDeliveryBack && (
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-800 text-[9px] font-black uppercase tracking-wide w-fit border border-indigo-200">
                                🔁 Return
                              </span>
                            )}
                            {ord.status === 'DELIVERED' && (
                              <div className="mt-0.5">
                                {ord.isPaid ? (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-black uppercase tracking-wide">
                                    <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600" /> Paid
                                  </span>
                                ) : ord.isStorePaid && !ord.isHelperPaid ? (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-black uppercase tracking-wide">
                                    Store Paid
                                  </span>
                                ) : ord.isHelperPaid && !ord.isStorePaid ? (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-purple-50 text-purple-700 border border-purple-200 text-[10px] font-black uppercase tracking-wide">
                                    Helper Paid
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-black uppercase tracking-wide">
                                    Unpaid
                                  </span>
                                )}
                              </div>
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
                    ))
                  )}
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

      {/* --- TAB 2b: ALL STORE ORDERS TAB --- */}
      {activeTab === 'STORE_ORDERS' && isTabAllowed('STORE_ORDERS') && (() => {
        const processed = processedStoreOrdersForTab;
        const { totalPages, paginatedItems, totalItems } = paginateList(processed);
        const totalStoreRevenue = processed
          .filter((so) => so.status !== 'CANCELED')
          .reduce((acc, so) => acc + (so.price || 0), 0);

        return (
          <div className="bg-white rounded-3xl border border-gray-100 shadow-soft overflow-hidden space-y-2">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between flex-wrap gap-3">
              <div>
                <h3 className="font-extrabold text-base text-gray-900 flex items-center gap-2">
                  <Store className="w-5 h-5 text-purple-600" />
                  <span>All Store Orders Master List</span>
                </h3>
                <p className="text-xs text-gray-500">
                  Real-time list of store order requests sent to stores capable of receiving in-app orders
                </p>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                {selectedStoreOrderIds.length > 0 && (
                  <AsyncButton
                    onClick={handleBulkDeleteStoreOrders}
                    isLoading={isDeletingStoreOrders}
                    icon={<Trash2 className="w-4 h-4" />}
                    className="py-1.5 px-3.5 rounded-xl bg-red-600 hover:bg-red-700 active:scale-95 text-white font-extrabold text-xs shadow-md transition-all flex items-center space-x-1.5 disabled:opacity-50"
                  >
                    <span>Delete Selected ({selectedStoreOrderIds.length})</span>
                  </AsyncButton>
                )}
                {/* Export Buttons */}
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => exportShopOrdersToCSV(processed)}
                    title="Export visible store orders to Excel (CSV)"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold text-xs transition-all shadow-sm"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Excel</span>
                  </button>
                  <button
                    onClick={() => exportShopOrdersToPDF(processed)}
                    title="Export visible store orders to PDF"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 active:scale-95 text-white font-bold text-xs transition-all shadow-sm"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>PDF</span>
                  </button>
                </div>
                <span className="text-xs font-bold px-3 py-1 rounded-full bg-purple-50 text-purple-900 flex items-center gap-2 flex-wrap border border-purple-100">
                  <span>{totalItems} store orders</span>
                  <span className="text-purple-300">•</span>
                  <span>Total Value: ৳{totalStoreRevenue.toLocaleString()}</span>
                </span>
              </div>
            </div>

            {/* Sub-Filters and Search Controls */}
            <div className="p-4 bg-gray-50/50 border-b border-gray-100 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
              {/* Search Bar */}
              <div className="md:col-span-2">
                <label className="text-[11px] font-bold text-gray-500 uppercase block mb-1">Search Store Orders</label>
                <div className="flex items-center gap-1.5">
                  <div className="relative flex-1">
                    <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={storeOrdersSearchQuery}
                      onChange={(e) => setStoreOrdersSearchQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          setStoreOrdersAppliedSearchQuery(storeOrdersSearchQuery);
                          setCurrentPage(1);
                        }
                      }}
                      placeholder="Parent Order ID, Shop, Helper, Items..."
                      className="w-full pl-8 pr-3 py-2 bg-white border border-gray-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-purple-600"
                    />
                  </div>
                  <button
                    onClick={() => {
                      setStoreOrdersAppliedSearchQuery(storeOrdersSearchQuery);
                      setCurrentPage(1);
                    }}
                    className="px-3 py-2 bg-purple-900 hover:bg-purple-950 text-white font-bold text-xs rounded-xl shadow-xs transition-all"
                  >
                    Search
                  </button>
                  {storeOrdersAppliedSearchQuery && (
                    <button
                      onClick={() => {
                        setStoreOrdersSearchQuery('');
                        setStoreOrdersAppliedSearchQuery('');
                        setCurrentPage(1);
                      }}
                      className="px-2 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold text-xs rounded-xl transition-all"
                      title="Clear search"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Status Filter */}
              <div>
                <label className="text-[11px] font-bold text-gray-500 uppercase block mb-1">Status Filter</label>
                <select
                  value={storeOrdersStatusFilter}
                  onChange={(e) => {
                    setStoreOrdersStatusFilter(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full p-2 bg-white border border-gray-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-purple-600"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="PENDING">PENDING</option>
                  <option value="ACCEPTED">ACCEPTED</option>
                  <option value="PREPARING">PREPARING</option>
                  <option value="READY">READY</option>
                  <option value="HANDOVER">HANDOVER</option>
                  <option value="DELIVERED">DELIVERED</option>
                  <option value="CANCELED">CANCELED</option>
                </select>
              </div>

              {/* Filter by Shop */}
              <div>
                <label className="text-[11px] font-bold text-gray-500 uppercase block mb-1">Filter by Shop</label>
                <select
                  value={storeOrdersShopFilter}
                  onChange={(e) => {
                    setStoreOrdersShopFilter(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full p-2 bg-white border border-gray-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-purple-600"
                >
                  <option value="ALL">All Shops</option>
                  {shops
                    .filter((s) => s.canReceiveOrders !== false)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} {s.type ? `(${s.type})` : ''}
                      </option>
                    ))}
                </select>
              </div>

              {/* Sort By */}
              <div>
                <label className="text-[11px] font-bold text-gray-500 uppercase block mb-1">Sort By</label>
                <select
                  value={storeOrdersSortBy}
                  onChange={(e) => {
                    setStoreOrdersSortBy(e.target.value as any);
                    setCurrentPage(1);
                  }}
                  className="w-full p-2 bg-white border border-gray-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-purple-600"
                >
                  <option value="NEWEST">Newest First</option>
                  <option value="OLDEST">Oldest First</option>
                  <option value="PRICE_HIGH">Price (High to Low)</option>
                  <option value="PRICE_LOW">Price (Low to High)</option>
                </select>
              </div>

              {/* Filter by Helper */}
              <div className="md:col-span-2">
                <label className="text-[11px] font-bold text-gray-500 uppercase block mb-1">Filter by Helper</label>
                <select
                  value={storeOrdersHelperFilter}
                  onChange={(e) => {
                    setStoreOrdersHelperFilter(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full p-2 bg-white border border-gray-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-purple-600"
                >
                  <option value="ALL">All Helpers</option>
                  {Array.from(
                    new Map(
                      realStoreOrders
                        .filter((so) => so.helperId && so.helperName)
                        .map((so) => [so.helperId, { id: so.helperId, name: so.helperName! }])
                    ).values()
                  )
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map((h) => (
                      <option key={h.id} value={h.id}>
                        {h.name}
                      </option>
                    ))}
                </select>
              </div>

              {/* Clear All Filters */}
              {(storeOrdersHelperFilter !== 'ALL' || storeOrdersShopFilter !== 'ALL' || storeOrdersStatusFilter !== 'ALL' || storeOrdersAppliedSearchQuery) && (
                <div className="flex items-end">
                  <button
                    onClick={() => {
                      setStoreOrdersHelperFilter('ALL');
                      setStoreOrdersShopFilter('ALL');
                      setStoreOrdersStatusFilter('ALL');
                      setStoreOrdersSearchQuery('');
                      setStoreOrdersAppliedSearchQuery('');
                      setCurrentPage(1);
                    }}
                    className="w-full p-2 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5"
                  >
                    <X className="w-3 h-3" />
                    Clear All Filters
                  </button>
                </div>
              )}
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-gray-600 min-w-[850px]">
                <thead className="bg-gray-50 text-gray-700 uppercase font-extrabold text-[10px] tracking-wider border-b border-gray-100">
                  <tr>
                    <th className="py-3 px-4 w-10 text-center">
                      <input
                        type="checkbox"
                        checked={
                          paginatedItems.length > 0 &&
                          paginatedItems.every((so) => selectedStoreOrderIds.includes(so.id))
                        }
                        onChange={() => handleToggleSelectAllStoreOrders(paginatedItems)}
                        className="rounded text-purple-600 focus:ring-purple-500 w-4 h-4 cursor-pointer"
                        title="Select All on page"
                      />
                    </th>
                    <th className="py-3 px-5">Parent Delivery Order</th>
                    <th className="py-3 px-5">Shop / Store</th>
                    <th className="py-3 px-5">Helper</th>
                    <th className="py-3 px-5">Request & Items</th>
                    <th className="py-3 px-5">Cost / Price</th>
                    <th className="py-3 px-5">Status</th>
                    <th className="py-3 px-5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 font-medium">
                  {paginatedItems.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-gray-400 font-semibold">
                        {rangeStatus === 'loading'
                          ? `Loading store orders for ${describeRange(dateRange)}…`
                          : rangeStatus === 'error'
                            ? 'Could not load store orders for these dates. Use Retry above.'
                            : `No store orders match your criteria for ${describeRange(dateRange)}.`}
                      </td>
                    </tr>
                  ) : (
                    paginatedItems.map((so) => {
                      const shop = shops.find((s) => s.id === so.shopId) || fallbackStore.shops.get(so.shopId);
                      const parentOrder = fallbackStore.orders.get(so.parentOrderId);
                      const helper = fallbackStore.users.get(so.helperId);
                      const helperPhone = parentOrder?.helperPhone || helper?.alternativePhone || helper?.phoneNumber || '';
                      const isSelected = selectedStoreOrderIds.includes(so.id);

                      return (
                        <tr
                          key={so.id}
                          className={`hover:bg-purple-50/40 cursor-pointer transition-colors ${isSelected ? 'bg-purple-50/70' : ''
                            }`}
                          onClick={() => setSelectedShopOrderId(so.id)}
                        >
                          <td className="py-4 px-4 w-10 text-center" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={(e) => handleToggleSelectStoreOrder(so.id, e as any)}
                              className="rounded text-purple-600 focus:ring-purple-500 w-4 h-4 cursor-pointer"
                            />
                          </td>
                          <td className="py-4 px-5 font-mono" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <button
                                onClick={() => setSelectedOrderId(so.parentOrderId)}
                                className="inline-flex items-center gap-1 text-purple-700 hover:text-purple-900 font-black text-xs hover:underline bg-purple-50 px-2 py-1 rounded-lg border border-purple-150 transition-colors"
                                title="Open Customer Order Details"
                              >
                                <span>#{so.parentOrderId}</span>
                                <ExternalLink className="w-3 h-3" />
                              </button>
                              {so.viewedByStore && (
                                <span className="inline-flex items-center gap-0.5 text-[9px] text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded font-bold border border-emerald-200">
                                  👁️ Seen
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-gray-400 font-normal mt-0.5">
                              {new Date(so.createdAt).toLocaleDateString()} {new Date(so.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </div>
                          </td>
                          <td className="py-4 px-5">
                            <div className="font-extrabold text-gray-900 text-xs flex items-center gap-1.5 flex-wrap">
                              <Store className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                              <span>{so.shopName}</span>
                              {shop?.type && (
                                <span className="text-[9px] bg-purple-100 text-purple-800 px-1.5 py-0.5 rounded font-bold">
                                  {shop.type}
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-gray-500 font-medium">
                              {shop?.whatsapp || shop?.contactPerson || 'N/A'}
                            </div>
                          </td>
                          <td className="py-4 px-5">
                            <div className="font-extrabold text-purple-900 text-xs flex items-center gap-1.5 flex-wrap">
                              <Bike className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                              <span>{so.helperName}</span>
                            </div>
                            <div className="text-[11px] text-gray-500 font-mono">
                              {helperPhone || 'N/A'}
                            </div>
                          </td>
                          <td className="py-4 px-5 max-w-xs">
                            {so.itemsWithPrice && so.itemsWithPrice.length > 0 ? (
                              <div className="space-y-0.5">
                                <span className="inline-block px-1.5 py-0.5 bg-blue-50 text-blue-800 border border-blue-200 rounded text-[9px] font-bold">
                                  {so.itemsWithPrice.length} item{so.itemsWithPrice.length > 1 ? 's' : ''} divided
                                </span>
                                <div className="text-[11px] text-gray-700 truncate font-medium">
                                  {so.itemsWithPrice.map((it) => `${it.name} (৳${it.price ?? 0})`).join(', ')}
                                </div>
                              </div>
                            ) : (
                              <div className="text-[11px] text-gray-700 line-clamp-2 font-medium">
                                {so.requestText || 'No description'}
                              </div>
                            )}
                          </td>
                          <td className="py-4 px-5 font-black text-xs">
                            {so.price !== undefined && so.price !== null ? (
                              <span className="text-emerald-700 text-sm font-mono font-black">
                                ৳{so.price}
                              </span>
                            ) : (
                              <span className="text-amber-600 text-[10px] font-bold bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                                Pending Price
                              </span>
                            )}
                          </td>
                          <td className="py-4 px-5">
                            <div className="flex flex-col gap-0.5">
                              <span
                                className={`px-2 py-0.5 rounded-full font-extrabold text-[10px] w-fit border ${so.status === 'DELIVERED'
                                    ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                                    : so.status === 'HANDOVER'
                                      ? 'bg-indigo-100 text-indigo-800 border-indigo-200'
                                      : so.status === 'READY'
                                        ? 'bg-teal-100 text-teal-800 border-teal-200'
                                        : so.status === 'PREPARING'
                                          ? 'bg-purple-100 text-purple-800 border-purple-200'
                                          : so.status === 'ACCEPTED'
                                            ? 'bg-blue-100 text-blue-800 border-blue-200'
                                            : so.status === 'CANCELED'
                                              ? 'bg-red-100 text-red-800 border-red-200'
                                              : 'bg-amber-100 text-amber-800 border-amber-200'
                                  }`}
                              >
                                {so.status}
                              </span>
                              <span className="text-[10px] text-gray-400 font-medium">
                                {new Date(so.updatedAt || so.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                          </td>
                          <td className="py-4 px-5 text-right" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => setSelectedShopOrderId(so.id)}
                              className="py-1.5 px-3 rounded-xl bg-purple-900 hover:bg-purple-950 text-white font-extrabold text-xs shadow-sm transition-all inline-flex items-center gap-1"
                            >
                              <span>Manage</span>
                              <ArrowRight className="w-3 h-3" />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
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
        const processed = processedUsersList;
        const hasUsersFilter = Boolean(usersAppliedSearchQuery.trim() || usersStartDate || usersEndDate || audienceFilter !== 'ALL' || statusFilter !== 'ALL' || usersCoinsFilter !== 'ALL' || usersMinCoins || usersMaxCoins || usersSortByCoins !== 'NONE' || usersSortColumn !== null);
        const overrideUsersCount = (serverUsers === null && !hasUsersFilter && exactCustomerAccounts !== null) ? exactCustomerAccounts : undefined;
        const { totalPages, paginatedItems, totalItems } = paginateList(processed, undefined, undefined, overrideUsersCount);

        const handleUserColumnSort = (col: 'NAME' | 'ROLE' | 'COINS' | 'ORDERS' | 'ACTIVITY' | 'SEGMENTS' | 'STATUS' | 'DATE') => {
          if (usersSortColumn === col) {
            setUsersSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
          } else {
            setUsersSortColumn(col);
            if (col === 'NAME' || col === 'ROLE' || col === 'STATUS') {
              setUsersSortDirection('asc');
            } else {
              setUsersSortDirection('desc');
            }
          }
          setCurrentPage(1);
        };

        const renderUserSortHeader = (
          label: string,
          col: 'NAME' | 'ROLE' | 'COINS' | 'ORDERS' | 'ACTIVITY' | 'SEGMENTS' | 'STATUS' | 'DATE',
          extraClass = ''
        ) => {
          const isActive = usersSortColumn === col;
          return (
            <th
              onClick={() => handleUserColumnSort(col)}
              className={`py-3.5 px-5 cursor-pointer select-none transition-colors group hover:bg-purple-100/70 hover:text-purple-950 ${isActive ? 'bg-purple-100/80 text-purple-950 font-black' : ''
                } ${extraClass}`}
              title={`Click to sort by ${label} (${isActive ? (usersSortDirection === 'asc' ? 'Ascending' : 'Descending') : 'Click to Sort'})`}
            >
              <div className="flex items-center space-x-1.5">
                <span>{label}</span>
                <span className="inline-flex shrink-0">
                  {isActive ? (
                    usersSortDirection === 'asc' ? (
                      <ArrowUp className="w-3.5 h-3.5 text-purple-700" />
                    ) : (
                      <ArrowDown className="w-3.5 h-3.5 text-purple-700" />
                    )
                  ) : (
                    <ArrowUpDown className="w-3 h-3 text-gray-400 opacity-40 group-hover:opacity-100 transition-opacity" />
                  )}
                </span>
              </div>
            </th>
          );
        };

        return (
          <div className="bg-white rounded-3xl border border-gray-100 shadow-soft overflow-hidden">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between flex-wrap gap-3">
              <h3 className="font-extrabold text-base text-gray-900">Registered Users Master List</h3>
              <div className="flex items-center gap-2 flex-wrap">
                {/* Export Buttons */}
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => exportUsersToCSV(processed, 'users_list')}
                    title="Export visible users to Excel (CSV)"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold text-xs transition-all shadow-sm"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Excel</span>
                  </button>
                  <button
                    onClick={() => exportUsersToPDF(processed, 'Users List')}
                    title="Export visible users to PDF"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 active:scale-95 text-white font-bold text-xs transition-all shadow-sm"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>PDF</span>
                  </button>
                </div>
                <span className="text-xs font-bold px-3 py-1 rounded-full bg-purple-50 text-purple-800">
                  {exactCustomerAccounts !== null ? exactCustomerAccounts.toLocaleString() : totalItems} total users recorded
                </span>
              </div>
            </div>

            {/* Date & Coins Filter Bar */}
            <div className="p-4 bg-gray-50/50 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center space-x-2">
                <Calendar className="w-4 h-4 text-purple-700" />
                <span className="font-extrabold text-gray-900">Filter Users (Date & Coins)</span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {/* Coins Filter Dropdown */}
                <div className="flex items-center space-x-1.5 bg-white border border-gray-200 rounded-xl px-2.5 py-1">
                  <Coins className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                  <span className="text-gray-400 text-[10px] uppercase font-bold">Coins:</span>
                  <select
                    value={usersCoinsFilter}
                    onChange={(e) => {
                      setUsersCoinsFilter(e.target.value);
                      setCurrentPage(1);
                    }}
                    className="bg-transparent text-gray-800 font-extrabold focus:outline-none text-[11px] cursor-pointer"
                  >
                    <option value="ALL">All Coins</option>
                    <option value="HAS_COINS">Has Coins (&gt; 0)</option>
                    <option value="COINS_50_PLUS">50+ Coins</option>
                    <option value="COINS_100_PLUS">100+ Coins</option>
                    <option value="COINS_500_PLUS">500+ Coins</option>
                    <option value="NO_COINS">0 Coins</option>
                    <option value="CUSTOM">Custom Range...</option>
                  </select>
                </div>

                {/* Custom Coins Range */}
                {usersCoinsFilter === 'CUSTOM' && (
                  <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-xl px-2 py-0.5">
                    <input
                      type="number"
                      placeholder="Min"
                      value={usersMinCoins}
                      onChange={(e) => {
                        setUsersMinCoins(e.target.value);
                        setCurrentPage(1);
                      }}
                      className="w-14 text-center font-extrabold text-[11px] text-gray-800 outline-none"
                    />
                    <span className="text-gray-400 text-[10px]">-</span>
                    <input
                      type="number"
                      placeholder="Max"
                      value={usersMaxCoins}
                      onChange={(e) => {
                        setUsersMaxCoins(e.target.value);
                        setCurrentPage(1);
                      }}
                      className="w-14 text-center font-extrabold text-[11px] text-gray-800 outline-none"
                    />
                  </div>
                )}

                {/* Sort by Coins */}
                <div className="flex items-center space-x-1 bg-white border border-gray-200 rounded-xl px-2.5 py-1">
                  <span className="text-gray-400 text-[10px] uppercase font-bold">Sort:</span>
                  <select
                    value={usersSortByCoins}
                    onChange={(e) => {
                      setUsersSortByCoins(e.target.value as any);
                      if (e.target.value !== 'NONE') {
                        setUsersSortColumn(null);
                      }
                      setCurrentPage(1);
                    }}
                    className="bg-transparent text-gray-800 font-extrabold focus:outline-none text-[11px] cursor-pointer"
                  >
                    <option value="NONE">Default Order</option>
                    <option value="HIGH_TO_LOW">Coins: High to Low</option>
                    <option value="LOW_TO_HIGH">Coins: Low to High</option>
                  </select>
                </div>

                {/* Registration Date Range */}
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
                {(usersStartDate || usersEndDate || usersCoinsFilter !== 'ALL' || usersMinCoins || usersMaxCoins || usersSortByCoins !== 'NONE' || usersSortColumn !== null) && (
                  <button
                    onClick={() => {
                      setUsersStartDate('');
                      setUsersEndDate('');
                      setUsersCoinsFilter('ALL');
                      setUsersMinCoins('');
                      setUsersMaxCoins('');
                      setUsersSortByCoins('NONE');
                      setUsersSortColumn(null);
                      setUsersSortDirection('desc');
                      setCurrentPage(1);
                    }}
                    className="px-2.5 py-1 rounded-xl bg-red-50 hover:bg-red-100 text-red-650 font-bold transition-all cursor-pointer"
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
                    {renderUserSortHeader('User Profile', 'NAME')}
                    {renderUserSortHeader('Role & Badges', 'ROLE')}
                    {renderUserSortHeader('Reward Coins (কয়েন)', 'COINS')}
                    {renderUserSortHeader('Order Stats & Patterns', 'ORDERS')}
                    {renderUserSortHeader('Live Current Running State', 'ACTIVITY')}
                    {renderUserSortHeader('Audience Segments', 'SEGMENTS')}
                    {renderUserSortHeader('Status', 'STATUS')}
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

                        <td className="py-4 px-5" onClick={(e) => e.stopPropagation()}>
                          <div className="flex flex-col gap-1.5 items-start">
                            <div className="inline-flex items-center gap-1.5 bg-amber-50 border border-amber-200/90 px-2.5 py-1 rounded-xl shadow-2xs">
                              <span className="text-sm leading-none">🪙</span>
                              <div className="flex items-baseline gap-1">
                                <span className="text-xs font-black text-amber-950">{u.coins || 0}</span>
                                <span className="text-[10px] text-amber-700 font-bold">Coins</span>
                              </div>
                            </div>
                            {u.totalEarnedCoins !== undefined && u.totalEarnedCoins !== (u.coins || 0) && (
                              <span className="text-[9.5px] text-gray-400 font-medium">
                                মোট অর্জিত: {u.totalEarnedCoins}
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={() => handleOpenEditCoins(u)}
                              className="inline-flex items-center gap-1 px-2 py-0.5 text-[10.5px] font-extrabold text-amber-900 bg-amber-100/90 hover:bg-amber-200 active:scale-95 rounded-lg border border-amber-300 transition-all cursor-pointer"
                              title="ব্যবহারকারীর কয়েন পরিবর্তন করুন"
                            >
                              <Edit className="w-3 h-3 text-amber-700" />
                              <span>কয়েন পরিবর্তন</span>
                            </button>
                          </div>
                        </td>

                        <td className="py-4 px-5 font-bold">
                          <div className="space-y-1">
                            {/* Total Orders Placed */}
                            <div className="text-gray-900 font-extrabold text-[11px] flex items-center gap-1 flex-wrap">
                              <span>Total Placed:</span>
                              <span className="text-purple-900 bg-purple-50 px-2 py-0.5 rounded-md border border-purple-200">
                                {item.customerOrdersCount} {item.customerOrdersCount === 1 ? 'order' : 'orders'}
                              </span>
                              {u.isHelper && item.helperOrdersCount > 0 && (
                                <span className="text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-md text-[10px] font-extrabold border border-emerald-200">
                                  ({item.helperOrdersCount} as helper)
                                </span>
                              )}
                            </div>

                            {/* When Last Order Placed */}
                            <div className="text-[11px] font-semibold text-gray-600 flex items-center gap-1">
                              <span className="text-gray-500">Last Order:</span>
                              {item.customerOrdersCount > 0 && item.daysSinceLastOrder !== null ? (
                                <span className={item.daysSinceLastOrder >= 7 ? "text-amber-700 font-extrabold" : "text-gray-900 font-bold"}>
                                  {item.daysSinceLastOrder === 0 ? 'Today' : item.daysSinceLastOrder === 1 ? 'Yesterday' : `${item.daysSinceLastOrder} days ago`}
                                </span>
                              ) : (
                                <span className="text-gray-400 italic">Never</span>
                              )}
                            </div>

                            {/* Weekly Order Status */}
                            <div className="text-[11px] font-semibold text-gray-600 flex items-center gap-1">
                              <span className="text-gray-500">Weekly Order:</span>
                              {item.customerOrdersCount === 0 ? (
                                <span className="text-gray-400 font-medium">No (0 orders)</span>
                              ) : item.weeklyOrderRate >= 1 ? (
                                <span className="text-emerald-700 font-extrabold bg-emerald-50 px-1.5 py-0.5 rounded text-[10px] border border-emerald-200">
                                  Yes (~{item.weeklyOrderRate.toFixed(1)}/wk)
                                </span>
                              ) : (
                                <span className="text-amber-800 font-semibold bg-amber-50 px-1.5 py-0.5 rounded text-[10px] border border-amber-200">
                                  No / Low (~{item.weeklyOrderRate.toFixed(1)}/wk)
                                </span>
                              )}
                            </div>
                          </div>
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
                              else if (seg === 'RARE_ORDERS_WEEK') { label = 'Low Frequency (<1/wk)'; color = 'bg-yellow-50 text-yellow-800 border border-yellow-200'; }
                              else if (seg === 'RARE_ORDERS_MONTH') { label = 'Low Frequency (<1/mo)'; color = 'bg-amber-150 text-amber-800'; }
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
                            <div className="space-y-1">
                              <span className="px-2.5 py-1 rounded-full bg-red-100 text-red-800 font-black text-[10px] inline-flex items-center gap-1">
                                <Ban className="w-3 h-3 text-red-600" />
                                <span>BLOCKED</span>
                              </span>
                              {(u.adminBlockNote || u.blockedReason) && (
                                <p className="text-[10px] text-red-700 font-bold flex items-center gap-1">
                                  <Lock className="w-2.5 h-2.5 text-red-500 shrink-0" />
                                  <span className="truncate max-w-[140px]" title={u.adminBlockNote || u.blockedReason}>
                                    Note: {u.adminBlockNote || u.blockedReason}
                                  </span>
                                </p>
                              )}
                            </div>
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
                            onEditCoins={(target) => handleOpenEditCoins(target)}
                            onToggleAdmin={(targetUser, makeAdmin) => handleToggleAdminRole(targetUser, makeAdmin)}
                            onToggleSuperAdmin={(targetUser, makeSuperAdmin) => handleToggleSuperAdminRole(targetUser, makeSuperAdmin)}
                            onConvertToHelper={(targetUser) => {
                              setSelectedUserId(targetUser.uid);
                            }}
                            onConvertToCustomer={async (targetUser) => {
                              const confirmed = await showConfirm(
                                'কাস্টমার অ্যাকাউন্টে রূপান্তর',
                                `আপনি কি ${targetUser.displayName}-কে Admin থেকে সাধারণ Customer অ্যাকাউন্টে পরিবর্তন করতে চান?`,
                                'হ্যাঁ, Customer করুন',
                                'বাতিল'
                              );
                              if (!confirmed) return;
                              try {
                                const updatedUser = await fallbackStore.convertUserRole(targetUser.uid, 'customer', [], false, targetUser);
                                setUsers(Array.from(fallbackStore.users.values()));
                                setServerUsers((prev) => (prev ? prev.map((usr) => (usr.uid === targetUser.uid ? { ...usr, ...updatedUser } : usr)) : null));
                                showAlert('রূপান্তর সম্পন্ন', `${targetUser.displayName} এখন সাধারণ Customer হিসেবে সংরক্ষিত।`, 'success');
                              } catch (err: any) {
                                console.error('Error converting user to customer:', err);
                                showAlert('ত্রুটি', 'কাস্টমার রূপান্তর ব্যর্থ হয়েছে।', 'error');
                              }
                            }}
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
                                setBlockTarget({
                                  id: targetUser.uid,
                                  name: targetUser.displayName,
                                  type: targetUser.isHelper ? 'Helper' : 'Customer',
                                });
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
        <RevenueAnalytics
          orders={scopedAllOrders}
          pricing={pricing}
          shops={scopedShops}
          users={scopedUsers}
          feedbacks={feedbacks}
          serverTotalDeliveryFees={exactTotalDeliveryFees}
          serverTotalProductCosts={exactTotalProductCosts}
          serverTotalCollection={exactTotalCollection}
        />
      )}

      {/* --- TAB: GROWTH & EVERYDAY RATES TAB --- */}
      {activeTab === 'GROWTH' && isTabAllowed('GROWTH') && (
        <GrowthAnalytics
          orders={scopedAllOrders}
          users={scopedUsers}
          feedbacks={feedbacks}
        />
      )}

      {/* --- TAB 3: HELPER STATS TAB --- */}
      {activeTab === 'HELPERS' && isTabAllowed('HELPERS') && (() => {
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
                  onClick={() => setHelperSubView('AREAS')}
                  className={`px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 ${helperSubView === 'AREAS'
                    ? 'bg-purple-950 text-white shadow-md'
                    : 'text-gray-600 hover:text-gray-900'
                    }`}
                >
                  <Square className="w-4 h-4 text-emerald-400" />
                  <span>🛡️ Service Areas ({allowedDeliveryAreas.length})</span>
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
                users={scopedUsers}
                orders={isZoneFiltered && targetZoneIds ? orders.filter((o) => isOrderInAnyZone(o, targetZoneIds, allowedDeliveryAreas)) : orders}
                applications={scopedApplications}
                allowedDeliveryAreas={isZoneFiltered && targetZoneIds ? allowedDeliveryAreas.filter((a) => targetZoneIds.includes(a.id)) : allowedDeliveryAreas}
                onSelectHelper={(h) => setSelectedHelper(h)}
                onSelectUser={(uid) => setSelectedUserId(uid)}
                onUpdateHelperType={handleUpdateHelperType}
                onEditArea={(area) => {
                  setEditingArea(area);
                  setShowAreaDrawerModal(true);
                }}
                onAddArea={() => {
                  setEditingArea(null);
                  setShowAreaDrawerModal(true);
                }}
              />
            )}

            {/* Service Areas & Geofencing Sub-View */}
            {helperSubView === 'AREAS' && (() => {
              const helperFleet = users.filter((u) => u.isHelper || u.role === 'helper');

              const handleToggleGeofence = async (enabled: boolean) => {
                setAllowedDeliveryAreasEnabled(enabled);
                const updatedPricing: PricingSettings = {
                  ...fallbackStore.pricingSettings,
                  allowedDeliveryAreasEnabled: enabled,
                };
                await fallbackStore.savePricingSettings(updatedPricing);
                setPricing(updatedPricing);
                showAlert(
                  'সেটিংস সংরক্ষিত',
                  `সার্ভিস এরিয়া রেস্ট্রিকশন ${enabled ? 'চালু' : 'বন্ধ'} করা হয়েছে।`,
                  'success'
                );
              };

              const handleSaveWarningMessage = async () => {
                const updatedPricing: PricingSettings = {
                  ...fallbackStore.pricingSettings,
                  outOfServiceAreaMessage: outOfServiceAreaMessage.trim() || undefined,
                };
                await fallbackStore.savePricingSettings(updatedPricing);
                setPricing(updatedPricing);
                showAlert('সংরক্ষিত', 'ওয়ার্নিং বার্তা সফলভাবে সেভ হয়েছে।', 'success');
              };

              return (
                <div className="space-y-6">
                  {/* Top Control Bar */}
                  <div className="p-6 rounded-3xl bg-emerald-50/80 border border-emerald-200 shadow-soft flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center space-x-2">
                        <div className="p-2 rounded-2xl bg-emerald-600 text-white shadow-xs">
                          <Globe className="w-5 h-5" />
                        </div>
                        <h4 className="font-extrabold text-base text-emerald-950">
                          Specific Serving Areas & Geofencing (সার্ভিস এলাকা ও হেলপার অ্যাসাইনমেন্ট)
                        </h4>
                      </div>
                      <p className="text-xs text-emerald-800 font-medium">
                        ম্যাপে আয়তক্ষেত্র (Rectangle) বা পলিগন ড্র করে সাব-এরিয়া তৈরি করুন এবং নির্দিষ্ট হেলপার নির্ধারণ করুন। শুধুমাত্র নির্ধারিত হেলপারেরাই ঐ এলাকার নতুন অর্ডারের নোটিফিকেশন পাবেন।
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setEditingArea(null);
                        setShowAreaDrawerModal(true);
                      }}
                      className="py-2.5 px-5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-2xl text-xs font-extrabold shadow-md transition-all flex items-center justify-center space-x-2 shrink-0 active:scale-95"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Add Sub-Area (নতুন এলাকা ড্র)</span>
                    </button>
                  </div>

                  {/* Geofence Enforcement Toggle & Message Config */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div className="p-5 bg-white rounded-3xl border border-gray-100 shadow-soft space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <h5 className="text-xs font-extrabold text-gray-900 uppercase tracking-wider">
                            সার্ভিস বাউন্ডারি এনফোর্সমেন্ট
                          </h5>
                          <p className="text-[11px] text-gray-500 font-medium mt-0.5">
                            চালু রাখলে গ্রাহকরা কেবল ড্র করা এরিয়ার ভেতর অর্ডার ও ঠিকানা সিলেক্ট করতে পারবেন।
                          </p>
                        </div>
                        <input
                          type="checkbox"
                          id="allowedDeliveryAreasEnabledHelpers"
                          checked={allowedDeliveryAreasEnabled}
                          onChange={(e) => handleToggleGeofence(e.target.checked)}
                          className="w-5 h-5 text-emerald-600 rounded focus:ring-emerald-500 border-gray-300 cursor-pointer"
                        />
                      </div>
                      <div className="p-3 rounded-2xl bg-gray-50 border border-gray-200 text-xs font-bold text-gray-700 flex items-center justify-between">
                        <span>স্ট্যাটাস:</span>
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-black ${allowedDeliveryAreasEnabled ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-200 text-gray-700'
                          }`}>
                          {allowedDeliveryAreasEnabled ? 'সক্রিয় (Enforced)' : 'নিষ্ক্রিয় (Bypass Allowed)'}
                        </span>
                      </div>
                    </div>

                    <div className="p-5 bg-white rounded-3xl border border-gray-100 shadow-soft space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-extrabold text-gray-900 block">
                          সীমানার বাইরে নোটিশ বার্তা (Out of Area Message):
                        </label>
                        <button
                          type="button"
                          onClick={handleSaveWarningMessage}
                          className="text-[11px] font-extrabold text-emerald-700 hover:text-emerald-800 underline"
                        >
                          Save Message
                        </button>
                      </div>
                      <textarea
                        value={outOfServiceAreaMessage}
                        onChange={(e) => setOutOfServiceAreaMessage(e.target.value)}
                        placeholder="যেমন: দুঃখিত, আপনার নির্বাচন করা লোকেশনটি আমাদের সার্ভিস এরিয়ার বাইরে। অনুগ্রহ করে নির্ধারিত সার্ভিস এরিয়ার ভেতর থেকে পয়েন্ট নির্বাচন করুন।"
                        rows={2}
                        className="w-full p-2.5 rounded-xl border border-gray-200 bg-gray-50 text-xs font-medium outline-none focus:border-emerald-600 leading-relaxed font-sans"
                      />
                    </div>
                  </div>

                  {/* Sub-Areas Cards List */}
                  {(() => {
                    const visibleAreas = isZoneFiltered && targetZoneIds
                      ? allowedDeliveryAreas.filter((a) => targetZoneIds.includes(a.id))
                      : allowedDeliveryAreas;

                    return (
                      <div className="bg-white rounded-3xl border border-gray-100 shadow-soft overflow-hidden">
                        <div className="p-5 border-b border-gray-100 flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <Square className="w-5 h-5 text-emerald-600" />
                            <h4 className="font-extrabold text-base text-gray-900">
                              নির্ধারিত সাব-এরিয়া ও হেলপার তালিকা ({visibleAreas.length})
                            </h4>
                          </div>
                          {isSuperAdmin && (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingArea(null);
                                setShowAreaDrawerModal(true);
                              }}
                              className="py-1.5 px-3 rounded-xl bg-purple-900 hover:bg-purple-950 text-white font-extrabold text-xs shadow-sm transition-all flex items-center space-x-1"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              <span>Draw Area</span>
                            </button>
                          )}
                        </div>

                        {visibleAreas.length === 0 ? (
                          <div className="p-10 text-center text-xs text-gray-400">
                            <Globe className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                            <p className="font-bold text-gray-600">কোনো সার্ভিস সাব-এরিয়া ড্র করা হয়নি।</p>
                            <p className="text-[11px] text-gray-400 mt-1">
                              এলাকা যুক্ত করতে উপরের &ldquo;Add Sub-Area&rdquo; বাটনে ক্লিক করুন।
                            </p>
                          </div>
                        ) : (
                          <div className="p-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {visibleAreas.map((area) => {
                          const isAllHelpers =
                            area.allHelpersAssigned !== false &&
                            (!area.assignedHelperIds || area.assignedHelperIds.length === 0);

                          const assignedHelpers = isAllHelpers
                            ? helperFleet
                            : helperFleet.filter((h) => area.assignedHelperIds?.includes(h.uid));

                          return (
                            <div
                              key={area.id}
                              className="p-4 rounded-3xl border border-emerald-100 bg-emerald-50/30 hover:border-emerald-300 transition-all shadow-xs flex flex-col justify-between space-y-3"
                            >
                              <div>
                                <div className="flex items-start justify-between gap-2 mb-1.5">
                                  <div className="flex items-center space-x-2 min-w-0">
                                    <div className="w-7 h-7 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-extrabold text-xs shrink-0 shadow-xs">
                                      📍
                                    </div>
                                    <h5 className="font-extrabold text-sm text-gray-900 truncate">
                                      {area.name}
                                    </h5>
                                  </div>
                                  <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 shrink-0">
                                    {area.country || 'Bangladesh'}
                                  </span>
                                </div>

                                <div className="text-[11px] text-gray-500 font-medium">
                                  🗺️ {area.coordinates?.length || 0} vertices বাউন্ডারি পয়েন্ট
                                </div>

                                {/* Helper Assignment Badges */}
                                <div className="mt-3 pt-2.5 border-t border-emerald-100/80">
                                  <div className="flex items-center justify-between mb-1.5">
                                    <span className="text-[10px] font-extrabold text-gray-500 uppercase tracking-wider">
                                      অ্যাসাইনড হেলপার:
                                    </span>
                                    <span className="text-[10px] font-black text-emerald-800 bg-white px-2 py-0.5 rounded-md border border-emerald-200">
                                      {isAllHelpers ? 'All Fleet (উন্মুক্ত)' : `${assignedHelpers.length} জন`}
                                    </span>
                                  </div>

                                  <div className="flex flex-wrap gap-1 max-h-16 overflow-y-auto pr-1">
                                    {isAllHelpers ? (
                                      <span className="px-2 py-0.5 rounded-lg bg-emerald-100 text-emerald-900 text-[10px] font-extrabold">
                                        🌟 সকল নিবন্ধিত হেলপার গ্রহণযোগ্য
                                      </span>
                                    ) : assignedHelpers.length === 0 ? (
                                      <span className="text-[10px] text-amber-700 font-semibold">
                                        ⚠️ কোনো নির্দিষ্ট হেলপার অ্যাসাইন নেই
                                      </span>
                                    ) : (
                                      assignedHelpers.map((h) => (
                                        <span
                                          key={h.uid}
                                          className="px-2 py-0.5 rounded-lg bg-white border border-emerald-200 text-gray-800 text-[10px] font-bold shadow-xs truncate max-w-[130px]"
                                          title={h.displayName}
                                        >
                                          {h.displayName}
                                        </span>
                                      ))
                                    )}
                                  </div>
                                </div>
                              </div>

                              {/* Card Actions */}
                              <div className="flex items-center justify-end space-x-2 pt-2 border-t border-emerald-100/60">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingArea(area);
                                    setShowAreaDrawerModal(true);
                                  }}
                                  className="px-3 py-1.5 rounded-xl bg-white hover:bg-gray-100 text-gray-700 font-extrabold text-xs border border-gray-200 shadow-xs transition-colors flex items-center space-x-1"
                                >
                                  <Edit className="w-3.5 h-3.5 text-emerald-600" />
                                  <span>Edit & Assign</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    const confirmed = await showConfirm(
                                      'এলাকা ডিলিট নিশ্চিতকরণ',
                                      `আপনি কি "${area.name}" এলাকাটি ডিলিট করতে চান?`,
                                      'হ্যাঁ, ডিলিট করুন',
                                      'বাতিল'
                                    );
                                    if (confirmed) {
                                      const updated = allowedDeliveryAreas.filter((a) => a.id !== area.id);
                                      setAllowedDeliveryAreas(updated);
                                      const updatedPricing: PricingSettings = {
                                        ...fallbackStore.pricingSettings,
                                        allowedDeliveryAreas: updated,
                                      };
                                      await fallbackStore.savePricingSettings(updatedPricing);
                                      setPricing(updatedPricing);
                                      showAlert('ডিলিট সম্পন্ন', 'এলাকাটি সফলভাবে মুছে ফেলা হয়েছে।', 'success');
                                    }
                                  }}
                                  className="p-1.5 rounded-xl bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 shadow-xs transition-colors"
                                  title="Delete area"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          );
        })()}

            {/* Helper Applications Sub-View */}
            {helperSubView === 'APPLICATIONS' && (() => {
              let filtered = [...applications];
              if (isZoneFiltered && targetZoneIds) {
                filtered = filtered.filter((a) => {
                  if (a.assignedAreaIds && a.assignedAreaIds.some((id) => targetZoneIds.includes(id))) return true;
                  if (a.preferredAreaId && targetZoneIds.includes(a.preferredAreaId)) return true;
                  return false;
                });
              }
              if (appsStartDate) {
                const startMs = new Date(`${appsStartDate}T00:00:00`).getTime();
                filtered = filtered.filter((a) => new Date(a.createdAt).getTime() >= startMs);
              }
              if (appsEndDate) {
                const endMs = new Date(`${appsEndDate}T23:59:59.999`).getTime();
                filtered = filtered.filter((a) => new Date(a.createdAt).getTime() <= endMs);
              }
              if (helpersAppliedSearchQuery.trim()) {
                const q = helpersAppliedSearchQuery.toLowerCase().trim();
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
            {helperSubView === 'TABLE' && (() => {
              // Deduplicate list by id
              const processedList = processedHelpers;
              const uniqueProcessedMap = new Map<string, typeof processedList[0]>();
              processedList.forEach((h) => {
                if (!uniqueProcessedMap.has(h.id)) {
                  uniqueProcessedMap.set(h.id, h);
                }
              });
              let fleetList = Array.from(uniqueProcessedMap.values());

              // Column sorting logic for Registered Fleet
              if (fleetSortColumn) {
                fleetList.sort((a, b) => {
                  let valA: any = a[fleetSortColumn as keyof typeof a];
                  let valB: any = b[fleetSortColumn as keyof typeof b];

                  if (fleetSortColumn === 'name') {
                    valA = (a.name || '').toLowerCase();
                    valB = (b.name || '').toLowerCase();
                  } else if (fleetSortColumn === 'helperType') {
                    const typeA = fallbackStore.users.get(a.id)?.helperType || 'commuter';
                    const typeB = fallbackStore.users.get(b.id)?.helperType || 'commuter';
                    valA = typeA;
                    valB = typeB;
                  } else if (fleetSortColumn === 'nid') {
                    valA = (a.nid || '').toLowerCase();
                    valB = (b.nid || '').toLowerCase();
                  } else if (fleetSortColumn === 'completedJobs') {
                    valA = a.completedJobs ?? 0;
                    valB = b.completedJobs ?? 0;
                  } else if (fleetSortColumn === 'activeOrders') {
                    valA = a.activeOrders ?? 0;
                    valB = b.activeOrders ?? 0;
                  } else if (fleetSortColumn === 'avgDeliveryTimeMins') {
                    valA = a.avgDeliveryTimeMins ?? 999999;
                    valB = b.avgDeliveryTimeMins ?? 999999;
                  } else if (fleetSortColumn === 'totalEarned') {
                    valA = a.totalEarned ?? 0;
                    valB = b.totalEarned ?? 0;
                  } else if (fleetSortColumn === 'balance') {
                    valA = a.balance ?? 0;
                    valB = b.balance ?? 0;
                  }

                  if (valA < valB) return fleetSortDirection === 'asc' ? -1 : 1;
                  if (valA > valB) return fleetSortDirection === 'asc' ? 1 : -1;
                  return 0;
                });
              }

              const { totalPages, paginatedItems, totalItems } = paginateList(fleetList);

              const handleSortClick = (col: string) => {
                if (fleetSortColumn === col) {
                  setFleetSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
                } else {
                  setFleetSortColumn(col);
                  setFleetSortDirection('asc');
                }
              };

              const renderSortIcon = (col: string) => {
                if (fleetSortColumn !== col) {
                  return <ArrowUpDown className="w-3 h-3 opacity-40 inline ml-1" />;
                }
                return (
                  <span className="inline ml-1 font-bold text-purple-600">
                    {fleetSortDirection === 'asc' ? '▲' : '▼'}
                  </span>
                );
              };

              return (
                <div className="bg-white rounded-3xl border border-gray-100 shadow-soft overflow-hidden">
                  <div className="p-5 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <h3 className="font-extrabold text-base text-gray-900">Helper Statistics & Performance Histories</h3>
                      <p className="text-xs text-purple-700 font-bold mt-0.5">
                        Performance metrics for: <span className="underline">{describeRange(dateRange)}</span>
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        type="button"
                        onClick={() => {
                          setExportHelperTargetId(null);
                          setShowExportHelperModal(true);
                        }}
                        className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-extrabold text-xs transition-all shadow-sm"
                        title="Export helper data as Excel / Sheet"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Export Sheet</span>
                      </button>
                      <span className="text-xs font-bold px-3 py-1 rounded-full bg-indigo-50 text-indigo-800 self-start sm:self-auto">
                        {exactActiveHelpers !== null ? exactActiveHelpers.toLocaleString() : totalItems} helpers recorded
                      </span>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs text-gray-600 min-w-[700px]">
                      <thead className="bg-gray-50 text-gray-700 uppercase font-extrabold text-[10px] tracking-wider border-b border-gray-100">
                        <tr>
                          <th
                            className="py-3.5 px-5 cursor-pointer hover:bg-gray-100 select-none"
                            onClick={() => handleSortClick('name')}
                          >
                            <div className="flex items-center space-x-1">
                              <span>Helper Name</span>
                              {renderSortIcon('name')}
                            </div>
                          </th>
                          <th
                            className="py-3.5 px-5 cursor-pointer hover:bg-gray-100 select-none"
                            onClick={() => handleSortClick('helperType')}
                          >
                            <div className="flex items-center space-x-1">
                              <span>Helper Type / Status</span>
                              {renderSortIcon('helperType')}
                            </div>
                          </th>
                          <th
                            className="py-3.5 px-5 cursor-pointer hover:bg-gray-100 select-none"
                            onClick={() => handleSortClick('nid')}
                          >
                            <div className="flex items-center space-x-1">
                              <span>NID #</span>
                              {renderSortIcon('nid')}
                            </div>
                          </th>
                          <th
                            className="py-3.5 px-5 cursor-pointer hover:bg-gray-100 select-none"
                            onClick={() => handleSortClick('completedJobs')}
                          >
                            <div className="flex items-center space-x-1">
                              <span>Completed Jobs</span>
                              {renderSortIcon('completedJobs')}
                            </div>
                          </th>
                          <th
                            className="py-3.5 px-5 cursor-pointer hover:bg-gray-100 select-none"
                            onClick={() => handleSortClick('activeOrders')}
                          >
                            <div className="flex items-center space-x-1">
                              <span>Active Assigned Jobs</span>
                              {renderSortIcon('activeOrders')}
                            </div>
                          </th>
                          <th
                            className="py-3.5 px-5 cursor-pointer hover:bg-gray-100 select-none"
                            onClick={() => handleSortClick('storeOrders' as any)}
                          >
                            <div className="flex items-center space-x-1">
                              <span>Store Orders</span>
                              {renderSortIcon('storeOrders' as any)}
                            </div>
                          </th>
                          <th
                            className="py-3.5 px-5 cursor-pointer hover:bg-gray-100 select-none"
                            onClick={() => handleSortClick('avgDeliveryTimeMins')}
                          >
                            <div className="flex items-center space-x-1">
                              <span>Avg Delivery</span>
                              {renderSortIcon('avgDeliveryTimeMins')}
                            </div>
                          </th>
                          <th
                            className="py-3.5 px-5 cursor-pointer hover:bg-gray-100 select-none"
                            onClick={() => handleSortClick('totalEarned')}
                          >
                            <div className="flex items-center space-x-1">
                              <span>Total Earned</span>
                              {renderSortIcon('totalEarned')}
                            </div>
                          </th>
                          <th
                            className="py-3.5 px-5 cursor-pointer hover:bg-gray-100 select-none"
                            onClick={() => handleSortClick('balance')}
                          >
                            <div className="flex items-center space-x-1">
                              <span>Wallet Balance</span>
                              {renderSortIcon('balance')}
                            </div>
                          </th>
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
                                <div className="space-y-0.5">
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-extrabold text-gray-900">{h.name}</span>
                                    {helperUser?.isBlocked && (
                                      <span className="px-2 py-0.5 rounded-full bg-red-600 text-white font-black text-[9px] uppercase tracking-wider flex items-center space-x-0.5">
                                        <Ban className="w-2.5 h-2.5" />
                                        <span>BLOCKED</span>
                                      </span>
                                    )}
                                    {isEdu && (
                                      <span className="inline-flex items-center gap-0.5 text-[9px] font-black bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded-full border border-blue-200" title="Edu Email Verified">
                                        <Check className="w-2.5 h-2.5 text-blue-600" />
                                        <span>Edu</span>
                                      </span>
                                    )}
                                  </div>
                                  {helperUser?.isBlocked && (helperUser.adminBlockNote || helperUser.blockedReason) && (
                                    <p className="text-[10px] text-red-700 font-bold flex items-center gap-1">
                                      <Lock className="w-2.5 h-2.5 text-red-500 shrink-0" />
                                      <span className="truncate max-w-[140px]" title={helperUser.adminBlockNote || helperUser.blockedReason}>
                                        Note: {helperUser.adminBlockNote || helperUser.blockedReason}
                                      </span>
                                    </p>
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
                              <td className="py-4 px-5">
                                <span className="font-extrabold text-amber-900 bg-amber-50 border border-amber-200/80 px-2 py-0.5 rounded-lg text-xs flex items-center gap-1 w-fit">
                                  <Store className="w-3 h-3 text-amber-600" />
                                  <span>{h.storeOrdersCount} ({h.storeOrdersPercentage}%)</span>
                                </span>
                              </td>
                              <td className="py-4 px-5 font-black text-blue-700">
                                {h.avgDeliveryTimeMins != null
                                  ? formatDurationMinutes(h.avgDeliveryTimeMins)
                                  : '—'}
                              </td>
                              <td className="py-4 px-5 font-extrabold text-indigo-900">৳{h.totalEarned}</td>
                              <td className="py-4 px-5 font-extrabold text-purple-900">৳{h.balance}</td>
                              <td className="py-4 px-5 text-right space-x-1" onClick={(e) => e.stopPropagation()}>
                                {helperUser?.isBlocked ? (
                                  <button
                                    onClick={async () => {
                                      const conf = await showConfirm(
                                        'আনব্লক নিশ্চিতকরণ',
                                        `আপনি কি ${h.name}-কে আনব্লক করতে চান?`,
                                        'হ্যাঁ, আনব্লক করুন',
                                        'বাতিল'
                                      );
                                      if (!conf) return;
                                      await fallbackStore.blockUser(h.id, false);
                                      setUsers(Array.from(fallbackStore.users.values()));
                                      showAlert('আনব্লক সম্পন্ন', `${h.name}-কে আনব্লক করা হয়েছে।`, 'success');
                                    }}
                                    className="py-1.5 px-2.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-extrabold text-xs transition-all"
                                  >
                                    Unblock
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => setBlockTarget({ id: h.id, name: h.name, type: 'Helper' })}
                                    className="py-1.5 px-2.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-700 font-extrabold text-xs transition-all"
                                  >
                                    Block
                                  </button>
                                )}
                                <button
                                  onClick={() => {
                                    setExportHelperTargetId(h.id);
                                    setShowExportHelperModal(true);
                                  }}
                                  title="Export this helper's performance to Excel / Sheet"
                                  className="py-1.5 px-2.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-extrabold text-xs transition-all flex items-center gap-1"
                                >
                                  <Download className="w-3 h-3 text-emerald-600" />
                                  <span>Sheet</span>
                                </button>
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
              );
            })()}
          </div>
        );
      })()}



      {/* --- TAB 6: WITHDRAWALS TAB --- */}
      {activeTab === 'WITHDRAWALS' && isTabAllowed('WITHDRAWALS') && (() => {
        const withdrawalsSource = serverWithdrawals !== null ? serverWithdrawals : withdrawals;
        let filtered = [...withdrawalsSource];
        if (isZoneFiltered && targetZoneIds) {
          filtered = filtered.filter((w) => {
            const u = users.find((usr) => usr.uid === w.helperId);
            if (u) {
              if (u.serveAllAreas) return true;
              if (u.assignedAreaIds && u.assignedAreaIds.some((id) => targetZoneIds.includes(id))) return true;
              if (u.areaId && targetZoneIds.includes(u.areaId)) return true;
              if (allowedDeliveryAreas.some((a) => targetZoneIds.includes(a.id) && a.assignedHelperIds?.includes(u.uid))) return true;
            }
            return false;
          });
        }
        if (withdrawalStatusFilter !== 'ALL') {
          filtered = filtered.filter((w) => w.status === withdrawalStatusFilter);
        }
        if (withdrawalTypeFilter !== 'ALL') {
          filtered = filtered.filter((w) => {
            const isStore = w.userType === 'store' || storeUserIds.has(w.helperId) || shopByOwnerId.has(w.helperId);
            return withdrawalTypeFilter === 'STORE' ? isStore : !isStore;
          });
        }
        if (withdrawalsStartDate) {
          const startMs = new Date(`${withdrawalsStartDate}T00:00:00`).getTime();
          filtered = filtered.filter((w) => new Date(w.createdAt).getTime() >= startMs);
        }
        if (withdrawalsEndDate) {
          const endMs = new Date(`${withdrawalsEndDate}T23:59:59.999`).getTime();
          filtered = filtered.filter((w) => new Date(w.createdAt).getTime() <= endMs);
        }
        if (withdrawalsAppliedSearchQuery.trim()) {
          const q = withdrawalsAppliedSearchQuery.toLowerCase().trim();
          filtered = filtered.filter(
            (w) =>
              w.helperName.toLowerCase().includes(q) ||
              w.paymentMethod?.toLowerCase().includes(q) ||
              w.accountNumber?.includes(q) ||
              w.id.toLowerCase().includes(q)
          );
        }
        filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        const hasWdFilter = Boolean(withdrawalsAppliedSearchQuery.trim() || withdrawalsStartDate || withdrawalsEndDate || withdrawalStatusFilter !== 'ALL' || withdrawalTypeFilter !== 'ALL');
        const overrideWdCount = (serverWithdrawals === null && !hasWdFilter && exactWithdrawalsCount !== null) ? exactWithdrawalsCount : undefined;
        const { totalPages, paginatedItems, totalItems } = paginateList(filtered, undefined, undefined, overrideWdCount);

        return (
          <div className="bg-white rounded-3xl border border-gray-100 shadow-soft overflow-hidden">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-extrabold text-base text-gray-900">Commission Payback Requests</h3>
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
                    <th className="py-3.5 px-5">Type</th>
                    <th className="py-3.5 px-5">Name</th>
                    <th className="py-3.5 px-5">Amount (৳)</th>
                    <th className="py-3.5 px-5">Payment Method</th>
                    <th className="py-3.5 px-5">Note / Mobile / TxID</th>
                    <th className="py-3.5 px-5">Status</th>
                    <th className="py-3.5 px-5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 font-medium">
                  {paginatedItems.map((w) => {
                    const shop = shopByOwnerId.get(w.helperId);
                    const isStore = w.userType === 'store' || Boolean(shop) || storeUserIds.has(w.helperId);
                    const storeName = shop?.name;
                    return (
                      <tr key={w.id} className="hover:bg-gray-50/80 transition-colors">
                        <td className="py-4 px-5">
                          <span
                            className={`px-2.5 py-1 rounded-full font-extrabold text-[10px] ${isStore ? 'bg-purple-100 text-purple-800' : 'bg-emerald-100 text-emerald-800'
                              }`}
                          >
                            {isStore ? 'Store' : 'Helper'}
                          </span>
                        </td>
                        <td className="py-4 px-5">
                          {storeName ? (
                            <div>
                              <span className="font-extrabold text-purple-950 block text-xs">{storeName}</span>
                              <span className="text-[10px] text-gray-500 font-medium block">{w.helperName}</span>
                            </div>
                          ) : (
                            <span className="font-extrabold text-gray-900">{w.helperName}</span>
                          )}
                        </td>
                        <td className="py-4 px-5 font-extrabold text-purple-800">৳{w.amount}</td>
                        <td className="py-4 px-5 font-bold uppercase">{w.paymentMethod}</td>
                        <td className="py-4 px-5 font-mono whitespace-pre-wrap max-w-xs">{w.accountNumber || '—'}</td>
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
                          <div className="flex items-center justify-end space-x-2">
                            {w.status === 'PENDING' ? (
                              <>
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
                              </>
                            ) : (
                              <span className="text-gray-400 text-xs">Processed</span>
                            )}
                            {isSuperAdmin && (
                              <button
                                onClick={() => openEditWdModal(w)}
                                className="py-1.5 px-3 rounded-xl bg-purple-100 hover:bg-purple-200 text-purple-900 font-extrabold text-xs transition-all flex items-center space-x-1"
                              >
                                <span>Edit</span>
                              </button>
                            )}
                          </div>
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

          {/* ── Custom Store Pricing Settings ── */}
          <div className="border border-indigo-200 rounded-3xl p-5 bg-indigo-50/40 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h4 className="font-extrabold text-sm text-indigo-950 flex items-center gap-2">
                  <Store className="w-5 h-5 text-indigo-700" />
                  <span>Custom Store pricing (কাস্টম স্টোর চার্জ)</span>
                </h4>
                <p className="text-[11px] text-gray-600 mt-1 leading-relaxed">
                  কাস্টমার যদি ৫টি পণ্যের মধ্যে ৪টি লিস্টেড স্টোর থেকে এবং ১টি কাস্টম আইটেম অর্ডার করে এবং হেলপার সেটি লিস্টেড স্টোর থেকে কিনতে না পেরে অন্য কোনো দোকান থেকে কিনে কাস্টম খরচ যোগ করে, তবে প্রতি কাস্টম পণ্যে/খরচে এই অতিরিক্ত চার্জ যোগ হবে।
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-0.5">
                <input
                  type="checkbox"
                  checked={customStorePricingEnabled}
                  onChange={(e) => setCustomStorePricingEnabled(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
              </label>
            </div>

            {customStorePricingEnabled && (
              <div className="pt-3 border-t border-indigo-100 grid grid-cols-1 sm:grid-cols-2 gap-4 animate-in fade-in duration-200">
                <div>
                  <label className="text-xs font-bold text-gray-750 block mb-1">
                    Charge per Custom Item (প্রতি কাস্টম পণ্যের চার্জ ৳):
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={customStorePricingAmount}
                    onChange={(e) => setCustomStorePricingAmount(e.target.value === '' ? '' : e.target.value)}
                    placeholder="e.g. 15"
                    className="w-full p-3 rounded-2xl border border-gray-200 text-xs font-extrabold outline-none focus:border-indigo-600 bg-white"
                  />
                  <p className="text-[10px] text-gray-500 mt-1 font-medium">
                    হেলপার কাস্টম খরচ যুক্ত করলে কাস্টমার ও হেলপার উভয়ের ক্যালকুলেশন সামারিতে পণ্য প্রতি এই ফি প্রদর্শিত হবে।
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* ── Customer Referral Coin Reward Settings ── */}
          <div className="border border-amber-200 rounded-3xl p-5 bg-gradient-to-br from-amber-50/70 to-yellow-50/40 space-y-4 shadow-2xs">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h4 className="font-extrabold text-sm text-amber-950 flex items-center gap-2">
                  <Share2 className="w-5 h-5 text-amber-600" />
                  <span>Customer Referral Reward Settings (কাস্টমার রেফারেল কয়েন বোনাস)</span>
                </h4>
                <p className="text-[11px] text-gray-600 mt-1 leading-relaxed">
                  কাস্টমাররা তাদের বন্ধুদের হোয়াটসঅ্যাপ নম্বর দিয়ে রেফার করতে পারেন। রেফার করা বন্ধু যখন জামানতে অর্ডার করবেন এবং সেই অর্ডারটি সফলভাবে ডেলিভারি (DELIVERED) হবে, তখন রেফারকারী গ্রাহক এই পরিমাণ জামানত কয়েন উপহার পাবেন।
                </p>
              </div>
            </div>

            <div className="pt-2 border-t border-amber-200/60 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <label className="text-xs font-bold text-gray-800 block mb-1">
                  Referrer Reward Coins (রেফারকারী কত কয়েন পাবেন):
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm pointer-events-none">🪙</span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={referralRewardCoins}
                    onChange={(e) => setReferralRewardCoins(e.target.value === '' ? '' : Number(e.target.value))}
                    placeholder="e.g. 20"
                    className="w-full pl-9 pr-3 py-3 rounded-2xl border border-gray-200 bg-white text-xs font-black outline-none focus:border-amber-600 focus:ring-3 focus:ring-amber-500/10"
                  />
                </div>
                <p className="text-[10px] text-gray-500 mt-1 font-medium">
                  রেফার করা বন্ধু ডেলিভারি সম্পন্ন করলে রেফারকারী এই কয়েন পাবেন (ডিফল্ট: ২০)।
                </p>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-800 block mb-1">
                  Referred Customer Coins (নতুন কাস্টমার কত কয়েন পাবেন):
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm pointer-events-none">🪙</span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={referredUserRewardCoins}
                    onChange={(e) => setReferredUserRewardCoins(e.target.value === '' ? '' : Number(e.target.value))}
                    placeholder="e.g. 10"
                    className="w-full pl-9 pr-3 py-3 rounded-2xl border border-gray-200 bg-white text-xs font-black outline-none focus:border-amber-600 focus:ring-3 focus:ring-amber-500/10"
                  />
                </div>
                <p className="text-[10px] text-gray-500 mt-1 font-medium">
                  রেফারেলের মাধ্যমে যুক্ত নতুন কাস্টমার সফল অর্ডারে এই বোনাস কয়েন পাবেন (ডিফল্ট: ১০)।
                </p>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-800 block mb-1">
                  Eligible Orders for New Customer (কতটি অর্ডারে প্রযোজ্য):
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm pointer-events-none">📦</span>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={referredUserRewardOrderLimit}
                    onChange={(e) => setReferredUserRewardOrderLimit(e.target.value === '' ? '' : Number(e.target.value))}
                    placeholder="e.g. 1"
                    className="w-full pl-9 pr-3 py-3 rounded-2xl border border-gray-200 bg-white text-xs font-black outline-none focus:border-amber-600 focus:ring-3 focus:ring-amber-500/10"
                  />
                </div>
                <p className="text-[10px] text-gray-500 mt-1 font-medium">
                  ১ দিলে শুধুমাত্র ১ম সফল অর্ডারে পাবে, ২ বা ৩ দিলে ততগুলো সফল অর্ডারে কয়েন বোনাস পাবে (ডিফল্ট: ১)।
                </p>
              </div>
            </div>

            <div className="mt-3">
              <label className="text-xs font-bold text-gray-800 block mb-1">
                Referral WhatsApp Message (হোয়াটসঅ্যাপে পাঠানোর রেফারেল মেসেজ):
              </label>
              <textarea
                rows={2}
                value={referralMessageTemplate}
                onChange={(e) => setReferralMessageTemplate(e.target.value)}
                placeholder="e.g. আসসালামু আলাইকুম! জামানত দিয়ে সহজে বাজার-সদাই ডেলিভারি নিন। এখনই এই লিঙ্কে অর্ডার করুন: {link}"
                className="w-full px-3 py-2.5 rounded-2xl border border-gray-200 bg-white text-xs font-medium outline-none focus:border-amber-600 focus:ring-3 focus:ring-amber-500/10 resize-none"
              />
              <p className="text-[10px] text-gray-500 mt-1 font-medium">
                রেফার লিংক ডায়নামিক ভাবে বসাতে <code className="bg-amber-100 text-amber-900 px-1 py-0.5 rounded font-mono text-[9px] font-bold">{'{link}'}</code> কোডটি ব্যবহার করুন।
              </p>
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
                  step="any"
                  min="0"
                  value={feeCalculatorPerKmRate}
                  onChange={(e) => setFeeCalculatorPerKmRate(e.target.value === '' ? '' : e.target.value)}
                  className="w-full p-3 rounded-xl border border-gray-200 text-xs font-extrabold outline-none focus:border-emerald-600"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">Rate per KG Weight (ওজন চার্জ ৳):</label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={feeCalculatorPerKgRate}
                  onChange={(e) => setFeeCalculatorPerKgRate(e.target.value === '' ? '' : e.target.value)}
                  className="w-full p-3 rounded-xl border border-gray-200 text-xs font-extrabold outline-none focus:border-emerald-600"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">Return Charge (% ডেলিভারি ফি-এর শতাংশ):</label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={feeCalculatorReturnPercent}
                  onChange={(e) => setFeeCalculatorReturnPercent(e.target.value === '' ? '' : e.target.value)}
                  placeholder="খালি রাখলে অপশনটি হাইড হবে"
                  className="w-full p-3 rounded-xl border border-gray-200 text-xs font-extrabold outline-none focus:border-emerald-600"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">Processing Fee (প্রসেসিং ফি):</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={feeCalculatorProcessingFee}
                    onChange={(e) => setFeeCalculatorProcessingFee(e.target.value === '' ? '' : e.target.value)}
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
                  step="any"
                  min="0"
                  value={feeCalculatorMinFee}
                  onChange={(e) => setFeeCalculatorMinFee(e.target.value === '' ? '' : e.target.value)}
                  className="w-full p-3 rounded-xl border border-gray-200 text-xs font-extrabold outline-none focus:border-emerald-600"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">Delivery Fee Alert Limit (সর্বোচ্চ ফি লিমিট ৳):</label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={feeCalculatorMaxLimit}
                  onChange={(e) => setFeeCalculatorMaxLimit(e.target.value === '' ? '' : e.target.value)}
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
            ) : (() => {
              const totalItems = feeSuggestions.length;
              const totalPages = Math.max(1, Math.ceil(totalItems / pricingFeeSuggestionsPageSize));
              const currentPage = Math.min(Math.max(1, pricingFeeSuggestionsPage), totalPages);
              const startIndex = (currentPage - 1) * pricingFeeSuggestionsPageSize;
              const paginatedSuggestions = feeSuggestions.slice(startIndex, startIndex + pricingFeeSuggestionsPageSize);

              return (
                <div className="space-y-3">
                  {/* Top Bar with Page Size Selector */}
                  <div className="flex items-center justify-between text-xs px-1">
                    <span className="font-semibold text-gray-600">
                      Showing {startIndex + 1} to {Math.min(startIndex + pricingFeeSuggestionsPageSize, totalItems)} of {totalItems} suggestions
                    </span>
                    <div className="flex items-center gap-1.5 text-xs text-gray-600">
                      <span>Per page:</span>
                      <select
                        value={pricingFeeSuggestionsPageSize}
                        onChange={(e) => {
                          setPricingFeeSuggestionsPageSize(Number(e.target.value));
                          setPricingFeeSuggestionsPage(1);
                        }}
                        className="px-2 py-1 rounded-xl border border-gray-200 bg-white font-bold text-xs outline-none focus:border-purple-600 cursor-pointer"
                      >
                        <option value={5}>5</option>
                        <option value={10}>10</option>
                        <option value={20}>20</option>
                      </select>
                    </div>
                  </div>

                  <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-xs">
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
                        {paginatedSuggestions.map((sug) => (
                          <tr key={sug.id} className="hover:bg-gray-50/80">
                            <td className="p-3 whitespace-nowrap text-gray-500 font-medium">
                              {new Date(sug.createdAt).toLocaleDateString()}
                            </td>
                            <td className="p-3 font-bold text-gray-900">
                              {sug.userName}
                              {sug.userPhone && (
                                <span className="block text-[10px] text-gray-500 font-normal">{sug.userPhone}</span>
                              )}
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
                                className="p-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 transition-colors cursor-pointer"
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

                  {/* Pagination Controls */}
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
                    <p className="text-xs text-gray-500 font-medium">
                      Showing {startIndex + 1} to {Math.min(startIndex + pricingFeeSuggestionsPageSize, totalItems)} of {totalItems} entries
                    </p>

                    <div className="flex items-center space-x-2">
                      <button
                        type="button"
                        disabled={currentPage <= 1}
                        onClick={() => setPricingFeeSuggestionsPage((p) => Math.max(1, p - 1))}
                        className="px-3 py-1.5 rounded-xl border border-gray-200 text-xs font-bold text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
                      >
                        Previous
                      </button>
                      <span className="text-xs font-extrabold text-purple-950 px-2">
                        {currentPage} / {totalPages}
                      </span>
                      <button
                        type="button"
                        disabled={currentPage >= totalPages}
                        onClick={() => setPricingFeeSuggestionsPage((p) => Math.min(totalPages, p + 1))}
                        className="px-3 py-1.5 rounded-xl border border-gray-200 text-xs font-bold text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                </div>
              );
            })()}
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
                  step="any"
                  min={1}
                  max={1000}
                  value={helperRadiusKm}
                  onChange={(e) => setHelperRadiusKm(e.target.value === '' ? '' : e.target.value)}
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
                  step="any"
                  min={0}
                  max={60}
                  value={dedicatedDelayMins}
                  onChange={(e) => setDedicatedDelayMins(e.target.value === '' ? '' : e.target.value)}
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
                  step="any"
                  min={0}
                  max={60}
                  value={pricing.adminAcceptedDelayMinutes ?? 5}
                  onChange={(e) =>
                    setPricing({ ...pricing, adminAcceptedDelayMinutes: e.target.value === '' ? ('' as any) : Number(e.target.value) })
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

            {/* Become Helper Visibility Toggle for Customers */}
            <div className="pt-3 border-t border-blue-200/80">
              <div className="flex items-start justify-between p-3.5 bg-white/90 rounded-2xl border border-blue-200 shadow-xs">
                <div className="pr-3">
                  <label htmlFor="showBecomeHelperToggle" className="text-xs font-bold text-gray-800 cursor-pointer block">
                    Show "Become Helper" in Sidebar (গ্রাহকদের সাইডবারে "Become Helper" বা হেল্পার হওয়ার অপশন দেখান)
                  </label>
                  <p className="text-[11px] text-gray-500 mt-1">
                    সক্রিয় থাকলে সাধারণ গ্রাহকরা সাইডবার/ড্রয়ার মেনুতে হেল্পার হওয়ার আবেদন অপশন দেখতে পাবেন। বন্ধ থাকলে অপ্রয়োজনীয় আবেদন ও ডাটাবেজ স্টোরেজ রোধে অপশনটি সাধারণ গ্রাহকদের থেকে লুকানো থাকবে। (অ্যাডমিন কাউকে Dedicated বা Helper বানিয়ে দিলে তারা সবসময় Helper Mode দেখতে পাবেন)।
                  </p>
                </div>
                <input
                  type="checkbox"
                  id="showBecomeHelperToggle"
                  checked={showBecomeHelper}
                  onChange={(e) => setShowBecomeHelper(e.target.checked)}
                  className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500 cursor-pointer shrink-0 mt-0.5"
                />
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

          {/* Specific Allowed Serving Areas (Geofencing Polygons) Link to Helpers Tab */}
          <div className="p-5 rounded-3xl bg-emerald-50/80 border border-emerald-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <h4 className="font-extrabold text-sm text-emerald-950 uppercase tracking-wider flex items-center space-x-2">
                <Globe className="w-5 h-5 text-emerald-700" />
                <span>Specific Serving Areas & Geofencing (সার্ভিস এলাকা ও হেলপার বাউন্ডারি)</span>
              </h4>
              <p className="text-[11px] text-emerald-800 font-medium">
                নির্দিষ্ট সার্ভিস এলাকা, ম্যাপে আয়তক্ষেত্র/পলিগন সাব-এরিয়া তৈরি এবং প্রতি এলাকার জন্য হেলপার নির্ধারণ এখন <strong>Helpers</strong> ট্যাব থেকে সরাসরি নিয়ন্ত্রণ করা যায়।
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                setActiveTab('HELPERS');
                setHelperSubView('AREAS');
              }}
              className="py-2.5 px-4 bg-emerald-800 hover:bg-emerald-900 text-white rounded-2xl text-xs font-extrabold shadow-sm transition-all flex items-center space-x-1.5 shrink-0 self-start sm:self-auto cursor-pointer"
            >
              <span>Manage in Helpers Tab 👉</span>
            </button>
          </div>

          {/* Manual Auth (Email/Password Login & Register) Settings */}
          <div className="p-5 rounded-3xl bg-amber-50/80 border border-amber-200 space-y-4">
            <h4 className="font-extrabold text-sm text-amber-950 uppercase tracking-wider flex items-center space-x-2">
              <User className="w-5 h-5 text-amber-700" />
              <span>ম্যানুয়াল লগইন ও রেজিস্ট্রেশন নিয়ন্ত্রণ (Manual Auth Controls)</span>
            </h4>
            <p className="text-[11px] text-amber-900 font-medium">
              এখানে ম্যানুয়াল (Email & Password) লগইন ও সাইন-আপ অপশন চালু বা বন্ধ রাখতে পারবেন। বন্ধ রাখলে ব্যবহারকারীর সাইন-ইন মডালে শুধুমাত্র Google Sign-In দৃশ্যমান থাকবে।
            </p>

            <div className="flex items-center space-x-3 p-3.5 bg-white rounded-2xl border border-amber-200 shadow-sm">
              <input
                type="checkbox"
                id="manualAuthEnabled"
                checked={manualAuthEnabled}
                onChange={(e) => setManualAuthEnabled(e.target.checked)}
                className="w-4 h-4 text-amber-600 rounded focus:ring-amber-500 border-gray-300"
              />
              <label htmlFor="manualAuthEnabled" className="text-xs font-bold text-gray-900 cursor-pointer select-none">
                ম্যানুয়াল ইমেইল ও পাসওয়ার্ড দিয়ে লগইন ও রেজিস্ট্রেশন চালু রাখুন (Enable Manual Email/Password Authentication)
              </label>
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

          {/* In-App Browser (Facebook/Messenger/Instagram) Popup & Alert Admin Controls */}
          <div className="p-5 rounded-3xl bg-amber-50/70 border border-amber-200 space-y-4">
            <h4 className="font-extrabold text-sm text-amber-950 uppercase tracking-wider flex items-center space-x-2">
              <Compass className="w-5 h-5 text-amber-600" />
              <span>In-App Browser (Facebook / Messenger) Popup & Alert Settings (ইন-অ্যাপ ব্রাউজার পপআপ ও সতর্কতা বার্তা)</span>
            </h4>
            <p className="text-[11px] text-amber-900 font-medium">
              ব্যবহারকারী যখন ফেসবুক বা মেসেঞ্জারের ভেতর থেকে ওয়েবসাইট ভিজিট করেন, তখন গুগল লগইন ব্লক হওয়া রোধ ও সেরা সুবিধার জন্য ব্রাউজারে খোলার পপআপ বার্তা নিয়ন্ত্রণ করুন।
            </p>

            <div className="flex items-center space-x-3 p-3 bg-white rounded-2xl border border-amber-200">
              <input
                type="checkbox"
                id="inAppBrowserPromptEnabled"
                checked={inAppBrowserPromptEnabled}
                onChange={(e) => setInAppBrowserPromptEnabled(e.target.checked)}
                className="w-4 h-4 text-amber-600 rounded focus:ring-amber-500 border-gray-300 cursor-pointer"
              />
              <label htmlFor="inAppBrowserPromptEnabled" className="text-xs font-bold text-gray-900 cursor-pointer">
                ফেসবুক/মেসেঞ্জারে ওয়েবসাইট দেখলে পপআপ অ্যালার্ট দেখান (Enable In-App Browser Popup Alert)
              </label>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1.5">
                  পপআপ টাইটেল (Popup Title)
                </label>
                <input
                  type="text"
                  value={inAppBrowserPromptTitle}
                  onChange={(e) => setInAppBrowserPromptTitle(e.target.value)}
                  placeholder="ব্রাউজারে ওপেন করুন"
                  className="w-full p-3.5 rounded-2xl border border-gray-200 bg-white text-sm font-semibold outline-none focus:border-amber-600"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1.5">
                  সাব-টাইটেল (Subtitle / Sub-text)
                </label>
                <input
                  type="text"
                  value={inAppBrowserPromptSubtitle}
                  onChange={(e) => setInAppBrowserPromptSubtitle(e.target.value)}
                  placeholder="Open in Chrome or Safari"
                  className="w-full p-3.5 rounded-2xl border border-gray-200 bg-white text-sm font-semibold outline-none focus:border-amber-600"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-gray-700 block mb-1.5">
                সতর্কবার্তা ও বিবরণ (Alert Message & Details)
              </label>
              <textarea
                value={inAppBrowserPromptMessage}
                onChange={(e) => setInAppBrowserPromptMessage(e.target.value)}
                placeholder="লগইন ও নির্ভুল সেবার জন্য ওয়েবসাইটটি Chrome বা Safari ব্রাউজারে ওপেন করুন।"
                rows={3}
                className="w-full p-3.5 rounded-2xl border border-gray-200 bg-white text-xs font-medium outline-none focus:border-amber-600 leading-relaxed font-sans"
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

          {/* Blocked User Notice & Custom Modal Admin Configuration */}
          <div className="p-5 rounded-3xl bg-rose-50/80 border border-rose-200 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h4 className="font-extrabold text-sm text-rose-950 uppercase tracking-wider flex items-center space-x-2">
                  <Ban className="w-5 h-5 text-rose-600" />
                  <span>ব্লকড ব্যবহারকারী নোটিশ ও কাস্টম পপআপ সেটিংস (Blocked User Modal & Notice Settings)</span>
                </h4>
                <p className="text-[11px] text-rose-800 font-medium mt-0.5">
                  যেকোনো গ্রাহক, হেলপার বা স্টোর ব্লক করা হলে তাদের সামনে প্রদর্শিত নোটিশ ও যোগাযোগের বাটন কাস্টমাইজ করুন।
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowBlockedUserModalPreview(true)}
                className="py-2 px-3.5 rounded-xl bg-rose-700 hover:bg-rose-800 text-white font-extrabold text-xs shadow-sm transition-all flex items-center space-x-1.5 shrink-0 self-start sm:self-auto cursor-pointer"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Live Modal Preview</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold text-gray-800 block mb-1.5">
                  পপআপ টাইটেল (Modal Title)
                </label>
                <input
                  type="text"
                  value={blockedUserModalTitle}
                  onChange={(e) => setBlockedUserModalTitle(e.target.value)}
                  placeholder="অ্যাকাউন্ট সাময়িকভাবে স্থগিত (Account Suspended)"
                  className="w-full p-3.5 rounded-2xl border border-gray-200 bg-white text-sm font-semibold outline-none focus:border-rose-600"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-800 block mb-1.5">
                  সাব-টাইটেল (Subtitle)
                </label>
                <input
                  type="text"
                  value={blockedUserModalSubtitle}
                  onChange={(e) => setBlockedUserModalSubtitle(e.target.value)}
                  placeholder="আপনার অ্যাকাউন্টটি সাময়িকভাবে সীমাবদ্ধ করা হয়েছে"
                  className="w-full p-3.5 rounded-2xl border border-gray-200 bg-white text-sm font-semibold outline-none focus:border-rose-600"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-gray-800 block mb-1.5">
                বিস্তারিত বার্তা / মেসেজ (Notice Message)
              </label>
              <textarea
                value={blockedUserModalMessage}
                onChange={(e) => setBlockedUserModalMessage(e.target.value)}
                rows={3}
                placeholder="নিরাপত্তা বা নীতিমালা ভঙ্গের কারণে আপনার অ্যাকাউন্টটি সাময়িকভাবে স্থগিত করা হয়েছে..."
                className="w-full p-3.5 rounded-2xl border border-gray-200 bg-white text-xs font-medium outline-none focus:border-rose-600 leading-relaxed font-sans"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold text-gray-800 block mb-1.5">
                  সাপোর্ট বাটন টেক্সট (Button Label)
                </label>
                <input
                  type="text"
                  value={blockedUserModalButtonText}
                  onChange={(e) => setBlockedUserModalButtonText(e.target.value)}
                  placeholder="সাপোর্টে যোগাযোগ করুন (Contact Support)"
                  className="w-full p-3.5 rounded-2xl border border-gray-200 bg-white text-sm font-semibold outline-none focus:border-rose-600"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-800 block mb-1.5">
                  সাপোর্ট লিংক বা হোয়াটসঅ্যাপ নম্বর (Support Link / WhatsApp)
                </label>
                <input
                  type="text"
                  value={blockedUserModalContactUrl}
                  onChange={(e) => setBlockedUserModalContactUrl(e.target.value)}
                  placeholder="https://wa.me/88018XXXXXXXX"
                  className="w-full p-3.5 rounded-2xl border border-gray-200 bg-white text-sm font-semibold outline-none focus:border-rose-600"
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
                  <option value="always_on">Always Open (সরাসরি চালু)</option>
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

          {/* ── Home Page Hero / Banner Slider Management ── */}
          <div className="border border-purple-200 rounded-2xl p-5 bg-purple-50/20 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-extrabold text-sm text-purple-950 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-purple-700" />
                <span>হোম পেজ ব্যানার স্লাইডার (Hero Banner Slides)</span>
              </h4>
              <span className="text-xs bg-purple-100 text-purple-800 font-extrabold px-2.5 py-1 rounded-full">
                {adminSlides.length}টি স্লাইড
              </span>
            </div>
            <p className="text-xs text-gray-500">
              হোম পেজের শীর্ষ স্লাইডারে ব্যানার ছবি প্রদর্শন করুন। প্রতিটি ব্যানারে ঐচ্ছিক রিডাইরেক্ট লিংক যোগ করতে পারেন (লিংক সেট করলে ক্লিক করলে রিডাইরেক্ট হবে, খালি রাখলে কোনো অ্যাকশন হবে না)।
            </p>

            {/* List of current slides */}
            {adminSlides.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                {adminSlides.map((slide, idx) => (
                  <div
                    key={slide.id || idx}
                    className="relative border border-gray-200 rounded-2xl p-3 bg-white flex flex-col justify-between shadow-xs hover:border-purple-300 transition-colors"
                  >
                    <div className="space-y-2">
                      {slide.imageUrl && (
                        <div className="w-full h-28 rounded-xl overflow-hidden bg-gray-100 border border-gray-100">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={slide.imageUrl}
                            alt={slide.title || `Slide ${idx + 1}`}
                            className="w-full h-full object-cover"
                          />
                        </div>
                      )}
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-gray-900">
                            {slide.title || `ব্যানার #${idx + 1}`}
                          </span>
                          <span className="text-[10px] bg-purple-50 text-purple-700 font-semibold px-2 py-0.5 rounded-full">
                            স্লাইড {idx + 1}
                          </span>
                        </div>
                        {slide.link ? (
                          <p className="text-[11px] text-purple-700 font-medium truncate flex items-center gap-1 mt-1">
                            <ExternalLink className="w-3 h-3 shrink-0" />
                            <span>{slide.link}</span>
                          </p>
                        ) : (
                          <p className="text-[11px] text-gray-400 mt-1 italic">
                            কোনো লিংক সংযুক্ত নেই (ক্লিকে কিছু হবে না)
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="mt-3 pt-2 border-t border-gray-100 flex justify-end">
                      <button
                        type="button"
                        onClick={() => handleDeleteSlide(idx)}
                        className="text-xs text-red-600 hover:text-red-700 font-bold flex items-center gap-1 px-2.5 py-1 rounded-lg hover:bg-red-50 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>মুছে ফেলুন</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Form to add a new slide */}
            <div className="p-4 bg-white rounded-2xl border border-dashed border-purple-200 space-y-3">
              <h5 className="text-xs font-extrabold text-purple-900 flex items-center gap-1.5">
                <Plus className="w-4 h-4 text-purple-600" />
                <span>নতুন ব্যানার স্লাইড যোগ করুন</span>
              </h5>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-gray-700 block mb-1">
                    ব্যানার ইমেজ আপলোড (ফাইল সিলেক্ট করুন):
                  </label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleSlideImageFileChange(file);
                    }}
                    className="w-full text-xs text-gray-600 file:mr-3 file:py-2 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-purple-100 file:text-purple-800 hover:file:bg-purple-200 cursor-pointer"
                  />
                  {isUploadingSlideImage && (
                    <p className="text-[11px] text-purple-600 font-medium mt-1">ছবি প্রসেস হচ্ছে...</p>
                  )}
                </div>

                <div>
                  <label className="text-xs font-bold text-gray-700 block mb-1">
                    অথবা ছবির সরাসরি URL (ঐচ্ছিক):
                  </label>
                  <input
                    type="url"
                    value={newSlideImageUrl}
                    onChange={(e) => setNewSlideImageUrl(e.target.value)}
                    placeholder="https://example.com/banner.jpg"
                    className="w-full p-2.5 rounded-xl border border-gray-200 text-xs font-medium outline-none focus:border-purple-600"
                  />
                </div>
              </div>

              {newSlideImageUrl && (
                <div className="w-full max-w-xs h-24 rounded-xl overflow-hidden bg-gray-100 border border-gray-200">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={newSlideImageUrl}
                    alt="Preview"
                    className="w-full h-full object-cover"
                  />
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-gray-700 block mb-1">
                    ব্যানারের শিরোনাম (ঐচ্ছিক):
                  </label>
                  <input
                    type="text"
                    value={newSlideTitle}
                    onChange={(e) => setNewSlideTitle(e.target.value)}
                    placeholder="যেমন: বিশেষ অফার বা ছাড়"
                    className="w-full p-2.5 rounded-xl border border-gray-200 text-xs font-medium outline-none focus:border-purple-600"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-gray-700 block mb-1">
                    ক্লিক রিডাইরেক্ট লিংক (ঐচ্ছিক):
                  </label>
                  <input
                    type="text"
                    value={newSlideLink}
                    onChange={(e) => setNewSlideLink(e.target.value)}
                    placeholder="যেমন: https://wa.me/... অথবা খালি রাখুন"
                    className="w-full p-2.5 rounded-xl border border-gray-200 text-xs font-medium outline-none focus:border-purple-600"
                  />
                  <p className="text-[10px] text-gray-500 mt-0.5">
                    খালি রাখলে গ্রাহক ব্যানারে ক্লিক করলে কোনো রিডাইরেক্ট হবে না।
                  </p>
                </div>
              </div>

              <div className="pt-1 flex justify-end">
                <button
                  type="button"
                  onClick={handleAddSlide}
                  disabled={!newSlideImageUrl.trim() || isUploadingSlideImage}
                  className="px-4 py-2 rounded-xl bg-purple-700 hover:bg-purple-800 disabled:opacity-50 text-white text-xs font-bold shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>স্লাইড যোগ করুন</span>
                </button>
              </div>
            </div>
          </div>

          {/* ── Search Not Found Notice Message ── */}
          <div className="border border-emerald-100 rounded-2xl p-4 bg-emerald-50/20 space-y-2">
            <label className="text-xs font-bold text-gray-800 block">
              সার্চ রেজাল্ট না পাওয়া গেলে নোটিশ বার্তা (Search Not Found Message):
            </label>
            <textarea
              value={searchNotFoundMsg}
              onChange={(e) => setSearchNotFoundMsg(e.target.value)}
              placeholder="যেমন: দুঃখিত, আপনার খোঁজা পণ্য বা সেবাটি খুঁজে পাওয়া যায়নি। তবে কোনো সমস্যা নেই! কাস্টম রিকোয়েস্ট তৈরি করুন, আমরা ব্যবস্থা করে দেবো।"
              rows={3}
              className="w-full p-3.5 rounded-2xl border border-gray-200 bg-white text-xs font-medium outline-none focus:border-emerald-600 focus:ring-4 focus:ring-emerald-600/10 leading-relaxed font-sans"
            />
            <p className="text-[11px] text-gray-500">
              গ্রাহক হোম পেজের সার্চ বক্সে কোনো পণ্য বা সেবা খুঁজে না পেলে এই বার্তাটি দেখাবে এবং নিচে কাস্টম রিকোয়েস্ট বাটন থাকবে। খালি রাখলে ডিফল্ট বার্তা প্রদর্শিত হবে।
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

          {/* ── Connect Store Types with Service Types ── */}
          <div className="border border-purple-200/80 rounded-2xl p-5 bg-gradient-to-br from-purple-50/50 via-white to-indigo-50/30 space-y-4 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-purple-100">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-purple-600/10 flex items-center justify-center text-purple-700 shrink-0 mt-0.5">
                  <Layers className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-extrabold text-sm text-gray-900 flex items-center gap-2">
                    সার্ভিসের সাথে দোকানের ধরন সংযোগ (Connect Store Types to Services)
                  </h4>
                  <p className="text-[11px] text-gray-600 mt-0.5 leading-relaxed">
                    গ্রাহক যখন হোম পেজে বা স্টোর গ্রিডে একটি সার্ভিস সিলেক্ট করবেন, তখন কোন কোন ধরনের দোকান (Store Types) প্রদর্শিত হবে তা নির্ধারণ করুন।
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  const servicesList = servicesText.split('\n').map((s) => s.trim()).filter(Boolean);
                  const svcs = servicesList.length > 0 ? servicesList : DEFAULT_SERVICES;
                  const newMap: Record<string, string[]> = {};
                  svcs.forEach((svc) => {
                    newMap[svc] = getStoreTypesForService(svc);
                  });
                  setServiceStoreTypeMap(newMap);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-100 hover:bg-purple-200 text-purple-800 text-xs font-bold transition-all shrink-0 active:scale-95 cursor-pointer self-start sm:self-auto"
                title="স্বয়ংক্রিয়ভাবে বুদ্ধিমত্তা অনুযায়ী ডিফল্ট সংযোগ সেট করুন"
              >
                <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                ডিফল্ট সংযোগ রিস্টোর করুন
              </button>
            </div>

            {(() => {
              const servicesList = servicesText.split('\n').map((s) => s.trim()).filter(Boolean);
              const svcs = servicesList.length > 0 ? servicesList : DEFAULT_SERVICES;
              const allStoreTypes = parseStoreTypes(storeTypesText);

              if (svcs.length === 0) {
                return (
                  <p className="text-xs text-gray-400 italic py-2">
                    কোনো সার্ভিস পাওয়া যায়নি। উপরে সার্ভিস ড্রপডাউন অপশনে সার্ভিস যুক্ত করুন।
                  </p>
                );
              }

              return (
                <div className="space-y-3.5">
                  {svcs.map((svcName) => {
                    const selectedTypes = serviceStoreTypeMap[svcName] || [];
                    const isAllSelected = allStoreTypes.length > 0 && selectedTypes.length === allStoreTypes.length;

                    return (
                      <div
                        key={svcName}
                        className="p-4 rounded-xl border border-gray-200/90 bg-white/90 shadow-xs hover:border-purple-300 transition-all space-y-2.5"
                      >
                        {/* Service Header Row */}
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-xs text-gray-900">
                              {svcName}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${selectedTypes.length > 0
                                  ? 'bg-purple-100 text-purple-700 border border-purple-200'
                                  : 'bg-amber-50 text-amber-700 border border-amber-200'
                                }`}
                            >
                              {selectedTypes.length > 0
                                ? `${selectedTypes.length}টি ধরন সংযুক্ত`
                                : 'ডিফল্ট ম্যাচিং'}
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setServiceStoreTypeMap((prev) => ({
                                  ...prev,
                                  [svcName]: isAllSelected ? [] : [...allStoreTypes],
                                }));
                              }}
                              className="text-[11px] font-semibold text-purple-700 hover:text-purple-900 px-2 py-0.5 rounded-lg hover:bg-purple-50 transition-colors cursor-pointer"
                            >
                              {isAllSelected ? 'সব বাতিল' : 'সব নির্বাচন'}
                            </button>
                            {selectedTypes.length > 0 && (
                              <button
                                type="button"
                                onClick={() => {
                                  setServiceStoreTypeMap((prev) => {
                                    const next = { ...prev };
                                    delete next[svcName];
                                    return next;
                                  });
                                }}
                                className="text-[11px] font-semibold text-gray-500 hover:text-rose-600 px-1.5 py-0.5 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer"
                              >
                                রিসেট
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Store Types Badges / Chips */}
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {allStoreTypes.map((type) => {
                            const isSelected = selectedTypes.includes(type);
                            return (
                              <button
                                key={type}
                                type="button"
                                onClick={() => {
                                  setServiceStoreTypeMap((prev) => {
                                    const curr = prev[svcName] || [];
                                    const exists = curr.includes(type);
                                    const nextList = exists
                                      ? curr.filter((t) => t !== type)
                                      : [...curr, type];
                                    return {
                                      ...prev,
                                      [svcName]: nextList,
                                    };
                                  });
                                }}
                                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs transition-all cursor-pointer font-medium active:scale-95 ${isSelected
                                    ? 'bg-purple-600 text-white shadow-xs font-semibold'
                                    : 'bg-gray-100 hover:bg-gray-200/80 text-gray-700 border border-gray-200'
                                  }`}
                              >
                                {isSelected ? (
                                  <Check className="w-3 h-3 text-white shrink-0" />
                                ) : (
                                  <Plus className="w-3 h-3 text-gray-400 shrink-0" />
                                )}
                                <span>{type}</span>
                              </button>
                            );
                          })}
                        </div>

                        {selectedTypes.length === 0 && (
                          <p className="text-[10px] text-amber-700 bg-amber-50/80 px-2.5 py-1 rounded-md border border-amber-200/50 inline-block font-medium">
                            💡 কোনো ধরন নির্বাচন না থাকলে নামের মিল অনুযায়ী স্বয়ংক্রিয় ডিফল্ট ফিল্টার কার্যকর থাকবে।
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })()}
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t border-purple-100/60">
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1.5">
                  পিকআপ ইনপুট বাক্সের কাস্টম প্লেসহোল্ডার (Pickup Input Placeholder):
                </label>
                <input
                  type="text"
                  value={mapPickerPickupPlaceholder}
                  onChange={(e) => setMapPickerPickupPlaceholder(e.target.value)}
                  placeholder="যেমন: আরিফ স্টোর, আশুলিয়া বাজার."
                  className="w-full p-3.5 rounded-2xl border border-gray-200 text-xs font-medium outline-none focus:border-purple-600 focus:ring-4 focus:ring-purple-600/10"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1.5">
                  ডেলিভারি ইনপুট বাক্সের কাস্টম প্লেসহোল্ডার (Delivery Input Placeholder):
                </label>
                <input
                  type="text"
                  value={mapPickerDeliveryPlaceholder}
                  onChange={(e) => setMapPickerDeliveryPlaceholder(e.target.value)}
                  placeholder="যেমন: ৪এ, রহমান ভিলা, মডেল টাউন."
                  className="w-full p-3.5 rounded-2xl border border-gray-200 text-xs font-medium outline-none focus:border-purple-600 focus:ring-4 focus:ring-purple-600/10"
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-bold text-gray-700 block mb-1.5">
                ঠিকানা খালি থাকলে সতর্কবার্তা (Blank Address Floating Error Message):
              </label>
              <input
                type="text"
                value={mapPickerAddressRequiredMessage}
                onChange={(e) => setMapPickerAddressRequiredMessage(e.target.value)}
                placeholder="যেমন: অনুগ্রহ করে নিচের বাক্সে বিস্তারিত ঠিকানা ম্যানুয়ালি লিখুন। এটি একটি বাধ্যতামূলক ফিল্ড।"
                className="w-full p-3.5 rounded-2xl border border-gray-200 text-xs font-medium outline-none focus:border-purple-600 focus:ring-4 focus:ring-purple-600/10"
              />
              <p className="text-[11px] text-gray-500 mt-1">
                গ্রাহক ম্যাপে ঠিকানা ম্যানুয়ালি না লিখে কনফার্ম বাটনে ক্লিক করলে লাল বর্ডারসহ এই ফ্লোটিং বার্তাটি দেখাবে।
              </p>
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
        const shopsSource = serverShops !== null ? serverShops : shops;
        const predefinedCategories = parseStoreTypes(fallbackStore.pricingSettings.storeTypes);
        const dynamicCats = new Set<string>(predefinedCategories);
        shopsSource.forEach((s) => {
          if (s.type && s.type.trim()) dynamicCats.add(s.type.trim());
        });
        const allShopCategories = Array.from(dynamicCats).sort();

        let filteredShops = [...shopsSource];
        if (isZoneFiltered && targetZoneIds) {
          filteredShops = filteredShops.filter((s) => {
            if ((s as any).areaId && targetZoneIds.includes((s as any).areaId)) return true;
            if ((s as any).areaIds && (s as any).areaIds.some((aid: string) => targetZoneIds.includes(aid))) return true;
            if (s.location?.lat && s.location?.lng) {
              const matched = getAreasForPoint({ lat: s.location.lat, lng: s.location.lng }, allowedDeliveryAreas);
              return matched.some((a) => targetZoneIds.includes(a.id));
            }
            return false;
          });
        }
        if (shopsCategoryFilter !== 'ALL') {
          filteredShops = filteredShops.filter((s) => (s.type || '').trim() === shopsCategoryFilter.trim());
        }
        if (shopsActiveFilter !== 'ALL') {
          filteredShops = filteredShops.filter((s) => {
            const isStoreActive = s.isActive !== undefined ? s.isActive : (s.isOpen !== false);
            return shopsActiveFilter === 'ACTIVE' ? isStoreActive : !isStoreActive;
          });
        }
        if (shopsApprovalFilter !== 'ALL') {
          filteredShops = filteredShops.filter((s) => {
            const sStatus = s.status === 'Pending' || s.status === 'PENDING'
              ? 'Pending'
              : s.status === 'Rejected' || s.status === 'REJECTED'
                ? 'Rejected'
                : 'Approved';
            return sStatus === shopsApprovalFilter;
          });
        }
        if (shopsFeaturedFilter === 'FEATURED') {
          filteredShops = filteredShops.filter((s) => Boolean(s.isFeatured));
        } else if (shopsFeaturedFilter === 'NOT_FEATURED') {
          filteredShops = filteredShops.filter((s) => !s.isFeatured);
        }
        if (shopsAppliedSearchQuery.trim()) {
          const q = shopsAppliedSearchQuery.toLowerCase().trim();
          filteredShops = filteredShops.filter(
            (s) =>
              (s.name || '').toLowerCase().includes(q) ||
              (s.type || '').toLowerCase().includes(q) ||
              (s.contactPerson || '').toLowerCase().includes(q) ||
              (s.whatsapp && s.whatsapp.includes(q)) ||
              (s.location?.address || '').toLowerCase().includes(q)
          );
        }

        // Sort shops by selected field & direction (default: UNPAID DESC)
        filteredShops.sort((a, b) => {
          const ma = shopMetricsMap.get(a.id)!;
          const mb = shopMetricsMap.get(b.id)!;

          let diff = 0;
          if (shopsSortField === 'FEATURED') {
            const featA = a.isFeatured ? 1 : 0;
            const featB = b.isFeatured ? 1 : 0;
            diff = featB - featA;
            if (diff === 0 && a.isFeatured && b.isFeatured) {
              const ordA = typeof a.featuredOrder === 'number' ? a.featuredOrder : 999999;
              const ordB = typeof b.featuredOrder === 'number' ? b.featuredOrder : 999999;
              diff = ordA - ordB;
            }
          } else if (shopsSortField === 'UNPAID') {
            diff = mb.unpaidBalance - ma.unpaidBalance;
          } else if (shopsSortField === 'SALES') {
            diff = mb.totalSales - ma.totalSales;
          } else if (shopsSortField === 'COMMISSION') {
            diff = mb.commission - ma.commission;
          } else if (shopsSortField === 'ORDERS') {
            diff = mb.completed - ma.completed;
          } else if (shopsSortField === 'NAME') {
            diff = (a.name || '').localeCompare(b.name || '');
            return shopsSortDirection === 'ASC' ? diff : -diff;
          } else if (shopsSortField === 'TYPE') {
            diff = (a.type || '').localeCompare(b.type || '');
            return shopsSortDirection === 'ASC' ? diff : -diff;
          } else if (shopsSortField === 'DATE') {
            diff = new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
          } else {
            diff = mb.unpaidBalance - ma.unpaidBalance;
          }

          if (diff === 0) {
            diff = new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
          }

          return shopsSortDirection === 'DESC' ? diff : -diff;
        });

        const toggleShopSort = (field: typeof shopsSortField) => {
          if (shopsSortField === field) {
            setShopsSortDirection((prev) => (prev === 'ASC' ? 'DESC' : 'ASC'));
          } else {
            setShopsSortField(field);
            setShopsSortDirection(field === 'NAME' || field === 'TYPE' ? 'ASC' : 'DESC');
          }
        };

        const hasShopsFilter = Boolean(shopsAppliedSearchQuery.trim() || shopsCategoryFilter !== 'ALL' || shopsFeaturedFilter !== 'ALL' || shopsActiveFilter !== 'ALL' || shopsApprovalFilter !== 'ALL');
        const overrideShopsCount = (serverShops === null && !hasShopsFilter && exactShopsCount !== null) ? exactShopsCount : undefined;
        const { totalPages, paginatedItems, totalItems } = paginateList(filteredShops, undefined, undefined, overrideShopsCount);

        return (
          <div className="space-y-4">
            {/* ── ASSIGN TO STORE MODAL (always rendered at top level) ── */}
            {assignModalOpen && (() => {
              const selectedProducts = allStoreProducts.filter((p) => selectedProductIds.has(p.id));
              const compressImg = (file: File): Promise<string> => new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = (e) => {
                  const img = new Image();
                  img.onload = () => {
                    const canvas = document.createElement('canvas'); const MAX = 500;
                    let w = img.width, h = img.height;
                    if (w > h) { if (w > MAX) { h = Math.round(h * MAX / w); w = MAX; } } else { if (h > MAX) { w = Math.round(w * MAX / h); h = MAX; } }
                    canvas.width = w; canvas.height = h;
                    const ctx = canvas.getContext('2d');
                    if (!ctx) { resolve(e.target?.result as string); return; }
                    ctx.drawImage(img, 0, 0, w, h); resolve(canvas.toDataURL('image/jpeg', 0.82));
                  };
                  img.onerror = reject; img.src = e.target?.result as string;
                };
                reader.onerror = reject; reader.readAsDataURL(file);
              });
              const doAssign = async () => {
                if (!assignTargetStoreId) { showAlert('দোকান নির্বাচন করুন', 'একটি লক্ষ্য দোকান বেছে নিন।', 'error'); return; }
                const tShop = shopsSource.find((s) => s.id === assignTargetStoreId);
                if (!tShop) return;
                setAssignSubmitting(true);
                try {
                  const now = new Date().toISOString();
                  for (const prod of selectedProducts) {
                    const ov = assignItemOverrides[prod.id];
                    const newId = `sp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
                    const np = ov?.price ? parseFloat(ov.price) : prod.price;
                    await fallbackStore.saveStoreProduct({ id: newId, storeId: assignTargetStoreId, storeName: tShop.name, name: ov?.name?.trim() || prod.name, unit: prod.unit, price: isNaN(np) ? prod.price : np, discountRate: prod.discountRate, inStock: true, category: (ov?.category?.trim() || prod.category) || undefined, photoUrl: (ov?.photoUrl || prod.photoUrl) || undefined, createdAt: now, updatedAt: now });
                  }
                  setAllStoreProducts(Array.from(fallbackStore.storeProducts.values()));
                  setAssignModalOpen(false); setSelectedProductIds(new Set());
                  showAlert('সফল হয়েছে! 🎉', `${selectedProducts.length} টি পণ্য "${tShop.name}" দোকানে কপি হয়েছে।`, 'success');
                } catch (err: any) { console.error(err); showAlert('সমস্যা হয়েছে', 'কপি করতে ব্যর্থ হয়েছে।', 'error'); }
                finally { setAssignSubmitting(false); }
              };
              return (
                <div className="fixed inset-0 z-[200000] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
                  <div className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl border border-gray-100 flex flex-col max-h-[92vh]">
                    <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white flex items-center justify-center shadow-lg"><Copy className="w-5 h-5" /></div>
                        <div>
                          <h3 className="font-extrabold text-base text-gray-900">অন্য দোকানে পণ্য কপি করুন</h3>
                          <p className="text-[11px] text-gray-500 mt-0.5">{selectedProducts.length} টি পণ্য নির্বাচিত — তথ্য পরিবর্তন করুন ও দোকান বেছে নিন</p>
                        </div>
                      </div>
                      <button type="button" onClick={() => setAssignModalOpen(false)} className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-600 flex items-center justify-center cursor-pointer"><X className="w-4 h-4" /></button>
                    </div>
                    {/* Target store */}
                    <div className="px-6 py-4 border-b border-gray-100 bg-indigo-50/40 shrink-0">
                      <label className="block text-xs font-extrabold text-gray-700 mb-2 flex items-center gap-1.5"><Store className="w-3.5 h-3.5 text-indigo-600" />কোন দোকানে কপি করবেন? <span className="text-rose-500">*</span></label>
                      <div className="relative">
                        <select value={assignTargetStoreId} onChange={(e) => setAssignTargetStoreId(e.target.value)} className="w-full pl-4 pr-8 py-2.5 rounded-xl border border-indigo-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none text-xs font-bold bg-white cursor-pointer appearance-none">
                          <option value="">-- দোকান নির্বাচন করুন --</option>
                          {shopsSource.map((s) => (<option key={s.id} value={s.id}>{s.name} · {s.type}</option>))}
                        </select>
                        <ChevronDown className="w-4 h-4 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      </div>
                    </div>
                    {/* Product list */}
                    <div className="overflow-y-auto flex-1 px-6 py-4 space-y-3">
                      <p className="text-[11px] text-indigo-700 font-semibold bg-indigo-50 rounded-xl px-3 py-2 border border-indigo-100">💡 প্রয়োজনে নাম, মূল্য, ছবি ও ক্যাটাগরি পরিবর্তন করুন। পরিবর্তন না করলে মূল তথ্য ব্যবহার হবে।</p>
                      {selectedProducts.map((prod) => {
                        const ov = assignItemOverrides[prod.id] ?? { name: prod.name, price: String(prod.price), photoUrl: prod.photoUrl || '', category: prod.category || '' };
                        const upd = (p: Partial<typeof ov>) => setAssignItemOverrides((prev) => ({ ...prev, [prod.id]: { ...ov, ...p } }));
                        return (
                          <div key={prod.id} className="bg-gray-50 rounded-2xl border border-gray-200 p-4">
                            <div className="flex items-center gap-3 mb-3">
                              <div className="w-14 h-14 rounded-xl overflow-hidden bg-gray-200 shrink-0 border border-gray-200 flex items-center justify-center relative group cursor-pointer" onClick={() => { const inp = document.getElementById(`assign-photo-${prod.id}`) as HTMLInputElement; inp?.click(); }}>
                                {ov.photoUrl ? <img src={ov.photoUrl} alt={prod.name} className="w-full h-full object-cover" /> : <Package className="w-6 h-6 text-gray-400" />}
                                <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity"><Upload className="w-4 h-4 text-white" /></div>
                                <input id={`assign-photo-${prod.id}`} type="file" accept="image/*" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (f) { try { upd({ photoUrl: await compressImg(f) }); } catch {/**/ } } }} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-extrabold text-gray-800 truncate">{prod.name}</p>
                                <p className="text-[10px] text-gray-400">মূল মূল্য: ৳{prod.price} · {prod.storeName || '—'}</p>
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div><label className="block text-[10px] font-bold text-gray-600 mb-0.5">নাম</label><input type="text" value={ov.name} onChange={(e) => upd({ name: e.target.value })} className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 focus:border-indigo-400 outline-none text-xs bg-white" /></div>
                              <div><label className="block text-[10px] font-bold text-gray-600 mb-0.5">মূল্য (৳)</label><input type="number" min="0" step="0.01" value={ov.price} onChange={(e) => upd({ price: e.target.value })} className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 focus:border-indigo-400 outline-none text-xs font-bold bg-white" /></div>
                              <div><label className="block text-[10px] font-bold text-gray-600 mb-0.5">ক্যাটাগরি</label><input type="text" value={ov.category} onChange={(e) => upd({ category: e.target.value })} placeholder="যেমন: মশলা" className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 focus:border-indigo-400 outline-none text-xs bg-white" /></div>
                              <div><label className="block text-[10px] font-bold text-gray-600 mb-0.5">ছবির URL</label><input type="text" value={ov.photoUrl} onChange={(e) => upd({ photoUrl: e.target.value })} placeholder="https://..." className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 focus:border-indigo-400 outline-none text-xs bg-white" /></div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {/* Footer */}
                    <div className="px-6 py-4 border-t border-gray-100 shrink-0 flex gap-3">
                      <button type="button" onClick={() => setAssignModalOpen(false)} className="flex-1 py-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-extrabold text-xs cursor-pointer">বাতিল</button>
                      <button type="button" disabled={!assignTargetStoreId || assignSubmitting} onClick={doAssign} className="flex-[2] py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 active:scale-95 text-white font-extrabold text-xs shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50">
                        {assignSubmitting ? (<><RefreshCw className="w-4 h-4 animate-spin" /><span>কপি হচ্ছে...</span></>) : (<><Copy className="w-4 h-4" /><span>{selectedProducts.length} টি পণ্য কপি করুন →</span></>)}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })()}
            {/* Top Sub-View Header & Controls */}
            <div className="bg-white rounded-3xl p-4 border border-gray-100 shadow-soft flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center space-x-2">
                <div className="p-2.5 rounded-2xl bg-purple-100 text-purple-900">
                  <Store className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-gray-900">Registered Store / Shop List</h3>
                  <span className="text-xs font-bold text-purple-700">
                    {totalItems} stores {shopsCategoryFilter !== 'ALL' ? `(${shopsCategoryFilter})` : 'registered'}
                  </span>
                </div>
              </div>

              {/* Sub-view Toggles & Category Filter & Add Shop Button */}
              <div className="flex items-center space-x-2 flex-wrap gap-2">
                {/* Category Dropdown Filter */}
                <div className="flex items-center space-x-1.5 bg-gray-100 border border-gray-200 rounded-2xl px-3 py-1.5">
                  <Filter className="w-3.5 h-3.5 text-purple-700 shrink-0" />
                  <span className="text-gray-500 text-[11px] font-bold">Category:</span>
                  <select
                    value={shopsCategoryFilter}
                    onChange={(e) => {
                      setShopsCategoryFilter(e.target.value);
                      setCurrentPage(1);
                    }}
                    className="bg-transparent text-gray-900 font-extrabold text-xs outline-none cursor-pointer max-w-[170px] truncate"
                  >
                    <option value="ALL">All Categories ({shopsSource.length})</option>
                    {allShopCategories.map((cat) => {
                      const count = shopsSource.filter((s) => (s.type || '').trim() === cat.trim()).length;
                      return (
                        <option key={cat} value={cat}>
                          {cat} ({count})
                        </option>
                      );
                    })}
                  </select>
                </div>

                {/* Active / Inactive Status Dropdown Filter */}
                <div className="flex items-center space-x-1.5 bg-gray-100 border border-gray-200 rounded-2xl px-3 py-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                  <span className="text-gray-500 text-[11px] font-bold">Active:</span>
                  <select
                    value={shopsActiveFilter}
                    onChange={(e) => {
                      setShopsActiveFilter(e.target.value as 'ALL' | 'ACTIVE' | 'INACTIVE');
                      setCurrentPage(1);
                    }}
                    className="bg-transparent text-gray-900 font-extrabold text-xs outline-none cursor-pointer"
                  >
                    <option value="ALL">All ({shopsSource.length})</option>
                    <option value="ACTIVE">
                      🟢 Active / খোলা ({shopsSource.filter(s => (s.isActive !== undefined ? s.isActive : (s.isOpen !== false))).length})
                    </option>
                    <option value="INACTIVE">
                      🔴 Inactive / বন্ধ ({shopsSource.filter(s => !(s.isActive !== undefined ? s.isActive : (s.isOpen !== false))).length})
                    </option>
                  </select>
                </div>

                {/* Approval Status Dropdown Filter */}
                <div className="flex items-center space-x-1.5 bg-gray-100 border border-gray-200 rounded-2xl px-3 py-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-purple-700 shrink-0" />
                  <span className="text-gray-500 text-[11px] font-bold">Approval:</span>
                  <select
                    value={shopsApprovalFilter}
                    onChange={(e) => {
                      setShopsApprovalFilter(e.target.value as 'ALL' | 'Approved' | 'Pending' | 'Rejected');
                      setCurrentPage(1);
                    }}
                    className="bg-transparent text-gray-900 font-extrabold text-xs outline-none cursor-pointer"
                  >
                    <option value="ALL">All Approvals</option>
                    <option value="Approved">✓ Approved ({shopsSource.filter(s => s.status !== 'Pending' && s.status !== 'PENDING' && s.status !== 'Rejected' && s.status !== 'REJECTED').length})</option>
                    <option value="Pending">⏳ Pending ({shopsSource.filter(s => s.status === 'Pending' || s.status === 'PENDING').length})</option>
                    <option value="Rejected">✕ Rejected ({shopsSource.filter(s => s.status === 'Rejected' || s.status === 'REJECTED').length})</option>
                  </select>
                </div>

                {/* Featured Filter */}
                <div className="flex items-center space-x-1.5 bg-gray-100 border border-gray-200 rounded-2xl px-3 py-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                  <span className="text-gray-500 text-[11px] font-bold">Featured:</span>
                  <select
                    value={shopsFeaturedFilter}
                    onChange={(e) => {
                      setShopsFeaturedFilter(e.target.value as 'ALL' | 'FEATURED' | 'NOT_FEATURED');
                      setCurrentPage(1);
                    }}
                    className="bg-transparent text-gray-900 font-extrabold text-xs outline-none cursor-pointer"
                  >
                    <option value="ALL">All ({shopsSource.length})</option>
                    <option value="FEATURED">
                      ⭐ Featured ({shopsSource.filter(s => Boolean(s.isFeatured)).length})
                    </option>
                    <option value="NOT_FEATURED">
                      Not Featured ({shopsSource.filter(s => !s.isFeatured).length})
                    </option>
                  </select>
                </div>

                {(shopsCategoryFilter !== 'ALL' || shopsFeaturedFilter !== 'ALL' || shopsActiveFilter !== 'ALL' || shopsApprovalFilter !== 'ALL') && (
                  <button
                    onClick={() => {
                      setShopsCategoryFilter('ALL');
                      setShopsFeaturedFilter('ALL');
                      setShopsActiveFilter('ALL');
                      setShopsApprovalFilter('ALL');
                      setCurrentPage(1);
                    }}
                    className="px-2.5 py-1.5 rounded-xl bg-red-50 hover:bg-red-100 text-red-650 text-xs font-bold transition-all"
                  >
                    Clear Filter
                  </button>
                )}

                <div className="flex bg-gray-100 p-1 rounded-2xl">
                  <button
                    type="button"
                    onClick={() => setShopSubView('MAP')}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-extrabold transition-all flex items-center space-x-1.5 ${shopSubView === 'MAP'
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
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-extrabold transition-all flex items-center space-x-1.5 ${shopSubView === 'TABLE'
                        ? 'bg-purple-900 text-white shadow-md'
                        : 'text-gray-600 hover:text-gray-900'
                      }`}
                  >
                    <Layers className="w-3.5 h-3.5" />
                    <span>Table View</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setShopSubView('ITEMS')}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-extrabold transition-all flex items-center space-x-1.5 ${shopSubView === 'ITEMS'
                        ? 'bg-purple-900 text-white shadow-md'
                        : 'text-gray-600 hover:text-gray-900'
                      }`}
                  >
                    <Package className="w-3.5 h-3.5" />
                    <span>Store Items</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setShopSubView('CATEGORIES')}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-extrabold transition-all flex items-center space-x-1.5 ${shopSubView === 'CATEGORIES'
                        ? 'bg-purple-900 text-white shadow-md'
                        : 'text-gray-600 hover:text-gray-900'
                      }`}
                  >
                    <Tag className="w-3.5 h-3.5" />
                    <span>Categories</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setShopSubView('APPLICATIONS')}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-extrabold transition-all flex items-center space-x-1.5 ${shopSubView === 'APPLICATIONS'
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
                if (shopsAppliedSearchQuery.trim()) {
                  const q = shopsAppliedSearchQuery.toLowerCase().trim();
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
                                  {app.commissionPercent !== undefined && app.commissionPercent !== null ? (
                                    <span className="font-extrabold text-emerald-700">{app.commissionPercent}%</span>
                                  ) : <span className="text-gray-400">—</span>}
                                </td>
                                <td className="py-4 px-4">
                                  <span className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold ${app.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-800' :
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
                                      <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
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
            ) : shopSubView === 'ITEMS' ? (
              /* ── Store Items Catalog Management Sub-View ── */
              (() => {
                const targetShop = shopsSource.find(s => s.id === selectedShopForItems) || shops.find(s => s.id === selectedShopForItems);

                return (
                  <div className="space-y-4">
                    {/* Store Selector & Overview Header */}
                    <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-soft space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center space-x-2.5">
                          <div className="w-10 h-10 rounded-2xl bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold shrink-0">
                            <Package className="w-5 h-5" />
                          </div>
                          <div>
                            <h3 className="font-extrabold text-base text-gray-900">
                              স্টোর পণ্য ও ক্যাটালগ ব্যবস্থাপনা (Store Items)
                            </h3>
                            <p className="text-xs text-gray-500 font-medium">
                              দোকান নির্বাচন করে পণ্য যোগ করুন, মূল্য ও ছাড় পরিবর্তন করুন এবং স্টক নিয়ন্ত্রণ করুন
                            </p>
                          </div>
                        </div>

                        {/* Store Selection Dropdown */}
                        <div className="flex items-center space-x-2 bg-indigo-50/70 border border-indigo-200/80 rounded-2xl p-1.5 px-3">
                          <Store className="w-4 h-4 text-indigo-700 shrink-0" />
                          <span className="text-[11px] font-bold text-indigo-900 shrink-0">দোকান নির্বাচন:</span>
                          <select
                            value={selectedShopForItems}
                            onChange={(e) => setSelectedShopForItems(e.target.value)}
                            className="bg-transparent font-extrabold text-xs text-indigo-950 focus:outline-none cursor-pointer max-w-[260px] truncate"
                          >
                            <option value="ALL">🌐 সকল দোকান ({allStoreProducts.length} টি পণ্য)</option>
                            {shopsSource.map((s) => {
                              const pCount = allStoreProducts.filter(
                                (p) => p.storeId === s.id || (s.ownerUserId && p.storeId === s.ownerUserId)
                              ).length;
                              return (
                                <option key={s.id} value={s.id}>
                                  🏪 {s.name} ({s.type}) — {pCount} টি পণ্য
                                </option>
                              );
                            })}
                          </select>
                        </div>
                      </div>

                      {/* Quick Metric Pills */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-gray-100">
                        <div className="bg-gray-50 rounded-2xl p-3 border border-gray-100">
                          <span className="text-[10px] text-gray-400 font-bold uppercase block">মোট পণ্য (Total Items)</span>
                          <span className="text-lg font-black text-gray-900">{allStoreProducts.length}</span>
                        </div>
                        <div className="bg-emerald-50/60 rounded-2xl p-3 border border-emerald-100">
                          <span className="text-[10px] text-emerald-700 font-bold uppercase block">স্টকে আছে (In Stock)</span>
                          <span className="text-lg font-black text-emerald-800">
                            {allStoreProducts.filter(p => p.inStock).length}
                          </span>
                        </div>
                        <div className="bg-rose-50/60 rounded-2xl p-3 border border-rose-100">
                          <span className="text-[10px] text-rose-700 font-bold uppercase block">স্টক শেষ (Out of Stock)</span>
                          <span className="text-lg font-black text-rose-800">
                            {allStoreProducts.filter(p => !p.inStock).length}
                          </span>
                        </div>
                        <div className="bg-purple-50/60 rounded-2xl p-3 border border-purple-100">
                          <span className="text-[10px] text-purple-700 font-bold uppercase block">পণ্যযুক্ত দোকান</span>
                          <span className="text-lg font-black text-purple-800">
                            {new Set(allStoreProducts.map(p => p.storeId)).size} টি দোকান
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Specific Store Selected -> StoreProductManager */}
                    {selectedShopForItems !== 'ALL' && targetShop ? (
                      <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-soft space-y-4">
                        <div className="flex items-center justify-between pb-3 border-b border-gray-100 flex-wrap gap-2">
                          <div className="flex items-center space-x-2">
                            <span className="px-2.5 py-1 rounded-full bg-purple-100 text-purple-900 font-extrabold text-xs">
                              {targetShop.type}
                            </span>
                            <span className="text-xs text-gray-500 font-medium">
                              {targetShop.location?.address}
                            </span>
                          </div>
                          <div className="flex items-center space-x-2">
                            {/* Target shop Active / Inactive direct toggle */}
                            <button
                              type="button"
                              onClick={async () => {
                                const isStoreActive = targetShop.isActive !== undefined ? targetShop.isActive : (targetShop.isOpen !== false);
                                const nextVal = !isStoreActive;
                                await fallbackStore.toggleShopActiveStatus(targetShop.id, nextVal);
                                setShops(Array.from(fallbackStore.shops.values()));
                                if (serverShops) {
                                  setServerShops((prev) =>
                                    prev ? prev.map((item) => (item.id === targetShop.id ? { ...item, isActive: nextVal, isOpen: nextVal } : item)) : null
                                  );
                                }
                                showAlert(
                                  'স্টোর স্ট্যাটাস আপডেট',
                                  `"${targetShop.name}" সফলভাবে ${nextVal ? 'সক্রিয় (Active / Open)' : 'নিষ্ক্রিয় (Inactive / Closed)'} করা হয়েছে।`,
                                  'success'
                                );
                              }}
                              className={`px-3 py-1.5 rounded-xl font-bold text-xs transition-colors flex items-center space-x-1.5 border cursor-pointer ${(targetShop.isActive !== undefined ? targetShop.isActive : (targetShop.isOpen !== false))
                                  ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
                                  : 'bg-rose-50 text-rose-850 border-rose-300 hover:bg-rose-100'
                                }`}
                              title="Click to toggle store active/inactive"
                            >
                              <span className={`w-2 h-2 rounded-full ${(targetShop.isActive !== undefined ? targetShop.isActive : (targetShop.isOpen !== false)) ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
                              <span>{(targetShop.isActive !== undefined ? targetShop.isActive : (targetShop.isOpen !== false)) ? '🟢 Store Active (খোলা)' : '🔴 Store Inactive (বন্ধ)'}</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => setSelectedShopDetails(targetShop)}
                              className="px-3 py-1.5 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-800 font-bold text-xs transition-colors flex items-center space-x-1 cursor-pointer"
                            >
                              <Store className="w-3.5 h-3.5" />
                              <span>Store Details</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setSelectedShopForItems('ALL')}
                              className="px-3 py-1.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs transition-colors cursor-pointer"
                            >
                              Show All Stores
                            </button>
                          </div>
                        </div>

                        <StoreProductManager
                          storeId={targetShop.id}
                          storeName={targetShop.name}
                          hideFloatingFab={false}
                        />
                      </div>
                    ) : (
                      /* "ALL" Stores Catalog Grid / List */
                      (() => {
                        const allProductCategories = Array.from(
                          new Set(allStoreProducts.map((p) => p.category?.trim()).filter(Boolean))
                        ) as string[];
                        const uncategorizedItemsCount = allStoreProducts.filter(
                          (p) => !p.category || !p.category.trim()
                        ).length;

                        const filteredAllProducts = allStoreProducts.filter((p) => {
                          // Store filter
                          if (adminItemsStoreFilter !== 'ALL' && p.storeId !== adminItemsStoreFilter) {
                            return false;
                          }
                          // Category filter
                          if (adminItemsCategoryFilter !== 'ALL') {
                            if (adminItemsCategoryFilter === '__UNCATEGORIZED__') {
                              if (p.category && p.category.trim()) return false;
                            } else {
                              if ((p.category || '').trim() !== adminItemsCategoryFilter) return false;
                            }
                          }
                          // Stock filter
                          if (adminItemsStockFilter === 'IN_STOCK' && !p.inStock) return false;
                          if (adminItemsStockFilter === 'OUT_OF_STOCK' && p.inStock) return false;

                          // Search filter
                          if (adminItemsSearchQuery.trim()) {
                            const q = adminItemsSearchQuery.toLowerCase();
                            const matchesName = p.name.toLowerCase().includes(q);
                            const matchesCategory = p.category?.toLowerCase().includes(q);
                            const matchesUnit = p.unit?.toLowerCase().includes(q);
                            const matchesStore = (p.storeName || '').toLowerCase().includes(q);
                            return matchesName || matchesCategory || matchesUnit || matchesStore;
                          }
                          return true;
                        });

                        const hasAdminItemsFilter = Boolean(
                          adminItemsSearchQuery.trim() ||
                          adminItemsCategoryFilter !== 'ALL' ||
                          adminItemsStockFilter !== 'ALL' ||
                          adminItemsStoreFilter !== 'ALL'
                        );

                        const totalAdminItemPages = Math.max(1, Math.ceil(filteredAllProducts.length / adminItemsPageSize));
                        const validAdminItemPage = Math.min(Math.max(1, adminItemsPage), totalAdminItemPages);
                        const startAdminItemIdx = (validAdminItemPage - 1) * adminItemsPageSize;
                        const paginatedAdminItems = filteredAllProducts.slice(startAdminItemIdx, startAdminItemIdx + adminItemsPageSize);

                        const totalInStock = allStoreProducts.filter(p => p.inStock).length;
                        const totalOutOfStock = allStoreProducts.filter(p => !p.inStock).length;

                        return (
                          <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-soft space-y-4">
                            {/* Header & Sub-view Toggles */}
                            <div className="flex items-center justify-between flex-wrap gap-3 pb-3 border-b border-gray-100">
                              <div>
                                <h4 className="font-extrabold text-sm sm:text-base text-gray-900 flex items-center gap-2">
                                  <span>স্টোর পণ্য ও ক্যাটাগরি ব্যবস্থাপনা</span>
                                  <span className="px-2 py-0.5 rounded-full bg-purple-100 text-purple-900 text-[10px] font-black">
                                    {filteredAllProducts.length} টি পণ্য
                                  </span>
                                </h4>
                                <p className="text-[11px] text-gray-500 mt-0.5">
                                  সকল দোকানের পণ্য ক্যাটাগরি অনুযায়ী ফিল্টার ও অনুসন্ধান করুন, স্টক নিয়ন্ত্রণ করুন অথবা নির্দিষ্ট দোকান নির্বাচন করুন
                                </p>
                              </div>

                              <div className="flex items-center space-x-2 flex-wrap gap-1.5">
                                {/* Mode Toggles */}
                                <div className="flex bg-gray-100 p-1 rounded-xl">
                                  <button
                                    type="button"
                                    onClick={() => setAdminItemsViewMode('TABLE')}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center space-x-1.5 ${adminItemsViewMode === 'TABLE'
                                        ? 'bg-purple-900 text-white shadow-xs'
                                        : 'text-gray-600 hover:text-gray-900'
                                      }`}
                                  >
                                    <Layers className="w-3.5 h-3.5" />
                                    <span>সকল পণ্যের তালিকা ({filteredAllProducts.length})</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setAdminItemsViewMode('STORES')}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center space-x-1.5 ${adminItemsViewMode === 'STORES'
                                        ? 'bg-purple-900 text-white shadow-xs'
                                        : 'text-gray-600 hover:text-gray-900'
                                      }`}
                                  >
                                    <Store className="w-3.5 h-3.5" />
                                    <span>দোকান ভিত্তিক ({shopsSource.length})</span>
                                  </button>
                                </div>

                                {selectedProductIds.size > 0 && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      // Pre-fill overrides with current product data
                                      const overrides: Record<string, { name: string; price: string; photoUrl: string; category: string }> = {};
                                      Array.from(selectedProductIds).forEach((pid) => {
                                        const prod = allStoreProducts.find((p) => p.id === pid);
                                        if (prod) {
                                          overrides[pid] = {
                                            name: prod.name,
                                            price: String(prod.price),
                                            photoUrl: prod.photoUrl || '',
                                            category: prod.category || '',
                                          };
                                        }
                                      });
                                      setAssignItemOverrides(overrides);
                                      setAssignTargetStoreId('');
                                      setAssignModalOpen(true);
                                    }}
                                    className="py-1.5 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs shadow-sm transition-all flex items-center space-x-1.5 cursor-pointer active:scale-95 animate-in fade-in"
                                  >
                                    <Copy className="w-3.5 h-3.5" />
                                    <span>অন্য দোকানে কপি ({selectedProductIds.size})</span>
                                  </button>
                                )}
                                {shopsSource.length > 0 && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (shopsSource[0]) setSelectedShopForItems(shopsSource[0].id);
                                    }}
                                    className="py-1.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs shadow-sm transition-all flex items-center space-x-1 cursor-pointer active:scale-95"
                                  >
                                    <Plus className="w-3.5 h-3.5" />
                                    <span>পণ্য যোগ করুন</span>
                                  </button>
                                )}
                              </div>
                            </div>

                            {/* Filters Bar */}
                            <div className="bg-gray-50/80 p-3 rounded-2xl border border-gray-100 flex flex-wrap items-center gap-2.5">
                              {/* Search */}
                              <div className="relative flex-1 min-w-[200px]">
                                <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                                <input
                                  type="text"
                                  value={adminItemsSearchQuery}
                                  onChange={(e) => {
                                    setAdminItemsSearchQuery(e.target.value);
                                    setAdminItemsPage(1);
                                  }}
                                  placeholder="পণ্য, ক্যাটাগরি বা দোকানের নাম খুঁজুন..."
                                  className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl bg-white border border-gray-200/90 focus:border-purple-600 focus:ring-1 focus:ring-purple-600 outline-none transition-all font-medium"
                                />
                                {adminItemsSearchQuery && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setAdminItemsSearchQuery('');
                                      setAdminItemsPage(1);
                                    }}
                                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-0.5"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                )}
                              </div>

                              {/* Category Filter */}
                              <div className="flex items-center space-x-1.5 bg-white border border-gray-200 rounded-xl px-2.5 py-1.5">
                                <Tag className="w-3.5 h-3.5 text-purple-700 shrink-0" />
                                <span className="text-gray-500 text-[11px] font-bold">ক্যাটাগরি:</span>
                                <select
                                  value={adminItemsCategoryFilter}
                                  onChange={(e) => {
                                    setAdminItemsCategoryFilter(e.target.value);
                                    setAdminItemsPage(1);
                                  }}
                                  className="bg-transparent text-gray-900 font-extrabold text-xs outline-none cursor-pointer max-w-[150px] truncate"
                                >
                                  <option value="ALL">সকল ক্যাটাগরি ({allStoreProducts.length})</option>
                                  {allProductCategories.map((cat) => {
                                    const count = allStoreProducts.filter((p) => (p.category || '').trim() === cat.trim()).length;
                                    return (
                                      <option key={cat} value={cat}>
                                        {cat} ({count})
                                      </option>
                                    );
                                  })}
                                  {uncategorizedItemsCount > 0 && (
                                    <option value="__UNCATEGORIZED__">
                                      অন্যান্য / ক্যাটাগরি ছাড়া ({uncategorizedItemsCount})
                                    </option>
                                  )}
                                </select>
                              </div>

                              {/* Store Filter */}
                              <div className="flex items-center space-x-1.5 bg-white border border-gray-200 rounded-xl px-2.5 py-1.5">
                                <Store className="w-3.5 h-3.5 text-purple-700 shrink-0" />
                                <span className="text-gray-500 text-[11px] font-bold">দোকান:</span>
                                <select
                                  value={adminItemsStoreFilter}
                                  onChange={(e) => {
                                    setAdminItemsStoreFilter(e.target.value);
                                    setAdminItemsPage(1);
                                  }}
                                  className="bg-transparent text-gray-900 font-extrabold text-xs outline-none cursor-pointer max-w-[150px] truncate"
                                >
                                  <option value="ALL">সকল দোকান ({shopsSource.length})</option>
                                  {shopsSource.map((s) => {
                                    const pCount = allStoreProducts.filter(
                                      (p) => p.storeId === s.id || (s.ownerUserId && p.storeId === s.ownerUserId)
                                    ).length;
                                    return (
                                      <option key={s.id} value={s.id}>
                                        {s.name} ({pCount})
                                      </option>
                                    );
                                  })}
                                </select>
                              </div>

                              {/* Stock Filter */}
                              <div className="flex items-center space-x-1.5 bg-white border border-gray-200 rounded-xl px-2.5 py-1.5">
                                <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                                <span className="text-gray-500 text-[11px] font-bold">স্টক:</span>
                                <select
                                  value={adminItemsStockFilter}
                                  onChange={(e) => {
                                    setAdminItemsStockFilter(e.target.value as any);
                                    setAdminItemsPage(1);
                                  }}
                                  className="bg-transparent text-gray-900 font-extrabold text-xs outline-none cursor-pointer"
                                >
                                  <option value="ALL">সকল স্টক ({allStoreProducts.length})</option>
                                  <option value="IN_STOCK">🟢 স্টকে আছে ({totalInStock})</option>
                                  <option value="OUT_OF_STOCK">🔴 স্টক শেষ ({totalOutOfStock})</option>
                                </select>
                              </div>

                              {hasAdminItemsFilter && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setAdminItemsSearchQuery('');
                                    setAdminItemsCategoryFilter('ALL');
                                    setAdminItemsStockFilter('ALL');
                                    setAdminItemsStoreFilter('ALL');
                                    setAdminItemsPage(1);
                                  }}
                                  className="px-2.5 py-1.5 rounded-xl bg-red-50 hover:bg-red-100 text-red-650 text-xs font-bold transition-all cursor-pointer"
                                >
                                  ফিল্টার মুছুন
                                </button>
                              )}
                            </div>

                            {/* Content based on View Mode */}
                            {/* Selection summary bar */}
                            {selectedProductIds.size > 0 && adminItemsViewMode === 'TABLE' && (
                              <div className="flex items-center justify-between bg-indigo-50 border border-indigo-200 rounded-2xl px-4 py-2.5 animate-in fade-in">
                                <div className="flex items-center gap-2">
                                  <CheckSquare className="w-4 h-4 text-indigo-600" />
                                  <span className="text-xs font-extrabold text-indigo-800">{selectedProductIds.size} টি পণ্য নির্বাচিত</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const overrides: Record<string, { name: string; price: string; photoUrl: string; category: string }> = {};
                                      Array.from(selectedProductIds).forEach((pid) => {
                                        const prod = allStoreProducts.find((p) => p.id === pid);
                                        if (prod) {
                                          overrides[pid] = { name: prod.name, price: String(prod.price), photoUrl: prod.photoUrl || '', category: prod.category || '' };
                                        }
                                      });
                                      setAssignItemOverrides(overrides);
                                      setAssignTargetStoreId('');
                                      setAssignModalOpen(true);
                                    }}
                                    className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs flex items-center gap-1.5 cursor-pointer active:scale-95 transition-all"
                                  >
                                    <Copy className="w-3.5 h-3.5" />
                                    <span>অন্য দোকানে কপি করুন</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setSelectedProductIds(new Set())}
                                    className="px-2.5 py-1.5 rounded-xl bg-white border border-indigo-200 text-indigo-700 font-bold text-xs cursor-pointer hover:bg-indigo-100 transition-all"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            )}
                            {adminItemsViewMode === 'TABLE' ? (
                              <div className="space-y-3">
                                {filteredAllProducts.length === 0 ? (
                                  <div className="text-center py-12 space-y-2.5 bg-gray-50/50 rounded-2xl border border-dashed border-gray-200">
                                    <Package className="w-8 h-8 text-gray-300 mx-auto" />
                                    <p className="text-xs font-bold text-gray-600">কোনো পণ্য পাওয়া যায়নি</p>
                                    {hasAdminItemsFilter && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setAdminItemsSearchQuery('');
                                          setAdminItemsCategoryFilter('ALL');
                                          setAdminItemsStockFilter('ALL');
                                          setAdminItemsStoreFilter('ALL');
                                        }}
                                        className="text-xs font-extrabold text-purple-700 hover:underline cursor-pointer"
                                      >
                                        সকল ফিল্টার রিসেট করুন
                                      </button>
                                    )}
                                  </div>
                                ) : (
                                  <>
                                    <div className="overflow-x-auto rounded-2xl border border-gray-100 shadow-2xs">
                                      <table className="w-full text-left text-xs text-gray-600 min-w-[700px]">
                                        <thead className="bg-gray-50 text-gray-700 uppercase font-extrabold text-[10px] tracking-wider border-b border-gray-100 select-none">
                                          <tr>
                                            <th className="py-3 px-3 w-10 text-center">
                                              <input
                                                type="checkbox"
                                                title="সব নির্বাচন করুন"
                                                checked={paginatedAdminItems.length > 0 && paginatedAdminItems.every((p) => selectedProductIds.has(p.id))}
                                                onChange={(e) => {
                                                  const next = new Set(selectedProductIds);
                                                  if (e.target.checked) {
                                                    paginatedAdminItems.forEach((p) => next.add(p.id));
                                                  } else {
                                                    paginatedAdminItems.forEach((p) => next.delete(p.id));
                                                  }
                                                  setSelectedProductIds(next);
                                                }}
                                                className="w-4 h-4 rounded border-gray-300 text-indigo-600 cursor-pointer accent-indigo-600"
                                              />
                                            </th>
                                            <th className="py-3 px-3 w-12 text-center">#</th>
                                            <th className="py-3 px-3 w-14 text-center">ছবি</th>
                                            <th className="py-3 px-3">পণ্যের নাম ও ক্যাটাগরি</th>
                                            <th className="py-3 px-3">দোকান</th>
                                            <th className="py-3 px-3">পরিমাণ / একক</th>
                                            <th className="py-3 px-3">বিক্রয়মূল্য</th>
                                            <th className="py-3 px-3 text-center">স্টক নিয়ন্ত্রণ</th>
                                            <th className="py-3 px-3 text-right">অ্যাকশন</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100 bg-white">
                                          {paginatedAdminItems.map((p, idx) => {
                                            const itemShop = shopsSource.find(
                                              (s) => s.id === p.storeId || (s.ownerUserId && s.ownerUserId === p.storeId)
                                            );
                                            const hasDiscount = Boolean(p.discountRate && p.discountRate > 0);
                                            const discountedPrice = hasDiscount
                                              ? Math.round(p.price * (1 - (p.discountRate || 0) / 100))
                                              : p.price;
                                            const isSelected = selectedProductIds.has(p.id);

                                            return (
                                              <tr key={p.id} className={`hover:bg-purple-50/20 transition-colors ${isSelected ? 'bg-indigo-50/60' : ''}`}>
                                                <td className="py-2.5 px-3 text-center">
                                                  <input
                                                    type="checkbox"
                                                    checked={isSelected}
                                                    onChange={(e) => {
                                                      const next = new Set(selectedProductIds);
                                                      if (e.target.checked) next.add(p.id); else next.delete(p.id);
                                                      setSelectedProductIds(next);
                                                    }}
                                                    className="w-4 h-4 rounded border-gray-300 text-indigo-600 cursor-pointer accent-indigo-600"
                                                  />
                                                </td>
                                                <td className="py-2.5 px-3 text-center text-[11px] font-bold text-gray-400">
                                                  {startAdminItemIdx + idx + 1}
                                                </td>
                                                <td className="py-2.5 px-3 text-center">
                                                  <div className="w-10 h-10 rounded-xl bg-gray-50 border border-gray-100 overflow-hidden mx-auto flex items-center justify-center">
                                                    {p.photoUrl ? (
                                                      // eslint-disable-next-line @next/next/no-img-element
                                                      <img src={p.photoUrl} alt={p.name} className="w-full h-full object-cover" />
                                                    ) : (
                                                      <Package className="w-5 h-5 text-gray-300" />
                                                    )}
                                                  </div>
                                                </td>
                                                <td className="py-2.5 px-3">
                                                  <div className="font-extrabold text-gray-900 text-xs">
                                                    {p.name}
                                                  </div>
                                                  <div className="mt-0.5 flex items-center gap-1.5 flex-wrap">
                                                    {p.category ? (
                                                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-purple-50 text-purple-700 border border-purple-200/70 font-bold text-[10px]">
                                                        <Tag className="w-2.5 h-2.5" />
                                                        <span>{p.category}</span>
                                                      </span>
                                                    ) : (
                                                      <span className="text-[10px] text-gray-400 italic">
                                                        ক্যাটাগরি নেই
                                                      </span>
                                                    )}
                                                  </div>
                                                </td>
                                                <td className="py-2.5 px-3">
                                                  {itemShop ? (
                                                    <button
                                                      type="button"
                                                      onClick={() => setSelectedShopForItems(itemShop.id)}
                                                      className="text-left font-bold text-indigo-700 hover:text-indigo-900 hover:underline flex items-center gap-1 text-xs cursor-pointer"
                                                      title="এই দোকানের পণ্য ম্যানেজ করুন"
                                                    >
                                                      <Store className="w-3 h-3 text-indigo-500 shrink-0" />
                                                      <span className="truncate max-w-[140px]">{itemShop.name}</span>
                                                    </button>
                                                  ) : (
                                                    <span className="text-gray-500 font-medium text-xs">
                                                      {p.storeName || '—'}
                                                    </span>
                                                  )}
                                                </td>
                                                <td className="py-2.5 px-3 text-xs font-semibold text-gray-600">
                                                  {p.unit}
                                                </td>
                                                <td className="py-2.5 px-3">
                                                  <div className="flex items-baseline gap-1.5">
                                                    <span className="font-extrabold text-emerald-700 text-xs">
                                                      ৳{discountedPrice}
                                                    </span>
                                                    {hasDiscount && (
                                                      <span className="text-[10px] text-gray-400 line-through">
                                                        ৳{p.price}
                                                      </span>
                                                    )}
                                                  </div>
                                                  {hasDiscount && (
                                                    <span className="text-[9px] font-bold text-rose-600 block">
                                                      -{p.discountRate}% ছাড়
                                                    </span>
                                                  )}
                                                </td>
                                                <td className="py-2.5 px-3 text-center">
                                                  <button
                                                    type="button"
                                                    onClick={async () => {
                                                      await fallbackStore.toggleProductStock(p.id, !p.inStock);
                                                      setAllStoreProducts(Array.from(fallbackStore.storeProducts.values()));
                                                    }}
                                                    className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border cursor-pointer transition-all ${p.inStock
                                                        ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
                                                        : 'bg-rose-50 text-rose-800 border-rose-300 hover:bg-rose-100'
                                                      }`}
                                                    title="ক্লিক করে স্টক পরিবর্তন করুন"
                                                  >
                                                    {p.inStock ? '🟢 স্টকে আছে' : '🔴 স্টক শেষ'}
                                                  </button>
                                                </td>
                                                <td className="py-2.5 px-3 text-right">
                                                  <div className="flex items-center justify-end gap-1.5">
                                                    {itemShop && (
                                                      <button
                                                        type="button"
                                                        onClick={() => {
                                                          setManagingItemsShop(itemShop);
                                                        }}
                                                        className="px-2 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-[11px] transition-all cursor-pointer"
                                                        title="দোকানের পণ্য ম্যানেজ করুন"
                                                      >
                                                        ম্যানেজ
                                                      </button>
                                                    )}
                                                    <button
                                                      type="button"
                                                      onClick={async () => {
                                                        const confirmed = await showConfirm(
                                                          'পণ্য মুছে ফেলবেন?',
                                                          `"${p.name}" চিরতরে মুছে যাবে। আপনি কি নিশ্চিত?`,
                                                          'হ্যাঁ, মুছুন',
                                                          'বাতিল'
                                                        );
                                                        if (confirmed) {
                                                          await fallbackStore.deleteStoreProduct(p.id);
                                                          setAllStoreProducts(Array.from(fallbackStore.storeProducts.values()));
                                                          showAlert('মুছে ফেলা হয়েছে', 'পণ্যটি মুছে ফেলা হয়েছে।', 'info');
                                                        }
                                                      }}
                                                      className="p-1 rounded-lg hover:bg-rose-50 text-gray-400 hover:text-rose-600 transition-colors cursor-pointer"
                                                      title="পণ্য মুছুন"
                                                    >
                                                      <Trash2 className="w-3.5 h-3.5" />
                                                    </button>
                                                  </div>
                                                </td>
                                              </tr>
                                            );
                                          })}
                                        </tbody>
                                      </table>
                                    </div>

                                    {/* Pagination */}
                                    {totalAdminItemPages > 1 && (
                                      <div className="pt-2">
                                        <PaginationControl
                                          currentPage={validAdminItemPage}
                                          totalPages={totalAdminItemPages}
                                          totalItems={filteredAllProducts.length}
                                          pageSize={adminItemsPageSize}
                                          onPageChange={(page) => setAdminItemsPage(page)}
                                          onPageSizeChange={(newSize) => {
                                            setAdminItemsPageSize(newSize);
                                            setAdminItemsPage(1);
                                          }}
                                        />
                                      </div>
                                    )}
                                  </>
                                )}
                              </div>
                            ) : (
                              /* Stores quick cards grid */
                              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                                {shopsSource.map((s) => {
                                  const pList = allStoreProducts.filter(
                                    (p) => p.storeId === s.id || (s.ownerUserId && p.storeId === s.ownerUserId)
                                  );
                                  const inStock = pList.filter(p => p.inStock).length;
                                  return (
                                    <div
                                      key={s.id}
                                      onClick={() => setSelectedShopForItems(s.id)}
                                      className="p-4 rounded-2xl border border-gray-100 hover:border-indigo-300 hover:bg-indigo-50/20 bg-gray-50/60 transition-all cursor-pointer group flex flex-col justify-between"
                                    >
                                      <div>
                                        <div className="flex items-start justify-between gap-1 mb-1">
                                          <h5 className="font-extrabold text-sm text-gray-900 group-hover:text-indigo-900 truncate">
                                            {s.name}
                                          </h5>
                                          <div className="flex items-center gap-1 shrink-0">
                                            <span
                                              onClick={async (e) => {
                                                e.stopPropagation();
                                                const isStoreActive = s.isActive !== undefined ? s.isActive : (s.isOpen !== false);
                                                const nextVal = !isStoreActive;
                                                await fallbackStore.toggleShopActiveStatus(s.id, nextVal);
                                                setShops(Array.from(fallbackStore.shops.values()));
                                                if (serverShops) {
                                                  setServerShops((prev) =>
                                                    prev ? prev.map((item) => (item.id === s.id ? { ...item, isActive: nextVal, isOpen: nextVal } : item)) : null
                                                  );
                                                }
                                              }}
                                              title="Click to toggle store active/inactive"
                                              className={`px-1.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border cursor-pointer transition-all ${(s.isActive !== undefined ? s.isActive : (s.isOpen !== false))
                                                  ? 'bg-emerald-100 text-emerald-800 border-emerald-300 hover:bg-emerald-200'
                                                  : 'bg-rose-100 text-rose-850 border-rose-300 hover:bg-rose-200'
                                                }`}
                                            >
                                              {(s.isActive !== undefined ? s.isActive : (s.isOpen !== false)) ? '🟢 Active' : '🔴 Inactive'}
                                            </span>
                                            <span className="px-2 py-0.5 rounded-full bg-purple-100 text-purple-900 text-[10px] font-bold">
                                              {s.type}
                                            </span>
                                          </div>
                                        </div>
                                        <p className="text-[11px] text-gray-500 truncate">{s.location?.address || '—'}</p>
                                      </div>
                                      <div className="mt-3 pt-2.5 border-t border-gray-200/70 flex items-center justify-between">
                                        <span className="text-xs font-black text-indigo-700">
                                          {pList.length} টি পণ্য ({inStock} স্টকে)
                                        </span>
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setManagingItemsShop(s);
                                          }}
                                          className="px-2.5 py-1 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[10px] shadow-2xs transition-all cursor-pointer"
                                        >
                                          ম্যানেজ করুন →
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })()
                    )}
                  </div>
                );
              })()
            ) : shopSubView === 'CATEGORIES' ? (
              <AdminCategoriesManager
                adminCategories={allShopCategories}
                pricingSettings={pricing}
                onPricingChange={(newPricing) => setPricing(newPricing)}
              />
            ) : (
              <div className="bg-white rounded-3xl border border-gray-100 shadow-soft overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-gray-600 min-w-[760px]">
                    <thead className="bg-gray-50 text-gray-700 uppercase font-extrabold text-[10px] tracking-wider border-b border-gray-100 select-none">
                      <tr>
                        <th
                          className="py-3.5 px-4 cursor-pointer hover:bg-gray-100/80 transition-colors"
                          onClick={() => toggleShopSort('NAME')}
                        >
                          <div className="flex items-center space-x-1">
                            <span>Store Name, Type & Items</span>
                            {shopsSortField === 'NAME' ? (
                              shopsSortDirection === 'ASC' ? <ArrowUp className="w-3 h-3 text-purple-700" /> : <ArrowDown className="w-3 h-3 text-purple-700" />
                            ) : (
                              <ArrowUpDown className="w-3 h-3 text-gray-300" />
                            )}
                          </div>
                        </th>
                        <th className="py-3.5 px-4 min-w-[190px]">
                          <div className="flex items-center space-x-1.5 text-gray-800 font-black">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Status & Featured</span>
                          </div>
                        </th>
                        <th
                          className="py-3.5 px-4 cursor-pointer hover:bg-emerald-50/80 transition-colors bg-emerald-50/30"
                          onClick={() => toggleShopSort('UNPAID')}
                        >
                          <div className="flex items-center space-x-1 text-emerald-950 font-black">
                            <DollarSign className="w-3.5 h-3.5 text-emerald-700" />
                            <span>Due Amount (৳)</span>
                            {shopsSortField === 'UNPAID' ? (
                              shopsSortDirection === 'ASC' ? <ArrowUp className="w-3 h-3 text-emerald-700" /> : <ArrowDown className="w-3 h-3 text-emerald-700" />
                            ) : (
                              <ArrowUpDown className="w-3 h-3 text-emerald-300" />
                            )}
                          </div>
                        </th>
                        <th
                          className="py-3.5 px-4 cursor-pointer hover:bg-gray-100/80 transition-colors"
                          onClick={() => toggleShopSort('SALES')}
                        >
                          <div className="flex items-center space-x-1">
                            <span>Current Orders</span>
                            {shopsSortField === 'SALES' ? (
                              shopsSortDirection === 'ASC' ? <ArrowUp className="w-3 h-3 text-purple-700" /> : <ArrowDown className="w-3 h-3 text-purple-700" />
                            ) : (
                              <ArrowUpDown className="w-3 h-3 text-gray-300" />
                            )}
                          </div>
                        </th>
                        <th className="py-3.5 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 font-medium">
                      {paginatedItems.map((s) => {
                        const metrics = shopMetricsMap.get(s.id) || {
                          completed: 0,
                          rejected: 0,
                          running: 0,
                          totalSales: 0,
                          todaySales: 0,
                          commission: 0,
                          disbursedCommission: 0,
                          unpaidCommission: 0,
                          netSales: 0,
                          totalDisbursed: 0,
                          unpaidBalance: 0,
                        };

                        const sStatus = s.status === 'Pending' || s.status === 'PENDING'
                          ? 'Pending'
                          : s.status === 'Rejected' || s.status === 'REJECTED'
                            ? 'Rejected'
                            : 'Approved';

                        const isStoreActive = s.isActive !== undefined ? s.isActive : (s.isOpen !== false);

                        return (
                          <tr
                            key={s.id}
                            onClick={() => setSelectedShopDetails(s)}
                            className="hover:bg-purple-50/50 transition-colors cursor-pointer"
                          >
                            {/* 1. STORE NAME + TYPE + ITEMS */}
                            <td className="py-4 px-4">
                              <div className="font-extrabold text-gray-900 flex items-center space-x-2">
                                <Store className="w-4 h-4 text-purple-600 shrink-0" />
                                <span className="font-bold text-gray-950">{s.name}</span>
                                {s.isBlocked && (
                                  <span className="px-2 py-0.5 rounded-full bg-red-600 text-white font-black text-[9px] uppercase tracking-wider flex items-center space-x-0.5">
                                    <Ban className="w-2.5 h-2.5" />
                                    <span>BLOCKED</span>
                                  </span>
                                )}
                              </div>
                              {s.isBlocked && (s.adminBlockNote || s.blockedReason) && (
                                <p className="text-[10px] text-red-700 font-bold flex items-center gap-1 mt-0.5">
                                  <Lock className="w-2.5 h-2.5 text-red-500 shrink-0" />
                                  <span className="truncate max-w-[200px]" title={s.adminBlockNote || s.blockedReason}>
                                    Note: {s.adminBlockNote || s.blockedReason}
                                  </span>
                                </p>
                              )}
                              <div className="mt-1.5 flex items-center gap-1.5 flex-wrap" onClick={(e) => e.stopPropagation()}>
                                <span className="px-2 py-0.5 rounded-full bg-purple-50 text-purple-900 font-bold text-[9px] border border-purple-200">
                                  {s.type}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setManagingItemsShop(s)}
                                  className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border-indigo-200 transition-all flex items-center space-x-1 cursor-pointer"
                                  title="Click to manage store items"
                                >
                                  <Package className="w-2.5 h-2.5 text-indigo-600" />
                                  <span>
                                    {allStoreProducts.filter(
                                      (p) => p.storeId === s.id || (s.ownerUserId && p.storeId === s.ownerUserId)
                                    ).length} Items
                                  </span>
                                </button>
                              </div>
                            </td>

                            {/* 2. INACTIVE + FEATURED STATUS */}
                            <td className="py-4 px-4 min-w-[190px]" onClick={(e) => e.stopPropagation()}>
                              <div className="space-y-1.5">
                                {/* Active / Inactive Toggle Switch */}
                                <div
                                  onClick={async () => {
                                    const nextVal = !isStoreActive;
                                    await fallbackStore.toggleShopActiveStatus(s.id, nextVal);
                                    setShops(Array.from(fallbackStore.shops.values()));
                                    if (serverShops) {
                                      setServerShops((prev) =>
                                        prev ? prev.map((item) => (item.id === s.id ? { ...item, isActive: nextVal, isOpen: nextVal } : item)) : null
                                      );
                                    }
                                    showAlert(
                                      'স্টোর স্ট্যাটাস পরিবর্তন',
                                      `"${s.name}" সফলভাবে ${nextVal ? 'সক্রিয় (Active / Open)' : 'নিষ্ক্রিয় (Inactive / Closed)'} করা হয়েছে।`,
                                      'success'
                                    );
                                  }}
                                  title={isStoreActive ? 'Click to make Inactive (দোকান বন্ধ করুন)' : 'Click to make Active (দোকান চালু করুন)'}
                                  className={`flex items-center justify-between gap-2 p-1.5 px-2.5 rounded-xl border cursor-pointer select-none transition-all ${isStoreActive
                                      ? 'bg-emerald-50 hover:bg-emerald-100/90 border-emerald-300 text-emerald-900 shadow-2xs'
                                      : 'bg-rose-50 hover:bg-rose-100/90 border-rose-300 text-rose-900 shadow-2xs'
                                    }`}
                                >
                                  <div className="flex items-center space-x-1.5">
                                    <span className={`w-2 h-2 rounded-full ${isStoreActive ? 'bg-emerald-600 animate-pulse' : 'bg-rose-600'}`} />
                                    <span className="text-[11px] font-black uppercase tracking-wider">
                                      {isStoreActive ? 'Active (খোলা)' : 'Inactive (বন্ধ)'}
                                    </span>
                                  </div>
                                  <div
                                    className={`w-8 h-4 flex items-center rounded-full p-0.5 transition-colors duration-200 shrink-0 ${isStoreActive ? 'bg-emerald-600' : 'bg-gray-300'
                                      }`}
                                  >
                                    <div
                                      className={`bg-white w-3 h-3 rounded-full shadow transform transition-transform duration-200 ${isStoreActive ? 'translate-x-4' : 'translate-x-0'
                                        }`}
                                    />
                                  </div>
                                </div>

                                {/* Featured Toggle Switch */}
                                <div className="space-y-1">
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      const nextVal = !s.isFeatured;
                                      await fallbackStore.toggleShopFeaturedStatus(s.id, nextVal);
                                      setShops(Array.from(fallbackStore.shops.values()));
                                      if (serverShops) {
                                        setServerShops((prev) =>
                                          prev ? prev.map((item) => (item.id === s.id ? { ...item, isFeatured: nextVal, featuredAt: nextVal ? new Date().toISOString() : undefined } : item)) : null
                                        );
                                      }
                                      showAlert(
                                        'ফিচার্ড স্ট্যাটাস আপডেট',
                                        `"${s.name}" ${nextVal ? 'সফলভাবে টপে ফিচার করা হয়েছে। গ্রাহক ক্যাটাগরি বেছে নিলে এই দোকানটি সবার উপরে থাকবে।' : 'টপ ফিচার থেকে সরানো হয়েছে।'}`,
                                        'success'
                                      );
                                    }}
                                    title={s.isFeatured ? 'টপ ফিচার থেকে বাদ দিতে ক্লিক করুন' : 'টপে ফিচার করতে ক্লিক করুন'}
                                    className={`w-full flex items-center justify-between gap-1.5 p-1.5 px-2.5 rounded-xl border cursor-pointer select-none transition-all shadow-2xs ${s.isFeatured
                                        ? 'bg-amber-50 hover:bg-amber-100/90 border-amber-300 text-amber-950'
                                        : 'bg-gray-50 hover:bg-gray-100 border-gray-200 text-gray-500'
                                      }`}
                                  >
                                    <div className="flex items-center space-x-1.5">
                                      <Sparkles className={`w-3.5 h-3.5 ${s.isFeatured ? 'text-amber-500 fill-amber-400 animate-pulse' : 'text-gray-400'}`} />
                                      <span className="text-[11px] font-black uppercase tracking-wider">
                                        {s.isFeatured ? '⭐ Featured' : '☆ Not Top'}
                                      </span>
                                    </div>
                                    <div
                                      className={`w-7 h-3.5 flex items-center rounded-full p-0.5 transition-colors duration-200 shrink-0 ${s.isFeatured ? 'bg-amber-500' : 'bg-gray-300'
                                        }`}
                                    >
                                      <div
                                        className={`bg-white w-2.5 h-2.5 rounded-full shadow transform transition-transform duration-200 ${s.isFeatured ? 'translate-x-3.5' : 'translate-x-0'
                                          }`}
                                      />
                                    </div>
                                  </button>

                                  {s.isFeatured && (
                                    <div className="flex items-center justify-between gap-1 px-1">
                                      <span className="text-[9px] font-black uppercase text-amber-700 tracking-wider">
                                        Priority:
                                      </span>
                                      <button
                                        type="button"
                                        onClick={async () => {
                                          const input = prompt(
                                            `"${s.name}" এর জন্য প্রায়োরিটি ক্রম নম্বর দিন (কম নম্বর শীর্ষে থাকবে, যেমন 1, 2, 3...):`,
                                            s.featuredOrder !== undefined ? String(s.featuredOrder) : '1'
                                          );
                                          if (input === null) return;
                                          const num = parseInt(input.trim(), 10);
                                          const newOrder = !isNaN(num) && num > 0 ? num : undefined;
                                          await fallbackStore.toggleShopFeaturedStatus(s.id, true, newOrder);
                                          setShops(Array.from(fallbackStore.shops.values()));
                                          if (serverShops) {
                                            setServerShops((prev) =>
                                              prev ? prev.map((item) => (item.id === s.id ? { ...item, featuredOrder: newOrder } : item)) : null
                                            );
                                          }
                                          showAlert('অগ্রাধিকার আপডেট', `"${s.name}" এর প্রায়োরিটি #${newOrder || 'Default'} সেট করা হয়েছে।`, 'success');
                                        }}
                                        className="px-2 py-0.5 rounded-md bg-amber-100 hover:bg-amber-200 text-amber-900 font-black text-[10px] border border-amber-300 transition-colors cursor-pointer"
                                        title="ক্লিক করে প্রায়োরিটি ক্রম পরিবর্তন করুন"
                                      >
                                        #{s.featuredOrder || '1'} (Edit ✎)
                                      </button>
                                    </div>
                                  )}
                                </div>

                                {/* Approval Status & Direct Orders */}
                                <div className="flex items-center gap-1">
                                  <select
                                    value={sStatus}
                                    onChange={async (e) => {
                                      const newStatus = e.target.value as 'Approved' | 'Pending' | 'Rejected';
                                      await fallbackStore.updateShopStatus(s.id, newStatus);
                                      setShops(Array.from(fallbackStore.shops.values()));
                                      if (serverShops) {
                                        setServerShops((prev) =>
                                          prev ? prev.map((item) => (item.id === s.id ? { ...item, status: newStatus } : item)) : null
                                        );
                                      }
                                      showAlert('স্ট্যাটাস আপডেট', `"${s.name}" স্ট্যাটাস ${newStatus} এ পরিবর্তিত হয়েছে।`, 'success');
                                    }}
                                    className={`flex-1 px-1.5 py-0.5 rounded-lg text-[9px] font-extrabold uppercase border cursor-pointer outline-none transition-all ${sStatus === 'Approved'
                                        ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
                                        : sStatus === 'Pending'
                                          ? 'bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100'
                                          : 'bg-red-50 text-red-800 border-red-300 hover:bg-red-100'
                                      }`}
                                  >
                                    <option value="Approved">✓ Approved</option>
                                    <option value="Pending">⏳ Pending</option>
                                    <option value="Rejected">✕ Rejected</option>
                                  </select>

                                  <button
                                    type="button"
                                    onClick={async () => {
                                      const currentVal = s.canReceiveOrders !== undefined ? s.canReceiveOrders : true;
                                      const nextVal = !currentVal;
                                      const updated = { ...s, canReceiveOrders: nextVal };
                                      await fallbackStore.saveShop(updated);
                                      setShops(Array.from(fallbackStore.shops.values()));
                                      showAlert(
                                        'Order Receive Status Updated',
                                        `"${s.name}" এর জন্য Order Receive স্ট্যাটাস ${nextVal ? 'সক্রিয় (Can Receive)' : 'নিষ্ক্রিয় (Manual Status/Price Only)'} করা হয়েছে।`,
                                        'success'
                                      );
                                    }}
                                    title={s.canReceiveOrders !== false ? 'Accepts orders directly' : 'Admin manual orders only'}
                                    className={`px-1.5 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-wider border cursor-pointer transition-all ${(s.canReceiveOrders !== false)
                                        ? 'bg-purple-50 text-purple-900 border-purple-200 hover:bg-purple-100'
                                        : 'bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-200'
                                      }`}
                                  >
                                    {(s.canReceiveOrders !== false) ? '⚡ Orders ON' : '🚫 OFF'}
                                  </button>
                                </div>
                              </div>
                            </td>

                            {/* 3. DUE AMOUNT */}
                            <td className="py-4 px-4" onClick={(e) => e.stopPropagation()}>
                              {metrics.unpaidBalance > 0 ? (
                                <button
                                  type="button"
                                  onClick={() => setDisbursingShop(s)}
                                  className="px-2.5 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-300 font-black text-xs block text-left shadow-2xs transition-all cursor-pointer group"
                                  title="Click to disburse payout"
                                >
                                  <span className="block text-[13px] font-black text-emerald-800 group-hover:text-emerald-950">
                                    ৳{metrics.unpaidBalance.toLocaleString('en-US')} Due
                                  </span>
                                  <span className="text-[9px] text-emerald-700/80 font-bold block">
                                    Click to Disburse →
                                  </span>
                                </button>
                              ) : metrics.unpaidBalance < 0 ? (
                                <button
                                  type="button"
                                  onClick={() => setDisbursingShop(s)}
                                  className="px-2.5 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 font-black text-xs block text-left shadow-2xs transition-all cursor-pointer group"
                                  title="Platform paid more - Advance / Minus balance"
                                >
                                  <span className="block text-[13px] font-black text-amber-700 group-hover:text-amber-900 font-mono">
                                    -৳{Math.abs(metrics.unpaidBalance).toLocaleString('en-US')}
                                  </span>
                                  <span className="text-[9px] text-amber-700/80 font-bold block">
                                    Advance / Overpaid →
                                  </span>
                                </button>
                              ) : (
                                <div className="space-y-0.5">
                                  <span className="px-2 py-0.5 rounded-lg bg-gray-100 text-gray-600 font-extrabold text-[10px] inline-block">
                                    ৳0 (Cleared)
                                  </span>
                                  {metrics.totalDisbursed > 0 && (
                                    <span className="text-[9px] text-gray-400 font-medium block">
                                      Paid: ৳{metrics.totalDisbursed.toLocaleString('en-US')}
                                    </span>
                                  )}
                                </div>
                              )}
                            </td>

                            {/* 4. CURRENT ORDERS */}
                            <td className="py-4 px-4">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span
                                  className={`px-2 py-0.5 rounded-md font-black text-[10px] border ${metrics.running > 0
                                      ? 'bg-amber-100 text-amber-900 border-amber-300 animate-pulse'
                                      : 'bg-amber-50 text-amber-700 border-amber-200'
                                    }`}
                                  title="Running Orders"
                                >
                                  ⚡ {metrics.running} Running
                                </span>
                                <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 font-black text-[10px] border border-emerald-200" title="Completed Orders">
                                  ✓ {metrics.completed}
                                </span>
                                <span className="px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 font-black text-[10px] border border-rose-200" title="Rejected Orders">
                                  ✕ {metrics.rejected}
                                </span>
                              </div>
                              <div className="mt-1.5 text-[11px] font-semibold text-gray-700 space-y-0.5">
                                <div className="text-[11px] font-bold text-purple-900 bg-purple-50 px-1.5 py-0.5 rounded-md inline-block">
                                  Today: <strong>৳{metrics.todaySales.toLocaleString('en-US')}</strong>
                                </div>
                                <div className="text-[10px] text-gray-500">
                                  Total Sales: <strong className="text-emerald-700 font-bold">৳{metrics.totalSales.toLocaleString('en-US')}</strong>
                                </div>
                              </div>
                            </td>

                            {/* 5. ACTIONS (DROPDOWN UNDER THREE-DOT BUTTON) */}
                            <td className="py-4 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                              <ShopActionDropdown
                                shop={s}
                                isStoreActive={isStoreActive}
                                onDisburse={() => setDisbursingShop(s)}
                                onToggleActive={async () => {
                                  const nextVal = !isStoreActive;
                                  await fallbackStore.toggleShopActiveStatus(s.id, nextVal);
                                  setShops(Array.from(fallbackStore.shops.values()));
                                  if (serverShops) {
                                    setServerShops((prev) =>
                                      prev ? prev.map((item) => (item.id === s.id ? { ...item, isActive: nextVal, isOpen: nextVal } : item)) : null
                                    );
                                  }
                                  showAlert(
                                    'স্টোর স্ট্যাটাস পরিবর্তন',
                                    `"${s.name}" সফলভাবে ${nextVal ? 'সক্রিয় (Active / Open)' : 'নিষ্ক্রিয় (Inactive / Closed)'} করা হয়েছে।`,
                                    'success'
                                  );
                                }}
                                onToggleBlock={async () => {
                                  if (s.isBlocked) {
                                    const confirmed = await showConfirm(
                                      'স্টোর আনব্লক নিশ্চিতকরণ',
                                      `আপনি কি "${s.name}" স্টোরটি আনব্লক করতে চান?`,
                                      'হ্যাঁ, আনব্লক করুন',
                                      'বাতিল'
                                    );
                                    if (!confirmed) return;
                                    await fallbackStore.blockShop(s.id, false);
                                    setShops(Array.from(fallbackStore.shops.values()));
                                    showAlert('আনব্লক সম্পন্ন', `"${s.name}" স্টোরটি আনব্লক করা হয়েছে।`, 'success');
                                  } else {
                                    setBlockTarget({ id: s.id, name: s.name, type: 'Store' });
                                  }
                                }}
                                onManageItems={() => setManagingItemsShop(s)}
                                onViewDetails={() => setSelectedShopDetails(s)}
                                onEdit={() => {
                                  setEditingShop(s);
                                  setShowAddShopModal(true);
                                }}
                                onDelete={async () => {
                                  const confirmed = await showConfirm(
                                    'দোকান ডিলিট নিশ্চিতকরণ',
                                    `আপনি কি নিশ্চিতভাবে ${s.name} দোকানটি ডিলিট করতে চান?`,
                                    'হ্যাঁ, ডিলিট করুন',
                                    'বাতিল'
                                  );
                                  if (!confirmed) return;
                                  await fallbackStore.deleteShop(s.id);
                                  setShops(Array.from(fallbackStore.shops.values()));
                                  setServerShops((prev) => (prev ? prev.filter((shop) => shop.id !== s.id) : null));
                                  setExactShopsCount((prev) => (prev !== null && prev > 0 ? prev - 1 : null));
                                  showAlert('সফল', 'দোকানের তথ্য মুছে ফেলা হয়েছে।', 'success');
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
                          {app.commissionPercent !== undefined && app.commissionPercent !== null ? (
                            <span className="font-extrabold text-emerald-700">{app.commissionPercent}%</span>
                          ) : <span className="text-gray-400">—</span>}
                        </td>
                        <td className="py-4 px-4">
                          <span className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold ${app.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-800' :
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

        // Thumbs-based sentiment counts
        const newStyleFbs = feedbacks.filter((f) => f.thumbsUp !== undefined);
        const thumbsUpCount = newStyleFbs.filter((f) => f.thumbsUp === true).length;
        const thumbsDownCount = newStyleFbs.filter((f) => f.thumbsUp === false).length;
        const satisfactionPercent = newStyleFbs.length > 0
          ? Math.round((thumbsUpCount / newStyleFbs.length) * 100)
          : null;

        // Legacy star averages (for old-style feedbacks without thumbsUp)
        const oldStyleFbs = feedbacks.filter((f) => f.thumbsUp === undefined);
        const avgRiderLegacy = oldStyleFbs.length > 0
          ? (oldStyleFbs.reduce((s, f) => s + f.riderRating, 0) / oldStyleFbs.length).toFixed(1)
          : null;

        const feedbacksSource = serverFeedbacks !== null ? serverFeedbacks : feedbacks;
        let filteredFeedbacks = [...feedbacksSource];
        if (isZoneFiltered && targetZoneIds) {
          filteredFeedbacks = filteredFeedbacks.filter((f) => {
            const o = fallbackStore.orders.get(f.orderId) || allOrders.find((ord) => ord.id === f.orderId);
            if (o) {
              return isOrderInAnyZone(o, targetZoneIds, allowedDeliveryAreas);
            }
            return false;
          });
        }
        if (feedbackAppliedSearchQuery.trim()) {
          const q = feedbackAppliedSearchQuery.toLowerCase().trim();
          filteredFeedbacks = filteredFeedbacks.filter(
            (f) =>
              f.orderId.toLowerCase().includes(q) ||
              (f.customerName && f.customerName.toLowerCase().includes(q)) ||
              (f.helperName && f.helperName.toLowerCase().includes(q)) ||
              (f.improvementComment && f.improvementComment.toLowerCase().includes(q)) ||
              (f.adminReply && f.adminReply.toLowerCase().includes(q))
          );
        }

        filteredFeedbacks.sort((a, b) => {
          let cmp = 0;
          if (feedbackSortColumn === 'orderId') {
            cmp = a.orderId.localeCompare(b.orderId);
          } else if (feedbackSortColumn === 'customerName') {
            cmp = (a.customerName || '').localeCompare(b.customerName || '');
          } else if (feedbackSortColumn === 'helperName') {
            cmp = (a.helperName || '').localeCompare(b.helperName || '');
          } else if (feedbackSortColumn === 'sentiment') {
            const aVal = a.thumbsUp === true ? 1 : a.thumbsUp === false ? -1 : 0;
            const bVal = b.thumbsUp === true ? 1 : b.thumbsUp === false ? -1 : 0;
            cmp = aVal - bVal;
          } else if (feedbackSortColumn === 'comment') {
            cmp = (a.improvementComment || '').localeCompare(b.improvementComment || '');
          } else {
            cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          }
          return feedbackSortDirection === 'asc' ? cmp : -cmp;
        });

        const handleFeedbackSortClick = (col: string) => {
          if (feedbackSortColumn === col) {
            setFeedbackSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
          } else {
            setFeedbackSortColumn(col);
            setFeedbackSortDirection('asc');
          }
        };

        const renderFeedbackSortIcon = (col: string) => {
          if (feedbackSortColumn !== col) return <ArrowUpDown className="w-3 h-3 opacity-40 inline ml-1" />;
          return <span className="inline ml-1 font-bold text-amber-600">{feedbackSortDirection === 'asc' ? '▲' : '▼'}</span>;
        };

        const hasFeedbackFilter = Boolean(feedbackAppliedSearchQuery.trim());
        const overrideFeedbacksCount = (serverFeedbacks === null && !hasFeedbackFilter && exactFeedbacksCount !== null) ? exactFeedbacksCount : undefined;
        const { totalPages, paginatedItems, totalItems } = paginateList(filteredFeedbacks, undefined, undefined, overrideFeedbacksCount);

        const handleSaveReply = async () => {
          if (!replyingToFeedbackId || !replyText.trim()) return;
          setSavingReply(true);
          try {
            await fallbackStore.updateOrderFeedbackReply(
              replyingToFeedbackId,
              replyText.trim(),
              replyShowUntil ? new Date(replyShowUntil).toISOString() : undefined,
              replyShowFrom ? new Date(replyShowFrom).toISOString() : undefined
            );
            const patch = {
              adminReply: replyText.trim(),
              adminReplyAt: new Date().toISOString(),
              adminReplyShowFrom: replyShowFrom ? new Date(replyShowFrom).toISOString() : undefined,
              adminReplyShowUntil: replyShowUntil ? new Date(replyShowUntil).toISOString() : undefined,
              adminReplyShownToCustomer: false,
            };
            setFeedbacks((prev) => prev.map((f) => f.id === replyingToFeedbackId ? { ...f, ...patch } : f));
            if (serverFeedbacks) setServerFeedbacks((prev) => prev ? prev.map((f) => f.id === replyingToFeedbackId ? { ...f, ...patch } : f) : null);
            setReplyingToFeedbackId(null);
            setReplyText('');
            setReplyShowFrom('');
            setReplyShowUntil('');
          } catch (err: any) {
            console.error('Reply save failed:', err);
          } finally {
            setSavingReply(false);
          }
        };

        return (
          <div className="space-y-6">
            {/* Stats Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
              <div className="p-5 rounded-3xl bg-emerald-50 border border-emerald-200 flex flex-col items-center">
                <ThumbsUp className="w-6 h-6 text-emerald-600 mb-1" />
                <span className="text-3xl font-black text-emerald-900 mt-1 block">{thumbsUpCount}</span>
                <span className="text-[10px] text-emerald-700 font-bold block mt-1 uppercase">Positive 👍</span>
              </div>
              <div className="p-5 rounded-3xl bg-red-50 border border-red-200 flex flex-col items-center">
                <ThumbsDown className="w-6 h-6 text-red-600 mb-1" />
                <span className="text-3xl font-black text-red-900 mt-1 block">{thumbsDownCount}</span>
                <span className="text-[10px] text-red-700 font-bold block mt-1 uppercase">Negative 👎</span>
              </div>
              <div className="p-5 rounded-3xl bg-indigo-50 border border-indigo-200 flex flex-col items-center">
                <span className="text-3xl font-black text-indigo-900 mt-1 block">
                  {satisfactionPercent !== null ? `${satisfactionPercent}%` : '—'}
                </span>
                <span className="text-[10px] text-indigo-700 font-bold block mt-1 uppercase">Satisfaction Rate</span>
                {avgRiderLegacy && <span className="text-[9px] text-indigo-500 block">Legacy avg: ⭐{avgRiderLegacy}</span>}
              </div>
              <div className="p-5 rounded-3xl bg-amber-50 border border-amber-200 flex flex-col items-center">
                <span className="text-3xl font-black text-amber-900 mt-1 block">{totalFeedbacks}</span>
                <span className="text-[10px] text-amber-700 font-bold block mt-1 uppercase">Total Reviews</span>
              </div>
            </div>

            {/* Visual Analytics */}
            <OrderFeedbackAnalytics feedbacks={feedbacksSource} />

            {/* Feedback Table */}
            <div className="bg-white rounded-3xl border border-gray-100 shadow-soft overflow-hidden">
              <div className="p-5 border-b border-gray-100 flex items-center justify-between flex-wrap gap-3">
                <h3 className="font-extrabold text-base text-gray-900">Customer Order Feedback Entries</h3>
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => exportFeedbackToCSV(filteredFeedbacks)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold text-xs transition-all shadow-sm">
                      <Download className="w-3.5 h-3.5" /><span>Excel</span>
                    </button>
                    <button onClick={() => exportFeedbackToPDF(filteredFeedbacks)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 active:scale-95 text-white font-bold text-xs transition-all shadow-sm">
                      <Download className="w-3.5 h-3.5" /><span>PDF</span>
                    </button>
                  </div>
                  <span className="text-xs font-bold px-3 py-1 rounded-full bg-amber-50 text-amber-800">{totalItems} total feedbacks</span>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-gray-600 min-w-[750px]">
                  <thead className="bg-gray-50 text-gray-700 uppercase font-extrabold text-[10px] tracking-wider border-b border-gray-100">
                    <tr>
                      <th className="py-3.5 px-5 cursor-pointer hover:bg-gray-100 select-none" onClick={() => handleFeedbackSortClick('orderId')}>
                        <div className="flex items-center space-x-1"><span>Order & Customer</span>{renderFeedbackSortIcon('orderId')}</div>
                      </th>
                      <th className="py-3.5 px-5 cursor-pointer hover:bg-gray-100 select-none" onClick={() => handleFeedbackSortClick('helperName')}>
                        <div className="flex items-center space-x-1"><span>Rider</span>{renderFeedbackSortIcon('helperName')}</div>
                      </th>
                      <th className="py-3.5 px-5 cursor-pointer hover:bg-gray-100 select-none" onClick={() => handleFeedbackSortClick('sentiment')}>
                        <div className="flex items-center space-x-1"><span>Sentiment</span>{renderFeedbackSortIcon('sentiment')}</div>
                      </th>
                      <th className="py-3.5 px-5 cursor-pointer hover:bg-gray-100 select-none" onClick={() => handleFeedbackSortClick('comment')}>
                        <div className="flex items-center space-x-1"><span>Comment</span>{renderFeedbackSortIcon('comment')}</div>
                      </th>
                      <th className="py-3.5 px-5">Admin Reply</th>
                      <th className="py-3.5 px-5 cursor-pointer hover:bg-gray-100 select-none" onClick={() => handleFeedbackSortClick('createdAt')}>
                        <div className="flex items-center space-x-1"><span>Date</span>{renderFeedbackSortIcon('createdAt')}</div>
                      </th>
                      <th className="py-3.5 px-5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 font-medium">
                    {paginatedItems.map((fb) => (
                      <React.Fragment key={fb.id}>
                        <tr className="hover:bg-gray-50/80 transition-colors">
                          <td className="py-4 px-5">
                            <div className="font-extrabold text-gray-900">#{fb.orderId}</div>
                            <div className="text-[11px] text-gray-500">{fb.customerName}</div>
                          </td>
                          <td className="py-4 px-5 font-bold text-gray-800">{fb.helperName || 'Unassigned'}</td>
                          <td className="py-4 px-5">
                            {fb.thumbsUp === true ? (
                              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 font-extrabold text-[11px]">
                                <ThumbsUp className="w-3.5 h-3.5" /> ভালো ছিল
                              </span>
                            ) : fb.thumbsUp === false ? (
                              <div className="space-y-1">
                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-100 text-red-800 font-extrabold text-[11px]">
                                  <ThumbsDown className="w-3.5 h-3.5" /> ভালো না
                                </span>
                                {fb.badReason && (
                                  <span className="block text-[10px] font-black text-red-700 bg-red-50 px-2 py-0.5 rounded border border-red-200 w-fit">
                                    {fb.badReason === 'RIDER' ? '🚴 রাইডার' : fb.badReason === 'PRODUCT' ? '🛍️ প্রোডাক্ট' : '🚴 রাইডার + 🛍️ প্রোডাক্ট'}
                                  </span>
                                )}
                                {fb.mutuallyDiscussed && (
                                  <span className="block text-[9px] font-black text-emerald-800 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded w-fit">
                                    ✓ Discussed
                                  </span>
                                )}
                              </div>
                            ) : (
                              <div className="space-y-1">
                                <span className="inline-flex items-center gap-1 text-amber-600 font-extrabold text-xs">
                                  <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                                  {fb.riderRating}/5
                                </span>
                                {fb.mutuallyDiscussed && (
                                  <span className="block text-[9px] font-black text-emerald-800 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded w-fit">
                                    ✓ Discussed
                                  </span>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="py-4 px-5">
                            {fb.improvementComment ? (
                              <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-950 font-semibold max-w-xs text-[11px]">&ldquo;{fb.improvementComment}&rdquo;</div>
                            ) : (
                              <span className="text-gray-400 italic">No comment</span>
                            )}
                          </td>
                          <td className="py-4 px-5 max-w-[180px]">
                            {fb.adminReply ? (
                              <div className="space-y-1">
                                <div className="p-2 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-900 font-semibold text-[11px] line-clamp-2">{fb.adminReply}</div>
                                {fb.adminReplyShowUntil && (
                                  <div className="text-[10px] text-gray-400 font-mono">Until: {new Date(fb.adminReplyShowUntil).toLocaleString()}</div>
                                )}
                                <div className={`text-[10px] font-bold ${fb.adminReplyShownToCustomer ? 'text-emerald-600' : 'text-amber-600'}`}>
                                  {fb.adminReplyShownToCustomer ? '✓ Seen by customer' : '⏳ Pending'}
                                </div>
                              </div>
                            ) : (
                              <span className="text-gray-300 italic text-[11px]">No reply yet</span>
                            )}
                          </td>
                          <td className="py-4 px-5 text-gray-400 font-mono text-[11px]">{new Date(fb.createdAt).toLocaleDateString()}</td>
                          <td className="py-4 px-5 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  if (replyingToFeedbackId === fb.id) {
                                    setReplyingToFeedbackId(null); setReplyText(''); setReplyShowUntil('');
                                  } else {
                                    setReplyingToFeedbackId(fb.id);
                                    setReplyText(fb.adminReply || '');
                                    setReplyShowFrom(fb.adminReplyShowFrom ? new Date(fb.adminReplyShowFrom).toISOString().slice(0, 16) : '');
                                    setReplyShowUntil(fb.adminReplyShowUntil ? new Date(fb.adminReplyShowUntil).toISOString().slice(0, 16) : '');
                                  }
                                }}
                                className={`p-1.5 rounded-xl transition-colors shadow-xs active:scale-95 inline-flex items-center justify-center cursor-pointer ${replyingToFeedbackId === fb.id ? 'bg-indigo-600 text-white hover:bg-indigo-700' : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-600'}`}
                                title="Reply to this feedback"
                              >
                                <MessageSquare className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteFeedback(fb.id)}
                                className="p-1.5 rounded-xl bg-red-50 hover:bg-red-100 text-red-600 hover:text-red-700 transition-colors shadow-xs active:scale-95 inline-flex items-center justify-center cursor-pointer"
                                title="Delete Feedback Entry"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                        {/* Inline Reply Drawer */}
                        {replyingToFeedbackId === fb.id && (
                          <tr>
                            <td colSpan={7} className="px-5 pb-5 pt-1 bg-indigo-50/50">
                              <div className="border border-indigo-200 rounded-2xl p-4 space-y-3 bg-white shadow-xs">
                                <div className="flex items-center gap-2 text-indigo-800 font-extrabold text-xs">
                                  <Send className="w-3.5 h-3.5 text-indigo-600" />
                                  <span>Reply to #{fb.orderId} — {fb.customerName}</span>
                                </div>
                                <textarea
                                  value={replyText}
                                  onChange={(e) => setReplyText(e.target.value)}
                                  placeholder="Customer-এর feedback-এর জবাবে আপনার response লিখুন..."
                                  rows={3}
                                  className="w-full p-3 rounded-xl border border-indigo-200 focus:border-indigo-400 bg-indigo-50/40 outline-none text-xs font-medium text-gray-900 placeholder:text-gray-400 resize-none transition-colors"
                                />
                                <div className="flex items-end gap-3 flex-wrap">
                                  <div className="flex-1 min-w-[180px]">
                                    <label className="text-[10px] font-extrabold text-emerald-700 uppercase tracking-wider block mb-1">
                                      Show From — blank = show immediately
                                    </label>
                                    <input
                                      type="datetime-local"
                                      value={replyShowFrom}
                                      onChange={(e) => setReplyShowFrom(e.target.value)}
                                      className="w-full px-3 py-2 rounded-xl border border-emerald-200 focus:border-emerald-400 bg-white outline-none text-xs font-medium text-gray-900 transition-colors"
                                    />
                                  </div>
                                  <div className="flex-1 min-w-[180px]">
                                    <label className="text-[10px] font-extrabold text-indigo-700 uppercase tracking-wider block mb-1">
                                      Show Until — blank = indefinitely until customer sees it
                                    </label>
                                    <input
                                      type="datetime-local"
                                      value={replyShowUntil}
                                      onChange={(e) => setReplyShowUntil(e.target.value)}
                                      className="w-full px-3 py-2 rounded-xl border border-indigo-200 focus:border-indigo-400 bg-white outline-none text-xs font-medium text-gray-900 transition-colors"
                                    />
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <button type="button" onClick={() => { setReplyingToFeedbackId(null); setReplyText(''); setReplyShowFrom(''); setReplyShowUntil(''); }} className="px-3 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold text-xs">Cancel</button>
                                    <button
                                      type="button"
                                      disabled={!replyText.trim() || savingReply}
                                      onClick={handleSaveReply}
                                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-extrabold text-xs shadow-sm transition-all active:scale-95"
                                    >
                                      <Send className="w-3.5 h-3.5" />
                                      {savingReply ? 'Saving...' : 'Send Reply'}
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                    {paginatedItems.length === 0 && (
                      <tr>
                        <td colSpan={7} className="py-12 text-center text-gray-400 font-semibold">
                          <Star className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                          কোনো ফিডব্যাক পাওয়া যায়নি
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

            {(() => {
              const customModalsSource = serverCustomModals !== null ? serverCustomModals : customModals;
              let filteredModals = [...customModalsSource];
              if (customModalsAppliedSearchQuery.trim()) {
                const q = customModalsAppliedSearchQuery.toLowerCase().trim();
                filteredModals = filteredModals.filter(
                  (m) =>
                    m.title.toLowerCase().includes(q) ||
                    (m.subtitle && m.subtitle.toLowerCase().includes(q)) ||
                    (m.description && m.description.toLowerCase().includes(q)) ||
                    m.id.toLowerCase().includes(q)
                );
              }

              if (filteredModals.length === 0) {
                return (
                  <div className="p-12 bg-white rounded-3xl border border-gray-100 text-center text-gray-400 space-y-2">
                    <Sparkles className="w-10 h-10 mx-auto text-purple-300" />
                    <p className="font-bold text-gray-700">কোনো ডায়নামিক কাস্টম পপআপ মোডাল পাওয়া যায়নি।</p>
                    <p className="text-xs text-gray-500">
                      অ্যাডমিন নতুন পপআপ ব্যানার তৈরি করে নির্দিষ্ট ইউজার গ্রুপ ও ইভেন্টে প্রদর্শন করাতে পারেন।
                    </p>
                  </div>
                );
              }

              return (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {filteredModals.map((modal) => (
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
              );
            })()}
          </div>
        );
      })()}

      {/* --- TAB 11: NOTIFICATION HISTORY TAB --- */}
      {activeTab === 'NOTIFICATIONS' && isTabAllowed('NOTIFICATIONS') && (
        <AdminNotificationHistory
          onOpenCreateModal={() => {
            setEditingNotification(null);
            setDuplicateNotification(null);
            setShowPushNotificationModal(true);
          }}
          onEditNotification={(notif) => {
            setEditingNotification(notif);
            setDuplicateNotification(null);
            setShowPushNotificationModal(true);
          }}
          onDuplicateNotification={(notif) => {
            setEditingNotification(null);
            setDuplicateNotification(notif);
            setShowPushNotificationModal(true);
          }}
        />
      )}

      {/* --- TAB 12: COINS & REWARDS TAB --- */}
      {activeTab === 'REWARDS' && isTabAllowed('REWARDS') && (
        <AdminRewardsManager />
      )}

      {/* --- TAB 13: SERVER ADDRESSES TAB --- */}
      {activeTab === 'ADDRESSES' && isTabAllowed('ADDRESSES') && (
        <AdminAddressesManager />
      )}

      {/* --- ALL MODALS OVERLAYS --- */}

      {/* 1. Admin Order Details Modal */}
      {selectedOrderId && (
        <AdminOrderDetailsModal
          orderId={selectedOrderId}
          onClose={() => setSelectedOrderId(null)}
        />
      )}

      {/* 1.5 Admin Store Order Details Modal */}
      {selectedShopOrderId && (
        <AdminStoreOrderDetailsModal
          shopOrderId={selectedShopOrderId}
          onClose={() => setSelectedShopOrderId(null)}
          onViewParentOrder={(parentOrderId) => {
            setSelectedShopOrderId(null);
            setSelectedOrderId(parentOrderId);
          }}
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

      {/* 4.1 Export Helper Performance Sheet Modal */}
      {showExportHelperModal && (
        <AdminExportHelperModal
          isOpen={showExportHelperModal}
          onClose={() => {
            setShowExportHelperModal(false);
            setExportHelperTargetId(null);
          }}
          initialHelperId={exportHelperTargetId}
          helpers={processedHelpers}
          allOrders={scopedAllOrders}
          defaultPreset={dateRange.preset}
          defaultStartDate={dateRange.preset === 'CUSTOM' ? rangeStartIso?.slice(0, 10) : ''}
          defaultEndDate={dateRange.preset === 'CUSTOM' ? rangeEndIso?.slice(0, 10) : ''}
        />
      )}

      {/* 4.5 High Duration Deliveries Modal */}
      {showHighDurationModal && (() => {
        const highDurationOrders = scopedAllOrders
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
                    Top High-Duration Deliveries (Average Order List)
                  </h2>
                  <p className="text-xs text-gray-400 mt-0.5">Most recent completed orders with longest delivery times</p>
                  <LifetimeDataNotice className="mt-2" loading={lifetimeData.loading} error={lifetimeData.error} onRetry={lifetimeData.retry} />
                </div>
                <div className="flex items-center gap-2">
                  {selectedOrderIds.length > 0 && (
                    <AsyncButton
                      onClick={handleBulkDeleteOrders}
                      isLoading={isDeletingOrders}
                      icon={<Trash2 className="w-3.5 h-3.5" />}
                      className="py-1.5 px-3 rounded-xl bg-red-600 hover:bg-red-700 text-white font-extrabold text-xs shadow-sm transition-all flex items-center space-x-1 disabled:opacity-50"
                    >
                      <span>Delete ({selectedOrderIds.length})</span>
                    </AsyncButton>
                  )}
                  <button
                    onClick={() => setShowHighDurationModal(false)}
                    className="p-2 rounded-xl bg-rose-50 text-rose-500 hover:text-rose-700 hover:bg-rose-100 border border-rose-200 transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Summary stat */}
              <div className="px-5 py-3 bg-purple-50/60 border-b border-purple-100 shrink-0">
                <div className="flex items-center gap-6">
                  <div>
                    <div className="text-[10px] font-extrabold text-gray-500 uppercase tracking-wider">Overall Avg</div>
                    <div className="text-xl font-extrabold text-purple-900">
                      {avgDeliveryTimeMins > 0
                        ? formatDurationMinutes(avgDeliveryTimeMins)
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
                        <th className="py-3 px-4 w-10 text-center">
                          <input
                            type="checkbox"
                            checked={
                              highDurationOrders.length > 0 &&
                              highDurationOrders.every((o) => selectedOrderIds.includes(o.id))
                            }
                            onChange={() => handleToggleSelectAllOrders(highDurationOrders)}
                            className="rounded text-purple-600 focus:ring-purple-500 w-4 h-4 cursor-pointer"
                            title="Select All"
                          />
                        </th>
                        <th className="py-3 px-3">#</th>
                        <th className="py-3 px-5">Order</th>
                        <th className="py-3 px-5">Customer / Helper</th>
                        <th className="py-3 px-5 text-right">Duration</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 font-medium">
                      {highDurationOrders.map((o, idx) => (
                        <tr
                          key={o.id}
                          className={`hover:bg-purple-50/40 transition-colors cursor-pointer ${selectedOrderIds.includes(o.id) ? 'bg-purple-50/70' : ''
                            }`}
                          onClick={() => { setShowHighDurationModal(false); setSelectedOrderId(o.id); }}
                        >
                          <td className="py-3.5 px-4 w-10 text-center" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={selectedOrderIds.includes(o.id)}
                              onChange={(e) => handleToggleSelectOrder(o.id, e as any)}
                              className="rounded text-purple-600 focus:ring-purple-500 w-4 h-4 cursor-pointer"
                            />
                          </td>
                          <td className="py-3.5 px-3 font-extrabold text-gray-400">{idx + 1}</td>
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

      {/* 5.1 Quick User Reward Coins Edit Modal */}
      {editingCoinsUser && (
        <div className="fixed inset-0 z-[10020] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-white rounded-3xl p-6 shadow-2xl border border-gray-100 space-y-4 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-900 flex items-center justify-center shadow-xs">
                  <Coins className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <h3 className="text-base font-black text-gray-900 leading-tight">
                    কয়েন ব্যালেন্স পরিবর্তন
                  </h3>
                  <p className="text-[11px] text-gray-500 font-medium">
                    Edit User Reward Coins Balance
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingCoinsUser(null)}
                className="p-2 rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Target User Info Summary */}
            <div className="p-3.5 rounded-2xl bg-amber-50/70 border border-amber-200/80 flex items-center justify-between">
              <div>
                <h4 className="text-xs font-black text-gray-900">
                  {editingCoinsUser.displayName}
                </h4>
                <p className="text-[11px] text-gray-600 font-mono">
                  {editingCoinsUser.email || editingCoinsUser.alternativePhone || editingCoinsUser.uid}
                </p>
              </div>
              <div className="text-right">
                <span className="text-[10px] font-bold text-amber-800 uppercase block">বর্তমান ব্যালেন্স</span>
                <span className="text-sm font-black text-amber-950 flex items-center gap-1 justify-end">
                  🪙 {editingCoinsUser.coins || 0}
                </span>
              </div>
            </div>

            <form onSubmit={handleSaveCoinsModal} className="space-y-3.5">
              <div>
                <label className="block text-xs font-extrabold text-gray-800 mb-1.5">
                  নতুন কয়েন ব্যালেন্স (New Balance) *
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-base">🪙</span>
                  <input
                    type="number"
                    min={0}
                    value={coinsInputValue}
                    onChange={(e) => setCoinsInputValue(Math.max(0, Number(e.target.value)))}
                    className="w-full pl-10 pr-4 py-3 rounded-2xl border border-gray-200 text-sm font-black text-gray-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200/50"
                    placeholder="যেমন: 50"
                    required
                  />
                </div>
                <p className="text-[11px] text-gray-500 mt-1">
                  এই সংখ্যাটি ব্যবহারকারীর মূল অ্যাকাউন্টে তাৎক্ষণিকভাবে প্রতিফলিত হবে।
                </p>
              </div>

              {/* Quick Adjust Buttons */}
              <div>
                <label className="block text-[11px] font-bold text-gray-600 mb-1.5">
                  দ্রুত কয়েন সমন্বয় (Quick Adjust):
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { label: '+10', val: 10 },
                    { label: '+20', val: 20 },
                    { label: '+50', val: 50 },
                    { label: '+100', val: 100 },
                    { label: '-10', val: -10 },
                    { label: '-20', val: -20 },
                    { label: '-50', val: -50 },
                  ].map((btn) => (
                    <button
                      key={btn.label}
                      type="button"
                      onClick={() =>
                        setCoinsInputValue((prev) => Math.max(0, Math.floor(Number(prev) || 0) + btn.val))
                      }
                      className="px-2.5 py-1 rounded-xl text-xs font-black bg-gray-100 hover:bg-amber-100 hover:text-amber-900 border border-gray-200 text-gray-700 transition-all cursor-pointer active:scale-95"
                    >
                      {btn.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setCoinsInputValue(0)}
                    className="px-2.5 py-1 rounded-xl text-xs font-black bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 transition-all cursor-pointer active:scale-95"
                  >
                    Reset (0)
                  </button>
                </div>
              </div>

              {/* Reason / Admin note */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5">
                  সমন্বয়ের কারণ বা নোট (ঐচ্ছিক):
                </label>
                <input
                  type="text"
                  value={coinsReasonValue}
                  onChange={(e) => setCoinsReasonValue(e.target.value)}
                  placeholder="যেমন: অর্ডার ক্যাম্পেইন বোনাস, রিফান্ড সমন্বয় ইত্যাদি"
                  className="w-full p-3 rounded-2xl border border-gray-200 text-xs font-medium outline-none focus:border-amber-500"
                />
              </div>

              <div className="flex items-center space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingCoinsUser(null)}
                  className="flex-1 py-3 rounded-2xl border border-gray-200 text-xs font-bold text-gray-600 hover:bg-gray-50 cursor-pointer"
                >
                  বাতিল
                </button>
                <AsyncButton
                  type="submit"
                  isLoading={savingCoinsState}
                  className="flex-1 py-3 rounded-2xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-black shadow-md shadow-amber-500/20 active:scale-95 transition-all cursor-pointer"
                >
                  সংরক্ষণ করুন
                </AsyncButton>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 6. Admin Custom Push Notification Modal */}
      {showPushNotificationModal && (
        <AdminPushNotificationModal
          editingNotification={editingNotification}
          initialData={duplicateNotification}
          targetZoneIds={targetZoneIds}
          isSuperAdmin={isSuperAdmin}
          onClose={() => {
            setShowPushNotificationModal(false);
            setEditingNotification(null);
            setDuplicateNotification(null);
          }}
        />
      )}

      {/* 7. Admin Helper Application Create/Edit Modals */}
      {(showAddAppModal || editingApp) && (
        <AdminHelperAppModal
          application={editingApp}
          users={scopedUsers}
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
                  className="p-2 rounded-xl bg-rose-50 text-rose-500 hover:text-rose-700 hover:bg-rose-100 border border-rose-200 transition-colors"
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
                                className={`text-[10px] font-extrabold px-2.5 py-1 rounded-full ${sug.userRole === 'helper'
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
                    className="ml-2 px-4 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 active:scale-95 text-xs font-bold transition-all"
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

      {managingItemsShop && (
        <AdminStoreItemsModal
          shop={managingItemsShop}
          onClose={() => setManagingItemsShop(null)}
        />
      )}

      {disbursingShop && (
        <AdminStoreDisbursementModal
          shop={disbursingShop}
          onClose={() => setDisbursingShop(null)}
          onDisbursed={() => {
            setShops(Array.from(fallbackStore.shops.values()));
            setWithdrawals(Array.from(fallbackStore.withdrawals.values()));
            setWalletInputsVersion((v) => v + 1);
          }}
        />
      )}

      {showAreaDrawerModal && (
        <AreaDrawerModal
          isOpen={showAreaDrawerModal}
          areaToEdit={editingArea}
          existingAreas={allowedDeliveryAreas}
          helpers={users.filter((u) => u.isHelper || u.role === 'helper')}
          admins={users.filter((u) => u.isAdmin || u.role === 'admin')}
          onClose={() => {
            setShowAreaDrawerModal(false);
            setEditingArea(null);
          }}
          onSaveArea={async (savedArea, assignedHelperIds, allHelpers, assignedAdminIds) => {
            const finalSavedArea: AllowedAreaPolygon = {
              ...savedArea,
              allHelpersAssigned: Boolean(allHelpers),
              assignedHelperIds: allHelpers ? [] : (assignedHelperIds || []),
              assignedAdminIds: assignedAdminIds || [],
            };

            const updatedAreas = (() => {
              const idx = allowedDeliveryAreas.findIndex((a) => a.id === finalSavedArea.id);
              if (idx > -1) {
                const next = [...allowedDeliveryAreas];
                next[idx] = finalSavedArea;
                return next;
              }
              return [...allowedDeliveryAreas, finalSavedArea];
            })();

            setAllowedDeliveryAreas(updatedAreas);

            // Persist immediately to pricing settings in Firestore & memory
            const updatedPricing: PricingSettings = {
              ...fallbackStore.pricingSettings,
              allowedDeliveryAreas: updatedAreas,
              allowedDeliveryAreasEnabled: allowedDeliveryAreasEnabled,
              outOfServiceAreaMessage: outOfServiceAreaMessage,
            };
            await fallbackStore.savePricingSettings(updatedPricing);
            setPricing(updatedPricing);

            // Sync helper profiles if specific helpers assigned
            if (allHelpers) {
              // Open to all helpers
            } else if (assignedHelperIds) {
              const helperFleet = users.filter((u) => u.isHelper || u.role === 'helper');
              for (const h of helperFleet) {
                let areaList = h.assignedAreaIds || [];
                if (assignedHelperIds.includes(h.uid)) {
                  if (!areaList.includes(savedArea.id)) {
                    areaList = [...areaList, savedArea.id];
                  }
                } else {
                  areaList = areaList.filter((id) => id !== savedArea.id);
                }
                const updatedUser = { ...h, assignedAreaIds: areaList };
                await fallbackStore.saveUser(updatedUser);
              }
            }

            // Sync admin profiles if specific admins assigned
            if (assignedAdminIds) {
              const adminFleet = users.filter((u) => u.isAdmin || u.role === 'admin');
              for (const a of adminFleet) {
                let areaList = a.assignedAreaIds || [];
                if (assignedAdminIds.includes(a.uid)) {
                  if (!areaList.includes(savedArea.id)) {
                    areaList = [...areaList, savedArea.id];
                  }
                } else {
                  areaList = areaList.filter((id) => id !== savedArea.id);
                }
                const updatedUser = { ...a, assignedAreaIds: areaList };
                await fallbackStore.saveUser(updatedUser);
              }
            }

            setUsers(Array.from(fallbackStore.users.values()));

            showAlert(
              'সাব-এরিয়া সংরক্ষিত',
              `"${savedArea.name}" এলাকা ও অ্যাডমিন/হেলপার অ্যাসাইনমেন্ট সফলভাবে সেভ করা হয়েছে।`,
              'success'
            );

            setShowAreaDrawerModal(false);
            setEditingArea(null);
          }}
        />
      )}

      {approvingHelperApp && (
        <ApproveHelperModal
          application={approvingHelperApp}
          existingAreas={allowedDeliveryAreas}
          onClose={() => setApprovingHelperApp(null)}
          onConfirmApprove={handleConfirmApproveHelper}
          onOpenAreaDrawer={() => {
            setApprovingHelperApp(null);
            setShowAreaDrawerModal(true);
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

      {/* Super Admin Edit Payback Request Modal */}
      {editingWd && isSuperAdmin && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white rounded-3xl p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="font-extrabold text-base text-gray-900">
                Edit Payback Request
              </h3>
              <button
                onClick={() => setEditingWd(null)}
                className="text-gray-400 hover:text-gray-600 font-extrabold text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveWdEdit} className="space-y-4">
              <div>
                <label className="text-xs font-extrabold text-gray-700 block mb-1">
                  Applicant / Target
                </label>
                <input
                  type="text"
                  value={editingWd.helperName}
                  disabled
                  className="w-full p-3 rounded-2xl bg-gray-100 border border-gray-200 text-xs font-bold text-gray-700 outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-extrabold text-gray-700 block mb-1">
                  Status
                </label>
                <select
                  value={editWdStatus}
                  onChange={(e) => setEditWdStatus(e.target.value as any)}
                  className="w-full p-3 rounded-2xl border border-gray-200 text-xs font-extrabold text-gray-800 focus:border-purple-600 outline-none bg-white"
                >
                  <option value="PENDING">PENDING (অপেক্ষমাণ)</option>
                  <option value="APPROVED">APPROVED (অনুমোদিত)</option>
                  <option value="REJECTED">REJECTED (বাতিল)</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-extrabold text-gray-700 block mb-1">
                  Payback Amount (৳)
                </label>
                <input
                  type="number"
                  min={1}
                  value={editWdAmount}
                  onChange={(e) => setEditWdAmount(e.target.value)}
                  className="w-full p-3 rounded-2xl border border-gray-200 text-base font-extrabold text-purple-900 focus:border-purple-600 outline-none"
                  required
                />
              </div>

              {editingWd.accountNumber && (
                <div>
                  <label className="text-xs font-extrabold text-gray-500 block mb-1">
                    Note / Account details
                  </label>
                  <div className="p-3 bg-gray-50 rounded-2xl text-xs font-mono text-gray-700 whitespace-pre-wrap max-h-24 overflow-y-auto border border-gray-100">
                    {editingWd.accountNumber}
                  </div>
                </div>
              )}

              <div className="flex space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingWd(null)}
                  className="flex-1 py-3 rounded-2xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-extrabold text-xs transition-all"
                >
                  বাতিল
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3 rounded-2xl bg-purple-900 hover:bg-purple-950 text-white font-extrabold text-xs shadow-md transition-all"
                >
                  সংরক্ষণ করুন
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Block Confirmation & Mandatory Admin Note Modal */}
      {blockTarget && (
        <AdminBlockModal
          targetName={blockTarget.name}
          targetType={blockTarget.type}
          onConfirm={async (note) => {
            if (blockTarget.type === 'Store') {
              await fallbackStore.blockShop(blockTarget.id, true, note, currentUser?.displayName || 'Admin');
              setShops(Array.from(fallbackStore.shops.values()));
              showAlert('ব্লক সম্পন্ন', `"${blockTarget.name}" স্টোরটি ব্লক করা হয়েছে।`, 'info');
            } else {
              await fallbackStore.blockUser(blockTarget.id, true, note, currentUser?.displayName || 'Admin');
              setUsers(Array.from(fallbackStore.users.values()));
              showAlert('ব্লক সম্পন্ন', `${blockTarget.name}-কে ব্লক করা হয়েছে।`, 'info');
            }
          }}
          onClose={() => setBlockTarget(null)}
        />
      )}

      {/* Blocked User Custom Modal Live Admin Preview */}
      {showBlockedUserModalPreview && (
        <BlockedUserModal
          onClose={() => setShowBlockedUserModalPreview(false)}
          customTitle={blockedUserModalTitle}
          customMessage={blockedUserModalMessage}
        />
      )}
    </div>
  );
};

