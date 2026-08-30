'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { UserProfile, ActiveMode, HelperApplication, StoreApplication } from '@/types';
import { auth, googleProvider, fallbackStore, initFcmMessaging, requestBrowserNotificationPermission, loadCustomerSavedAddresses, saveFcmToken } from '@/lib/firebase';
import {
  signInWithPopup,
  signInWithRedirect,
  signInWithCredential,
  GoogleAuthProvider,
  signOut as firebaseSignOut,
  onAuthStateChanged,
} from 'firebase/auth';
import { getSavedActiveMode, saveActiveMode, getSavedDeliveryAddresses, saveSavedDeliveryAddresses } from '@/lib/storage';
import {
  getNativePosition,
  isNativeApp,
  nativeGoogleSignIn,
  nativeGoogleSignOut,
  syncNativeUserState,
  startDutyService,
  stopDutyService,
  getNativeFcmToken,
} from '@/lib/native';


interface AuthContextType {
  user: UserProfile | null;
  loading: boolean;
  activeMode: ActiveMode;
  setActiveMode: (mode: ActiveMode) => void;
  enableCommuterHelperWithLocation: () => Promise<boolean>;
  loginWithGoogle: (roleOverride?: 'customer' | 'helper' | 'admin') => Promise<void>;
  logout: () => Promise<void>;
  submitHelperApplication: (appData: Omit<HelperApplication, 'id' | 'userId' | 'userName' | 'status' | 'createdAt'>) => Promise<void>;
  updateHelperApplication: (appId: string, updatedFields: Partial<HelperApplication>) => Promise<void>;
  cancelHelperApplication: (appId: string) => Promise<void>;
  submitStoreApplication: (appData: Omit<StoreApplication, 'id' | 'userId' | 'userName' | 'userEmail' | 'status' | 'createdAt'>) => Promise<void>;
  cancelStoreApplication: (appId: string) => Promise<void>;
  updateCustomerPreferences: (altPhone?: string, defaultDeliveryLocation?: any, missingItemPref?: any) => void;
  updateHelperLocation: (loc: { lat: number; lng: number; address?: string }) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const ADMIN_EMAILS = ['ajnasim72@gmail.com', 'contact.jamanot@gmail.com'];
const SUPER_ADMIN_EMAILS = ['ajnasim72@gmail.com'];

const isUserAdminEmail = (email?: string | null): boolean => {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  return ADMIN_EMAILS.includes(normalized) || normalized.includes('admin');
};

const isUserSuperAdminEmail = (email?: string | null): boolean => {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  return SUPER_ADMIN_EMAILS.includes(normalized);
};



const checkEduVerified = (email?: string | null): boolean => {
  if (!email) return false;
  const domains = fallbackStore.pricingSettings.eduEmailDomains || ['@diu.edu.bd'];
  const lower = email.trim().toLowerCase();
  return domains.some((d) => lower.endsWith(d.toLowerCase().trim()));
};

/**
 * Mirrors the signed-in identity into Android SharedPreferences, and starts or
 * stops the duty foreground service to match.
 *
 * This is the whole role-gating mechanism for the background path: once written,
 * the Java service can decide who to alert without any JavaScript running. It
 * must therefore be called anywhere role, mode or location changes — not just at
 * login. No-op on web.
 */
async function pushNativeState(
  profile: UserProfile | null,
  listenerRole: 'customer' | 'helper' | 'admin' | 'store'
): Promise<void> {
  if (!isNativeApp()) return;

  if (!profile) {
    await syncNativeUserState({ uid: null, onDuty: false });
    await stopDutyService();
    return;
  }

  const onDuty = listenerRole === 'helper' || listenerRole === 'store';

  await syncNativeUserState({
    uid: profile.uid,
    role: listenerRole,
    isHelper: !!profile.isHelper,
    helperType: profile.helperType || 'commuter',
    isStoreApproved: !!profile.isStoreApproved,
    storeId: profile.storeId || null,
    activeMode: profile.lastActiveMode || listenerRole,
    onDuty,
    lat: profile.helperLocation?.lat ?? null,
    lng: profile.helperLocation?.lng ?? null,
    radiusKm: fallbackStore.pricingSettings?.helperRadiusKm ?? 3.5,
  });

  // Customer and Admin never run the service — they get notifications only.
  if (onDuty) {
    await startDutyService();
  } else {
    await stopDutyService();
  }
}

export async function checkLocationPermissionState(): Promise<'granted' | 'denied' | 'prompt'> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return 'denied';
  if ('permissions' in navigator && navigator.permissions && typeof navigator.permissions.query === 'function') {
    try {
      const result = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
      return result.state;
    } catch (_) {
      // Permission API for geolocation might throw on Safari/iOS WebKit
    }
  }
  return 'prompt';
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [activeMode, setActiveModeState] = useState<ActiveMode>('customer');

