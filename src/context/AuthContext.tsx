'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { UserProfile, ActiveMode, HelperApplication } from '@/types';
import { auth, googleProvider, fallbackStore } from '@/lib/firebase';
import { signInWithPopup, signOut as firebaseSignOut, onAuthStateChanged } from 'firebase/auth';
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

  useEffect(() => {
    // Initial sync with stored mode
    const savedMode = getSavedActiveMode();
    setActiveModeState(savedMode);

    // Sync with fallback store updates
    const unsubscribeStore = fallbackStore.subscribe(() => {
      setUser((prevUser) => {
        if (!prevUser) return null;
        const updatedUser = fallbackStore.users.get(prevUser.uid);
        return updatedUser ? { ...updatedUser } : prevUser;
      });
    });

    // Firebase Auth listener - starts logged out unless authenticated
    const unsubscribeAuth = onAuthStateChanged(auth, (fbUser) => {
      if (fbUser) {
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

        setUser(profile);
        if (isAdmin) {
          setActiveModeState('admin');
          saveActiveMode('admin');
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    setLoading(false);

    return () => {
      unsubscribeStore();
      unsubscribeAuth();
    };
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
      
      // If roleOverride is passed directly (testing / demo login selection)
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
        return;
      }

      // Standard Google Auth Popup
      const res = await signInWithPopup(auth, googleProvider);
      if (res.user) {
        const isAdmin = isUserAdminEmail(res.user.email);
        const isSuperAdmin = isUserSuperAdminEmail(res.user.email);
        let profile = fallbackStore.users.get(res.user.uid);

        if (!profile) {
          profile = {
            uid: res.user.uid,
            email: res.user.email || '',
            displayName: res.user.displayName || 'User',
            photoURL: res.user.photoURL || undefined,
            role: isAdmin ? 'admin' : 'customer',
            isHelper: false,
            isAdmin: isAdmin,
            isSuperAdmin: isSuperAdmin,
            lastActiveMode: isAdmin ? 'admin' : 'customer',
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

        setUser(profile);
        if (isAdmin) {
          setActiveMode('admin');
        } else {
          setActiveMode(profile.isHelper && profile.lastActiveMode === 'helper' ? 'helper' : 'customer');
        }
      }
    } catch (err) {
      console.warn('Google Popup Auth login cancelled or failed.', err);
    } finally {
      setLoading(false);
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
