export type UserRole = 'customer' | 'helper' | 'admin' | 'store';

export type ActiveMode = 'customer' | 'helper' | 'admin' | 'store';

export type OrderStatus =
  | 'PENDING'
  | 'ACCEPTED'
  | 'PURCHASED_EXECUTED'
  | 'ON_THE_WAY'
  | 'ARRIVED'
  | 'DELIVERED'
  | 'CANCELED';

export type MissingItemPref = 'SKIP' | 'SIMILAR' | 'CALL';

export interface OrderItem {
  id: string;
  name: string;
  qty: string;
  purchased?: boolean;
}

export interface LocationData {
  address: string;
  lat?: number;
  lng?: number;
  name?: string;
}

export interface FeeAdjustment {
  amount: number;
  reason: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  requestedAt: string;
}

export interface StatusHistoryItem {
  id: string;
  status: OrderStatus;
  timestamp: string;
  actor: string;
  note?: string;
}

export interface CancellationRequest {
  requestedBy: 'customer' | 'helper';
  reason: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  createdAt: string;
}

export interface OrderEditChange {
  field: string;
  oldValue: string;
  newValue: string;
}

export interface OrderEditHistoryItem {
  id: string;
  timestamp: string;
  editedBy: 'customer' | 'helper' | 'admin';
  editedByName?: string;
  changes: OrderEditChange[];
}

export interface Order {
  id: string;
  customerId: string;
  customerName: string;
  customerPhone?: string;
  alternativePhone?: string;
  
  title: string;
  service?: string;
  items: OrderItem[];
  missingItemPreference?: MissingItemPref;
  
  pickupLocation?: LocationData;
  deliveryLocation: LocationData;
  additionalNote?: string;
  
  status: OrderStatus;
  deliveryFee: number;
  originalDeliveryFee: number;
  feeAdjustment?: FeeAdjustment;
  productCost?: number;
  
  helperId?: string;
  helperName?: string;
  helperPhone?: string;
  
  cancellationRequest?: CancellationRequest;
  cancellationReason?: string;
  
  routedToDedicated?: boolean;
  dedicatedNotifiedAt?: string;

  updatedByCustomer?: boolean;
  lastEditedAt?: string;
  lastEditedBy?: 'customer' | 'helper' | 'admin';
  editHistory?: OrderEditHistoryItem[];
  
  createdAt: string;
  acceptedAt?: string;
  purchasedAt?: string;
  onTheWayAt?: string;
  arrivedAt?: string;
  deliveredAt?: string;
  cancelledAt?: string;
  updatedAt: string;
  
  statusHistory: StatusHistoryItem[];
  feedback?: OrderFeedback;
  helperNote?: string;
  needDeliveryBack?: boolean;
  deliveryBackTime?: string;
  needReturnItems?: boolean;
  weightKg?: number;
  selectedShopIds?: string[];
  mutuallyDiscussed?: boolean;
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  role: UserRole;
  isHelper: boolean;
  helperType?: 'commuter' | 'dedicated';
  isEduVerified?: boolean;
  helperLocation?: LocationData & { updatedAt?: string };
  isAdmin?: boolean;
  isSuperAdmin?: boolean;
  lastActiveMode: ActiveMode;
  alternativePhone?: string;
  defaultDeliveryLocation?: LocationData;
  savedDeliveryAddresses?: LocationData[]; // Customer's saved delivery addresses (synced from Firestore on login)
  missingItemPreference?: MissingItemPref;
  createdAt: string;
  isBlocked?: boolean;
  blockedReason?: string;
  labels?: string[];
  fcmToken?: string; // FCM push subscription token for this device
  isStore?: boolean;         // True if user has an approved store application
  isStoreApproved?: boolean; // Explicit approval flag for store mode
  storeId?: string;          // The shop document ID linked to this user's store
}

export interface HelperApplication {
  id: string;
  userId: string;
  userName: string;
  legalName: string;
  nid: string;
  email: string;
  whatsapp: string;
  fbProfile: string;
  hasSmartphone: boolean;
  hasCycle: boolean;
  hasBike: boolean;
  applicationType?: 'dedicated';
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELED';
  createdAt: string;
}

