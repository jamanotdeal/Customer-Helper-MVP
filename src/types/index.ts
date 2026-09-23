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
  details?: string;
  addressId?: string;
}

export interface ServerAddress {
  id: string;
  address: string;
  shortName?: string;
  lat?: number;
  lng?: number;
  details?: string;
  usageCount?: number;
  createdAt: string;
  updatedAt?: string;
}

export interface AllowedAreaPolygon {
  id: string;
  name: string; // e.g. "Uttara 18", "Ashulia Model Town"
  country?: string; // e.g. "Bangladesh"
  coordinates: { lat: number; lng: number }[]; // Outer ring polygon coordinates
  assignedHelperIds?: string[]; // IDs of helpers specifically assigned to this area
  allHelpersAssigned?: boolean; // If true or empty/unset by default, all helpers can serve this area
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
  deliveryBackSetAt?: string;
  needReturnItems?: boolean;
  weightKg?: number;
  shopId?: string;
  selectedShopIds?: string[];
  mutuallyDiscussed?: boolean;
  
  // Due payment added to this completed order by helper or admin
  duePayment?: OrderDuePayment;
  // Previous due payment applied to this order's calculation summary
  appliedDuePayment?: {
    amount: number;
    note: string;
    sourceOrderIds?: string[];
  };

  // Gamification & Free Delivery fields
  isFreeDelivery?: boolean;
  deliveryDiscountPercent?: number; // 1-100%
  coinsRedeemedForDelivery?: number;
  coinsDeductedForDelivery?: boolean;
  coinsDeductedAt?: string;
  coinsAwarded?: number;
  coinsAwardedAt?: string;
}

export interface OrderDuePayment {
  amount: number;
  note: string;
  addedBy: 'admin' | 'helper';
  addedByName?: string;
  addedAt: string;
  updatedAt?: string;
  status?: 'UNPAID' | 'PAID';
  paidInOrderId?: string;
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
  phoneNumber?: string;
  alternativePhone?: string;
  defaultDeliveryLocation?: LocationData;
  savedDeliveryAddresses?: LocationData[]; // Customer's saved delivery addresses (synced from Firestore on login)
  savedPickupAddresses?: LocationData[];   // Customer's saved pickup addresses (synced from Firestore on login)
  servicePickupLocations?: Record<string, LocationData>; // Per-service pickup location mapping
  missingItemPreference?: MissingItemPref;
  createdAt: string;
  isBlocked?: boolean;
  blockedReason?: string;
  labels?: string[];
  fcmToken?: string; // FCM push subscription token for this device
  isStore?: boolean;         // True if user has an approved store application
  isStoreApproved?: boolean; // Explicit approval flag for store mode
  storeId?: string;          // The shop document ID linked to this user's store
  coins?: number;            // Current coin balance
  totalEarnedCoins?: number; // Lifetime earned coins
  assignedAreaIds?: string[]; // Specific sub-area IDs assigned to this helper
  serveAllAreas?: boolean;   // If true, helper receives orders from all service areas
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
  status?: 'Approved' | 'Pending' | 'Rejected' | 'APPROVED' | 'PENDING' | 'REJECTED';
  canReceiveOrders?: boolean; // If false, store cannot receive/accept order requests directly in app; helper enters note, price & status manually. Default is true.
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
  thumbsUp?: boolean;          // true = positive, false = negative (new thumbs system)
  improvementComment?: string;
  createdAt: string;
  mutuallyDiscussed?: boolean;
  // Admin reply fields
  adminReply?: string;              // Admin's reply text
  adminReplyAt?: string;            // ISO timestamp when admin wrote the reply
  adminReplyShowFrom?: string;      // ISO timestamp — do not show the reply before this time
  adminReplyShowUntil?: string;     // ISO timestamp until which the reply modal can be shown to customer
  adminReplyShownToCustomer?: boolean; // Set to true after customer has seen/dismissed the reply once
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
  userType?: 'helper' | 'store';
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
  showBecomeHelper?: boolean; // When true, regular customers see "Become Helper" in the sidebar drawer. When false (default), it is hidden.
  pwaInstallPromptEnabled?: boolean; // Admin toggle to enable PWA install prompt on order success
  pwaInstallPromptTitle?: string;    // Custom title e.g. "Install Jamanot App"
  pwaInstallPromptDescription?: string; // Custom description text
  pwaInstallButtonText?: string;     // Custom button text e.g. "Install Jamanot"
  // In-App Browser (Facebook/Messenger) prompt settings
  inAppBrowserPromptEnabled?: boolean; // Admin toggle to enable/disable in-app browser detection popup (default true)
  inAppBrowserPromptTitle?: string;    // Custom title e.g. "ব্রাউজারে ওপেন করুন"
  inAppBrowserPromptSubtitle?: string; // Custom subtitle e.g. "Open in Chrome or Safari for the Best Experience"
  inAppBrowserPromptMessage?: string;  // Custom alert message / description text
  locationPermissionModalTitle?: string; // Admin editable title for location permission modal
  locationPermissionModalBody?: string;  // Admin editable body message for location permission modal
  notificationPermissionModalTitle?: string; // Admin editable title for notification permission modal
  notificationPermissionModalBody?: string;  // Admin editable body message for notification permission modal
  displayOverPermissionModalTitle?: string; // Admin editable title for display over permission modal
  displayOverPermissionModalBody?: string;  // Admin editable body message for display over permission modal
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
  // Map picker input placeholders (admin configurable)
  mapPickerPlaceholder?: string;         // Fallback input box placeholder for map picker
  mapPickerPickupPlaceholder?: string;   // Input box placeholder for pickup location map modal
  mapPickerDeliveryPlaceholder?: string; // Input box placeholder for delivery location map modal
  mapPickerAddressRequiredMessage?: string; // Floating error text when manual address field is left blank
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
  