  const buildProfile = (fbUser: import('firebase/auth').User, savedMode: ActiveMode): UserProfile => {
    const isAdmin = isUserAdminEmail(fbUser.email);
    const isSuperAdmin = isUserSuperAdminEmail(fbUser.email);
    const isEduVerified = checkEduVerified(fbUser.email);
    let profile = fallbackStore.users.get(fbUser.uid);

    // If not found by UID, search by email to prevent creating duplicate users on re-login
    if (!profile && fbUser.email) {
      const targetEmail = fbUser.email.trim().toLowerCase();
      const existingByEmail = Array.from(fallbackStore.users.values()).find(
        (u) => u.email && u.email.trim().toLowerCase() === targetEmail
      );

      if (existingByEmail) {
        const oldUid = existingByEmail.uid;
        profile = {
          ...existingByEmail,
          uid: fbUser.uid,
          displayName: fbUser.displayName || existingByEmail.displayName,
          photoURL: fbUser.photoURL || existingByEmail.photoURL,
        };
        // Migrate all associated orders, wallets, apps, and feedbacks from oldUid to new UID
        fallbackStore.migrateUserUid(oldUid, fbUser.uid);
        fallbackStore.saveUser(profile);
      }
    }

    if (!profile) {
      profile = {
        uid: fbUser.uid,
        email: fbUser.email || '',
        displayName: fbUser.displayName || 'Customer User',
        photoURL: fbUser.photoURL || undefined,
        role: isAdmin ? 'admin' : 'customer',
        isHelper: false,
        helperType: 'commuter',
        isEduVerified: isEduVerified,
        isAdmin: isAdmin,
        isSuperAdmin: isSuperAdmin,
        lastActiveMode: isAdmin ? 'admin' : (savedMode || 'customer'),
        createdAt: new Date().toISOString(),
      };
      fallbackStore.saveUser(profile);
    } else {
      let needsSave = false;
      if (isAdmin && (!profile.isAdmin || profile.role !== 'admin' || (isSuperAdmin && !profile.isSuperAdmin))) {
        profile = {
          ...profile,
          isAdmin: true,
          isSuperAdmin: isSuperAdmin,
          role: 'admin',
          lastActiveMode: 'admin',
        };
        needsSave = true;
      }
      if (profile.isEduVerified !== isEduVerified) {
        profile = {
          ...profile,
          isEduVerified: isEduVerified,
        };
        needsSave = true;
      }
      if (needsSave) {
        fallbackStore.saveUser(profile);
      }
    }
    return profile;
  };

  const applyProfile = (profile: UserProfile, savedMode: ActiveMode) => {
    setUser(profile);
    if (profile.isAdmin) {
      setActiveModeState('admin');
      saveActiveMode('admin');
    } else if (profile.isStoreApproved) {
      // Approved stores are always locked into store mode
      setActiveModeState('store');
      saveActiveMode('store');
    } else {
      let targetMode: ActiveMode;
      if (profile.isHelper && profile.helperType === 'dedicated') {
        const storedMode = typeof window !== 'undefined' ? localStorage.getItem('jamanot_last_active_mode') : null;
        if (storedMode === 'customer') {
          targetMode = 'customer';
        } else if (storedMode === 'helper') {
          targetMode = 'helper';
        } else {
          targetMode = 'helper';
        }
      } else {
        targetMode = profile.isHelper && profile.lastActiveMode === 'helper' ? 'helper' : (savedMode || 'customer');
      }
      setActiveModeState(targetMode);
      saveActiveMode(targetMode);
    }
  };

