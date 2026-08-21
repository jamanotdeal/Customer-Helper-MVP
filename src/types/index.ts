export type UserRole = 'customer' | 'helper' | 'admin';

export type ActiveMode = 'customer' | 'helper' | 'admin';

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
  missingItemPreference?: MissingItemPref;
  createdAt: string;
  isBlocked?: boolean;
  blockedReason?: string;
  labels?: string[];
  fcmToken?: string; // FCM push subscription token for this device
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

export interface Shop {
  id: string;
  name: string;
  type: string;
  contactPerson: string;
  whatsapp: string;
  location: LocationData;
  addedByHelperId?: string;
  addedByHelperName?: string;
  createdAt: string;
  updatedAt?: string;
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

export interface ModalButtonConfig {
  label: string;
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
  | 'all'
  | 'customer'
  | 'helper'
  | 'dedicated_helper';

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
  | 'once_ever'
  | 'once_per_session'
  | 'every_time';

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
  // Map picker guide overlay settings
  mapPickerGuideText?: string;       // Bangla guide text shown as overlay when map opens
  mapPickerGuideOkText?: string;     // OK button label (default: "ঠিক আছে")
  mapPickerGuideShowCount?: number;  // How many times to show guide per modal (default: 5)
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
}

export interface AppNotification {
  id: string;
  userId: string;
  title: string;
  body: string;
  orderId?: string;
  read: boolean;
  createdAt: string;
}
