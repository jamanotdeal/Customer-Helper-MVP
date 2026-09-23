'use client';

import React, { useState, useEffect } from 'react';
import { ShopOrder, ShopOrderStatus, ShopOrderItemPrice, Shop } from '@/types';
import { fallbackStore } from '@/lib/firebase';
import { useModal } from '../CustomModal';
import { useAuth } from '@/context/AuthContext';
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
  ArrowRight,
  User,
} from 'lucide-react';

interface AdminStoreOrderDetailsModalProps {
  shopOrderId: string;
  onClose: () => void;
  onViewParentOrder?: (parentOrderId: string) => void;
}

const STATUS_STEPS: { status: ShopOrderStatus; label: string; color: string }[] = [
  { status: 'PENDING', label: 'Pending', color: 'bg-amber-500 text-white' },
  { status: 'ACCEPTED', label: 'Accepted', color: 'bg-blue-600 text-white' },
  { status: 'PREPARING', label: 'Preparing', color: 'bg-purple-600 text-white' },
  { status: 'READY', label: 'Ready', color: 'bg-teal-600 text-white' },
  { status: 'HANDOVER', label: 'Handover', color: 'bg-indigo-600 text-white' },
  { status: 'DELIVERED', label: 'Delivered', color: 'bg-emerald-600 text-white' },
];

