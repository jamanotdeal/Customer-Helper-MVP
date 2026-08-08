# Jamanot PWA — Master Technical Documentation

> **Tagline:** Ask. Relax. Done.  
> **Platform:** Progressive Web App (PWA) — Next.js 14, TailwindCSS, Firebase Auth, Firestore Realtime Sync, Geolocation API.

---

## 📖 Project Overview

**Jamanot** is a fast, minimalistic, mobile-first personal helper service for on-demand nearby shopping, errands, laundry, food delivery, parcel movement, and emergency medicine pick-ups. 

The application is structured into three primary operational roles:
1. **Customer**: Submits requests, tracks live order status step-by-step, manages preferences, and receives realtime notifications.
2. **Helper**: Views nearby pending requests, accepts tasks, updates execution progress (Purchased, On the way, Arrived, Delivered), requests fee adjustments, and manages earnings/withdrawals via Wallet.
3. **Admin**: Monitors exception queues ("Needs Attention"), manages helper applications, approves/rejects withdrawal payout requests, resolves fee adjustment requests, and configures system pricing rules.

---

## 🛠️ Tech Stack & Architecture

- **Framework**: [Next.js 14](https://nextjs.org/) (App Router, Client Components, TypeScript)
- **Styling**: TailwindCSS, CSS Variables, Glassmorphism, Responsive Mobile First layout
- **Authentication**: Firebase Authentication (Google Auth Popup + Role Fallback testing)
- **Database & Sync**: Firebase Firestore (`onSnapshot` real-time listeners, `setDoc`, `updateDoc`) with in-memory offline fallback
- **State Management**: React Context (`AuthContext`, `ModalContext`) + Observer Pattern Event Bus
- **Icons**: Lucide React icons
- **Progressive Web App**: Web App Manifest (`public/manifest.json`) + Service Worker (`public/sw.js`)

---

## 🔑 Key Features & User Workflows

### 1. Authentication & Form Guarding
- Unauthenticated users can explore the app landing page and view how Jamanot works.
- Attempting to interact with (type or click) the request input form or category chips immediately prompts the custom Google Sign-In modal.
- The request composer remains collapsed until the user completes authentication.

### 2. Category Selectors & Dynamic Placeholders
- 6 predefined category chips are featured:
  - 🛒 **বাজার-সদাই**: `"Amar chotokhato kichu bajar lagbe..."`
  - 🧺 **লন্ড্রি**: `"Amar kicu kapor lundry dukan patate hobe"`
  - 🍔 **খাবার**: `"Amar restora theke khabar aniya dite hobe..."`
  - 📦 **পার্সেল**: `"Amar ekta parcel pathate / ante hobe..."`
  - 💊 **ওষুধ**: `"Amar dukan theke ektu osudh ante hobe..."`
  - 🌀 **Others**: `"Amar ekta kaj ..... kore den"`
- Tapping a category chip dynamically updates the upper main input placeholder text without appending items below.

### 3. Pre-Submission Form Validation
- Ensures the user specifies a valid request item description.
- Validates delivery location requirement.
- Validates optional Bangladeshi phone number format (`^01[3-9]\d{8}$`).
- Displays user feedback through theme-matching custom modals instead of browser default alerts.

### 4. Device Geolocation Auto-Collection & Refresh
- Auto-collects device GPS coordinates via `navigator.geolocation.getCurrentPosition` upon initial load/focus.
- Includes a dedicated location icon (compass button) that re-fetches device GPS coordinates instantly with an active spinner indicator.

### 5. Custom Modal Dialog System
- Replaces native browser `alert()` and `confirm()` dialogs.
- Custom styled with dark backdrop blur (`backdrop-blur-xs bg-black/60`), smooth zoom animations, icon badges, and emerald/dark primary themes.

### 6. Firebase Firestore Real-Time Persistence & Zero Dummy Data
- All hardcoded demo orders have been removed for logged-in users.
- Live Firestore synchronization (`onSnapshot`) updates orders, notifications, helper applications, wallets, and withdrawals in real time across devices.

### 7. Bi-Directional Live Notifications
- **Customer Notifications**: Triggered when a helper accepts an order, marks items as purchased, moves on the way, arrives, delivers the order, or requests a fee adjustment.
- **Helper/Admin Notifications**: Triggered when a new nearby request is submitted by a customer.

### 8. Role-Based Access Control (RBAC)
- **Customer Mode**: Access limited to creating requests, viewing order history, and tracking live progress.
- **Helper Mode**: Gated by `isHelper === true`. Unapproved users see the "Become a Helper" application form.
- **Admin Panel**: Gated by `isAdmin === true`. Displays operational exception queues, helper approval actions, withdrawal processing, and pricing settings.

---

## 📁 Data Models (`src/types/index.ts`)

```typescript
export type OrderStatus =
  | 'PENDING'
  | 'ACCEPTED'
  | 'PURCHASED_EXECUTED'
  | 'ON_THE_WAY'
  | 'ARRIVED'
  | 'DELIVERED'
  | 'CANCELED';

export interface Order {
  id: string;
  customerId: string;
  customerName: string;
  customerPhone?: string;
  alternativePhone?: string;
  title: string;
  items: OrderItem[];
  missingItemPreference: 'SKIP' | 'SIMILAR' | 'CALL';
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
  createdAt: string;
  updatedAt: string;
  statusHistory: StatusHistoryItem[];
}
```

---

## ⚡ Environment Variables (`.env.local`)

Ensure the following variables are defined in `.env.local`:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSyDSN_Q5PTgnL7nTm0Ni1yktCculx6jlRYY
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=jamanot-pwa.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=jamanot-pwa
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=jamanot-pwa.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=685363529279
NEXT_PUBLIC_FIREBASE_APP_ID=1:685363529279:web:fcdd94d0e5181b7b4b9a8a
```

---

## 🚀 Running Locally

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start development server:
   ```bash
   npm run dev
   ```

3. Open [http://localhost:3000](http://localhost:3000) in your browser or mobile device emulator.

---

## 🔐 Security & Production Rules

- **Firestore Rules**: Ensure Firestore rules enforce write access checks matching user authentication.
- **Service Worker**: PWA offline assets are cached via `public/sw.js`.