export interface StoreApplication {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  storeName: string;
  storeType: string;
  storeDescription?: string;   // What types of items are available
  ownerName: string;
  ownerWhatsapp: string;
  managerName: string;
  managerWhatsapp: string;
  location: LocationData;
  commissionPercent: number;   // e.g. 5 means 5% per order
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELED';
  createdAt: string;
  reviewedAt?: string;
  reviewNote?: string;
}

export interface Shop {
  id: string;
  name: string;
  type: string;
  description?: string;       // What types of items are available (from storeDescription)
  contactPerson: string;
  whatsapp: string;
  managerName?: string;       // Manager name from store application
  managerWhatsapp?: string;   // Manager WhatsApp from store application
  location: LocationData;
  addedByHelperId?: string;
  addedByHelperName?: string;
  ownerUserId?: string;       // Firebase UID of the store owner
  ownerUserEmail?: string;    // Email of the store owner
  applicationId?: string;     // Source StoreApplication ID
  createdAt: string;
  updatedAt?: string;
  photoUrl?: string;          // Admin-uploaded photo URL or base64
  commissionPercent?: number; // e.g. 5 means 5% of product cost
  commissionNote?: string;    // Optional description of commission deal
}

export interface OrderFeedback {
  id: string;
  orderId: string;
  customerId: string;
  customerName?: string;
  helperId?: string;
  helperName?: string;
  shopId?: string;
  shopName?: string;
  riderRating: number;
  serviceRating: number;
  shopRating: number;
  improvementComment?: string;
  createdAt: string;
}

export type ModalButtonActionType = 'CLOSE' | 'REDIRECT';

export interface ModalButtonConfig {
  label: string;
  actionType?: ModalButtonActionType; // 'CLOSE' | 'REDIRECT'
  actionUrl?: string;
  url?: string;
  variant?: 'primary' | 'secondary' | 'danger' | 'outline';
}

export type ModalTargetAudience =
  | 'ALL'
  | 'CUSTOMERS'
  | 'HELPERS'
  | 'COMMUTER_HELPERS'
  | 'DEDICATED_HELPERS'
  | 'LOGGED_IN'
  | 'LOGGED_OUT'
  | 'WEBSITE_USERS'
  | 'MOBILE_APP_USERS'
  | 'all'
  | 'customer'
  | 'helper'
  | 'dedicated_helper'
  | 'website'
  | 'mobile_app'
  | 'MULTIPLE_ORDERS'
  | 'WEEKLY_2_ORDERS'
  | 'WEEKLY_1_ORDERS'
  | 'INACTIVE_1_WEEK'
  | 'INACTIVE_2_WEEKS'
  | 'NEVER_ORDERED'
  | 'RARE_ORDERS_WEEK'
  | 'RARE_ORDERS_MONTH'
  | 'NEW_REGISTERED';

export type ModalTriggerEvent =
  | 'FIRST_VISIT'
  | 'LOGIN'
  | 'REQUEST_SUBMIT'
  | 'ORDER_COMPLETE'
  | 'DASHBOARD_OPEN'
  | 'first_visit'
  | 'login'
  | 'request_submit'
  | 'order_complete'
  | 'dashboard_open';

export type ModalDisplayFrequency =
  | 'ONCE_EVER'
  | 'ONCE_PER_SESSION'
  | 'ALWAYS'
  | 'DAILY'
  | 'once_ever'
  | 'once_per_session'
  | 'every_time'
  | 'daily';

export interface AdminCustomModalConfig {
  id: string;
  title: string;
  subtitle?: string;
  bodyText?: string;
  imageUrl?: string;
  description: string;
  buttons: ModalButtonConfig[];
  targetAudience: ModalTargetAudience;
  triggerEvent: ModalTriggerEvent;
  displayFrequency: ModalDisplayFrequency;
  isEnabled: boolean;
  enabled?: boolean;
  scheduledTime?: string; // HH:mm format (e.g. "14:30") for specific or daily showing time
  startTime?: string;     // HH:mm format for start of display window
  endTime?: string;       // HH:mm format for end of display window
  expiryTime?: string;    // HH:mm format for modal expiration time on endDate/expiryDate
  expiresAt?: string;     // ISO string for modal expiration date & time
  startDate?: string;     // YYYY-MM-DD start date
  endDate?: string;       // YYYY-MM-DD end date
  repeatedDaily?: boolean; // Whether modal repeats daily at scheduledTime
  createdAt: string;
  updatedAt?: string;
}

