'use client';

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeft, Shield, Lock, Eye, FileText, Database, UserCheck, Mail } from 'lucide-react';

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col">
      {/* Header Bar */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-emerald-100 shadow-sm px-4 py-3">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center space-x-3 group">
            <div className="relative w-9 h-9 rounded-none overflow-hidden shadow-xs border border-emerald-200 bg-emerald-50">
              <Image
                src="/Jamanot-Logo.png"
                alt="Jamanot Logo"
                fill
                className="object-cover"
              />
            </div>
            <div>
              <span className="font-extrabold text-lg tracking-tight text-gray-900 group-hover:text-emerald-700 transition-colors">
                Jamanot
              </span>
              <p className="text-[10px] font-medium text-emerald-700">Ask. Relax. Done.</p>
            </div>
          </Link>

          <Link
            href="/"
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-800 hover:bg-emerald-100 text-xs font-bold transition-all"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to App</span>
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-4xl w-full mx-auto p-4 sm:p-6 md:p-8">
        <div className="bg-white rounded-3xl border border-emerald-100 p-6 sm:p-10 shadow-sm space-y-8">
          {/* Hero Banner */}
          <div className="border-b border-gray-100 pb-6">
            <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-emerald-50 text-emerald-800 text-xs font-bold mb-3">
              <Shield className="w-4 h-4 text-emerald-600" />
              <span>Legal & Transparency</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">
              Privacy Policy
            </h1>
            <p className="text-xs sm:text-sm text-gray-500 mt-2">
              Last updated: August 2026 | Effective immediately for all Jamanot users.
            </p>
          </div>

          {/* Overview */}
          <div className="prose prose-emerald text-xs sm:text-sm text-gray-600 leading-relaxed space-y-6">
            <section className="space-y-3">
              <div className="flex items-center space-x-2 font-bold text-gray-900 text-base sm:text-lg">
                <Lock className="w-5 h-5 text-emerald-600" />
                <h2>1. Commitment to Privacy</h2>
              </div>
              <p>
                At Jamanot (&quot;we&quot;, &quot;our&quot;, or &quot;us&quot;), we take your personal data privacy seriously. This Privacy Policy explains how we collect, use, store, and protect your information when you use our web application and services to request or fulfill errands and delivery tasks.
              </p>
            </section>

            <section className="space-y-3">
              <div className="flex items-center space-x-2 font-bold text-gray-900 text-base sm:text-lg">
                <Eye className="w-5 h-5 text-emerald-600" />
                <h2>2. Information We Collect</h2>
              </div>
              <p>We collect information necessary to provide, manage, and improve our services:</p>
              <ul className="list-disc pl-5 space-y-1.5 text-gray-600">
                <li>
                  <strong className="text-gray-800">Account & Profile Information:</strong> When you sign in with Google, we store your full name, email address, and profile photo URL.
                </li>
                <li>
                  <strong className="text-gray-800">Contact & Contact Numbers:</strong> Primary mobile phone number, WhatsApp contact number, and emergency or alternative contact numbers provided during request submission.
                </li>
                <li>
                  <strong className="text-gray-800">Order & Request Data:</strong> Items requested, missing item preferences, pickup shop details, special notes, and item prices.
                </li>
                <li>
                  <strong className="text-gray-800">Location Data:</strong> Geographical coordinates (latitude/longitude) and delivery text addresses provided or detected via device location services to connect nearby helpers.
                </li>
                <li>
                  <strong className="text-gray-800">Helper Verification Data:</strong> For users applying as helpers, we collect NID/Identity numbers, WhatsApp contact, Facebook profile link, vehicle details, and application status.
                </li>
              </ul>
            </section>

            <section className="space-y-3">
              <div className="flex items-center space-x-2 font-bold text-gray-900 text-base sm:text-lg">
                <Database className="w-5 h-5 text-emerald-600" />
                <h2>3. How We Use Your Information</h2>
              </div>
              <p>Your information is processed strictly for legitimate operational purposes:</p>
              <ul className="list-disc pl-5 space-y-1.5 text-gray-600">
                <li>To enable request creation, matching with nearby verified helpers, and order tracking.</li>
                <li>To calculate fair, dynamic delivery fees based on order cost and distance.</li>
                <li>To facilitate direct communication (phone/WhatsApp) between customer and helper during active orders.</li>
                <li>To process helper earnings, wallet balances, and withdrawal requests.</li>
                <li>To send notification updates regarding order statuses and platform updates.</li>
              </ul>
            </section>

            <section className="space-y-3">
              <div className="flex items-center space-x-2 font-bold text-gray-900 text-base sm:text-lg">
                <FileText className="w-5 h-5 text-emerald-600" />
                <h2>4. Data Sharing & Security</h2>
              </div>
              <p>
                We do <strong className="text-gray-800">never sell or rent</strong> your personal data to third parties. Information is shared strictly when required to fulfill services:
              </p>
              <ul className="list-disc pl-5 space-y-1.5 text-gray-600">
                <li>
                  <strong className="text-gray-800">With Assigned Helpers:</strong> Your delivery address, item details, and contact number are visible to the assigned helper solely for order fulfillment.
                </li>
                <li>
                  <strong className="text-gray-800">Cloud Infrastructure:</strong> Data is securely stored using Firebase Authentication and cloud databases with industry-standard encryption protocols.
                </li>
                <li>
                  <strong className="text-gray-800">Legal Compliance:</strong> We may disclose information if required by law, regulation, or valid legal process.
                </li>
              </ul>
            </section>

            <section className="space-y-3">
              <div className="flex items-center space-x-2 font-bold text-gray-900 text-base sm:text-lg">
                <UserCheck className="w-5 h-5 text-emerald-600" />
                <h2>5. Your Rights & Choices</h2>
              </div>
              <p>You have rights regarding your personal data:</p>
              <ul className="list-disc pl-5 space-y-1.5 text-gray-600">
                <li>Access and review your account details and request history anytime.</li>
                <li>Update your preferred contact numbers and saved delivery locations.</li>
                <li>Request account deactivation or data removal by contacting support.</li>
              </ul>
            </section>

            <section className="space-y-3 pt-2 border-t border-gray-100">
              <div className="flex items-center space-x-2 font-bold text-gray-900 text-base sm:text-lg">
                <Mail className="w-5 h-5 text-emerald-600" />
                <h2>6. Contact & Support</h2>
              </div>
              <p>
                If you have any questions, concerns, or privacy inquiries, please reach out to us at{' '}
                <a href="mailto:support@jamanot.com" className="text-emerald-600 underline font-semibold">
                  support@jamanot.com
                </a>.
              </p>
            </section>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-emerald-100 py-6 px-4 text-center text-xs text-gray-500">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          <p>© {new Date().getFullYear()} Jamanot. All rights reserved.</p>
          <div className="flex items-center space-x-4">
            <Link href="/" className="hover:text-emerald-700 transition-colors">
              Home
            </Link>
            <Link href="/terms" className="hover:text-emerald-700 transition-colors">
              Terms of Service
            </Link>
            <Link href="/privacy" className="text-emerald-700 font-bold hover:underline">
              Privacy Policy
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
