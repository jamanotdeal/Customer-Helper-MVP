'use client';

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeft, FileText, CheckCircle2, ShieldAlert, CreditCard, Scale, HelpCircle } from 'lucide-react';

export default function TermsOfService() {
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
              <FileText className="w-4 h-4 text-emerald-600" />
              <span>Terms & Guidelines</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">
              Terms of Service
            </h1>
            <p className="text-xs sm:text-sm text-gray-500 mt-2">
              Last updated: August 2026 | Applies to all customers and helpers using Jamanot.
            </p>
          </div>

          {/* Terms Content */}
          <div className="prose prose-emerald text-xs sm:text-sm text-gray-600 leading-relaxed space-y-6">
            <section className="space-y-3">
              <div className="flex items-center space-x-2 font-bold text-gray-900 text-base sm:text-lg">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                <h2>1. Acceptance of Terms</h2>
              </div>
              <p>
                By accessing or using the Jamanot platform (&quot;App&quot;, &quot;Service&quot;, &quot;Jamanot&quot;), you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use our services.
              </p>
            </section>

            <section className="space-y-3">
              <div className="flex items-center space-x-2 font-bold text-gray-900 text-base sm:text-lg">
                <FileText className="w-5 h-5 text-emerald-600" />
                <h2>2. Platform Services Overview</h2>
              </div>
              <p>
                Jamanot connects customers requiring errand assistance, item purchasing, or local delivery with nearby independent helpers (&quot;Helpers&quot;). Jamanot acts as an intermediary platform facilitating request matching, live status tracking, and delivery communication.
              </p>
            </section>

            <section className="space-y-3">
              <div className="flex items-center space-x-2 font-bold text-gray-900 text-base sm:text-lg">
                <ShieldAlert className="w-5 h-5 text-emerald-600" />
                <h2>3. Customer & Helper Responsibilities</h2>
              </div>
              <p>Users must adhere to the following rules:</p>
              <ul className="list-disc pl-5 space-y-1.5 text-gray-600">
                <li>
                  <strong className="text-gray-800">Accurate Information:</strong> Customers must provide clear item descriptions, accurate delivery addresses, and valid WhatsApp phone numbers.
                </li>
                <li>
                  <strong className="text-gray-800">Prohibited Items:</strong> Requesting illegal items, controlled substances, hazardous materials, weapons, or unlawful goods is strictly prohibited.
                </li>
                <li>
                  <strong className="text-gray-800">Helper Verification:</strong> Helpers must provide truthful information during registration, maintain professional conduct, and verify items with customers prior to purchase.
                </li>
              </ul>
            </section>

            <section className="space-y-3">
              <div className="flex items-center space-x-2 font-bold text-gray-900 text-base sm:text-lg">
                <CreditCard className="w-5 h-5 text-emerald-600" />
                <h2>4. Pricing, Costs & Cash Settlements</h2>
              </div>
              <p>
                Product costs are updated by helpers upon purchasing items. Delivery fees are determined dynamically based on product total value and distance. Customers agree to pay the total cost (Product Cost + Delivery Fee) upon successful delivery.
              </p>
            </section>

            <section className="space-y-3">
              <div className="flex items-center space-x-2 font-bold text-gray-900 text-base sm:text-lg">
                <Scale className="w-5 h-5 text-emerald-600" />
                <h2>5. Account Suspension & Liability</h2>
              </div>
              <p>
                Jamanot reserves the right to suspend or terminate any user account (Customer or Helper) violating platform policies, engaging in fraudulent activity, or displaying inappropriate conduct. Jamanot is not liable for indirect damages or delays caused by third-party events beyond reasonable control.
              </p>
            </section>

            <section className="space-y-3 pt-2 border-t border-gray-100">
              <div className="flex items-center space-x-2 font-bold text-gray-900 text-base sm:text-lg">
                <HelpCircle className="w-5 h-5 text-emerald-600" />
                <h2>6. Inquiries & Legal Contact</h2>
              </div>
              <p>
                For questions regarding our Terms of Service, please contact our team at{' '}
                <a href="mailto:terms@jamanot.com" className="text-emerald-600 underline font-semibold">
                  terms@jamanot.com
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
            <Link href="/terms" className="text-emerald-700 font-bold hover:underline">
              Terms of Service
            </Link>
            <Link href="/privacy" className="hover:text-emerald-700 transition-colors">
              Privacy Policy
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