export interface WalletTransaction {
  id: string;
  userId: string;
  amount: number; // positive for earnings, negative for withdrawal
  type: 'EARNING' | 'WITHDRAWAL' | 'ADJUSTMENT' | 'PAYBACK';
  orderId?: string;
  description: string;
  createdAt: string;
}

export interface Wallet {
  userId: string;
  balance: number;
  totalEarned: number;
  totalWithdrawn: number;
  totalPaidCommission?: number;
  updatedAt: string;
}

export interface WithdrawalRequest {
  id: string;
  helperId: string;
  helperName: string;
  amount: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  paymentMethod?: string;
  accountNumber?: string;
  createdAt: string;
  processedAt?: string;
}

export interface ValueFeeRule {
  maxOrderValue: number; // e.g. 100
  fee: number;           // e.g. 20
}

export type MapLocationPreference = 'BD' | 'GLOBAL' | 'CUSTOM';

export interface PricingSettings {
  rules: ValueFeeRule[];
  helperCommissionPercent: number; // e.g. 80
  minWithdrawalAmount: number;     // e.g. 100
  helperActiveOrderLimit?: number; // Max concurrent active orders a helper can hold (default 5)
  inputPlaceholders?: string[];    // Admin configured placeholder texts
  orderConfirmationMessage?: string; // Admin configured thank-you message shown after order submission
  services?: string[];             // Admin configured service dropdown options
  serviceDescriptionHints?: Record<string, string>; // Per-service description placeholder hints
  orderTimingType?: 'always_on' | 'always_off' | 'custom_range';
  orderTimingStart?: string; // HH:mm format
  orderTimingEnd?: string;   // HH:mm format
  orderTimingMessage?: string;
  eduEmailDomains?: string[]; // Admin configured domains for verified badge e.g. ['@diu.edu.bd']
  dedicatedHelperDelayMinutes?: number; // Minutes before dedicated helpers get notified (default 7)
  orderReceiverRule?: 'commuter_first' | 'dedicated_first' | 'both_simultaneous'; // Default 'commuter_first'
  allowedHelperTypes?: 'dedicated_only' | 'commuters_only' | 'both'; // Default 'both'
  helperRadiusKm?: number; // Distance radius limit in km for helper request visibility & notifications (default 3.5)
  mapLocationPreference?: MapLocationPreference; // Default 'BD'
  customCountryCode?: string; // e.g. 'bd', 'in', 'us'
  pwaInstallPromptEnabled?: boolean; // Admin toggle to enable PWA install prompt on order success
  pwaInstallPromptTitle?: string;    // Custom title e.g. "Install Jamanot App"
  pwaInstallPromptDescription?: string; // Custom description text
  pwaInstallButtonText?: string;     // Custom button text e.g. "Install Jamanot"
  locationPermissionModalTitle?: string; // Admin editable title for location permission modal
  locationPermissionModalBody?: string;  // Admin editable body message for location permission modal
  notificationPermissionModalTitle?: string; // Admin editable title for notification permission modal
  notificationPermissionModalBody?: string;  // Admin editable body message for notification permission modal
  bkashInstructions?: string;
  nagadInstructions?: string;
  rocketInstructions?: string;
  bankInstructions?: string;
  cashInstructions?: string;
  storeTypes?: string[];
  // Store application form placeholder texts (admin configurable)
  storeFormPlaceholders?: {
    storeName?: string;        // e.g. "যেমন: আলম জেনারেল স্টোর"
    storeDescription?: string; // e.g. "যেমন: চাল, ডাল, তেল, শ্যাম্পু, সাবান..."
    ownerName?: string;        // e.g. "মালিকের পুরো নাম"
    ownerPhone?: string;       // e.g. "মালিকের হোয়াটসঅ্যাপ নম্বর (01XXXXXXXXX)"
    managerName?: string;      // e.g. "ম্যানেজারের পুরো নাম"
    managerPhone?: string;     // e.g. "ম্যানেজারের হোয়াটসঅ্যাপ নম্বর (01XXXXXXXXX)"
    commissionPercent?: string; // e.g. "যেমন: ৫"
  };
  // Map picker guide overlay settings
  mapPickerGuideText?: string;           // Bangla guide text shown as overlay when map opens (fallback for both)
  mapPickerPickupGuideText?: string;     // Guide text specific to pickup/source location modal
  mapPickerDeliveryGuideText?: string;   // Guide text specific to delivery location modal
  mapPickerGuideOkText?: string;         // OK button label (default: "ঠিক আছে")
  mapPickerGuideShowCount?: number;      // How many times to show guide per modal (default: 5)
  // Per-category pickup location saving
  noSavePickupLocationServices?: string[]; // Service names whose pickup address should NOT be saved
  // Helper Center contact info (admin updatable)
  helperCenterEnabled?: boolean;
  helperCenterOfficeAddress?: string;
  helperCenterPhone1?: string;
  helperCenterPhone2?: string;
  helperCenterEmail?: string;
  helperCenterFacebook?: string;
  helperCenterLinkedin?: string;
  helperCenterInstagram?: string;
  helperCenterMapEmbedUrl?: string; // Optional Google Maps embed URL
  helperCenterNote?: string; // Additional note for the center page
  googleAnalyticsId?: string;
  microsoftClarityId?: string;
  // Fee Details Estimation Calculator & Policy Settings
  feeCalculatorBasePrice?: number;
  feeCalculatorPerKmRate?: number;
  feeCalculatorPerKgRate?: number;
  feeCalculatorReturnFee?: number;
  feeCalculatorReturnPercent?: number;
  feeCalculatorProcessingFee?: number;
  feeCalculatorProcessingFeeType?: 'flat' | 'percent';
  feeCalculatorMinFee?: number;
  feeCalculatorMaxLimit?: number;
  feeCalculatorMaxLimitMessage?: string;
  feeCalculatorCompanyDetails?: string;
  retailerCommissionRadius?: number; // km radius for showing nearby retailers in helper map (default: helperRadiusKm)
  allowedAdminTabs?: string[];
  // Admin Accepted status timer: minutes before showing "Admin Accepted" to customer when no helper assigned
  adminAcceptedDelayMinutes?: number; // Default: 5
}