  // Geofencing: Specific serving area polygons defined by admin
  allowedDeliveryAreasEnabled?: boolean; // Toggle to enforce geofence restriction
  allowedDeliveryAreas?: AllowedAreaPolygon[]; // Multiple drawn polygons
  outOfServiceAreaMessage?: string; // Admin configured custom message when user selects outside area
  
  // Manual authentication (email/password login & register) toggle
  manualAuthEnabled?: boolean; // Default false (only active if admin explicitly checks it)

  // Gamification & Rewards Settings
  defaultOrderCoins?: number;                // Default coins awarded per order (e.g. 10)
  serviceCoins?: Record<string, number>;     // Category/Service specific coin rewards
  freeDeliveryRequiredCoins?: number;        // Coins needed for free/discounted delivery (e.g. 50)
  freeDeliveryDiscountPercent?: number;      // Discount % on delivery fee (1-100, default 100)
  insufficientCoinsTitle?: string;           // Admin customizable popup title when coins not enough
  insufficientCoinsMessage?: string;         // Admin customizable popup message when coins not enough
  rewardStoreTips?: string;                  // Tips / advice text block written by admin for customers
}

export type ShopOrderStatus = 'PENDING' | 'ACCEPTED' | 'PREPARING' | 'READY' | 'HANDOVER' | 'DELIVERED' | 'CANCELED';

export interface ShopOrderStatusHistoryItem {
  status: ShopOrderStatus;
  timestamp: string;
  actor: string;
  note?: string;
}

export interface ShopOrderItemPrice {
  name: string;
  unit?: string;
  price?: number;
}

export interface ShopOrder {
  id: string;
  parentOrderId: string;     // The main delivery order ID
  shopId: string;
  shopName: string;
  helperId: string;
  helperName: string;        // Store sees this as "customer" name
  requestText: string;       // Helper's typed order/request
  itemsWithPrice?: ShopOrderItemPrice[]; // Divided items with their individual prices set by store
  status: ShopOrderStatus;
  price?: number;            // Set by store
  sellerName?: string;       // Custom cost seller / vendor name
  sellerPhone?: string;      // Custom cost seller / vendor phone number
  note?: string;             // Store's note to helper
  viewedByStore?: boolean;   // Set to true when store clicks "দেখতেছি" or views the order
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
  targetRole?: UserRole;
  type?: string;
  isAdminPush?: boolean;
  createdByAdmin?: boolean;
}

export interface RewardPrize {
  id: string;
  title: string;
  description?: string;
  requiredCoins: number;
  discountPercent?: number; // Optional 1-100% discount
  imageUrl?: string;
  icon?: string;
  isEnabled: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface RewardClaim {
  id: string;
  userId: string;
  userName: string;
  userPhone?: string;
  userEmail?: string;
  prizeId: string;
  prizeTitle: string;
  requiredCoins: number;
  discountPercent?: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  claimNote?: string;
  createdAt: string;
  reviewedAt?: string;
  reviewNote?: string;
  reviewedBy?: string;
}

export interface CoinTransaction {
  id: string;
  userId: string;
  amount: number;
  type: 'EARNED_ORDER' | 'CLAIM_REDEEM' | 'ADMIN_ADJUST' | 'FREE_DELIVERY';
  orderId?: string;
  claimId?: string;
  description: string;
  createdAt: string;
}

