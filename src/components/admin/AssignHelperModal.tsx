'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Order, HelperApplication, UserProfile, AllowedAreaPolygon } from '@/types';
import { fallbackStore } from '@/lib/firebase';
import { countJobsByHelper } from '@/lib/adminMetrics';
import { getAreasForOrder } from '@/lib/geofenceUtils';
import { useModal } from '../CustomModal';
import {
  X,
  Search,
  Bike,
  CheckCircle2,
  User,
  Phone,
  RefreshCw,
  MapPin,
  Globe,
  Loader2,
  ShieldCheck,
} from 'lucide-react';
import { AsyncButton } from '../ui/AsyncButton';

interface AssignHelperModalProps {
  order: Order;
  onClose: () => void;
  onAssigned?: () => void;
}

interface HelperDisplayItem {
  userId: string;
  name: string;
  phone: string;
  email: string;
  nid: string;
  hasCycle?: boolean;
  hasBike?: boolean;
  activeJobs: number;
  completedJobs: number;
  servesAllAreas: boolean;
  zoneNames: string[];
}

export const AssignHelperModal: React.FC<AssignHelperModalProps> = ({
  order,
  onClose,
  onAssigned,
}) => {
  const { showAlert } = useModal();
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [, setStoreVersion] = useState(0);
  const pageSize = 8;

  // Auto-fetch data & keep in sync with store
  const refreshData = useCallback(async (isManual = false) => {
    if (isManual) {
      setIsRefreshing(true);
    }
    try {
      await Promise.allSettled([
        fallbackStore.getAllUsers(),
        fallbackStore.refreshAdminData('helperApplications'),
      ]);
    } catch (err) {
      console.warn('[AssignHelperModal] refresh error:', err);
    } finally {
      setIsRefreshing(false);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const unsub = fallbackStore.subscribe(() => {
      setStoreVersion((v) => v + 1);
    });

    // If store seems empty on modal open, show brief loader while fetching
    if (fallbackStore.users.size < 5 || fallbackStore.helperApplications.size === 0) {
      setLoading(true);
    }

    refreshData();

    return () => {
      unsub();
    };
  }, [refreshData]);

  // Zone Settings & Order Zone Detection
  const allowedAreas = useMemo(
    () => fallbackStore.pricingSettings.allowedDeliveryAreas || [],
    []
  );
  const areasEnabled =
    fallbackStore.pricingSettings.allowedDeliveryAreasEnabled ?? true;

  // Identify all areas that this order belongs to
  const orderMatchingAreas = useMemo(() => {
    if (!areasEnabled || allowedAreas.length === 0) return [];

    const map = new Map<string, AllowedAreaPolygon>();

    // 1. Direct areaId tag on order
    if (order.areaId) {
      const matched = allowedAreas.find((a) => a.id === order.areaId);
      if (matched) map.set(matched.id, matched);
    }

    // 2. Multi-area areaIds tag on order
    if (order.areaIds && Array.isArray(order.areaIds)) {
      order.areaIds.forEach((id) => {
        const matched = allowedAreas.find((a) => a.id === id);
        if (matched) map.set(matched.id, matched);
      });
    }

    // 3. Geographic polygon match from delivery/pickup coordinates
    const geoAreas = getAreasForOrder(order, allowedAreas);
    geoAreas.forEach((a) => map.set(a.id, a));

    return Array.from(map.values());
  }, [order, allowedAreas, areasEnabled]);

  // Job counts in one pass
  const jobsByHelper = useMemo(
    () => countJobsByHelper(fallbackStore.orders.values()),
    []
  );

  // Compute the list of helpers
  const eligibleHelpers = useMemo(() => {
    const allUsers = Array.from(fallbackStore.users.values());
    const userByUid = new Map<string, UserProfile>();
    allUsers.forEach((u) => {
      if (u.uid) userByUid.set(u.uid, u);
    });

    const allApplications = Array.from(fallbackStore.helperApplications.values());
    const appByUserId = new Map<string, HelperApplication>();
    allApplications.forEach((a) => {
      if (a.userId) {
        const existing = appByUserId.get(a.userId);
        // Prefer APPROVED over pending/rejected
        if (!existing || a.status === 'APPROVED') {
          appByUserId.set(a.userId, a);
        }
      }
    });

    // Collect all candidate helper user IDs
    const candidateUids = new Set<string>();

    allUsers.forEach((u) => {
      if (u.isHelper || u.role === 'helper') {
        candidateUids.add(u.uid);
      }
    });

    allApplications.forEach((a) => {
      if (a.userId && a.status === 'APPROVED') {
        candidateUids.add(a.userId);
      }
    });

    // Also check if any allowedArea explicitly includes helper UIDs in assignedHelperIds
    allowedAreas.forEach((area) => {
      area.assignedHelperIds?.forEach((uid) => {
        if (userByUid.has(uid) || appByUserId.has(uid)) {
          candidateUids.add(uid);
        }
      });
    });

    const helpers: HelperDisplayItem[] = [];

    candidateUids.forEach((uid) => {
      const u = userByUid.get(uid);
      const app = appByUserId.get(uid);

      // ── 1. BLOCKED CHECK: Only blocked helper should be hidden ─────────────
      const isBlocked = Boolean(
        u?.isBlocked ||
        (app?.status === 'REJECTED' && !u?.isHelper)
      );
      if (isBlocked) {
        return; // Exclude blocked helpers
      }

      // Must be an approved helper application or marked as helper
      const isApprovedHelper =
        Boolean(u?.isHelper || u?.role === 'helper') ||
        app?.status === 'APPROVED';

      if (!isApprovedHelper) {
        return;
      }

      // ── 2. ZONE CHECK: Must be in the order's zone ─────────────────────────
      const servesAllAreas = Boolean(u?.serveAllAreas || (app as any)?.serveAllAreas);

      // Collect all zones assigned to this helper
      const helperAssignedZoneIds = new Set<string>();
      if (u?.assignedAreaIds) {
        u.assignedAreaIds.forEach((id) => helperAssignedZoneIds.add(id));
      }
      if (u?.areaId) {
        helperAssignedZoneIds.add(u.areaId);
      }
      if (app?.assignedAreaIds) {
        app.assignedAreaIds.forEach((id) => helperAssignedZoneIds.add(id));
      }
      if (app?.preferredAreaId) {
        helperAssignedZoneIds.add(app.preferredAreaId);
      }
      // Check which areas have this helper in assignedHelperIds
      allowedAreas.forEach((area) => {
        if (area.assignedHelperIds?.includes(uid)) {
          helperAssignedZoneIds.add(area.id);
        }
      });

      // If the order has specific matching zones, helper MUST belong to at least one
      if (orderMatchingAreas.length > 0) {
        const isInZone =
          servesAllAreas ||
          orderMatchingAreas.some((orderArea) => {
            if (helperAssignedZoneIds.has(orderArea.id)) return true;
            if (orderArea.assignedHelperIds?.includes(uid)) return true;
            // Area allows all helpers
            if (
              orderArea.allHelpersAssigned !== false &&
              (!orderArea.assignedHelperIds || orderArea.assignedHelperIds.length === 0)
            ) {
              return true;
            }
            return false;
          });

        if (!isInZone) {
          return; // Helper is outside this order's zone
        }
      }

      // ── 3. BUILD HELPER DISPLAY ITEM ──────────────────────────────────────
      const assignedOrdersCount = jobsByHelper.get(uid)?.active ?? 0;
      const completedOrdersCount = jobsByHelper.get(uid)?.completed ?? 0;

      const zoneNames = servesAllAreas
        ? ['All Zones']
        : Array.from(helperAssignedZoneIds)
            .map((zid) => allowedAreas.find((a) => a.id === zid)?.name)
            .filter((name): name is string => Boolean(name));

      helpers.push({
        userId: uid,
        name: app?.legalName || app?.userName || u?.displayName || 'Helper',
        phone:
          app?.whatsapp ||
          u?.alternativePhone ||
          u?.phoneNumber ||
          'N/A',
        email: app?.email || u?.email || '',
        nid: app?.nid || 'N/A',
        hasCycle: app?.hasCycle,
        hasBike: app?.hasBike,
        activeJobs: assignedOrdersCount,
        completedJobs: completedOrdersCount,
        servesAllAreas,
        zoneNames,
      });
    });

    return helpers;
  }, [allowedAreas, areasEnabled, orderMatchingAreas, jobsByHelper]);

  // Filter helpers by query
  const filteredHelpers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    let list = eligibleHelpers;

    if (q) {
      list = list.filter(
        (h) =>
          h.name.toLowerCase().includes(q) ||
          h.phone.toLowerCase().includes(q) ||
          h.nid.toLowerCase().includes(q) ||
          h.zoneNames.some((z) => z.toLowerCase().includes(q))
      );
    }

    // Sort: lowest active jobs first, then highest completed jobs
    return [...list].sort((a, b) => {
      if (a.activeJobs !== b.activeJobs) {
        return a.activeJobs - b.activeJobs;
      }
      return b.completedJobs - a.completedJobs;
    });
  }, [eligibleHelpers, searchQuery]);

  const totalPages = Math.ceil(filteredHelpers.length / pageSize) || 1;
  const paginatedHelpers = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredHelpers.slice(start, start + pageSize);
  }, [filteredHelpers, currentPage, pageSize]);

  const handleAssign = async (helper: HelperDisplayItem) => {
    const outcome = await fallbackStore.updateOrder(order.id, (o) => {
      const isPending = o.status === 'PENDING';
      const updatedStatus = isPending ? 'ACCEPTED' : o.status;
      return {
        ...o,
        helperId: helper.userId,
        helperName: helper.name,
        helperPhone: helper.phone,
        status: updatedStatus,
        acceptedAt: isPending ? new Date().toISOString() : o.acceptedAt,
        statusHistory: [
          ...(o.statusHistory || []),
          {
            id: `sh-${Date.now()}`,
            status: updatedStatus,
            timestamp: new Date().toISOString(),
            actor: 'Admin',
            note: `Assigned to helper ${helper.name}`,
          },
        ],
      };
    });

    if (outcome === 'conflict' || outcome === 'missing' || outcome === 'failed') {
      showAlert('অ্যাসাইন ব্যর্থ হয়েছে', 'অর্ডারটির স্ট্যাটাস ইতোমধ্যে পরিবর্তিত হয়েছে।', 'error');
      onClose();
      return;
    }

    // Notify assigned helper
    fallbackStore.addNotification({
      id: `notif-${Date.now()}-helper-assign-${order.id}`,
      userId: helper.userId,
      title: 'অ্যাডমিন অর্ডার অ্যাসাইন করেছেন!',
      body: `অর্ডার #${order.id} (${order.title || 'New Order'}) আপনাকে অ্যাসাইন করা হয়েছে।`,
      orderId: order.id,
      read: false,
      createdAt: new Date().toISOString(),
    });

    showAlert(
      'হেলপার অ্যাসাইন সম্পন্ন',
      `অর্ডার #${order.id} সফলভাবে ${helper.name}-কে অ্যাসাইন করা হয়েছে।`,
      'success'
    );

    if (onAssigned) onAssigned();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="p-5 border-b border-gray-100 flex items-center justify-between bg-purple-950 text-white">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-2xl bg-purple-800/70 border border-purple-700/60 shadow-inner">
              <Bike className="w-5 h-5 text-purple-200" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-base leading-tight">
                  {order.helperId ? 'Reassign Helper' : 'Assign Helper to Order'}
                </h3>
              </div>
              <p className="text-xs text-purple-200 mt-0.5">
                Order #{order.id} • {order.title || order.items?.[0]?.name || 'Customer Order'}
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => refreshData(true)}
              disabled={isRefreshing}
              title="Refresh Helpers List"
              className="p-2 rounded-2xl bg-purple-900 hover:bg-purple-800 text-purple-200 hover:text-white transition-all disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-2xl bg-rose-500/80 hover:bg-rose-600 text-white transition-colors shadow-sm"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Zone Info Banner */}
        <div className="px-5 py-2.5 bg-purple-50/80 border-b border-purple-100 flex items-center justify-between text-xs">
          <div className="flex items-center space-x-1.5 flex-wrap">
            {orderMatchingAreas.length > 0 ? (
              <>
                <MapPin className="w-3.5 h-3.5 text-purple-700 shrink-0" />
                <span className="font-bold text-purple-900">Order Zone:</span>
                <span className="font-extrabold text-purple-950 px-2 py-0.5 bg-purple-200/80 rounded-lg">
                  {orderMatchingAreas.map((a) => a.name).join(', ')}
                </span>
                <span className="text-[11px] text-purple-700 font-medium ml-1">
                  (Showing helpers for this zone)
                </span>
              </>
            ) : (
              <>
                <Globe className="w-3.5 h-3.5 text-indigo-700 shrink-0" />
                <span className="font-bold text-indigo-900">Zone:</span>
                <span className="font-extrabold text-indigo-950 px-2 py-0.5 bg-indigo-100 rounded-lg">
                  All Zones / Unrestricted
                </span>
                <span className="text-[11px] text-indigo-700 font-medium ml-1">
                  (All active helpers available)
                </span>
              </>
            )}
          </div>
          <div className="text-[11px] font-extrabold text-purple-800 shrink-0">
            {eligibleHelpers.length} Helper{eligibleHelpers.length !== 1 ? 's' : ''}
          </div>
        </div>

        {/* Search Bar */}
        <div className="p-4 border-b border-gray-100 bg-gray-50/70">
          <div className="relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-3.5" />
            <input
              type="text"
              placeholder="Search helper by name, phone, NID, zone..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-2xl text-xs font-semibold focus:outline-none focus:border-purple-600 focus:ring-4 focus:ring-purple-600/10 shadow-sm"
            />
          </div>
        </div>

        {/* Helpers List */}
        <div className="p-4 overflow-y-auto space-y-3 flex-1 min-h-[220px]">
          {loading ? (
            <div className="py-16 text-center text-gray-500 space-y-3">
              <Loader2 className="w-8 h-8 text-purple-600 animate-spin mx-auto" />
              <p className="font-bold text-xs text-gray-600">Loading helper fleet...</p>
            </div>
          ) : paginatedHelpers.length === 0 ? (
            <div className="py-12 text-center text-gray-500 space-y-2">
              <User className="w-12 h-12 text-gray-300 mx-auto" />
              <p className="font-extrabold text-xs text-gray-700">
                {searchQuery
                  ? `No helpers matching "${searchQuery}"`
                  : orderMatchingAreas.length > 0
                  ? `No active helpers found in zone (${orderMatchingAreas.map((a) => a.name).join(', ')})`
                  : 'No active helpers found.'}
              </p>
              <p className="text-[11px] text-gray-400 max-w-sm mx-auto">
                {orderMatchingAreas.length > 0
                  ? 'Only unblocked helpers assigned to this zone (or serving all zones) are shown.'
                  : 'Make sure helpers are approved in Helper Applications and are not blocked.'}
              </p>
            </div>
          ) : (
            paginatedHelpers.map((h) => {
              const isCurrentlyAssigned = order.helperId === h.userId;
              return (
                <div
                  key={h.userId}
                  className={`p-4 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                    isCurrentlyAssigned
                      ? 'bg-purple-50/70 border-purple-300 shadow-sm'
                      : 'bg-white border-gray-100 hover:border-purple-200 hover:shadow-soft'
                  }`}
                >
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex items-center space-x-2 flex-wrap">
                      <h4 className="font-extrabold text-sm text-gray-900 truncate">
                        {h.name}
                      </h4>
                      {isCurrentlyAssigned && (
                        <span className="px-2 py-0.5 rounded-full bg-purple-200 text-purple-950 text-[10px] font-extrabold flex items-center space-x-1 shrink-0">
                          <CheckCircle2 className="w-3 h-3 text-purple-700" />
                          <span>Currently Assigned</span>
                        </span>
                      )}
                      {h.servesAllAreas ? (
                        <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-extrabold flex items-center space-x-1 shrink-0">
                          <Globe className="w-2.5 h-2.5 text-emerald-600" />
                          <span>All Zones</span>
                        </span>
                      ) : h.zoneNames.length > 0 ? (
                        <span className="px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 text-[10px] font-extrabold flex items-center space-x-1 shrink-0 truncate max-w-[180px]">
                          <MapPin className="w-2.5 h-2.5 text-purple-600 shrink-0" />
                          <span className="truncate">{h.zoneNames.join(', ')}</span>
                        </span>
                      ) : null}
                    </div>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500 font-medium">
                      <a
                        href={`tel:${h.phone}`}
                        onClick={(e) => e.stopPropagation()}
                        className="flex items-center space-x-1 text-gray-700 font-semibold hover:text-purple-700 transition-colors"
                      >
                        <Phone className="w-3.5 h-3.5 text-gray-400" />
                        <span>{h.phone}</span>
                      </a>
                      <span>
                        Active: <strong className="text-amber-600 font-bold">{h.activeJobs}</strong>
                      </span>
                      <span>
                        Completed: <strong className="text-emerald-600 font-bold">{h.completedJobs}</strong>
                      </span>
                      {h.hasBike && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 rounded text-gray-700 font-bold">
                          🏍️ Motorbike
                        </span>
                      )}
                      {h.hasCycle && !h.hasBike && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 rounded text-gray-700 font-bold">
                          🚲 Bicycle
                        </span>
                      )}
                    </div>
                  </div>

                  <AsyncButton
                    onClick={() => handleAssign(h)}
                    disabled={isCurrentlyAssigned}
                    className={`py-2 px-4 rounded-xl font-extrabold text-xs transition-all shrink-0 ${
                      isCurrentlyAssigned
                        ? 'bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200'
                        : 'bg-purple-900 hover:bg-purple-950 text-white shadow-md active:scale-95'
                    }`}
                  >
                    <span>{isCurrentlyAssigned ? 'Assigned' : 'Assign Helper'}</span>
                  </AsyncButton>
                </div>
              );
            })
          )}
        </div>

        {/* Modal Footer & Pagination */}
        <div className="p-4 border-t border-gray-100 bg-gray-50 flex items-center justify-between">
          {totalPages > 1 ? (
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                disabled={currentPage === 1}
                className="py-1.5 px-3 rounded-xl bg-white border border-gray-200 font-bold text-xs text-gray-700 disabled:opacity-40 hover:bg-gray-50 transition-colors"
              >
                Prev
              </button>
              <span className="text-xs font-bold text-gray-600">
                Page {currentPage} of {totalPages} ({filteredHelpers.length} total)
              </span>
              <button
                onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
                disabled={currentPage === totalPages}
                className="py-1.5 px-3 rounded-xl bg-white border border-gray-200 font-bold text-xs text-gray-700 disabled:opacity-40 hover:bg-gray-50 transition-colors"
              >
                Next
              </button>
            </div>
          ) : (
            <span className="text-xs font-bold text-gray-500">
              Showing {filteredHelpers.length} eligible helper{filteredHelpers.length !== 1 ? 's' : ''}
            </span>
          )}

          <button
            onClick={onClose}
            className="py-2 px-5 rounded-2xl bg-rose-50 hover:bg-rose-100 font-extrabold text-xs text-rose-600 border border-rose-200 active:scale-95 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
