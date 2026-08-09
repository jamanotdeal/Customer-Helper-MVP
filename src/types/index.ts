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
  
  createdAt: string;
  acceptedAt?: string;
  purchasedAt?: string;
  onTheWayAt?: string;
  arrivedAt?: string;
  deliveredAt?: string;
  cancelledAt?: string;
  updatedAt: string;
  
  statusHistory: StatusHistoryItem[];
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  role: UserRole;
  isHelper: boolean;
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
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  createdAt: string;
}

export interface WalletTransaction {
  id: string;
  userId: string;
  amount: number; // positive for earnings, negative for withdrawal
  type: 'EARNING' | 'WITHDRAWAL' | 'ADJUSTMENT';
  orderId?: string;
  description: string;
  createdAt: string;
}

export interface Wallet {
  userId: string;
  balance: number;
  totalEarned: number;
  totalWithdrawn: number;
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

export interface PricingSettings {
  rules: ValueFeeRule[];
  helperCommissionPercent: number; // e.g. 80
  minWithdrawalAmount: number;     // e.g. 100
  helperActiveOrderLimit?: number; // Max concurrent active orders a helper can hold (default 5)
  inputPlaceholders?: string[];    // Admin configured placeholder texts
  orderConfirmationMessage?: string; // Admin configured thank-you message shown after order submission
  services?: string[];             // Admin configured service dropdown options
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