  useEffect(() => {
    const savedMode = getSavedActiveMode();
    setActiveModeState(savedMode);

    const unsubscribeStore = fallbackStore.subscribe(() => {
      setUser((prevUser) => {
        if (!prevUser) return null;
        const updatedUser = fallbackStore.users.get(prevUser.uid);
        return updatedUser ? { ...updatedUser } : prevUser;
      });
    });

    // Loading resolves as soon as the Firebase auth state listener fires.
    // We no longer use signInWithRedirect (popup-only), so redirect check is skipped.
    let authReady = false;
    const maybeFinishLoading = () => {
      if (authReady) {
        setLoading(false);
      }
    };

    // Safety net: if Firebase auth stalls (e.g. network issues), unblock after 3s
    const safetyTimer = setTimeout(() => {
      authReady = true;
      maybeFinishLoading();
    }, 3000);

    // Firebase Auth state listener
    const unsubscribeAuth = onAuthStateChanged(auth, async (fbUser) => {
      if (fbUser) {
        // Try fetching user from Firestore first to avoid overwriting or losing the helper/store status
        try {
          await fallbackStore.fetchUserFromFirestore(fbUser.uid);
        } catch (e) {
          console.warn('[AuthContext] Error fetching user profile on login:', e);
        }
        const profile = buildProfile(fbUser, savedMode);
        applyProfile(profile, savedMode);
        // Tell the Firestore notification listener which user is on this device
        fallbackStore.currentUserId = fbUser.uid;
        // Initialize role-scoped Firestore listeners (replaces the old 12-blanket-listeners approach)
        const listenerRole: 'customer' | 'helper' | 'admin' | 'store' = isUserAdminEmail(fbUser.email)
          ? 'admin'
          : (profile.isStoreApproved || profile.lastActiveMode === 'store' || savedMode === 'store')
          ? 'store'
          : (profile.isHelper && (profile.lastActiveMode === 'helper' || savedMode === 'helper'))
          ? 'helper'
          : 'customer';
        fallbackStore.initListenersForRole(listenerRole, fbUser.uid, profile.helperType, profile.storeId);
        // On customer login: load saved delivery addresses from Firestore if not already in localStorage
        if (listenerRole === 'customer') {
          const localAddresses = getSavedDeliveryAddresses(fbUser.uid);
          if (localAddresses.length === 0) {
            // No local cache — fetch from Firestore once and store
            loadCustomerSavedAddresses(fbUser.uid).then((firestoreAddresses) => {
              if (firestoreAddresses.length > 0) {
                saveSavedDeliveryAddresses(fbUser.uid, firestoreAddresses);
              }
            }).catch(() => {});
          }
        }
        // Mirror identity into SharedPreferences and start/stop the duty
        // service so the Java background path knows who is signed in.
        pushNativeState(profile, listenerRole).catch(() => {});

        if (isNativeApp()) {
          // Native builds get their FCM token from Play Services, not from the
          // web VAPID flow — the service worker is disabled inside the app.
          getNativeFcmToken()
            .then((token) => { if (token) saveFcmToken(fbUser.uid, token); })
            .catch(() => {});
        } else {
          // Initialize FCM push token for this device (async, non-blocking)
          requestBrowserNotificationPermission().then((granted) => {
            if (granted) {
              initFcmMessaging(fbUser.uid).catch(() => {});
            }
          });
        }
      } else {
        setUser(null);
        fallbackStore.currentUserId = null;
        fallbackStore.teardownListeners(); // Clean up all listeners on logout
      }
      authReady = true;
      maybeFinishLoading();
    });

    return () => {
      clearTimeout(safetyTimer);
      unsubscribeStore();
      unsubscribeAuth();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const enableCommuterHelperWithLocation = async (): Promise<boolean> => {
    if (!user) return false;

    try {
      // Use native GPS for maximum accuracy — falls back to browser geolocation on web
      const pos = await getNativePosition({ enableHighAccuracy: true, timeout: 12000, maximumAge: 0 });

      const updatedUser: UserProfile = {
        ...user,
        isHelper: true,
        helperType: user.helperType || 'commuter',
        lastActiveMode: 'helper',
        helperLocation: {
          ...(user.helperLocation || { address: 'Current Position' }),
          lat: pos.lat,
          lng: pos.lng,
          updatedAt: new Date().toISOString(),
        },
      };
      setUser(updatedUser);
      fallbackStore.saveUser(updatedUser);
      setActiveModeState('helper');
      saveActiveMode('helper');
      // Seed the geofence with the position we just obtained, so the very first
      // order is matched against a real fix rather than a stale one.
      pushNativeState(updatedUser, 'helper').catch(() => {});
      return true;
    } catch (err: any) {
      console.warn('[AuthContext] Commuter helper location error:', err?.message);
      // If permission denied, return false so caller can show the permission modal
      if (err?.message?.includes('denied') || err?.code === 1) {
        return false;
      }
      // For non-denial errors (timeout/unavailable), still allow helper mode switch
      const updatedUser: UserProfile = {
        ...user,
        isHelper: true,
        helperType: user.helperType || 'commuter',
        lastActiveMode: 'helper',
      };
      setUser(updatedUser);
      fallbackStore.saveUser(updatedUser);
      setActiveModeState('helper');
      saveActiveMode('helper');
      return true;
    }
  };

  const setActiveMode = (mode: ActiveMode) => {
    if (user && user.isAdmin) {
      setActiveModeState('admin');
      saveActiveMode('admin');
      return;
    }
    // Approved stores are locked into store mode
    if (user && user.isStoreApproved) {
      setActiveModeState('store');
      saveActiveMode('store');
      return;
    }
    if (mode === 'helper' && user && !user.isHelper) {
      enableCommuterHelperWithLocation();
      return;
    }
    setActiveModeState(mode);
    saveActiveMode(mode);
    if (user) {
      const updated = { ...user, lastActiveMode: mode, isHelper: mode === 'helper' ? true : user.isHelper };
      setUser(updated);
      fallbackStore.saveUser(updated);

      // Switch Firestore listeners to match the new active mode (customer ⇔ helper ⇔ store)
      if (mode === 'customer' || mode === 'helper' || mode === 'store') {
        fallbackStore.initListenersForRole(mode, user.uid, user.helperType, user.storeId);
        // Java listens on a role-scoped query too, so it has to follow the same
        // switch — otherwise a helper going off-mode keeps receiving alerts.
        pushNativeState(updated, mode).catch(() => {});
      }

      // When switching to helper mode, get native GPS location for maximum accuracy
      if (mode === 'helper') {
        getNativePosition({ enableHighAccuracy: true, timeout: 10000, maximumAge: 0 })
          .then((pos) => {
            updateHelperLocation({ lat: pos.lat, lng: pos.lng });
          })
          .catch((err) => console.warn('[AuthContext] Helper mode location note:', err?.message));
      }
    }
  };

  const loginWithGoogle = async (roleOverride?: 'customer' | 'helper' | 'admin') => {
    try {
      setLoading(true);

      // Demo / test login shortcuts (no real Firebase call)
      if (roleOverride) {
        let demoProfile: UserProfile;
        if (roleOverride === 'helper') {
          demoProfile = {
            uid: 'demo-helper-uid',
            email: 'helper@jamanot.com',
            displayName: 'Kamrul Rider (Helper)',
            photoURL: undefined,
            role: 'helper',
            isHelper: true,
            isAdmin: false,
            isSuperAdmin: false,
            lastActiveMode: 'helper',
            createdAt: new Date().toISOString(),
          };
        } else if (roleOverride === 'admin') {
          demoProfile = {
            uid: 'demo-admin-uid',
            email: 'ajnasim72@gmail.com',
            displayName: 'Super Admin (ajnasim72@gmail.com)',
            photoURL: undefined,
            role: 'admin',
            isHelper: false,
            isAdmin: true,
            isSuperAdmin: true,
            lastActiveMode: 'admin',
            createdAt: new Date().toISOString(),
          };
        } else {
          demoProfile = {
            uid: 'demo-customer-uid',
            email: 'customer@jamanot.com',
            displayName: 'Anisur Rahman (Customer)',
            photoURL: undefined,
            role: 'customer',
            isHelper: false,
            isAdmin: false,
            isSuperAdmin: false,
            lastActiveMode: 'customer',
            createdAt: new Date().toISOString(),
          };
        }
        fallbackStore.saveUser(demoProfile);
        setUser(demoProfile);
        // Tell the Firestore notification listener which user is on this device
        fallbackStore.currentUserId = demoProfile.uid;
        // Initialize role-scoped listeners for demo user
        const demoRole: 'customer' | 'helper' | 'admin' = demoProfile.isAdmin
          ? 'admin'
          : demoProfile.isHelper
          ? 'helper'
          : 'customer';
        fallbackStore.initListenersForRole(demoRole, demoProfile.uid, demoProfile.helperType);
        // Initialize FCM push token for this device & ask permission (async, non-blocking)
        requestBrowserNotificationPermission().then((granted) => {
          if (granted) {
            initFcmMessaging(demoProfile.uid).catch(() => {});
          }
        });
        setActiveMode(demoProfile.lastActiveMode);
        setLoading(false);
        return;
      }

      // ─── Native (Capacitor) ───────────────────────────────────────────────
      // signInWithPopup cannot work inside a WebView, so the app uses Android's
      // Credential Manager instead. It returns only a Google ID token; signing
      // the JS SDK in with that keeps onAuthStateChanged as the single source of
      // truth, so everything below this branch is shared with the web path.
      if (isNativeApp()) {
        const { idToken } = await nativeGoogleSignIn();
        const nativeRes = await signInWithCredential(
          auth,
          GoogleAuthProvider.credential(idToken)
        );
        if (nativeRes.user) {
          const savedMode = getSavedActiveMode();
          const profile = buildProfile(nativeRes.user, savedMode);
          applyProfile(profile, savedMode);
        }
        setLoading(false);
        return;
      }

      // ─── Web (unchanged) ──────────────────────────────────────────────────
      // Use popup on all devices (desktop & mobile). Mobile browsers support popups
      // triggered by a direct user gesture. The redirect flow was unreliable on mobile
      // (getRedirectResult failing silently due to cookie/storage restrictions).
      const res = await signInWithPopup(auth, googleProvider);
      if (res.user) {
        const savedMode = getSavedActiveMode();
        const profile = buildProfile(res.user, savedMode);
        applyProfile(profile, savedMode);

        // Ask browser notification permission immediately after login
        requestBrowserNotificationPermission().then((granted) => {
          if (granted) {
            initFcmMessaging(res.user.uid).catch(() => {});
          }
        });
      }
      setLoading(false);
    } catch (err: any) {
      console.warn('[Auth] Google login error:', err?.code, err?.message);
      // The native account chooser rejects with CANCELLED when dismissed —
      // an ordinary user action, not something to alert about.
      if (err?.code === 'CANCELLED' || err?.message === 'Sign-in cancelled') {
        setLoading(false);
        return;
      }
      if (err?.code === 'auth/popup-blocked' || err?.code === 'auth/popup-closed-by-user') {
        // Popup was blocked even on desktop — fall back silently to redirect.
        console.info('[Auth] Popup blocked, falling back to redirect.');
        await signInWithRedirect(auth, googleProvider);
        // Browser navigates away, no further code runs.
      } else if (err?.code === 'auth/unauthorized-domain') {
        if (typeof window !== 'undefined' && (window as any).showCustomAlert) {
          (window as any).showCustomAlert(
            'Domain Not Authorized!',
            `Your domain is not in Firebase Authorized Domains.\n\nAdd it in Firebase Console → Authentication → Settings → Authorized domains.`,
            'error'
          );
        } else {
          alert(
            `Domain Not Authorized!\n\nYour domain is not in Firebase Authorized Domains.\n\nAdd it in Firebase Console → Authentication → Settings → Authorized domains.`
          );
        }
        setLoading(false);
      } else if (err?.code && err.code !== 'auth/cancelled-popup-request') {
        if (typeof window !== 'undefined' && (window as any).showCustomAlert) {
          (window as any).showCustomAlert('Login failed', err.message || err.code, 'error');
        } else {
          alert(`Login failed: ${err.message || err.code}`);
        }
        setLoading(false);
      } else {
        setLoading(false);
      }
    }
  };

  const logout = async () => {
    try {
      await firebaseSignOut(auth);
    } catch (e) {
      // Ignored
    }
    // Both sessions must go. The native FirebaseAuth session is what the Java
    // Firestore listener authenticates with, so leaving it signed in would keep
    // the duty service running as the previous user.
    if (isNativeApp()) {
      await nativeGoogleSignOut().catch(() => {});
      await pushNativeState(null, 'customer').catch(() => {});
    }
    setUser(null);
    fallbackStore.currentUserId = null;
    fallbackStore.teardownListeners(); // Stop all Firestore listeners on logout
    setActiveModeState('customer');
  };

  const submitHelperApplication = async (appData: Omit<HelperApplication, 'id' | 'userId' | 'userName' | 'status' | 'createdAt'>) => {
    if (!user) return;
    const newApp: HelperApplication = {
      ...appData,
      id: `app-${Date.now()}`,
      userId: user.uid,
      userName: user.displayName,
      status: 'PENDING',
      createdAt: new Date().toISOString(),
    };
    await fallbackStore.submitHelperApp(newApp);
  };

  const updateHelperApplication = async (appId: string, updatedFields: Partial<HelperApplication>) => {
    await fallbackStore.updateHelperApp(appId, updatedFields);
  };

  const cancelHelperApplication = async (appId: string) => {
    await fallbackStore.cancelHelperApp(appId);
  };

  const submitStoreApplication = async (
    appData: Omit<StoreApplication, 'id' | 'userId' | 'userName' | 'userEmail' | 'status' | 'createdAt'>
  ) => {
    if (!user) return;
    const newApp: StoreApplication = {
      ...appData,
      id: `store-app-${Date.now()}`,
      userId: user.uid,
      userName: user.displayName,
      userEmail: user.email || '',
      status: 'PENDING',
      createdAt: new Date().toISOString(),
    };
    await fallbackStore.submitStoreApp(newApp);
  };

  const cancelStoreApplication = async (appId: string) => {
    await fallbackStore.cancelStoreApp(appId);
  };

  const updateCustomerPreferences = (altPhone?: string, defaultDeliveryLocation?: any, missingItemPref?: any) => {
    if (!user) return;
    const updated = {
      ...user,
      alternativePhone: altPhone !== undefined ? altPhone : user.alternativePhone,
      defaultDeliveryLocation: defaultDeliveryLocation || user.defaultDeliveryLocation,
      missingItemPreference: missingItemPref || user.missingItemPreference,
    };
    setUser(updated);
    fallbackStore.saveUser(updated);
  };

  const updateHelperLocation = (loc: { lat: number; lng: number; address?: string }) => {
    if (!user) return;
    const helperLoc = {
      ...loc,
      address: loc.address || user.helperLocation?.address || 'Current Position',
      updatedAt: new Date().toISOString(),
    };
    const updated = {
      ...user,
      helperLocation: helperLoc,
    };
    setUser(updated);
    fallbackStore.saveUser(updated);
    // While the app is open the WebView has the better fix; hand it to Java so
    // the two agree if the app is backgrounded a moment later.
    if (isNativeApp()) {
      syncNativeUserState({ lat: helperLoc.lat, lng: helperLoc.lng }).catch(() => {});
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        activeMode,
        setActiveMode,
        enableCommuterHelperWithLocation,
        loginWithGoogle,
        logout,
        submitHelperApplication,
        updateHelperApplication,
        cancelHelperApplication,
        submitStoreApplication,
        cancelStoreApplication,
        updateCustomerPreferences,
        updateHelperLocation,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
