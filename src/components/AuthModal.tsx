'use client';

import React, { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { fallbackStore } from '@/lib/firebase';
import { X, Mail, Lock, User, LogIn, UserPlus, AlertCircle } from 'lucide-react';
import { AsyncButton } from './ui/AsyncButton';

export const AuthModal: React.FC = () => {
  const {
    isAuthModalOpen,
    closeAuthModal,
    loginWithGoogle,
    loginWithEmail,
    registerWithEmail,
  } = useAuth();

  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Read pricingSettings dynamically from fallbackStore
  const manualAuthEnabled = fallbackStore.pricingSettings.manualAuthEnabled !== false;

  if (!isAuthModalOpen || !manualAuthEnabled) return null;

  const handleGoogleSignIn = async () => {
    setErrorMessage(null);
    try {
      await loginWithGoogle();
      closeAuthModal();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Google লগইন করতে ব্যর্থ হয়েছে।');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!email.trim() || !password.trim()) {
      setErrorMessage('অনুগ্রহ করে ইমেইল এবং পাসওয়ার্ড প্রবেশ করান।');
      return;
    }

    if (authMode === 'register' && !displayName.trim()) {
      setErrorMessage('অনুগ্রহ করে আপনার পুরো নাম প্রদান করুন।');
      return;
    }

    if (password.length < 6) {
      setErrorMessage('পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে।');
      return;
    }

    setIsSubmitting(true);
    try {
      if (authMode === 'login') {
        await loginWithEmail(email, password);
      } else {
        await registerWithEmail(email, password, displayName);
      }
      closeAuthModal();
      // Reset state
      setEmail('');
      setPassword('');
      setDisplayName('');
    } catch (err: any) {
      console.error('[AuthModal] Error:', err);
      let msg = err?.message || 'প্রসেসটি সম্পন্ন করা সম্ভব হয়নি।';
      if (err?.code === 'auth/wrong-password' || err?.code === 'auth/user-not-found' || err?.code === 'auth/invalid-credential') {
        msg = 'ইমেইল অথবা পাসওয়ার্ড সঠিক নয়।';
      } else if (err?.code === 'auth/email-already-in-use') {
        msg = 'এই ইমেইলটি ইতিমধ্যে নিবন্ধিত হয়েছে। লগইন করার চেষ্টা করুন।';
      } else if (err?.code === 'auth/invalid-email') {
        msg = 'সঠিক ইমেইল ঠিকানা প্রদান করুন।';
      } else if (err?.code === 'auth/weak-password') {
        msg = 'পাসওয়ার্ড আরও শক্তিশালী হতে হবে (কমপক্ষে ৬ অক্ষর)।';
      }
      setErrorMessage(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden border border-gray-100 transform transition-all duration-200">
        
        {/* Header */}
        <div className="relative bg-gradient-to-r from-emerald-600 to-teal-700 p-6 text-white text-center">
          <button
            onClick={closeAuthModal}
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
          
          <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-3 backdrop-blur-md">
            <User className="w-6 h-6 text-white" />
          </div>
          
          <h2 className="text-xl font-bold">স্বাগতম জামানতে!</h2>
          <p className="text-xs text-emerald-100 mt-1">
            সেবা শুরু করতে সাইন-ইন বা নতুন অ্যাকাউন্ট তৈরি করুন
          </p>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-5">
          {errorMessage && (
            <div className="flex items-start space-x-2.5 p-3.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-2xl text-xs">
              <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
              <span className="font-medium">{errorMessage}</span>
            </div>
          )}

          {/* Google Login Button */}
          <button
            type="button"
            onClick={handleGoogleSignIn}
            className="w-full flex items-center justify-center space-x-3 py-3.5 px-4 bg-white hover:bg-gray-50 border border-gray-300 rounded-2xl shadow-sm text-sm font-semibold text-gray-700 transition-all transform active:scale-[0.99]"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
              />
              <path
                fill="#34A853"
                d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.15C3.26 21.3 7.31 24 12 24z"
              />
              <path
                fill="#FBBC05"
                d="M5.28 14.24c-.25-.72-.38-1.49-.38-2.24s.13-1.52.38-2.24V6.61H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.39l3.99-3.15z"
              />
              <path
                fill="#EA4335"
                d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.61l3.99 3.15c.95-2.85 3.6-4.96 6.72-4.96z"
              />
            </svg>
            <span>Google দিয়ে প্রবেশ করুন</span>
          </button>

          {/* Manual Auth Form Section (Hidden if Admin turned off manualAuthEnabled) */}
          {manualAuthEnabled && (
            <>
              <div className="relative flex items-center justify-center my-4">
                <div className="border-t border-gray-200 w-full" />
                <span className="bg-white px-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  অথবা ইমেইল দিয়ে
                </span>
                <div className="border-t border-gray-200 w-full" />
              </div>

              {/* Mode Switcher Tabs */}
              <div className="grid grid-cols-2 p-1 bg-gray-100 rounded-2xl">
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('login');
                    setErrorMessage(null);
                  }}
                  className={`py-2 text-xs font-bold rounded-xl transition-all ${
                    authMode === 'login'
                      ? 'bg-white text-emerald-700 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  লগইন (Login)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('register');
                    setErrorMessage(null);
                  }}
                  className={`py-2 text-xs font-bold rounded-xl transition-all ${
                    authMode === 'register'
                      ? 'bg-white text-emerald-700 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  রেজিস্ট্রেশন (Register)
                </button>
              </div>

              {/* Form */}
              <form onSubmit={handleSubmit} className="space-y-3.5">
                {authMode === 'register' && (
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">
                      আপনার নাম (Full Name)
                    </label>
                    <div className="relative">
                      <User className="absolute left-3.5 top-3 w-4 h-4 text-gray-400" />
                      <input
                        type="text"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        placeholder="যেমন: আনিসুর রহমান"
                        required
                        className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium focus:bg-white focus:border-emerald-500 outline-none transition-all"
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    ইমেইল ঠিকানা (Email)
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-3 w-4 h-4 text-gray-400" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="name@example.com"
                      required
                      className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium focus:bg-white focus:border-emerald-500 outline-none transition-all"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    পাসওয়ার্ড (Password)
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-3 w-4 h-4 text-gray-400" />
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      required
                      minLength={6}
                      className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium focus:bg-white focus:border-emerald-500 outline-none transition-all"
                    />
                  </div>
                </div>

                <AsyncButton
                  type="submit"
                  isLoading={isSubmitting}
                  className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold shadow-md shadow-emerald-600/20 transition-all flex items-center justify-center space-x-2"
                >
                  {authMode === 'login' ? (
                    <>
                      <LogIn className="w-4 h-4" />
                      <span>লগইন করুন</span>
                    </>
                  ) : (
                    <>
                      <UserPlus className="w-4 h-4" />
                      <span>রেজিস্টার করুন</span>
                    </>
                  )}
                </AsyncButton>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
