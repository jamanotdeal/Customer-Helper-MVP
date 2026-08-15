'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { UserProfile, ActiveMode, HelperApplication } from '@/types';
import { auth, googleProvider, fallbackStore, initFcmMessaging, requestBrowserNotificationPermission } from '@/lib/firebase';
import {
  signInWithPopup,
  signInWithRedirect,
  signOut as firebaseSignOut,
  onAuthStateChanged,
} from 'firebase/auth';
import { getSavedActiveMode, saveActiveMode } from '@/lib/storage';

interface AuthContextType {
  user: UserProfile | null;
  loading: boolean;
  activeMode: ActiveMode;
  setActiveMode: (mode: ActiveMode) => void;
  enableCommuterHelperWithLocation: () => Promise<boolean>;
  loginWithGoogle: (roleOverride?: 'customer' | 'helper' | 'admin') => Promise<void>;
  logout: () => Promise<void>;
  submitHelperApplication: (appData: Omit<HelperApplication, 'id' | 'userId' | 'userName' | 'status' | 'createdAt'>) => Promise<void>;
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
        lastActiveMode: isAdmin ? 'admin' : savedMode,
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
    } else {
      const targetMode = profile.isHelper && profile.lastActiveMode === 'helper' ? 'helper' : (savedMode || 'customer');
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
    const unsubscribeAuth = onAuthStateChanged(auth, (fbUser) => {
      if (fbUser) {
        const profile = buildProfile(fbUser, savedMode);
        applyProfile(profile, savedMode);
        // Tell the Firestore notification listener which user is on this device
        fallbackStore.currentUserId = fbUser.uid;
        // Initialize FCM push token for this device (async, non-blocking)
        requestBrowserNotificationPermission().then((granted) => {
          if (granted) {
            initFcmMessaging(fbUser.uid).catch(() => {});
          }
        });
      } else {
        setUser(null);
        fallbackStore.currentUserId = null;
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
    if (typeof navigator === 'undefined' || !navigator.geolocation) return false;

    // Check if permission was already granted in browser
    const permState = await checkLocationPermissionState();

    if (permState === 'granted') {
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

      // Refresh position in background non-blocking
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          updateHelperLocation({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          });
        },
        (err) => console.warn('[AuthContext] Background location refresh note:', err?.message),
        { enableHighAccuracy: true, timeout: 10000 }
      );
      return true;
    }

    // Permission state is 'prompt' or unknown — trigger geolocation request
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          const updatedUser: UserProfile = {
            ...user,
            isHelper: true,
            helperType: user.helperType || 'commuter',
            lastActiveMode: 'helper',
            helperLocation: {
              ...(user.helperLocation || { address: 'Current Position' }),
              lat,
              lng,
              updatedAt: new Date().toISOString(),
            },
          };
          setUser(updatedUser);
          fallbackStore.saveUser(updatedUser);
          setActiveModeState('helper');
          saveActiveMode('helper');
          resolve(true);
        },
        (err) => {
          console.warn('[AuthContext] Commuter helper location permission note:', err?.message);
          if (err.code === err.PERMISSION_DENIED) {
            resolve(false);
          } else {
            // For non-denial errors (timeout/unavailable), allow helper mode switch
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
            resolve(true);
          }
        },
        { enableHighAccuracy: true, timeout: 8000 }
      );
    });
  };

  const setActiveMode = (mode: ActiveMode) => {
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

      // When switching to helper mode, immediately ask location permission & update position
      if (mode === 'helper' && typeof navigator !== 'undefined' && navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            updateHelperLocation({
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
            });
          },
          (err) => console.warn('[AuthContext] Helper mode location permission note:', err?.message),
          { enableHighAccuracy: true, timeout: 10000 }
        );
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
      if (err?.code === 'auth/popup-blocked' || err?.code === 'auth/popup-closed-by-user') {
        // Popup was blocked even on desktop — fall back silently to redirect.
        console.info('[Auth] Popup blocked, falling back to redirect.');
        await signInWithRedirect(auth, googleProvider);
        // Browser navigates away, no further code runs.
      } else if (err?.code === 'auth/unauthorized-domain') {
        alert(
          `Domain Not Authorized!\n\nYour domain is not in Firebase Authorized Domains.\n\nAdd it in Firebase Console → Authentication → Settings → Authorized domains.`
        );
        setLoading(false);
      } else if (err?.code && err.code !== 'auth/cancelled-popup-request') {
        alert(`Login failed: ${err.message || err.code}`);
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
    setUser(null);
    fallbackStore.currentUserId = null;
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