export type ShopOrderStatus = 'PENDING' | 'ACCEPTED' | 'PREPARING' | 'READY' | 'HANDOVER' | 'CANCELED';

export interface ShopOrderStatusHistoryItem {
  status: ShopOrderStatus;
  timestamp: string;
  actor: string;
  note?: string;
}

export interface ShopOrder {
  id: string;
  parentOrderId: string;     // The main delivery order ID
  shopId: string;
  shopName: string;
  helperId: string;
  helperName: string;        // Store sees this as "customer" name
  requestText: string;       // Helper's typed order/request
  status: ShopOrderStatus;
  price?: number;            // Set by store
  note?: string;             // Store's note to helper
  createdAt: string;
  updatedAt: string;
  statusHistory: ShopOrderStatusHistoryItem[];
}

export interface FeeSuggestion {
  id: string;
  userId: string;
  userName: string;
  userPhone?: string;
  userRole: 'customer' | 'helper';
  category: string;
  message: string;
  createdAt: string;
}

export interface AppNotification {
  id: string;
  userId: string;
  title: string;
  body: string;
  orderId?: string;
  read: boolean;
  createdAt: string;
  imageUrl?: string;
  scheduledAt?: string; // ISO string for scheduled push execution
  isScheduled?: boolean;
  repeatFrequency?: 'NONE' | 'DAILY' | 'WEEKLY';
  repeatTime?: string; // HH:mm format for recurring push time
}

