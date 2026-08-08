'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { UserProfile, ActiveMode, HelperApplication } from '@/types';
import { auth, googleProvider, fallbackStore } from '@/lib/firebase';
import {
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut as firebaseSignOut,
  onAuthStateChanged,
} from 'firebase/auth';
import { getSavedActiveMode, saveActiveMode } from '@/lib/storage';

interface AuthContextType {
  user: UserProfile | null;
  loading: boolean;
  activeMode: ActiveMode;
  setActiveMode: (mode: ActiveMode) => void;
  loginWithGoogle: (roleOverride?: 'customer' | 'helper' | 'admin') => Promise<void>;
  logout: () => Promise<void>;
  submitHelperApplication: (appData: Omit<HelperApplication, 'id' | 'userId' | 'userName' | 'status' | 'createdAt'>) => Promise<void>;
  updateCustomerPreferences: (altPhone?: string, defaultDeliveryLocation?: any, missingItemPref?: any) => void;
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



export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [activeMode, setActiveModeState] = useState<ActiveMode>('customer');

  const buildProfile = (fbUser: import('firebase/auth').User, savedMode: ActiveMode): UserProfile => {
    const isAdmin = isUserAdminEmail(fbUser.email);
    const isSuperAdmin = isUserSuperAdminEmail(fbUser.email);
    let profile = fallbackStore.users.get(fbUser.uid);

    if (!profile) {
      profile = {
        uid: fbUser.uid,
        email: fbUser.email || '',
        displayName: fbUser.displayName || 'Customer User',
        photoURL: fbUser.photoURL || undefined,
        role: isAdmin ? 'admin' : 'customer',
        isHelper: false,
        isAdmin: isAdmin,
        isSuperAdmin: isSuperAdmin,
        lastActiveMode: isAdmin ? 'admin' : savedMode,
        createdAt: new Date().toISOString(),
      };
      fallbackStore.saveUser(profile);
    } else if (isAdmin && (!profile.isAdmin || profile.role !== 'admin' || (isSuperAdmin && !profile.isSuperAdmin))) {
      profile = {
        ...profile,
        isAdmin: true,
        isSuperAdmin: isSuperAdmin,
        role: 'admin',
        lastActiveMode: 'admin',
      };
      fallbackStore.saveUser(profile);
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

    // Flags: loading resolves once BOTH the auth listener fires AND redirect check is done.
    let authReady = false;
    let redirectReady = false;
    const maybeFinishLoading = () => {
      if (authReady && redirectReady) {
        setLoading(false);
      }
    };

    // Safety net: if Firebase stalls for any reason, unblock after 6s
    const safetyTimer = setTimeout(() => {
      authReady = true;
      redirectReady = true;
      maybeFinishLoading();
    }, 6000);

    // Check if returning from a signInWithRedirect
    getRedirectResult(auth)
      .then((result) => {
        if (result?.user) {
          const profile = buildProfile(result.user, savedMode);
          applyProfile(profile, savedMode);
        }
      })
      .catch((err: any) => {
        console.warn('[Auth] getRedirectResult error:', err?.code, err?.message);
        if (err?.code === 'auth/unauthorized-domain') {
          alert(
            `Domain Not Authorized!\n\nYour domain is not added to Firebase Authorized Domains.\n\nPlease add it in Firebase Console → Authentication → Settings → Authorized domains.`
          );
        }
      })
      .finally(() => {
        redirectReady = true;
        maybeFinishLoading();
      });

    // Firebase Auth state listener
    const unsubscribeAuth = onAuthStateChanged(auth, (fbUser) => {
      if (fbUser) {
        const profile = buildProfile(fbUser, savedMode);
        applyProfile(profile, savedMode);
      } else {
        setUser(null);
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

  const setActiveMode = (mode: ActiveMode) => {
    setActiveModeState(mode);
    saveActiveMode(mode);
    if (user) {
      const updated = { ...user, lastActiveMode: mode };
      setUser(updated);
      fallbackStore.saveUser(updated);
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

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        activeMode,
        setActiveMode,
        loginWithGoogle,
        logout,
        submitHelperApplication,
        updateCustomerPreferences,
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