export const AdminStoreOrderDetailsModal: React.FC<AdminStoreOrderDetailsModalProps> = ({
  shopOrderId,
  onClose,
  onViewParentOrder,
}) => {
  const { showAlert, showConfirm } = useModal();
  const { user: currentUser } = useAuth();
  const isSuperAdmin = currentUser?.isSuperAdmin ?? false;

  const [shopOrder, setShopOrder] = useState<ShopOrder | undefined>(() =>
    fallbackStore.shopOrders.get(shopOrderId)
  );

  // Sync with store
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
  const [storeNote, setStoreNote] = useState<string>('');
  const [currentStatus, setCurrentStatus] = useState<ShopOrderStatus>('PENDING');
  const [itemsWithPrice, setItemsWithPrice] = useState<ShopOrderItemPrice[]>([]);
  const [statusChangeNote, setStatusChangeNote] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Populate form on load
  useEffect(() => {
    if (shopOrder) {
      setSelectedShopId(shopOrder.shopId || '');
      setRequestText(shopOrder.requestText || '');
      setPriceInput(shopOrder.price !== undefined && shopOrder.price !== null ? String(shopOrder.price) : '');
      setSellerName(shopOrder.sellerName || '');
      setSellerPhone(shopOrder.sellerPhone || '');
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
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
        <div className="bg-white rounded-3xl p-6 max-w-sm w-full text-center space-y-4 shadow-2xl">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto" />
          <h3 className="text-base font-bold text-gray-900">Store Order Not Found</h3>
          <p className="text-xs text-gray-500">This store order may have been deleted or does not exist.</p>
          <button
            onClick={onClose}
            className="w-full py-2.5 bg-gray-900 text-white rounded-xl text-xs font-bold"
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

  // Handle Items manipulation
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
    const confirmed = await showConfirm(
      `Change status to "${targetStatus}"?`,
      `Are you sure you want to change this Store Order's status from ${currentStatus} to ${targetStatus}?`
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
      showAlert('Status Updated', `Store Order status changed to ${targetStatus}`, 'success');
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

      // Clean items list
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
          itemsWithPrice: cleanItems,
          price: parsedPrice,
          sellerName: sellerName.trim() || undefined,
          sellerPhone: sellerPhone.trim() || undefined,
          note: storeNote.trim() || undefined,
          status: currentStatus,
        },
        actorName
      );

      showAlert('Saved Successfully', 'Store order details have been updated.', 'success');
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
      `Are you sure you want to permanently delete Store Order #${shopOrder.id}? This action cannot be undone.`
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
            body { font-family: sans-serif; font-size: 12px; padding: 20px; color: #111; }
            h2 { font-size: 16px; margin-bottom: 4px; }
            table { width: 100%; border-collapse: collapse; margin-top: 12px; }
            th { text-align: left; background: #f3f4f6; padding: 6px 8px; }
            .badge { display: inline-block; padding: 3px 8px; font-size: 10px; font-weight: bold; border-radius: 4px; background: #e0e7ff; color: #3730a3; }
          </style>
        </head>
        <body>
          <h2>JAMANOT — Store Order Slip</h2>
          <p><strong>Store Order ID:</strong> #${shopOrder.id}</p>
          <p><strong>Parent Order ID:</strong> #${shopOrder.parentOrderId}</p>
          <p><strong>Shop:</strong> ${selectedShop?.name || shopOrder.shopName} (${selectedShop?.whatsapp || 'N/A'})</p>
          <p><strong>Helper:</strong> ${shopOrder.helperName} (${helperPhone || 'N/A'})</p>
          <p><strong>Status:</strong> <span class="badge">${currentStatus}</span></p>
          <p><strong>Created:</strong> ${new Date(shopOrder.createdAt).toLocaleString()}</p>
          <hr style="border:none;border-top:1px solid #ccc;margin:12px 0;" />
          <h4>Order Items / Request:</h4>
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
                <td style="padding:8px;font-weight:bold;">Total Cost:</td>
                <td style="padding:8px;text-align:right;font-weight:bold;font-size:14px;">৳${priceInput || shopOrder.price || 0}</td>
              </tr>
            </tfoot>
          </table>
          ${storeNote ? `<p style="margin-top:12px;"><strong>Note:</strong> ${storeNote}</p>` : ''}
          <script>
            window.onload = function() { window.print(); }
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const getStatusBadge = (status: ShopOrderStatus) => {
    switch (status) {
      case 'DELIVERED':
        return 'bg-emerald-100 text-emerald-950 border-emerald-300 font-black';
      case 'HANDOVER':
        return 'bg-indigo-100 text-indigo-950 border-indigo-300 font-black';
      case 'READY':
        return 'bg-teal-100 text-teal-950 border-teal-300 font-black';
      case 'PREPARING':
        return 'bg-purple-100 text-purple-950 border-purple-300 font-black';
      case 'ACCEPTED':
        return 'bg-blue-100 text-blue-950 border-blue-300 font-black';
      case 'CANCELED':
        return 'bg-red-100 text-red-950 border-red-300 font-black';
      default:
        return 'bg-amber-100 text-amber-950 border-amber-300 font-black';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/60 backdrop-blur-xs overflow-y-auto animate-fadeIn">
      <div className="relative w-full max-w-4xl bg-white rounded-3xl shadow-2xl border border-gray-150 overflow-hidden my-auto max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="p-5 sm:p-6 bg-gradient-to-r from-purple-950 via-indigo-900 to-purple-900 text-white flex items-center justify-between shrink-0 shadow-md">
          <div className="space-y-1">
            <div className="flex items-center space-x-2.5 flex-wrap">
              <span className="p-2 rounded-xl bg-white/10 text-white border border-white/20">
                <Store className="w-5 h-5" />
              </span>
              <h2 className="text-lg sm:text-xl font-black tracking-tight text-white">
                Store Order #{shopOrder.id}
              </h2>
              <span className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider border ${getStatusBadge(currentStatus)}`}>
                {currentStatus}
              </span>
            </div>
            <div className="flex items-center gap-3 text-xs text-purple-200 font-medium pt-1 flex-wrap">
              <span className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-purple-300" />
                Created: {new Date(shopOrder.createdAt).toLocaleString()}
              </span>
              {shopOrder.viewedByStore && (
                <span className="inline-flex items-center gap-1 text-[11px] text-emerald-300 font-bold bg-emerald-950/40 px-2 py-0.5 rounded-md border border-emerald-500/30">
                  <CheckCircle2 className="w-3 h-3" /> Seen by Store
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={handlePrintSlip}
              title="Print Order Slip"
              className="p-2 sm:px-3 sm:py-2 rounded-xl bg-white/15 hover:bg-white/25 text-white border border-white/20 transition-colors flex items-center gap-1.5 text-xs font-bold shadow-xs cursor-pointer active:scale-95"
            >
              <Printer className="w-4 h-4" />
              <span className="hidden sm:inline">Print Slip</span>
            </button>
            <button
              onClick={onClose}
              title="Close Modal"
              className="p-2 rounded-xl bg-rose-500 hover:bg-rose-600 text-white transition-colors shadow-sm cursor-pointer active:scale-95 flex items-center justify-center"
            >
              <X className="w-5 h-5 text-white" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-6 flex-1 text-gray-800 text-xs sm:text-sm">
          {/* Quick Context Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Parent Delivery Order Box */}
            <div className="bg-purple-50 rounded-2xl p-4 border border-purple-200 space-y-2 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-black uppercase tracking-wider text-purple-950">
                  Parent Customer Order
                </span>
                <ShoppingBag className="w-4 h-4 text-purple-800" />
              </div>
              <div className="font-mono font-black text-sm text-purple-950">
                #{shopOrder.parentOrderId}
              </div>
              {parentOrder && (
                <div className="text-xs text-purple-950 space-y-0.5">
                  <p className="font-black text-gray-900">{parentOrder.customerName}</p>
                  <p className="text-gray-800 font-mono font-bold">{parentOrder.customerPhone}</p>
                </div>
              )}
              {onViewParentOrder && (
                <button
                  onClick={() => onViewParentOrder(shopOrder.parentOrderId)}
                  className="w-full mt-1.5 py-2 px-3 rounded-xl bg-purple-950 hover:bg-black text-white font-black text-xs transition-all flex items-center justify-center gap-1.5 shadow-xs cursor-pointer active:scale-98"
                >
                  <span>Open Customer Order Details</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Shop Details Box */}
            <div className="bg-blue-50 rounded-2xl p-4 border border-blue-200 space-y-2 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-black uppercase tracking-wider text-blue-950">
                  Assigned Store
                </span>
                <Store className="w-4 h-4 text-blue-800" />
              </div>
              <div className="font-black text-sm text-gray-950">
                {selectedShop?.name || shopOrder.shopName}
              </div>
              <div className="text-xs text-gray-900 font-medium space-y-0.5">
                <p><span className="font-bold text-gray-950">Contact:</span> {selectedShop?.contactPerson || 'N/A'}</p>
                <p className="font-mono font-bold text-gray-950">{selectedShop?.whatsapp || 'N/A'}</p>
              </div>
              {selectedShop?.whatsapp && (
                <a
                  href={`https://wa.me/${selectedShop.whatsapp.replace(/[^0-9]/g, '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-black text-emerald-950 bg-emerald-100 px-3 py-1.5 rounded-xl border border-emerald-300 hover:bg-emerald-200 transition-colors"
                >
                  <MessageSquare className="w-3.5 h-3.5 text-emerald-800" /> WhatsApp Store
                </a>
              )}
            </div>

            {/* Helper Details Box */}
            <div className="bg-emerald-50 rounded-2xl p-4 border border-emerald-200 space-y-2 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-black uppercase tracking-wider text-emerald-950">
                  Helper / Rider
                </span>
                <Bike className="w-4 h-4 text-emerald-800" />
              </div>
              <div className="font-black text-sm text-gray-950">
                {shopOrder.helperName}
              </div>
              <div className="text-xs text-gray-900 font-medium space-y-0.5">
                <p className="font-mono"><span className="font-bold text-gray-950">ID:</span> {shopOrder.helperId || 'N/A'}</p>
                <p className="font-mono font-bold text-gray-950">
                  <span className="font-bold text-gray-950">Phone: </span>
                  {helperPhone || 'N/A'}
                </p>
              </div>
              {helperPhone && (
                <div className="flex items-center gap-1.5 pt-1 flex-wrap">
                  <a
                    href={`tel:${helperPhone}`}
                    className="inline-flex items-center gap-1.5 text-xs font-black text-emerald-950 bg-white px-3 py-1.5 rounded-xl border border-emerald-300 hover:bg-emerald-100 transition-colors shadow-2xs"
                  >
                    <Phone className="w-3.5 h-3.5 text-emerald-800" /> Call Helper
                  </a>
                  <a
                    href={`https://wa.me/880${helperPhone.replace(/^0/, '').replace(/[^0-9]/g, '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs font-black text-emerald-950 bg-emerald-100 px-3 py-1.5 rounded-xl border border-emerald-300 hover:bg-emerald-200 transition-colors shadow-2xs"
                  >
                    <MessageSquare className="w-3.5 h-3.5 text-emerald-800" /> WhatsApp
                  </a>
                </div>
              )}
            </div>
          </div>

          {/* Status Progression Stepper */}
          <div className="bg-gray-100/80 rounded-2xl p-4 sm:p-5 border border-gray-200 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h4 className="font-black text-xs uppercase tracking-wider text-gray-950 flex items-center gap-1.5">
                <Tag className="w-4 h-4 text-purple-700" />
                <span>Status Progression Controls</span>
              </h4>
              <span className="text-xs text-gray-800 font-bold">
                Click any status below to immediately advance or override
              </span>
            </div>

            {/* Stepper Buttons */}
            <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
              {STATUS_STEPS.map((step) => {
                const isActive = currentStatus === step.status;
                return (
                  <button
                    key={step.status}
                    type="button"
                    onClick={() => handleQuickStatusChange(step.status)}
                    className={`p-2.5 rounded-xl text-center font-black text-xs transition-all border flex flex-col items-center justify-center gap-1 cursor-pointer ${
                      isActive
                        ? `${step.color} shadow-md scale-102 border-transparent`
                        : 'bg-white text-gray-900 border-gray-300 hover:border-purple-400 hover:bg-purple-50'
                    }`}
                  >
                    <span>{step.label}</span>
                    {isActive && <CheckCircle2 className="w-3.5 h-3.5" />}
                  </button>
                );
              })}
            </div>

            {/* Cancel Status Override */}
            <div className="flex items-center justify-between pt-2 border-t border-gray-200 flex-wrap gap-2">
              <div className="flex-1 min-w-[200px]">
                <input
                  type="text"
                  value={statusChangeNote}
                  onChange={(e) => setStatusChangeNote(e.target.value)}
                  placeholder="Optional note / reason for status change..."
                  className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl text-xs font-bold text-gray-900 placeholder:text-gray-500 focus:outline-none focus:border-purple-600"
                />
              </div>
              <button
                type="button"
                onClick={() => handleQuickStatusChange('CANCELED')}
                className={`px-4 py-2 rounded-xl text-xs font-black transition-all border cursor-pointer ${
                  currentStatus === 'CANCELED'
                    ? 'bg-red-600 text-white border-red-700 shadow-sm'
                    : 'bg-red-50 text-red-900 border-red-300 hover:bg-red-100'
                }`}
              >
                Mark as CANCELED
              </button>
            </div>
          </div>

          {/* Form Fields Section */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Left Column: Reassign Shop & Request Details */}
            <div className="space-y-4">
              <div>
                <label className="text-[11px] font-black text-gray-950 uppercase block mb-1.5">
                  Re-assign / Target Shop
                </label>
                <select
                  value={selectedShopId}
                  onChange={(e) => setSelectedShopId(e.target.value)}
                  className="w-full p-2.5 bg-white border border-gray-300 rounded-xl text-xs font-bold text-gray-900 focus:outline-none focus:border-purple-600"
                >
                  <option value="">Select Shop...</option>
                  {shopsList.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} {s.type ? `(${s.type})` : ''} — {s.contactPerson || s.whatsapp || ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[11px] font-black text-gray-950 uppercase block mb-1.5">
                  Helper Request Text / Items
                </label>
                <textarea
                  rows={4}
                  value={requestText}
                  onChange={(e) => setRequestText(e.target.value)}
                  placeholder="Items or notes typed by helper..."
                  className="w-full p-3 bg-white border border-gray-300 rounded-xl text-xs font-bold text-gray-900 placeholder:text-gray-500 focus:outline-none focus:border-purple-600 resize-none"
                />
              </div>

              <div>
                <label className="text-[11px] font-black text-gray-950 uppercase block mb-1.5">
                  Store / Admin Note to Helper
                </label>
                <textarea
                  rows={3}
                  value={storeNote}
                  onChange={(e) => setStoreNote(e.target.value)}
                  placeholder="Special instructions or notes for the helper..."
                  className="w-full p-3 bg-white border border-gray-300 rounded-xl text-xs font-bold text-gray-900 placeholder:text-gray-500 focus:outline-none focus:border-purple-600 resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-black text-gray-950 uppercase block mb-1.5">
                    Seller / Vendor Name
                  </label>
                  <input
                    type="text"
                    value={sellerName}
                    onChange={(e) => setSellerName(e.target.value)}
                    placeholder="e.g. Arif Traders"
                    className="w-full p-2.5 bg-white border border-gray-300 rounded-xl text-xs font-bold text-gray-900 placeholder:text-gray-500 focus:outline-none focus:border-purple-600"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-black text-gray-950 uppercase block mb-1.5">
                    Seller Phone
                  </label>
                  <input
                    type="text"
                    value={sellerPhone}
                    onChange={(e) => setSellerPhone(e.target.value)}
                    placeholder="01XXXXXXXXX"
                    className="w-full p-2.5 bg-white border border-gray-300 rounded-xl text-xs font-bold text-gray-900 placeholder:text-gray-500 focus:outline-none focus:border-purple-600"
                  />
                </div>
              </div>
            </div>

            {/* Right Column: Itemized Price Breakdown & Total Cost */}
            <div className="space-y-4">
              <div className="bg-gray-100/70 rounded-2xl p-4 border border-gray-200 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-black text-gray-950 uppercase block">
                    Divided Items & Prices Breakdown
                  </label>
                  <button
                    type="button"
                    onClick={handleAddItem}
                    className="px-3 py-1.5 rounded-lg bg-purple-950 hover:bg-black text-white font-black text-[11px] transition-all flex items-center gap-1 cursor-pointer shadow-xs"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Item
                  </button>
                </div>

                {itemsWithPrice.length === 0 ? (
                  <div className="text-center py-6 text-gray-500 text-xs font-bold border-2 border-dashed border-gray-300 rounded-xl bg-white">
                    No divided items added yet. Click &quot;Add Item&quot; to break down prices.
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                    {itemsWithPrice.map((item, idx) => (
                      <div key={idx} className="flex items-center gap-2 bg-white p-2.5 rounded-xl border border-gray-200 shadow-2xs">
                        <input
                          type="text"
                          value={item.name}
                          onChange={(e) => handleUpdateItem(idx, 'name', e.target.value)}
                          placeholder="Item Name (e.g. Rice)"
                          className="flex-1 px-2.5 py-1.5 bg-gray-50 border border-gray-300 rounded-lg text-xs font-bold text-gray-900 focus:outline-none focus:border-purple-600"
                        />
                        <input
                          type="text"
                          value={item.unit || ''}
                          onChange={(e) => handleUpdateItem(idx, 'unit', e.target.value)}
                          placeholder="Unit (1kg)"
                          className="w-20 px-2.5 py-1.5 bg-gray-50 border border-gray-300 rounded-lg text-xs font-bold text-gray-900 focus:outline-none focus:border-purple-600"
                        />
                        <div className="relative w-24">
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-700 font-black text-xs">৳</span>
                          <input
                            type="number"
                            value={item.price !== undefined ? item.price : ''}
                            onChange={(e) => handleUpdateItem(idx, 'price', e.target.value === '' ? undefined : Number(e.target.value))}
                            placeholder="Price"
                            className="w-full pl-6 pr-2 py-1.5 bg-gray-50 border border-gray-300 rounded-lg text-xs font-mono font-black text-gray-950 focus:outline-none focus:border-purple-600"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(idx)}
                          className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                          title="Remove item"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {itemsWithPrice.length > 0 && (
                  <button
                    type="button"
                    onClick={handleAutoSumPrices}
                    className="text-xs font-black text-purple-950 hover:text-purple-800 underline block cursor-pointer"
                  >
                    Sync Total Price with Sum of Items (৳{itemsWithPrice.reduce((a, b) => a + (Number(b.price) || 0), 0)})
                  </button>
                )}
              </div>

              {/* Total Order Cost */}
              <div className="bg-purple-50 rounded-2xl p-4 border border-purple-200 space-y-2">
                <label className="text-[11px] font-black text-purple-950 uppercase block">
                  Total Store Order Cost / Price (৳)
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-purple-900 font-black text-base">৳</span>
                  <input
                    type="number"
                    value={priceInput}
                    onChange={(e) => setPriceInput(e.target.value)}
                    placeholder="Enter total product price..."
                    className="w-full pl-8 pr-4 py-2.5 bg-white border border-purple-300 rounded-xl text-base font-mono font-black text-purple-950 focus:outline-none focus:border-purple-600"
                  />
                </div>
                <p className="text-[11px] text-purple-950 font-bold">
                  This price is reflected to the helper and contributes to order completion calculations.
                </p>
              </div>
            </div>
          </div>

          {/* Audit Trail & Status History */}
          {shopOrder.statusHistory && shopOrder.statusHistory.length > 0 && (
            <div className="space-y-3 pt-2">
              <h4 className="font-black text-xs uppercase tracking-wider text-gray-950 flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-purple-700" />
                <span>Audit Trail & Status History</span>
              </h4>
              <div className="bg-gray-100/70 rounded-2xl p-3 sm:p-4 border border-gray-200 divide-y divide-gray-200">
                {shopOrder.statusHistory.map((h, i) => (
                  <div key={i} className="py-2.5 first:pt-0 last:pb-0 flex items-start justify-between flex-wrap gap-2 text-xs">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded-md font-black text-[10px] ${getStatusBadge(h.status)}`}>
                          {h.status}
                        </span>
                        <span className="font-black text-gray-950">{h.actor || 'System'}</span>
                      </div>
                      {h.note && (
                        <p className="text-gray-900 text-xs font-semibold italic pl-1">
                          &quot;{h.note}&quot;
                        </p>
                      )}
                    </div>
                    <span className="text-[11px] text-gray-600 font-mono font-bold">
                      {new Date(h.timestamp).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 sm:p-5 bg-gray-50 border-t border-gray-200 flex items-center justify-between shrink-0 flex-wrap gap-3">
          <button
            type="button"
            onClick={handleDeleteOrder}
            disabled={isDeleting}
            className="px-4 py-2.5 rounded-xl bg-red-50 hover:bg-red-100 text-red-700 font-bold text-xs transition-colors flex items-center gap-1.5 disabled:opacity-50"
          >
            <Trash2 className="w-4 h-4" />
            <span>{isDeleting ? 'Deleting...' : 'Delete Store Order'}</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl bg-white hover:bg-gray-100 text-gray-700 font-bold text-xs border border-gray-300 transition-colors"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleSaveChanges}
              disabled={isSaving}
              className="px-5 py-2.5 rounded-xl bg-purple-900 hover:bg-purple-950 text-white font-extrabold text-xs transition-all shadow-md flex items-center gap-1.5 disabled:opacity-50 active:scale-95"
            >
              <Save className="w-4 h-4" />
              <span>{isSaving ? 'Saving Changes...' : 'Save All Changes'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
