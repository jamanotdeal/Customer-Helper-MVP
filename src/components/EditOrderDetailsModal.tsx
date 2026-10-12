'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useModal } from './CustomModal';
import { fallbackStore } from '@/lib/firebase';
import { Order, OrderItem, LocationData, OrderEditChange, OrderEditHistoryItem } from '@/types';
import { calculateEstimatedFee, calculateDistanceKm } from '@/lib/pricing';
import { fetchRoadDistanceKm } from '@/lib/routeUtils';
import { hapticFeedback } from '@/lib/native';
import { AddCustomItemModal } from './AddCustomItemModal';
import { AddressAutocompleteInput } from './AddressAutocompleteInput';
import { MapPickerModal } from './MapPickerModal';
import {
  X,
  ShoppingBag,
  Plus,
  Minus,
  Trash2,
  Sparkles,
  Package,
  AlertCircle,
  Phone,
  Receipt,
  Scale,
  MapPin,
  Navigation,
  Send,
  Edit2,
} from 'lucide-react';

interface EditOrderDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: Order;
  onOrderUpdated?: (updatedOrder: Order) => void;
}

export const EditOrderDetailsModal: React.FC<EditOrderDetailsModalProps> = ({
  isOpen,
  onClose,
  order,
  onOrderUpdated,
}) => {
  const { showAlert, showConfirm } = useModal();

  // Resolved order with shop/locations
  const resolvedOrder = useMemo(() => {
    return fallbackStore.resolveOrderLocations(order);
  }, [order]);

  // Form states initialized with order data
  const [items, setItems] = useState<OrderItem[]>(() => {
    return (order.items || []).map((it) => ({ ...it }));
  });
  const [deliveryAddress, setDeliveryAddress] = useState(
    resolvedOrder.deliveryLocation?.address || ''
  );
  const [deliveryLat, setDeliveryLat] = useState<number | undefined>(
    resolvedOrder.deliveryLocation?.lat
  );
  const [deliveryLng, setDeliveryLng] = useState<number | undefined>(
    resolvedOrder.deliveryLocation?.lng
  );
  const [deliveryAddressId, setDeliveryAddressId] = useState<string | undefined>(
    resolvedOrder.deliveryLocation?.addressId
  );

  const [pickupAddress, setPickupAddress] = useState(
    resolvedOrder.pickupLocation?.address || ''
  );
  const [pickupLat, setPickupLat] = useState<number | undefined>(
    resolvedOrder.pickupLocation?.lat
  );
  const [pickupLng, setPickupLng] = useState<number | undefined>(
    resolvedOrder.pickupLocation?.lng
  );
  const [pickupAddressId, setPickupAddressId] = useState<string | undefined>(
    resolvedOrder.pickupLocation?.addressId
  );

  const [customerPhone, setCustomerPhone] = useState(
    resolvedOrder.alternativePhone || resolvedOrder.customerPhone || ''
  );
  const [orderNotes, setOrderNotes] = useState(resolvedOrder.additionalNote || '');

  const [showAddCustomModal, setShowAddCustomModal] = useState(false);
  const [editingCustomIndex, setEditingCustomIndex] = useState<number | null>(null);
  const [showDeliveryMapPicker, setShowDeliveryMapPicker] = useState(false);
  const [showPickupMapPicker, setShowPickupMapPicker] = useState(false);
  const [updatingOrder, setUpdatingOrder] = useState(false);
  const [formError, setFormError] = useState('');

  // Re-sync states ONLY when the modal first opens (false → true transition).
  // We intentionally do NOT re-sync on every `order` change because the parent
  // has a live Firebase listener that creates new order objects continuously,
  // which would immediately overwrite any edits the user makes.
  const wasOpenRef = useRef(false);
  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      // Modal just opened — initialise form from the latest order snapshot
      const res = fallbackStore.resolveOrderLocations(order);
      setItems((res.items || []).map((it) => ({ ...it })));
      setDeliveryAddress(res.deliveryLocation?.address || '');
      setDeliveryLat(res.deliveryLocation?.lat);
      setDeliveryLng(res.deliveryLocation?.lng);
      setDeliveryAddressId(res.deliveryLocation?.addressId);
      setPickupAddress(res.pickupLocation?.address || '');
      setPickupLat(res.pickupLocation?.lat);
      setPickupLng(res.pickupLocation?.lng);
      setPickupAddressId(res.pickupLocation?.addressId);
      setCustomerPhone(res.alternativePhone || res.customerPhone || '');
      setOrderNotes(res.additionalNote || '');
      setFormError('');
      setEditingCustomIndex(null);
    }
    wasOpenRef.current = isOpen;
  }, [isOpen, order]);

  // Shop info if available
  const orderShop = useMemo(() => {
    if (order.shopId) {
      return fallbackStore.shops.get(order.shopId);
    }
    return undefined;
  }, [order.shopId]);

  // Calculate items subtotal
  const subtotal = useMemo(() => {
    return items.reduce((sum, item) => {
      if (item.price !== undefined) {
        return sum + item.price * (item.quantity || 1);
      }
      return sum;
    }, 0);
  }, [items]);

  const totalItemCount = useMemo(() => {
    return items.reduce((sum, item) => sum + (item.quantity || 1), 0);
  }, [items]);

  // Route & Straight distance calculation
  const [routeDistanceKm, setRouteDistanceKm] = useState<number>(0);
  const [isCalculatingDistance, setIsCalculatingDistance] = useState(false);

  // Effective pickup coordinates: either shop location or order's pickup location
  const effectivePickupLat = pickupLat || orderShop?.location?.lat;
  const effectivePickupLng = pickupLng || orderShop?.location?.lng;

  const rawDistanceKm = useMemo(() => {
    if (effectivePickupLat && effectivePickupLng && deliveryLat && deliveryLng) {
      return calculateDistanceKm(
        effectivePickupLat,
        effectivePickupLng,
        deliveryLat,
        deliveryLng
      );
    }
    return 0;
  }, [effectivePickupLat, effectivePickupLng, deliveryLat, deliveryLng]);

  useEffect(() => {
    let cancelled = false;

    const computeRouteDistance = async () => {
      if (effectivePickupLat && effectivePickupLng && deliveryLat && deliveryLng) {
        setIsCalculatingDistance(true);
        try {
          const distKm = await fetchRoadDistanceKm(
            { lat: effectivePickupLat, lng: effectivePickupLng },
            { lat: deliveryLat, lng: deliveryLng }
          );
          if (!cancelled) {
            setRouteDistanceKm(distKm);
          }
        } catch (e) {
          console.warn('[EditOrderDetailsModal] Error calculating route distance:', e);
          if (!cancelled) {
            const straight = calculateDistanceKm(
              effectivePickupLat,
              effectivePickupLng,
              deliveryLat,
              deliveryLng
            );
            setRouteDistanceKm(Math.round(straight * 1.25 * 10) / 10);
          }
        } finally {
          if (!cancelled) {
            setIsCalculatingDistance(false);
          }
        }
      } else {
        setRouteDistanceKm(0);
        setIsCalculatingDistance(false);
      }
    };

    computeRouteDistance();

    return () => {
      cancelled = true;
    };
  }, [effectivePickupLat, effectivePickupLng, deliveryLat, deliveryLng]);

  const effectiveDistanceKm = useMemo(() => {
    if (routeDistanceKm > 0) return routeDistanceKm;
    if (rawDistanceKm > 0) return Math.round(rawDistanceKm * 1.25 * 10) / 10;
    return 1;
  }, [routeDistanceKm, rawDistanceKm]);

  // Pricing calculation
  const pricingSettings = fallbackStore.pricingSettings;
  const feeEst = useMemo(() => {
    const effectiveDist = Math.max(1, Math.ceil(effectiveDistanceKm));
    return calculateEstimatedFee(
      {
        distanceKm: effectiveDist,
        weightKg: order.weightKg || 0,
        isReturnRequested: Boolean(order.needDeliveryBack),
        productPrice: subtotal,
      },
      pricingSettings
    );
  }, [effectiveDistanceKm, order.weightKg, order.needDeliveryBack, subtotal, pricingSettings]);

  if (!isOpen) return null;

  // Quantity updates
  const handleUpdateQuantity = (itemId: string, delta: number) => {
    setItems((prev) =>
      prev
        .map((it) => {
          if (it.id === itemId) {
            const currentQty = it.quantity || 1;
            const newQty = currentQty + delta;
            if (newQty <= 0) return null;
            return { ...it, quantity: newQty };
          }
          return it;
        })
        .filter((it): it is OrderItem => it !== null)
    );
  };

  const handleRemoveItem = (itemId: string) => {
    setItems((prev) => prev.filter((it) => it.id !== itemId));
  };

  const handleOpenAddCustomModal = () => {
    setEditingCustomIndex(null);
    setShowAddCustomModal(true);
  };

  const handleOpenEditCustomModal = (index: number) => {
    setEditingCustomIndex(index);
    setShowAddCustomModal(true);
  };

  const handleSaveCustomItems = (newItems: OrderItem[]) => {
    if (newItems.length === 0) return;
    if (editingCustomIndex !== null && editingCustomIndex >= 0 && editingCustomIndex < items.length) {
      setItems((prev) => {
        const copy = [...prev];
        copy.splice(editingCustomIndex, 1, ...newItems);
        return copy;
      });
    } else {
      setItems((prev) => [...prev, ...newItems]);
    }
    setEditingCustomIndex(null);
    setShowAddCustomModal(false);
  };

  // Submit Update
  const handleUpdateOrder = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    if (items.length === 0) {
      setFormError('কমপক্ষে ১টি পণ্য বা সার্ভিস থাকতে হবে।');
      return;
    }

    if (!deliveryAddress.trim()) {
      setFormError('অনুগ্রহ করে ডেলিভারি ঠিকানা উল্লেখ করুন।');
      return;
    }

    if (!customerPhone.trim()) {
      setFormError('অনুগ্রহ করে মোবাইল নম্বর প্রদান করুন।');
      return;
    }

    if (!/^01[3-9]\d{8}$/.test(customerPhone.trim())) {
      setFormError('অনুগ্রহ করে ১১ ডিজিটের সঠিক মোবাইল নম্বর দিন (যেমন: 01712345678)।');
      return;
    }

    const confirmed = await showConfirm(
      'অর্ডার আপডেট নিশ্চিতকরণ',
      'আপনি কি এই অর্ডারের পরিবর্তিত তথ্যাদি সেভ করতে চান?',
      'হ্যাঁ, আপডেট নিশ্চিত করুন',
      'বাতিল'
    );
    if (!confirmed) {
      return;
    }

    setUpdatingOrder(true);
    setFormError('');

    try {
      // Upsert server address for delivery if possible
      let effDelivId = deliveryAddressId || order.deliveryLocation?.addressId;
      let finalDeliveryAddressText = deliveryAddress.trim();
      try {
        const sa = await fallbackStore.recordOrUpsertServerAddress(finalDeliveryAddressText, {
          lat: deliveryLat,
          lng: deliveryLng,
        });
        if (sa?.id) {
          effDelivId = sa.id;
          finalDeliveryAddressText = sa.address;
        }
      } catch (_) { }

      // Upsert server address for pickup if applicable
      let effPickupId = pickupAddressId || order.pickupLocation?.addressId;
      let finalPickupAddressText = pickupAddress.trim();
      if (finalPickupAddressText) {
        try {
          const sa = await fallbackStore.recordOrUpsertServerAddress(finalPickupAddressText, {
            lat: pickupLat,
            lng: pickupLng,
          });
          if (sa?.id) {
            effPickupId = sa.id;
            finalPickupAddressText = sa.address;
          }
        } catch (_) { }
      }

      // Compute diffs for edit history
      const diffs: OrderEditChange[] = [];

      // Diff items
      const oldItemNames = (order.items || [])
        .map((i) => `${i.name} (x${i.quantity || i.qty || 1})`)
        .join(', ');
      const newItemNames = items
        .map((i) => `${i.name} (x${i.quantity || i.qty || 1})`)
        .join(', ');
      if (oldItemNames !== newItemNames) {
        diffs.push({
          field: 'Items',
          oldValue: oldItemNames || 'None',
          newValue: newItemNames || 'None',
        });
      }

      // Diff delivery address
      const oldDelivery = order.deliveryLocation?.address || '';
      if (oldDelivery !== finalDeliveryAddressText) {
        diffs.push({
          field: 'Delivery Address',
          oldValue: oldDelivery,
          newValue: finalDeliveryAddressText,
        });
      }

      // Diff phone
      const oldPhone = order.alternativePhone || order.customerPhone || '';
      if (oldPhone !== customerPhone.trim()) {
        diffs.push({
          field: 'Contact Phone',
          oldValue: oldPhone,
          newValue: customerPhone.trim(),
        });
      }

      // Diff note
      const oldNote = order.additionalNote || '';
      if (oldNote !== orderNotes.trim()) {
        diffs.push({
          field: 'Notes',
          oldValue: oldNote || 'None',
          newValue: orderNotes.trim() || 'None',
        });
      }

      // Diff pickup
      const oldPickup = order.pickupLocation?.address || '';
      if (oldPickup !== finalPickupAddressText && finalPickupAddressText) {
        diffs.push({
          field: 'Pickup Location',
          oldValue: oldPickup || 'None',
          newValue: finalPickupAddressText,
        });
      }

      const nowIso = new Date().toISOString();
      const editItem: OrderEditHistoryItem = {
        id: `ed-${Date.now()}`,
        timestamp: nowIso,
        editedBy: 'customer',
        editedByName: order.customerName || 'Customer',
        changes:
          diffs.length > 0
            ? diffs
            : [{ field: 'Details', oldValue: 'Previous Details', newValue: 'Updated Details' }],
      };

      const updatedDeliveryFee = order.isFreeDelivery ? 0 : feeEst.deliverySubtotal;
      const updatedProcessingFee = feeEst.processingFee;

      let finalUpdatedOrder: Order | undefined;

      fallbackStore.updateOrder(order.id, (o) => {
        const updated: Order = {
          ...o,
          items,
          productCost: subtotal > 0 ? subtotal : undefined,
          deliveryFee: updatedDeliveryFee,
          originalDeliveryFee: updatedDeliveryFee,
          processingFee: updatedProcessingFee > 0 ? updatedProcessingFee : undefined,
          deliveryLocation: {
            ...o.deliveryLocation,
            address: finalDeliveryAddressText,
            lat: deliveryLat,
            lng: deliveryLng,
            addressId: effDelivId,
          },
          pickupLocation: finalPickupAddressText
            ? {
              ...(o.pickupLocation || {}),
              address: finalPickupAddressText,
              lat: pickupLat,
              lng: pickupLng,
              addressId: effPickupId,
            }
            : o.pickupLocation,
          customerPhone: customerPhone.trim(),
          alternativePhone: customerPhone.trim(),
          additionalNote: orderNotes.trim() || undefined,
          updatedByCustomer: true,
          lastEditedAt: nowIso,
          lastEditedBy: 'customer',
          editHistory: [...(o.editHistory || []), editItem],
          updatedAt: nowIso,
          statusHistory: [
            ...(o.statusHistory || []),
            {
              id: `sh-${Date.now()}`,
              status: o.status,
              timestamp: nowIso,
              actor: 'Customer',
              note: `Order details updated by customer (${diffs.map((d) => d.field).join(', ') || 'Updated'})`,
            },
          ],
        };
        finalUpdatedOrder = updated;
        return updated;
      });

      hapticFeedback('medium');
      showAlert('অর্ডার আপডেট সম্পন্ন!', 'আপনার অর্ডারের তথ্য সফলভাবে আপডেট করা হয়েছে।', 'success');

      if (finalUpdatedOrder && onOrderUpdated) {
        onOrderUpdated(finalUpdatedOrder);
      }

      onClose();
    } catch (err) {
      console.error('Failed to update order details:', err);
      setFormError('অর্ডার আপডেট করতে সমস্যা হয়েছে। আবার চেষ্টা করুন।');
    } finally {
      setUpdatingOrder(false);
    }
  };

  const shopOrOrderName =
    orderShop?.name ||
    order.pickupLocation?.name ||
    order.title ||
    order.service ||
    'স্টোর অর্ডার';

  const finalTotalAmount =
    subtotal +
    (order.isFreeDelivery ? 0 : feeEst.deliverySubtotal) +
    (feeEst.processingFee || 0);

  const customItemToEdit =
    editingCustomIndex !== null && items[editingCustomIndex]
      ? items[editingCustomIndex]
      : undefined;

  return (
    <>
      <div
        className="fixed inset-0 z-[99999] bg-black/60 backdrop-blur-xs flex flex-col justify-end animate-in fade-in duration-200"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div
          className="bg-white rounded-t-3xl w-full max-h-[92vh] flex flex-col shadow-2xl animate-in slide-in-from-bottom-5 duration-300"
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {/* Drawer Header */}
          <div className="flex items-center justify-between p-4 pb-3 border-b border-gray-100">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center">
                <ShoppingBag className="w-5 h-5" />
              </div>
              <div>
                <h2 className="font-extrabold text-sm sm:text-base text-gray-900 leading-tight">
                  Edit order details
                </h2>
                <p className="text-[11px] text-gray-500 font-medium">
                  {shopOrOrderName} • {totalItemCount}টি পণ্য
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-600 flex items-center justify-center transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Drawer Scrollable Body */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 overscroll-contain" style={{ WebkitUserSelect: 'text', userSelect: 'text', touchAction: 'pan-y' }}>
            {formError && (
              <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            {/* Items List */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-black text-gray-800 uppercase tracking-wide">
                  নির্বাচিত পণ্যের তালিকা
                </h3>
                {items.length > 0 && (
                  <button
                    type="button"
                    onClick={async () => {
                      const confirmed = await showConfirm(
                        'সব পণ্য মুছুন',
                        'আপনি কি অর্ডারের সকল পণ্য মুছে ফেলতে চান?',
                        'হ্যাঁ, মুছে ফেলুন',
                        'বাতিল'
                      );
                      if (confirmed) {
                        setItems([]);
                      }
                    }}
                    className="text-[11px] text-rose-600 hover:text-rose-700 font-bold flex items-center gap-1 cursor-pointer transition-colors"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>সব মুছুন</span>
                  </button>
                )}
              </div>

              {items.length === 0 ? (
                <div className="text-center py-8 text-gray-400 text-xs bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                  <Package className="w-8 h-8 mx-auto text-gray-300 mb-2" />
                  <p className="font-bold text-gray-600">অর্ডারে কোনো পণ্য নেই</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    নিচের বাটন দিয়ে নতুন পণ্য বা সার্ভিস যোগ করুন
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {items.map((item, idx) => (
                    <div
                      key={item.id || `item-${idx}`}
                      className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-gray-50 border border-gray-100"
                    >
                      {/* Item image or icon on left */}
                      <div className="w-12 h-12 rounded-xl bg-white border border-gray-200/80 shrink-0 overflow-hidden flex items-center justify-center shadow-2xs">
                        {item.photoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={item.photoUrl}
                            alt={item.name}
                            className="w-full h-full object-cover"
                          />
                        ) : item.isCustom ? (
                          <div className="w-full h-full bg-amber-50 flex items-center justify-center text-amber-600">
                            <Sparkles className="w-5 h-5" />
                          </div>
                        ) : (
                          <div className="w-full h-full bg-emerald-50 flex items-center justify-center text-emerald-600">
                            <Package className="w-5 h-5" />
                          </div>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-black text-xs text-gray-900 truncate">
                            {item.name}
                          </span>
                          {item.isCustom && (
                            <span className="bg-amber-100 text-amber-800 text-[9px] font-black px-1.5 py-0.5 rounded-full">
                              কাস্টম
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-gray-500 flex items-center gap-2 mt-0.5">
                          {item.unit && <span>{item.unit}</span>}
                          {item.price !== undefined ? (
                            <span className="font-extrabold text-emerald-700">
                              ৳{item.price} × {item.quantity || 1} = ৳
                              {(item.price || 0) * (item.quantity || 1)}
                            </span>
                          ) : (
                            <span className="text-amber-700 font-semibold">
                              {item.qty} • মূল্য হেলপার যাচাই করবে
                            </span>
                          )}
                        </div>

                      </div>

                      {/* Quantity Counter, Custom Edit, or Delete */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        {!item.isCustom ? (
                          <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-xl p-0.5">
                            <button
                              type="button"
                              onClick={() => handleUpdateQuantity(item.id, -1)}
                              className="w-6 h-6 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 flex items-center justify-center transition-all cursor-pointer"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <span className="text-xs font-black px-1 text-gray-800">
                              {item.quantity || 1}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleUpdateQuantity(item.id, 1)}
                              className="w-6 h-6 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 flex items-center justify-center transition-all cursor-pointer"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1">
                            <span className="text-xs font-bold text-gray-600 bg-white border border-gray-200 px-2 py-1 rounded-xl">
                              {item.qty}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleOpenEditCustomModal(idx)}
                              className="p-1 rounded-lg text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors cursor-pointer"
                              title="কাস্টম তথ্য পরিবর্তন করুন"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}

                        <button
                          type="button"
                          onClick={() => handleRemoveItem(item.id)}
                          className="p-1.5 rounded-xl text-gray-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                          aria-label="Remove item"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── ADD CUSTOM ITEM OPTION ── */}
            <div>
              <button
                type="button"
                id="edit-order-add-custom-item-btn"
                onClick={handleOpenAddCustomModal}
                className="w-full py-3 px-3 rounded-2xl border border-dashed border-emerald-300 bg-emerald-50/50 hover:bg-emerald-50 text-emerald-800 transition-all cursor-pointer flex items-center justify-center gap-2 text-xs font-black"
              >
                <Plus className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>প্ল্যাটফর্মে নেই এমন কাস্টম পণ্য বা সার্ভিস যোগ করুন</span>
              </button>
            </div>

            {/* Delivery & Contact Information */}
            <div className="space-y-3 pt-2 border-t border-gray-100">
              <h3 className="text-xs font-black text-gray-800 uppercase tracking-wide flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-emerald-600" />
                ডেলিভারির তথ্য
              </h3>

              {/* Delivery Address Autocomplete with Map Picker Trigger */}
              <div>
                <label className="text-[11px] font-bold text-gray-700 block mb-1">
                  আপনার ডেলিভারি ঠিকানা <span className="text-rose-500">*</span>
                </label>
                <div className="flex items-center gap-1.5">
                  <div className="flex-1 min-w-0">
                    <AddressAutocompleteInput
                      value={deliveryAddress}
                      onChange={(val, loc) => {
                        setDeliveryAddress(val);
                        if (loc?.lat !== undefined) setDeliveryLat(loc.lat);
                        if (loc?.lng !== undefined) setDeliveryLng(loc.lng);
                      }}
                      placeholder="যেমন: বাসা #৪, রোড #২, সেক্টর #১০, উত্তরা..."
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowDeliveryMapPicker(true)}
                    title="ম্যাপ থেকে ঠিকানা নির্বাচন করুন"
                    className="p-2.5 rounded-xl border border-gray-200 bg-gray-50 hover:bg-emerald-50 text-emerald-600 active:scale-95 transition-all shrink-0 cursor-pointer"
                  >
                    <MapPin className="w-4 h-4" />
                  </button>
                </div>
              </div>



              {/* Contact phone */}
              <div>
                <label className="text-[11px] font-bold text-gray-700 block mb-1">
                  মোবাইল নম্বর <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <Phone className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="tel"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    placeholder="01XXXXXXXXX"
                    className="w-full pl-9 pr-3 py-2 rounded-xl border border-gray-200 text-xs font-bold outline-none focus:border-emerald-600"
                    style={{ WebkitUserSelect: 'text', userSelect: 'text' }}
                  />
                </div>
              </div>

              {/* Optional note */}
              <div>
                <label className="text-[11px] font-bold text-gray-700 block mb-1">
                  বিশেষ নির্দেশনা (যদি থাকে)
                </label>
                <textarea
                  rows={2}
                  value={orderNotes}
                  onChange={(e) => setOrderNotes(e.target.value)}
                  placeholder="যেমন: ৩য় তলা, বেল বাজাবেন, বা দ্রুত পাঠাবেন..."
                  className="w-full p-2.5 rounded-xl border border-gray-200 text-xs font-medium outline-none focus:border-emerald-600"
                  style={{ WebkitUserSelect: 'text', userSelect: 'text' }}
                />
              </div>

              {/* Pricing / Calculation Summary */}
              <div className="bg-emerald-50/60 border border-emerald-100 rounded-2xl p-3.5 space-y-2 text-xs">
                <div className="flex items-center justify-between font-bold text-gray-700">
                  <span className="flex items-center gap-1">
                    <Receipt className="w-3.5 h-3.5 text-emerald-600" />
                    পণ্য / সেবামূল্য (Subtotal):
                  </span>
                  <span className="font-black text-gray-900">
                    ৳{subtotal}
                    {items.some((i) => i.isCustom) && ' + কাস্টম মূল্য'}
                  </span>
                </div>

                {/* Delivery Distance with per-km rate */}
                <div className="flex items-center justify-between text-gray-600 text-[11px]">
                  <span className="flex items-center gap-1">
                    <Navigation className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    ডেলিভারি দূরত্ব (৳{feeEst.perKmRate}/কিমি):
                  </span>
                  <div className="flex items-center gap-1">
                    {isCalculatingDistance ? (
                      <span className="text-gray-400 font-semibold animate-pulse text-[10px]">
                        হিসেব হচ্ছে...
                      </span>
                    ) : (
                      <>
                        <span className="font-bold text-gray-900">
                          {effectiveDistanceKm > 0
                            ? `${effectiveDistanceKm.toFixed(1)} কিমি`
                            : '১ কিমি'}
                        </span>
                        <span className="text-[9px] bg-emerald-100 text-emerald-800 font-black px-1 py-0.2 rounded uppercase">
                          Auto
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {/* Weight with per-kg rate */}
                <div className="flex items-center justify-between text-gray-600 text-[11px]">
                  <span className="flex items-center gap-1">
                    <Scale className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    পণ্য ওজন (৳{feeEst.perKgRate}/কেজি):
                  </span>
                  <span className="font-bold text-amber-800 bg-amber-100/80 px-1.5 py-0.5 rounded text-[10px]">
                    {order.weightKg ? `${order.weightKg} কেজি` : 'Unknown'}
                  </span>
                </div>

                {/* Delivery Fee */}
                <div className="flex items-center justify-between text-gray-600 text-[11px]">
                  <span>ডেলিভারি ফি:</span>
                  <span className="font-black text-emerald-800">
                    ৳{order.isFreeDelivery ? 0 : feeEst.deliverySubtotal}
                  </span>
                </div>

                {feeEst.processingFee > 0 && (
                  <div className="flex items-center justify-between text-gray-500 text-[11px]">
                    <span>প্রসেসিং ফি:</span>
                    <span className="font-bold">৳{feeEst.processingFee}</span>
                  </div>
                )}

                <div className="pt-2 border-t border-emerald-200/60 flex items-center justify-between font-black text-emerald-950 text-sm">
                  <span>Total</span>
                  <span className="text-base text-emerald-700 font-black">
                    ৳{finalTotalAmount}
                    {items.some((i) => i.isCustom) && (
                      <span className="text-[10px] text-amber-700 ml-1 font-bold">
                        (+কাস্টম)
                      </span>
                    )}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Drawer Footer Actions */}
          <div className="p-4 border-t border-gray-100 bg-white space-y-2">
            {items.length > 0 ? (
              <button
                type="button"
                onClick={handleUpdateOrder}
                disabled={updatingOrder}
                className="w-full py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white font-black text-sm shadow-lg shadow-emerald-600/30 flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
              >
                {updatingOrder ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>আপডেট হচ্ছে...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>Update Order (৳{finalTotalAmount})</span>
                  </>
                )}
              </button>
            ) : (
              <button
                type="button"
                onClick={onClose}
                className="w-full py-3 rounded-2xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs transition-colors cursor-pointer"
              >
                বাতিল করুন
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Add / Edit Custom Item Modal */}
      <AddCustomItemModal
        isOpen={showAddCustomModal}
        onClose={() => {
          setShowAddCustomModal(false);
          setEditingCustomIndex(null);
        }}
        isEditing={editingCustomIndex !== null}
        defaultBuyFrom={
          customItemToEdit?.buyFrom || orderShop?.name || pickupAddress || undefined
        }
        defaultDescription={customItemToEdit?.name || undefined}
        defaultQuantity={customItemToEdit?.qty}
        onAddItems={handleSaveCustomItems}
        onAddItem={(item) => handleSaveCustomItems([item])}
      />

      {/* Map Picker Modal for Delivery */}
      <MapPickerModal
        isOpen={showDeliveryMapPicker}
        onClose={() => setShowDeliveryMapPicker(false)}
        title="ডেলিভারি ঠিকানা সিলেক্ট করুন"
        initialLocation={{
          address: deliveryAddress,
          lat: deliveryLat,
          lng: deliveryLng,
        }}
        addressLabel="Your Building name & flat no"
        addressPlaceholder="Your Building name & flat no"
        onSelectLocation={(loc) => {
          setDeliveryAddress(loc.address);
          if (loc.lat) setDeliveryLat(loc.lat);
          if (loc.lng) setDeliveryLng(loc.lng);
        }}
      />

      {/* Map Picker Modal for Pickup */}
      <MapPickerModal
        isOpen={showPickupMapPicker}
        onClose={() => setShowPickupMapPicker(false)}
        title="পিকআপ লোকেশন সিলেক্ট করুন"
        initialLocation={{
          address: pickupAddress,
          lat: pickupLat,
          lng: pickupLng,
        }}
        addressLabel="Name of Store, Market or Area"
        addressPlaceholder="Name of Store, Market or Area"
        onSelectLocation={(loc) => {
          setPickupAddress(loc.address);
          if (loc.lat) setPickupLat(loc.lat);
          if (loc.lng) setPickupLng(loc.lng);
        }}
      />
    </>
  );
};
