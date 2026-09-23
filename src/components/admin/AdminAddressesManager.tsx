'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { ServerAddress } from '@/types';
import { fallbackStore } from '@/lib/firebase';
import { useModal } from '../CustomModal';
import { MapPickerModal } from '../MapPickerModal';
import { PaginationControl } from './PaginationControl';
import {
  MapPin,
  Plus,
  Search,
  RefreshCw,
  Edit2,
  Trash2,
  Navigation,
  Globe,
  CheckCircle2,
  ExternalLink,
  Layers,
  Sparkles,
  X,
} from 'lucide-react';
import { formatShortAddress } from '@/utils/mapMarkerUtils';

export const AdminAddressesManager: React.FC = () => {
  const { showAlert, showConfirm } = useModal();

  const [addresses, setAddresses] = useState<ServerAddress[]>(
    Array.from(fallbackStore.serverAddresses.values())
  );
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [coordFilter, setCoordFilter] = useState<'ALL' | 'WITH_COORDS' | 'NO_COORDS'>('ALL');

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Add / Edit Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAddress, setEditingAddress] = useState<ServerAddress | null>(null);
  const [addressInput, setAddressInput] = useState('');
  const [shortNameInput, setShortNameInput] = useState('');
  const [latInput, setLatInput] = useState<string>('');
  const [lngInput, setLngInput] = useState<string>('');
  const [detailsInput, setDetailsInput] = useState('');
  const [formError, setFormError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Map Picker Modal state
  const [isMapPickerOpen, setIsMapPickerOpen] = useState(false);

  // Sync with fallbackStore
  useEffect(() => {
    const sync = () => {
      setAddresses(Array.from(fallbackStore.serverAddresses.values()));
    };
    sync();
    fallbackStore.refreshAdminData('serverAddresses');
    const unsub = fallbackStore.subscribe(sync);
    return () => unsub();
  }, []);

  // Reset pagination on search or filter change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, coordFilter]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await fallbackStore.refreshAdminData('serverAddresses');
      setAddresses(Array.from(fallbackStore.serverAddresses.values()));
    } catch (_) {}
    setIsRefreshing(false);
  };

  // Filtered addresses
  const filteredAddresses = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return addresses.filter((item) => {
      const matchSearch =
        !q ||
        item.address.toLowerCase().includes(q) ||
        (item.shortName && item.shortName.toLowerCase().includes(q)) ||
        (item.details && item.details.toLowerCase().includes(q));

      let matchCoord = true;
      if (coordFilter === 'WITH_COORDS') {
        matchCoord = typeof item.lat === 'number' && typeof item.lng === 'number';
      } else if (coordFilter === 'NO_COORDS') {
        matchCoord = typeof item.lat !== 'number' || typeof item.lng !== 'number';
      }

      return matchSearch && matchCoord;
    }).sort((a, b) => {
      const timeA = new Date(a.updatedAt || a.createdAt || 0).getTime();
      const timeB = new Date(b.updatedAt || b.createdAt || 0).getTime();
      return timeB - timeA;
    });
  }, [addresses, searchQuery, coordFilter]);

  // Paginated addresses slice
  const totalPages = Math.ceil(filteredAddresses.length / pageSize) || 1;
  const paginatedAddresses = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredAddresses.slice(start, start + pageSize);
  }, [filteredAddresses, currentPage, pageSize]);

  // Statistics
  const totalCount = addresses.length;
  const withCoordsCount = addresses.filter((a) => typeof a.lat === 'number' && typeof a.lng === 'number').length;
  const textOnlyCount = totalCount - withCoordsCount;
  const totalUsage = addresses.reduce((sum, a) => sum + (a.usageCount || 1), 0);

  const openAddModal = () => {
    setEditingAddress(null);
    setAddressInput('');
    setShortNameInput('');
    setLatInput('');
    setLngInput('');
    setDetailsInput('');
    setFormError('');
    setIsModalOpen(true);
  };

  const openEditModal = (addr: ServerAddress) => {
    setEditingAddress(addr);
    setAddressInput(addr.address || '');
    setShortNameInput(addr.shortName || '');
    setLatInput(typeof addr.lat === 'number' ? String(addr.lat) : '');
    setLngInput(typeof addr.lng === 'number' ? String(addr.lng) : '');
    setDetailsInput(addr.details || '');
    setFormError('');
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addressInput.trim()) {
      setFormError('ঠিকানা লিখুন (Address is required)');
      return;
    }

    const latNum = latInput.trim() ? parseFloat(latInput.trim()) : undefined;
    const lngNum = lngInput.trim() ? parseFloat(lngInput.trim()) : undefined;

    if (latInput.trim() && isNaN(latNum!)) {
      setFormError('সঠিক Latitude মান লিখুন');
      return;
    }
    if (lngInput.trim() && isNaN(lngNum!)) {
      setFormError('সঠিক Longitude মান লিখুন');
      return;
    }

    setIsSaving(true);
    setFormError('');

    try {
      if (editingAddress) {
        await fallbackStore.updateServerAddress(editingAddress.id, {
          address: addressInput.trim(),
          shortName: shortNameInput.trim() || undefined,
          lat: latNum,
          lng: lngNum,
          details: detailsInput.trim() || undefined,
        });
        showAlert('সফল!', 'ঠিকানা সফলভাবে আপডেট করা হয়েছে।', 'success');
      } else {
        const id = `addr-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        const newAddr: ServerAddress = {
          id,
          address: addressInput.trim(),
          shortName: shortNameInput.trim() || undefined,
          lat: latNum,
          lng: lngNum,
          details: detailsInput.trim() || undefined,
          usageCount: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        await fallbackStore.addServerAddress(newAddr);
        showAlert('সফল!', 'নতুন সার্ভার ঠিকানা যুক্ত করা হয়েছে।', 'success');
      }
      setIsModalOpen(false);
    } catch (err: any) {
      setFormError(err?.message || 'সংরক্ষণ করতে সমস্যা হয়েছে');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (addr: ServerAddress) => {
    const ok = await showConfirm(
      'ঠিকানা মুছুন',
      `আপনি কি নিশ্চিতভাবে "${formatShortAddress(addr.address)}" ঠিকানাটি সার্ভার তালিকা থেকে মুছে ফেলতে চান?`,
      'হ্যাঁ, মুছুন',
      'বাতিল'
    );
    if (!ok) return;

    try {
      await fallbackStore.deleteServerAddress(addr.id);
      showAlert('সফল', 'ঠিকানা মুছে ফেলা হয়েছে।', 'success');
    } catch (_) {
      showAlert('ত্রুটি', 'ঠিকানা মুছতে ব্যর্থ হয়েছে।', 'error');
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* ── Summary Stats ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="p-4 rounded-3xl bg-white border border-gray-100 shadow-sm flex items-center space-x-3">
          <div className="w-10 h-10 rounded-2xl bg-teal-50 text-teal-600 flex items-center justify-center shrink-0">
            <MapPin className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">মোট ঠিকানা</p>
            <p className="text-xl font-extrabold text-gray-900">{totalCount}</p>
          </div>
        </div>

        <div className="p-4 rounded-3xl bg-white border border-gray-100 shadow-sm flex items-center space-x-3">
          <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <Navigation className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">ম্যাপ কোঅর্ডিনেট সহ</p>
            <p className="text-xl font-extrabold text-emerald-700">{withCoordsCount}</p>
          </div>
        </div>

        <div className="p-4 rounded-3xl bg-white border border-gray-100 shadow-sm flex items-center space-x-3">
          <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
            <Globe className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">শুধুমাত্র টেক্সট</p>
            <p className="text-xl font-extrabold text-amber-700">{textOnlyCount}</p>
          </div>
        </div>

        <div className="p-4 rounded-3xl bg-white border border-gray-100 shadow-sm flex items-center space-x-3">
          <div className="w-10 h-10 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">মোট ব্যবহার গণনা</p>
            <p className="text-xl font-extrabold text-purple-700">{totalUsage}</p>
          </div>
        </div>
      </div>

      {/* ── Header Actions & Search ── */}
      <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-gray-100 space-y-4">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="flex items-center space-x-2 flex-1 max-w-md relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="ঠিকানা, শর্ট নেম বা বিস্তারিত লিখে খুঁজুন..."
                className="w-full pl-10 pr-4 py-2.5 rounded-2xl border border-gray-200 bg-gray-50/50 focus:bg-white focus:border-teal-500 outline-none text-xs sm:text-sm font-medium transition-colors"
              />
            </div>

            <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap justify-end">
              {/* Coordinate filter chips */}
              <div className="flex items-center bg-gray-100 p-1 rounded-2xl text-xs font-bold text-gray-600">
                <button
                  type="button"
                  onClick={() => setCoordFilter('ALL')}
                  className={`px-3 py-1.5 rounded-xl transition-all ${
                    coordFilter === 'ALL' ? 'bg-white text-gray-900 shadow-xs' : 'hover:text-gray-900'
                  }`}
                >
                  সব ({totalCount})
                </button>
                <button
                  type="button"
                  onClick={() => setCoordFilter('WITH_COORDS')}
                  className={`px-3 py-1.5 rounded-xl transition-all ${
                    coordFilter === 'WITH_COORDS' ? 'bg-white text-emerald-700 shadow-xs' : 'hover:text-gray-900'
                  }`}
                >
                  📍 ম্যাপ সহ ({withCoordsCount})
                </button>
                <button
                  type="button"
                  onClick={() => setCoordFilter('NO_COORDS')}
                  className={`px-3 py-1.5 rounded-xl transition-all ${
                    coordFilter === 'NO_COORDS' ? 'bg-white text-amber-700 shadow-xs' : 'hover:text-gray-900'
                  }`}
                >
                  টেক্সট ({textOnlyCount})
                </button>
              </div>

              <button
                type="button"
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="p-2.5 rounded-2xl border border-gray-200 hover:bg-gray-50 text-gray-600 transition-colors disabled:opacity-50"
                title="রিফ্রেশ করুন"
              >
                <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-teal-600' : ''}`} />
              </button>

              <button
                type="button"
                onClick={openAddModal}
                className="px-4 py-2.5 rounded-2xl bg-teal-600 hover:bg-teal-700 text-white text-xs sm:text-sm font-extrabold shadow-md shadow-teal-600/20 transition-all flex items-center space-x-1.5 shrink-0 active:scale-98"
              >
                <Plus className="w-4 h-4" />
                <span>নতুন ঠিকানা</span>
              </button>
            </div>
          </div>
        </div>

        {/* ── Paginated Address Table ── */}
        {filteredAddresses.length === 0 ? (
          <div className="text-center py-16 px-4 space-y-2">
            <MapPin className="w-10 h-10 mx-auto text-gray-300" />
            <p className="text-sm font-bold text-gray-700">কোনো ঠিকানা পাওয়া যায়নি</p>
            <p className="text-xs text-gray-400">নতুন ঠিকানা যোগ করতে &quot;নতুন ঠিকানা&quot; বাটনে ক্লিক করুন।</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50/80 border-b border-gray-100 text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                  <th className="py-3 px-4 w-12 text-center">#</th>
                  <th className="py-3 px-4 min-w-[220px]">ঠিকানা (Address)</th>
                  <th className="py-3 px-4 min-w-[140px]">শর্ট নেম / ল্যান্ডমার্ক</th>
                  <th className="py-3 px-4 min-w-[160px]">বিবরণ (Details)</th>
                  <th className="py-3 px-4 min-w-[170px]">ম্যাপ লোকেশন</th>
                  <th className="py-3 px-4 text-center w-24">ব্যবহার</th>
                  <th className="py-3 px-4 min-w-[120px]">আপডেট</th>
                  <th className="py-3 px-4 text-right w-24">অ্যাকশন</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-xs">
                {paginatedAddresses.map((addr, idx) => {
                  const sl = (currentPage - 1) * pageSize + idx + 1;
                  const hasCoords = typeof addr.lat === 'number' && typeof addr.lng === 'number';
                  const formattedDate = addr.updatedAt || addr.createdAt
                    ? new Date(addr.updatedAt || addr.createdAt!).toLocaleDateString('bn-BD', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })
                    : '-';

                  return (
                    <tr key={addr.id} className="hover:bg-teal-50/30 transition-colors group">
                      <td className="py-3.5 px-4 text-center text-gray-400 font-bold">{sl}</td>
                      
                      <td className="py-3.5 px-4 font-semibold text-gray-900">
                        <div className="flex items-start gap-2">
                          <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                            hasCoords ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-100 text-gray-400'
                          }`}>
                            <MapPin className="w-3.5 h-3.5" />
                          </div>
                          <span className="leading-snug break-words max-w-sm">{addr.address}</span>
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        {addr.shortName ? (
                          <span className="inline-block text-[11px] font-bold text-teal-700 bg-teal-50 px-2 py-0.5 rounded-lg border border-teal-100">
                            {addr.shortName}
                          </span>
                        ) : (
                          <span className="text-gray-300">-</span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-gray-600">
                        {addr.details ? (
                          <span className="line-clamp-2 max-w-xs">{addr.details}</span>
                        ) : (
                          <span className="text-gray-300">-</span>
                        )}
                      </td>

                      <td className="py-3.5 px-4">
                        {hasCoords ? (
                          <a
                            href={`https://www.google.com/maps?q=${addr.lat},${addr.lng}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1 rounded-lg border border-emerald-100 transition-colors"
                          >
                            <span>📍 {addr.lat?.toFixed(4)}, {addr.lng?.toFixed(4)}</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        ) : (
                          <span className="text-[11px] text-gray-400 italic">ম্যাপ নেই</span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-center">
                        <span className="inline-block px-2 py-0.5 bg-gray-100 text-gray-700 text-[11px] font-extrabold rounded-md">
                          {addr.usageCount || 1}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-gray-500 font-medium whitespace-nowrap">
                        {formattedDate}
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => openEditModal(addr)}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-teal-700 hover:bg-teal-50 transition-colors"
                            title="সম্পাদনা করুন"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(addr)}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                            title="মুছে ফেলুন"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Pagination Footer ── */}
        {filteredAddresses.length > 0 && (
          <PaginationControl
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={filteredAddresses.length}
            pageSize={pageSize}
            onPageChange={(p) => setCurrentPage(p)}
            onPageSizeChange={(sz) => {
              setPageSize(sz);
              setCurrentPage(1);
            }}
            pageSizeOptions={[10, 25, 50, 100]}
          />
        )}
      </div>

      {/* ── ADD / EDIT MODAL ── */}
      {isModalOpen && (
        <div
          className="fixed inset-0 z-[99999] bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={() => setIsModalOpen(false)}
        >
          <div
            className="w-full max-w-lg bg-white rounded-3xl p-6 shadow-2xl border border-gray-100 relative animate-in zoom-in-95 duration-150 space-y-4 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-2xl bg-teal-50 text-teal-600 flex items-center justify-center">
                  <MapPin className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-gray-900">
                    {editingAddress ? 'সার্ভার ঠিকানা সম্পাদনা' : 'নতুন সার্ভার ঠিকানা যুক্ত করুন'}
                  </h3>
                  <p className="text-[11px] text-gray-400 font-medium">
                    গ্রাহকদের ড্রপডাউনে সাজেশন ও অটো-আপডেটের জন্য সংরক্ষিত ঠিকানা
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-2 rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              {formError && (
                <div className="p-3 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold">
                  {formError}
                </div>
              )}

              {/* Address Text */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  ঠিকানা (Address Text) <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={addressInput}
                  onChange={(e) => setAddressInput(e.target.value)}
                  placeholder="যেমন: ৪এ, রহমান ভিলা, আশুলিয়া মডেল টাউন"
                  rows={2}
                  className="w-full p-3 rounded-2xl border border-gray-200 bg-gray-50/50 focus:bg-white focus:border-teal-500 outline-none text-xs sm:text-sm font-medium resize-none transition-colors"
                  required
                />
              </div>

              {/* Short Name / Landmark */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  সংক্ষিপ্ত নাম বা ল্যান্ডমার্ক (Short Name / Landmark)
                </label>
                <input
                  type="text"
                  value={shortNameInput}
                  onChange={(e) => setShortNameInput(e.target.value)}
                  placeholder="যেমন: ধানমন্ডি ২৭ / মডেল টাউন বাজার"
                  className="w-full px-3.5 py-2.5 rounded-2xl border border-gray-200 bg-gray-50/50 focus:bg-white focus:border-teal-500 outline-none text-xs sm:text-sm font-medium transition-colors"
                />
              </div>

              {/* Coordinates: Lat & Lng with Map Picker trigger */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-gray-700">
                    ম্যাপ লোকেশন কোঅর্ডিনেট (Map Coordinates)
                  </label>
                  <button
                    type="button"
                    onClick={() => setIsMapPickerOpen(true)}
                    className="text-[11px] font-bold text-teal-700 hover:text-teal-800 bg-teal-50 hover:bg-teal-100 px-2.5 py-1 rounded-xl transition-colors flex items-center gap-1"
                  >
                    <Navigation className="w-3 h-3" />
                    <span>ম্যাপ থেকে সিলেক্ট করুন</span>
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <input
                      type="text"
                      value={latInput}
                      onChange={(e) => setLatInput(e.target.value)}
                      placeholder="Latitude (যেমন: 23.8103)"
                      className="w-full px-3.5 py-2.5 rounded-2xl border border-gray-200 bg-gray-50/50 focus:bg-white focus:border-teal-500 outline-none text-xs font-medium transition-colors"
                    />
                  </div>
                  <div>
                    <input
                      type="text"
                      value={lngInput}
                      onChange={(e) => setLngInput(e.target.value)}
                      placeholder="Longitude (যেমন: 90.4125)"
                      className="w-full px-3.5 py-2.5 rounded-2xl border border-gray-200 bg-gray-50/50 focus:bg-white focus:border-teal-500 outline-none text-xs font-medium transition-colors"
                    />
                  </div>
                </div>
              </div>

              {/* Details / Notes */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  অতিরিক্ত বিবরণ বা নোট (Details / Note)
                </label>
                <input
                  type="text"
                  value={detailsInput}
                  onChange={(e) => setDetailsInput(e.target.value)}
                  placeholder="যেমন: গেটের পাশে গার্ড রুম, লিফটের ৪ তলায়"
                  className="w-full px-3.5 py-2.5 rounded-2xl border border-gray-200 bg-gray-50/50 focus:bg-white focus:border-teal-500 outline-none text-xs sm:text-sm font-medium transition-colors"
                />
              </div>

              {/* Action buttons */}
              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 rounded-2xl border border-gray-200 text-gray-600 hover:bg-gray-100 text-xs sm:text-sm font-bold transition-colors"
                >
                  বাতিল
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-6 py-2.5 rounded-2xl bg-teal-600 hover:bg-teal-700 text-white text-xs sm:text-sm font-extrabold shadow-md shadow-teal-600/25 transition-all disabled:opacity-50 flex items-center gap-1.5"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{isSaving ? 'সংরক্ষণ হচ্ছে...' : 'সংরক্ষণ করুন'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Map Picker Modal for Pinpoint Location ── */}
      {isMapPickerOpen && (
        <MapPickerModal
          isOpen={isMapPickerOpen}
          onClose={() => setIsMapPickerOpen(false)}
          title="ম্যাপ থেকে ঠিকানা ও লোকেশন নির্বাচন করুন"
          initialLocation={{
            address: addressInput || 'Dhaka, Bangladesh',
            lat: latInput ? parseFloat(latInput) : undefined,
            lng: lngInput ? parseFloat(lngInput) : undefined,
          }}
          onSelectLocation={(loc) => {
            if (loc.address && !addressInput) {
              setAddressInput(loc.address);
            }
            if (typeof loc.lat === 'number') {
              setLatInput(String(loc.lat));
            }
            if (typeof loc.lng === 'number') {
              setLngInput(String(loc.lng));
            }
            setIsMapPickerOpen(false);
          }}
        />
      )}
    </div>
  );
};
