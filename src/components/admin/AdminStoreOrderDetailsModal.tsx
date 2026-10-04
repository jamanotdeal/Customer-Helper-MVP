'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { ShopOrder, ShopOrderStatus, ShopOrderItemPrice, Shop } from '@/types';
import { fallbackStore } from '@/lib/firebase';
import { useModal } from '../CustomModal';
import { useAuth } from '@/context/AuthContext';
import { getElapsedTime } from '@/lib/timeUtils';
import {
  X,
  Store,
  Bike,
  ShoppingBag,
  Clock,
  CheckCircle2,
  Trash2,
  Plus,
  Phone,
  MessageSquare,
  FileText,
  Printer,
  ExternalLink,
  Save,
  Tag,
  AlertCircle,
  User,
  MapPin,
  DollarSign,
  Percent,
  Check,
  ChevronRight,
} from 'lucide-react';

interface AdminStoreOrderDetailsModalProps {
  shopOrderId: string;
  onClose: () => void;
  onViewParentOrder?: (parentOrderId: string) => void;
}

const STATUS_OPTIONS: { status: ShopOrderStatus; label: string; activeClass: string; badgeClass: string }[] = [
  { status: 'PENDING', label: 'Pending', activeClass: 'bg-amber-500 text-white shadow-xs', badgeClass: 'bg-amber-50 text-amber-700 border-amber-200' },
  { status: 'ACCEPTED', label: 'Accepted', activeClass: 'bg-blue-600 text-white shadow-xs', badgeClass: 'bg-blue-50 text-blue-700 border-blue-200' },
  { status: 'PREPARING', label: 'Preparing', activeClass: 'bg-purple-600 text-white shadow-xs', badgeClass: 'bg-purple-50 text-purple-700 border-purple-200' },
  { status: 'READY', label: 'Ready', activeClass: 'bg-teal-600 text-white shadow-xs', badgeClass: 'bg-teal-50 text-teal-700 border-teal-200' },
  { status: 'HANDOVER', label: 'Handover', activeClass: 'bg-indigo-600 text-white shadow-xs', badgeClass: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  { status: 'DELIVERED', label: 'Delivered', activeClass: 'bg-emerald-600 text-white shadow-xs', badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  { status: 'CANCELED', label: 'Canceled', activeClass: 'bg-rose-600 text-white shadow-xs', badgeClass: 'bg-rose-50 text-rose-700 border-rose-200' },
];

export const AdminStoreOrderDetailsModal: React.FC<AdminStoreOrderDetailsModalProps> = ({
  shopOrderId,
  onClose,
  onViewParentOrder,
}) => {
  const { showAlert, showConfirm } = useModal();
  const { user: currentUser } = useAuth();

  const [shopOrder, setShopOrder] = useState<ShopOrder | undefined>(() =>
    fallbackStore.shopOrders.get(shopOrderId)
  );

  // Sync with reactive store
  useEffect(() => {
    const sync = () => {
      const fresh = fallbackStore.shopOrders.get(shopOrderId);
      setShopOrder(fresh ? { ...fresh } : undefined);
    };
    sync();
    const unsub = fallbackStore.subscribe(sync);
    return () => unsub();
  }, [shopOrderId]);

  // Form State
  const [selectedShopId, setSelectedShopId] = useState<string>('');
  const [requestText, setRequestText] = useState<string>('');
  const [priceInput, setPriceInput] = useState<string>('');
  const [sellerName, setSellerName] = useState<string>('');
  const [sellerPhone, setSellerPhone] = useState<string>('');
  const [helperNote, setHelperNote] = useState<string>('');
  const [storeNote, setStoreNote] = useState<string>('');
  const [currentStatus, setCurrentStatus] = useState<ShopOrderStatus>('PENDING');
  const [itemsWithPrice, setItemsWithPrice] = useState<ShopOrderItemPrice[]>([]);
  const [statusChangeNote, setStatusChangeNote] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Populate form on load / update
  useEffect(() => {
    if (shopOrder) {
      setSelectedShopId(shopOrder.shopId || '');
      setRequestText(shopOrder.requestText || '');
      setPriceInput(shopOrder.price !== undefined && shopOrder.price !== null ? String(shopOrder.price) : '');
      setSellerName(shopOrder.sellerName || '');
      setSellerPhone(shopOrder.sellerPhone || '');
      setHelperNote(shopOrder.helperNote || '');
      setStoreNote(shopOrder.note || '');
      setCurrentStatus(shopOrder.status || 'PENDING');
      setItemsWithPrice(
        shopOrder.itemsWithPrice && shopOrder.itemsWithPrice.length > 0
          ? shopOrder.itemsWithPrice.map((it) => ({ ...it }))
          : []
      );
    }
  }, [shopOrder]);

  if (!shopOrder) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
        <div className="bg-white rounded-3xl p-6 max-w-sm w-full text-center space-y-4 shadow-2xl border border-gray-100">
          <AlertCircle className="w-10 h-10 text-rose-500 mx-auto" />
          <div>
            <h3 className="text-base font-extrabold text-gray-900">Store Order Not Found</h3>
            <p className="text-xs text-gray-500 mt-1">This store order may have been removed or does not exist.</p>
          </div>
          <button
            onClick={onClose}
            className="w-full py-2.5 bg-gray-900 hover:bg-black text-white rounded-xl text-xs font-bold transition-all shadow-xs"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  const shopsList: Shop[] = Array.from(fallbackStore.shops.values());
  const selectedShop = shopsList.find((s) => s.id === selectedShopId) || fallbackStore.shops.get(shopOrder.shopId);
  const parentOrder = shopOrder.parentOrderId ? fallbackStore.orders.get(shopOrder.parentOrderId) : undefined;

  // Resolve helper user & contact phone from multiple fallback sources
  const helperUser = shopOrder.helperId
    ? fallbackStore.users.get(shopOrder.helperId)
    : parentOrder?.helperId
    ? fallbackStore.users.get(parentOrder.helperId)
    : Array.from(fallbackStore.users.values()).find(
        (u) =>
          u.displayName &&
          shopOrder.helperName &&
          u.displayName.trim().toLowerCase() === shopOrder.helperName.trim().toLowerCase()
      );

  const helperAppEntry = shopOrder.helperId
    ? Array.from(fallbackStore.helperApplications.values()).find(
        (app) => app.userId === shopOrder.helperId || app.userName === shopOrder.helperName
      )
    : undefined;

  const helperPhone =
    parentOrder?.helperPhone ||
    helperUser?.alternativePhone ||
    helperUser?.phoneNumber ||
    helperAppEntry?.whatsapp ||
    '';

  // Commission calculations
  const commissionRate = Number(selectedShop?.commissionPercent || 0);
  const parsedGrossPrice = Number(priceInput) || 0;
  const commissionAmount = currentStatus === 'CANCELED' ? 0 : Math.round(parsedGrossPrice * (commissionRate / 100));
  const netStoreEarnings = currentStatus === 'CANCELED' ? 0 : Math.max(0, parsedGrossPrice - commissionAmount);

  // Items manipulation
  const handleAddItem = () => {
    setItemsWithPrice([...itemsWithPrice, { name: '', unit: '', price: undefined }]);
  };

  const handleUpdateItem = (index: number, field: keyof ShopOrderItemPrice, value: any) => {
    const updated = [...itemsWithPrice];
    updated[index] = { ...updated[index], [field]: value };
    setItemsWithPrice(updated);
  };

  const handleRemoveItem = (index: number) => {
    setItemsWithPrice(itemsWithPrice.filter((_, i) => i !== index));
  };

  const handleAutoSumPrices = () => {
    const sum = itemsWithPrice.reduce((acc, item) => acc + (Number(item.price) || 0), 0);
    setPriceInput(String(sum));
  };

  // Status Change Handler
  const handleQuickStatusChange = async (targetStatus: ShopOrderStatus) => {
    if (targetStatus === currentStatus) return;

    const confirmed = await showConfirm(
      `Update Status to ${targetStatus}?`,
      `Are you sure you want to change store order status from ${currentStatus} to ${targetStatus}?`
    );
    if (!confirmed) return;

    try {
      const actorName = currentUser?.displayName || 'Admin';
      await fallbackStore.updateShopOrderDetails(
        shopOrder.id,
        {
          status: targetStatus,
          note: statusChangeNote.trim() || storeNote.trim() || undefined,
        },
        actorName
      );
      setCurrentStatus(targetStatus);
      setStatusChangeNote('');
      showAlert('Status Updated', `Status changed to ${targetStatus}`, 'success');
    } catch (e: any) {
      showAlert('Error', e?.message || 'Failed to update status', 'error');
    }
  };

  // Save changes handler
  const handleSaveChanges = async () => {
    setIsSaving(true);
    try {
      const parsedPrice = priceInput.trim() !== '' ? Number(priceInput) : undefined;
      const targetShop = shopsList.find((s) => s.id === selectedShopId);
      const actorName = currentUser?.displayName || 'Admin';

      const cleanItems = itemsWithPrice
        .filter((it) => it.name.trim() !== '')
        .map((it) => ({
          name: it.name.trim(),
          unit: it.unit?.trim() || undefined,
          price: it.price !== undefined && it.price !== null && !isNaN(Number(it.price)) ? Number(it.price) : undefined,
        }));

      await fallbackStore.updateShopOrderDetails(
        shopOrder.id,
        {
          shopId: selectedShopId || shopOrder.shopId,
          shopName: targetShop?.name || shopOrder.shopName,
          requestText: requestText.trim(),
          helperNote: helperNote.trim() || undefined,
          itemsWithPrice: cleanItems,
          price: parsedPrice,
          sellerName: sellerName.trim() || undefined,
          sellerPhone: sellerPhone.trim() || undefined,
          note: storeNote.trim() || undefined,
          status: currentStatus,
        },
        actorName
      );

      showAlert('Changes Saved', 'Store order details updated successfully.', 'success');
    } catch (e: any) {
      showAlert('Error', e?.message || 'Failed to save store order changes', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // Delete Handler
  const handleDeleteOrder = async () => {
    const confirmed = await showConfirm(
      'Delete Store Order',
      `Permanently delete Store Order #${shopOrder.id}? This action cannot be reversed.`
    );
    if (!confirmed) return;

    setIsDeleting(true);
    try {
      await fallbackStore.deleteShopOrder(shopOrder.id);
      showAlert('Deleted', 'Store order was successfully deleted.', 'success');
      onClose();
    } catch (e: any) {
      showAlert('Error', e?.message || 'Failed to delete store order', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  // Print Slip
  const handlePrintSlip = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const itemsRows = itemsWithPrice.length > 0
      ? itemsWithPrice.map((it) => `<tr><td style="padding:6px 8px;border-bottom:1px solid #eee;">${it.name}${it.unit ? ` (${it.unit})` : ''}</td><td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right;">৳${it.price ?? 0}</td></tr>`).join('')
      : `<tr><td colspan="2" style="padding:6px 8px;border-bottom:1px solid #eee;">${shopOrder.requestText}</td></tr>`;

    printWindow.document.write(`
      <html>
        <head>
          <title>Store Order #${shopOrder.id}</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; font-size: 12px; padding: 24px; color: #1e293b; line-height: 1.5; }
            h2 { font-size: 16px; margin: 0 0 4px 0; font-weight: 800; color: #0f172a; }
            .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 12px 0; background: #f8fafc; padding: 12px; border-radius: 8px; border: 1px solid #e2e8f0; }
            .meta-item { font-size: 11px; }
            .meta-label { color: #64748b; font-weight: 600; text-transform: uppercase; font-size: 9px; }
            .meta-val { font-weight: 700; color: #0f172a; margin-top: 1px; }
            table { width: 100%; border-collapse: collapse; margin-top: 14px; }
            th { text-align: left; background: #f1f5f9; padding: 8px; font-size: 10px; font-weight: 800; color: #475569; text-transform: uppercase; }
            .badge { display: inline-block; padding: 2px 6px; font-size: 10px; font-weight: 800; border-radius: 4px; background: #e0e7ff; color: #3730a3; }
          </style>
        </head>
        <body>
          <h2>JAMANOT — Store Order Slip</h2>
          <div class="meta-grid">
            <div class="meta-item"><div class="meta-label">Store Order ID</div><div class="meta-val">#${shopOrder.id}</div></div>
            <div class="meta-item"><div class="meta-label">Customer Order ID</div><div class="meta-val">#${shopOrder.parentOrderId}</div></div>
            <div class="meta-item"><div class="meta-label">Store / Shop</div><div class="meta-val">${selectedShop?.name || shopOrder.shopName} (${selectedShop?.whatsapp || 'N/A'})</div></div>
            <div class="meta-item"><div class="meta-label">Helper / Rider</div><div class="meta-val">${shopOrder.helperName} (${helperPhone || 'N/A'})</div></div>
            <div class="meta-item"><div class="meta-label">Status</div><div class="meta-val"><span class="badge">${currentStatus}</span></div></div>
            <div class="meta-item"><div class="meta-label">Created At</div><div class="meta-val">${new Date(shopOrder.createdAt).toLocaleString()}</div></div>
          </div>
          <table>
            <thead>
              <tr>
                <th>Item / Description</th>
                <th style="text-align:right;">Price</th>
              </tr>
            </thead>
            <tbody>
              ${itemsRows}
            </tbody>
            <tfoot>
              <tr>
                <td style="padding:10px 8px;font-weight:800;font-size:12px;">Total Product Price:</td>
                <td style="padding:10px 8px;text-align:right;font-weight:900;font-size:14px;">৳${priceInput || shopOrder.price || 0}</td>
              </tr>
            </tfoot>
          </table>
          ${storeNote ? `<p style="margin-top:14px;font-size:11px;background:#f8fafc;padding:8px 12px;border-radius:6px;"><strong>Store Note:</strong> ${storeNote}</p>` : ''}
          <script>
            window.onload = function() { window.print(); }
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const activeStatusMeta = STATUS_OPTIONS.find((s) => s.status === currentStatus) || STATUS_OPTIONS[0];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-900/60 backdrop-blur-xs overflow-y-auto animate-fadeIn">
      <div className="relative w-full max-w-4xl bg-white rounded-3xl shadow-2xl border border-gray-150 overflow-hidden my-auto max-h-[92vh] flex flex-col">
        
        {/* Minimalist Clean Header */}
        <div className="px-6 py-4 bg-white border-b border-gray-150 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3 flex-wrap">
            <div className="p-2 rounded-xl bg-slate-100 text-slate-800 border border-slate-200">
              <Store className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-extrabold text-gray-900 tracking-tight flex items-center gap-1.5">
                  <span>Store Order</span>
                  <span className="font-mono text-purple-700 bg-purple-50 px-2 py-0.5 rounded-lg text-xs font-black border border-purple-100">
                    #{shopOrder.id.slice(-6)}
                  </span>
                </h2>
                <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wider border ${activeStatusMeta.badgeClass}`}>
                  {activeStatusMeta.label}
                </span>
                {shopOrder.viewedByStore && (
                  <span className="inline-flex items-center gap-1 text-[10px] text-emerald-700 font-extrabold bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                    <CheckCircle2 className="w-3 h-3" /> Seen
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 text-[11px] text-gray-500 font-medium mt-0.5">
                <span>{new Date(shopOrder.createdAt).toLocaleDateString()} at {new Date(shopOrder.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                <span>•</span>
                <span className="text-gray-400">{getElapsedTime(shopOrder.createdAt)}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={handlePrintSlip}
              title="Print Order Slip"
              className="px-3 py-1.5 rounded-xl bg-gray-50 hover:bg-gray-100 text-gray-700 border border-gray-200 transition-colors flex items-center gap-1.5 text-xs font-bold cursor-pointer active:scale-95"
            >
              <Printer className="w-3.5 h-3.5 text-gray-500" />
              <span className="hidden sm:inline">Print Slip</span>
            </button>
            <button
              onClick={onClose}
              title="Close Modal"
              className="p-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-600 hover:text-gray-900 transition-colors cursor-pointer active:scale-95 flex items-center justify-center"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-5 flex-1 text-gray-800 text-xs sm:text-sm bg-gray-50/40">
          
          {/* Quick Context 3-Column Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            
            {/* 1. Customer & Parent Order */}
            <div className="bg-white rounded-2xl p-4 border border-gray-200/90 shadow-2xs space-y-2.5 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-purple-700 flex items-center gap-1">
                    <ShoppingBag className="w-3.5 h-3.5" /> Customer Order
                  </span>
                  <span className="text-[10px] font-mono font-bold text-gray-400">
                    #{shopOrder.parentOrderId ? shopOrder.parentOrderId.slice(-6) : 'N/A'}
                  </span>
                </div>
                
                {parentOrder ? (
                  <div className="space-y-1 mt-2">
                    <p className="font-extrabold text-sm text-gray-900">{parentOrder.customerName || 'Customer'}</p>
                    {parentOrder.customerPhone && (
                      <p className="text-xs font-mono font-bold text-gray-600">{parentOrder.customerPhone}</p>
                    )}
                    {parentOrder.deliveryLocation?.address && (
                      <div className="flex items-start gap-1 text-[11px] text-gray-500 pt-1 line-clamp-2">
                        <MapPin className="w-3 h-3 text-gray-400 shrink-0 mt-0.5" />
                        <span>{parentOrder.deliveryLocation.address}</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="mt-2 text-xs text-gray-500">
                    Parent Order: <span className="font-mono font-bold">#{shopOrder.parentOrderId}</span>
                  </div>
                )}
              </div>

              {onViewParentOrder && shopOrder.parentOrderId && (
                <button
                  type="button"
                  onClick={() => onViewParentOrder(shopOrder.parentOrderId)}
                  className="w-full py-1.5 px-3 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-900 font-extrabold text-[11px] transition-all flex items-center justify-center gap-1.5 border border-purple-200/60 cursor-pointer active:scale-98"
                >
                  <span>View Customer Order</span>
                  <ExternalLink className="w-3 h-3 text-purple-700" />
                </button>
              )}
            </div>

            {/* 2. Store Details */}
            <div className="bg-white rounded-2xl p-4 border border-gray-200/90 shadow-2xs space-y-2.5 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700 flex items-center gap-1">
                    <Store className="w-3.5 h-3.5" /> Assigned Store
                  </span>
                  {commissionRate > 0 && (
                    <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-100">
                      {commissionRate}% Fee
                    </span>
                  )}
                </div>

                <div className="mt-2 space-y-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="font-extrabold text-sm text-gray-900">{selectedShop?.name || shopOrder.shopName}</p>
                    {selectedShop?.type && (
                      <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-md bg-gray-100 text-gray-600">
                        {selectedShop.type}
                      </span>
                    )}
                  </div>
                  {selectedShop?.contactPerson && (
                    <p className="text-[11px] text-gray-500">Contact: {selectedShop.contactPerson}</p>
                  )}
                  {selectedShop?.whatsapp && (
                    <p className="text-xs font-mono font-bold text-gray-600">{selectedShop.whatsapp}</p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1.5 flex-wrap pt-1">
                {selectedShop?.whatsapp && (
                  <a
                    href={`https://wa.me/${selectedShop.whatsapp.replace(/[^0-9]/g, '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 py-1.5 px-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-extrabold text-[11px] transition-all flex items-center justify-center gap-1 border border-emerald-200"
                  >
                    <MessageSquare className="w-3 h-3 text-emerald-700" /> WhatsApp
                  </a>
                )}
                {selectedShop?.whatsapp && (
                  <a
                    href={`tel:${selectedShop.whatsapp}`}
                    className="py-1.5 px-2.5 rounded-xl bg-gray-50 hover:bg-gray-100 text-gray-700 font-bold text-[11px] border border-gray-200"
                  >
                    <Phone className="w-3 h-3 text-gray-600" />
                  </a>
                )}
              </div>
            </div>

            {/* 3. Helper / Rider Details */}
            <div className="bg-white rounded-2xl p-4 border border-gray-200/90 shadow-2xs space-y-2.5 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 flex items-center gap-1">
                    <Bike className="w-3.5 h-3.5" /> Assigned Helper
                  </span>
                  {helperUser?.helperType && (
                    <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-100">
                      {helperUser.helperType}
                    </span>
                  )}
                </div>

                <div className="mt-2 space-y-1">
                  <p className="font-extrabold text-sm text-gray-900">{shopOrder.helperName || 'Helper'}</p>
                  <p className="text-xs font-mono font-bold text-gray-600">
                    {helperPhone ? helperPhone : <span className="text-gray-400 font-normal text-[11px]">No phone listed</span>}
                  </p>
                </div>
              </div>

              {helperPhone && (
                <div className="flex items-center gap-1.5 flex-wrap pt-1">
                  <a
                    href={`tel:${helperPhone}`}
                    className="flex-1 py-1.5 px-2 rounded-xl bg-gray-50 hover:bg-gray-100 text-gray-800 font-extrabold text-[11px] transition-all flex items-center justify-center gap-1 border border-gray-200"
                  >
                    <Phone className="w-3 h-3 text-gray-600" /> Call Helper
                  </a>
                  <a
                    href={`https://wa.me/880${helperPhone.replace(/^0/, '').replace(/[^0-9]/g, '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="py-1.5 px-2.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold text-[11px] border border-emerald-200"
                  >
                    <MessageSquare className="w-3 h-3 text-emerald-700" />
                  </a>
                </div>
              )}
            </div>
          </div>

          {/* Status Progression Segmented Control */}
          <div className="bg-white rounded-2xl p-3.5 sm:p-4 border border-gray-200/90 shadow-2xs space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5 text-purple-600" />
                Status Progression
              </span>
              <span className="text-[11px] text-gray-500 font-semibold">
                Click any step to transition order status
              </span>
            </div>

            {/* Stepper Buttons */}
            <div className="grid grid-cols-2 sm:grid-cols-7 gap-1.5">
              {STATUS_OPTIONS.map((step) => {
                const isActive = currentStatus === step.status;
                return (
                  <button
                    key={step.status}
                    type="button"
                    onClick={() => handleQuickStatusChange(step.status)}
                    className={`py-2 px-1.5 rounded-xl text-center font-extrabold text-xs transition-all border flex items-center justify-center gap-1 cursor-pointer active:scale-98 ${
                      isActive
                        ? `${step.activeClass} border-transparent`
                        : 'bg-gray-50/80 text-gray-700 border-gray-200 hover:bg-gray-100 hover:border-gray-300'
                    }`}
                  >
                    <span>{step.label}</span>
                    {isActive && <Check className="w-3.5 h-3.5" />}
                  </button>
                );
              })}
            </div>

            {/* Status Change Note Input */}
            <div className="pt-1">
              <input
                type="text"
                value={statusChangeNote}
                onChange={(e) => setStatusChangeNote(e.target.value)}
                placeholder="Optional reason or note when updating status..."
                className="w-full px-3 py-1.5 bg-gray-50/80 border border-gray-200 rounded-xl text-xs font-medium text-gray-800 placeholder:text-gray-400 focus:outline-none focus:border-purple-600 focus:bg-white"
              />
            </div>
          </div>

          {/* Main 2-Column Form Details */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* Left Column: Request Text & Store Notes */}
            <div className="space-y-3.5">
              
              {/* Re-assign Store */}
              <div className="bg-white rounded-2xl p-4 border border-gray-200/90 shadow-2xs space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-wider text-gray-500 block">
                  Assigned Store
                </label>
                <select
                  value={selectedShopId}
                  onChange={(e) => setSelectedShopId(e.target.value)}
                  className="w-full p-2.5 bg-gray-50/80 border border-gray-200 rounded-xl text-xs font-bold text-gray-900 focus:outline-none focus:border-purple-600 focus:bg-white"
                >
                  <option value="">Select Store...</option>
                  {shopsList.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} {s.type ? `(${s.type})` : ''} {s.whatsapp ? `— ${s.whatsapp}` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Helper Request Items */}
              <div className="bg-white rounded-2xl p-4 border border-gray-200/90 shadow-2xs space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-wider text-gray-500 block">
                  Helper's Order Request / Items
                </label>
                <textarea
                  rows={3}
                  value={requestText}
                  onChange={(e) => setRequestText(e.target.value)}
                  placeholder="Items or notes typed by helper..."
                  className="w-full p-2.5 bg-gray-50/80 border border-gray-200 rounded-xl text-xs font-semibold text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-purple-600 focus:bg-white resize-none"
                />
              </div>

              {/* Helper Instruction / Note */}
              <div className="bg-white rounded-2xl p-4 border border-gray-200/90 shadow-2xs space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-wider text-amber-700 block">
                  Helper Special Instruction / Note
                </label>
                <textarea
                  rows={2}
                  value={helperNote}
                  onChange={(e) => setHelperNote(e.target.value)}
                  placeholder="Special instructions or notes typed by helper..."
                  className="w-full p-2.5 bg-amber-50/40 border border-amber-200/80 rounded-xl text-xs font-semibold text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-amber-500 resize-none"
                />
              </div>

              {/* Store Note to Helper */}
              <div className="bg-white rounded-2xl p-4 border border-gray-200/90 shadow-2xs space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-wider text-gray-500 block">
                  Store Note to Helper
                </label>
                <textarea
                  rows={2}
                  value={storeNote}
                  onChange={(e) => setStoreNote(e.target.value)}
                  placeholder="Special note or instructions from store/admin..."
                  className="w-full p-2.5 bg-gray-50/80 border border-gray-200 rounded-xl text-xs font-semibold text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-purple-600 focus:bg-white resize-none"
                />
              </div>

              {/* Third-Party Vendor (Optional) */}
              <div className="bg-white rounded-2xl p-4 border border-gray-200/90 shadow-2xs space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-wider text-gray-500 block">
                  Custom Vendor Details (Optional)
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={sellerName}
                    onChange={(e) => setSellerName(e.target.value)}
                    placeholder="Vendor Name"
                    className="w-full p-2 bg-gray-50/80 border border-gray-200 rounded-xl text-xs font-semibold text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-purple-600"
                  />
                  <input
                    type="text"
                    value={sellerPhone}
                    onChange={(e) => setSellerPhone(e.target.value)}
                    placeholder="Vendor Phone"
                    className="w-full p-2 bg-gray-50/80 border border-gray-200 rounded-xl text-xs font-semibold text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-purple-600"
                  />
                </div>
              </div>
            </div>

            {/* Right Column: Itemized Price Breakdown & Financial Card */}
            <div className="space-y-3.5">
              
              {/* Divided Items Breakdown */}
              <div className="bg-white rounded-2xl p-4 border border-gray-200/90 shadow-2xs space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-gray-500 block">
                    Divided Items Breakdown ({itemsWithPrice.length})
                  </label>
                  <button
                    type="button"
                    onClick={handleAddItem}
                    className="px-2.5 py-1 rounded-lg bg-purple-50 hover:bg-purple-100 text-purple-900 font-extrabold text-[11px] transition-all flex items-center gap-1 cursor-pointer border border-purple-200"
                  >
                    <Plus className="w-3 h-3 text-purple-700" /> Add Item
                  </button>
                </div>

                {itemsWithPrice.length === 0 ? (
                  <div className="text-center py-5 text-gray-400 text-xs font-medium border border-dashed border-gray-200 rounded-xl bg-gray-50/50">
                    No divided items added. Click &quot;Add Item&quot; to break down pricing.
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                    {itemsWithPrice.map((item, idx) => (
                      <div key={idx} className="flex items-center gap-2 bg-gray-50/80 p-2 rounded-xl border border-gray-200">
                        <input
                          type="text"
                          value={item.name}
                          onChange={(e) => handleUpdateItem(idx, 'name', e.target.value)}
                          placeholder="Item Name"
                          className="flex-1 px-2.5 py-1 bg-white border border-gray-200 rounded-lg text-xs font-semibold text-gray-900 focus:outline-none focus:border-purple-600"
                        />
                        <input
                          type="text"
                          value={item.unit || ''}
                          onChange={(e) => handleUpdateItem(idx, 'unit', e.target.value)}
                          placeholder="Unit (1kg)"
                          className="w-20 px-2 py-1 bg-white border border-gray-200 rounded-lg text-xs font-semibold text-gray-900 focus:outline-none focus:border-purple-600"
                        />
                        <div className="relative w-24">
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-xs">৳</span>
                          <input
                            type="number"
                            value={item.price !== undefined ? item.price : ''}
                            onChange={(e) => handleUpdateItem(idx, 'price', e.target.value === '' ? undefined : Number(e.target.value))}
                            placeholder="Price"
                            className="w-full pl-5 pr-2 py-1 bg-white border border-gray-200 rounded-lg text-xs font-mono font-bold text-gray-900 focus:outline-none focus:border-purple-600"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(idx)}
                          className="p-1 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                          title="Remove"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {itemsWithPrice.length > 0 && (
                  <button
                    type="button"
                    onClick={handleAutoSumPrices}
                    className="text-[11px] font-extrabold text-purple-700 hover:text-purple-900 transition-colors block cursor-pointer"
                  >
                    Sync Total Price with Sum of Items (৳{itemsWithPrice.reduce((a, b) => a + (Number(b.price) || 0), 0)})
                  </button>
                )}
              </div>

              {/* Total Order Cost & Financial Breakdown */}
              <div className="bg-white rounded-2xl p-4 border border-gray-200/90 shadow-2xs space-y-3">
                <label className="text-[10px] font-bold uppercase tracking-wider text-gray-500 block">
                  Total Store Order Cost / Price
                </label>
                
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500 font-black text-base">৳</span>
                  <input
                    type="number"
                    value={priceInput}
                    onChange={(e) => setPriceInput(e.target.value)}
                    placeholder="0"
                    className="w-full pl-8 pr-4 py-2.5 bg-gray-50/80 border border-gray-200 rounded-xl text-lg font-mono font-black text-gray-900 focus:outline-none focus:border-purple-600 focus:bg-white"
                  />
                </div>

                {/* Live Financial Breakdown Cards */}
                <div className="grid grid-cols-3 gap-2 pt-1 text-center">
                  <div className="p-2 rounded-xl bg-gray-50 border border-gray-100">
                    <span className="text-[9px] font-bold text-gray-400 uppercase block">Gross Price</span>
                    <span className="text-xs font-black text-gray-900">৳{parsedGrossPrice}</span>
                  </div>
                  <div className="p-2 rounded-xl bg-rose-50/60 border border-rose-100">
                    <span className="text-[9px] font-bold text-rose-700 uppercase block">Fee ({commissionRate}%)</span>
                    <span className="text-xs font-black text-rose-700">-৳{commissionAmount}</span>
                  </div>
                  <div className="p-2 rounded-xl bg-emerald-50/60 border border-emerald-100">
                    <span className="text-[9px] font-bold text-emerald-800 uppercase block">Store Net</span>
                    <span className="text-xs font-black text-emerald-800">৳{netStoreEarnings}</span>
                  </div>
                </div>
              </div>

              {/* Audit Trail & Status History */}
              {shopOrder.statusHistory && shopOrder.statusHistory.length > 0 && (
                <div className="bg-white rounded-2xl p-4 border border-gray-200/90 shadow-2xs space-y-2.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500 block flex items-center gap-1">
                    <FileText className="w-3.5 h-3.5 text-gray-400" />
                    Status History & Audit Trail
                  </span>
                  
                  <div className="space-y-2 max-h-[160px] overflow-y-auto pr-1 divide-y divide-gray-100">
                    {shopOrder.statusHistory.map((h, i) => (
                      <div key={i} className="pt-2 first:pt-0 flex items-start justify-between gap-2 text-xs">
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-extrabold text-[10px] uppercase text-purple-700 bg-purple-50 px-1.5 py-0.2 rounded border border-purple-100">
                              {h.status}
                            </span>
                            <span className="font-bold text-gray-800 text-[11px]">{h.actor || 'System'}</span>
                          </div>
                          {h.note && (
                            <p className="text-gray-500 text-[10px] italic mt-0.5">&quot;{h.note}&quot;</p>
                          )}
                        </div>
                        <span className="text-[10px] font-mono text-gray-400 shrink-0">
                          {new Date(h.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Modal Minimalist Footer */}
        <div className="px-6 py-3.5 bg-white border-t border-gray-150 flex items-center justify-between shrink-0 flex-wrap gap-3">
          <button
            type="button"
            onClick={handleDeleteOrder}
            disabled={isDeleting}
            className="px-3 py-2 rounded-xl text-rose-600 hover:bg-rose-50 font-bold text-xs transition-colors flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>{isDeleting ? 'Deleting...' : 'Delete Store Order'}</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs transition-colors cursor-pointer"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleSaveChanges}
              disabled={isSaving}
              className="px-5 py-2 rounded-xl bg-slate-900 hover:bg-black text-white font-extrabold text-xs transition-all shadow-xs flex items-center gap-1.5 disabled:opacity-50 active:scale-95 cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{isSaving ? 'Saving...' : 'Save Changes'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
