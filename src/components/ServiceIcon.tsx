import React from 'react';
import { ShoppingBag, Utensils, Pill, Shirt, Package, Store, Layers, Sparkles } from 'lucide-react';

export interface ServiceIconInfo {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  category: 'bazar' | 'food' | 'medicine' | 'laundry' | 'parcel' | 'store' | 'mix' | 'general';
  colorClass: string;
  bgClass: string;
  borderClass: string;
}

export function getServiceIconInfo(service?: string): ServiceIconInfo {
  const s = (service || '').trim().toLowerCase();

  // Bazar / Grocery
  if (
    s.includes('bazar') ||
    s.includes('বাজার') ||
    s.includes('সদাই') ||
    s.includes('sodai') ||
    s.includes('grocery') ||
    s.includes('মুদিখানা') ||
    s.includes('সুপারশপ') ||
    s.includes('supermarket') ||
    s.includes('market')
  ) {
    return {
      icon: ShoppingBag,
      label: 'বাজার-সদাই',
      category: 'bazar',
      colorClass: 'text-emerald-600',
      bgClass: 'bg-emerald-50',
      borderClass: 'border-emerald-200',
    };
  }

  // Food / Restaurant
  if (
    s.includes('khabar') ||
    s.includes('খাবার') ||
    s.includes('food') ||
    s.includes('restaurant') ||
    s.includes('রেস্টুরেন্ট') ||
    s.includes('বিরিয়ানি') ||
    s.includes('বার্গার') ||
    s.includes('মিষ্টি')
  ) {
    return {
      icon: Utensils,
      label: 'খাবার',
      category: 'food',
      colorClass: 'text-amber-500',
      bgClass: 'bg-amber-50',
      borderClass: 'border-amber-200',
    };
  }

  // Medicine / Pharmacy
  if (
    s.includes('medicine') ||
    s.includes('ওষুধ') ||
    s.includes('ঔষধ') ||
    s.includes('pharmacy') ||
    s.includes('ফার্মেসি') ||
    s.includes('ডাক্তার')
  ) {
    return {
      icon: Pill,
      label: 'ওষুধ',
      category: 'medicine',
      colorClass: 'text-rose-500',
      bgClass: 'bg-rose-50',
      borderClass: 'border-rose-200',
    };
  }

  // Shoes / Shoe repair / Laundry / Tailor / Iron
  if (
    s.includes('zuta') ||
    s.includes('জুতা') ||
    s.includes('laundry') ||
    s.includes('লন্ড্রি') ||
    s.includes('সেলাই') ||
    s.includes('কাপড়') ||
    s.includes('কাপড়') ||
    s.includes('আয়রন') ||
    s.includes('দর্জি')
  ) {
    return {
      icon: Shirt,
      label: 'লন্ড্রি ও সেলাই',
      category: 'laundry',
      colorClass: 'text-indigo-500',
      bgClass: 'bg-indigo-50',
      borderClass: 'border-indigo-200',
    };
  }

  // Parcel / Document / Courier
  if (
    s.includes('parcel') ||
    s.includes('পার্সেল') ||
    s.includes('ডকুমেন্ট') ||
    s.includes('চিঠি') ||
    s.includes('কুরিয়ার') ||
    s.includes('courier') ||
    s.includes('package')
  ) {
    return {
      icon: Package,
      label: 'পার্সেল',
      category: 'parcel',
      colorClass: 'text-sky-500',
      bgClass: 'bg-sky-50',
      borderClass: 'border-sky-200',
    };
  }

  // Store
  if (s.includes('store') || s.includes('দোকান') || s.includes('শপ')) {
    return {
      icon: Store,
      label: 'স্টোর',
      category: 'store',
      colorClass: 'text-purple-600',
      bgClass: 'bg-purple-50',
      borderClass: 'border-purple-200',
    };
  }

  // Mix / Multiple
  if (s.includes('mix') || s.includes('মিক্স') || s.includes('একাধিক')) {
    return {
      icon: Layers,
      label: 'মিক্স কাজ',
      category: 'mix',
      colorClass: 'text-teal-600',
      bgClass: 'bg-teal-50',
      borderClass: 'border-teal-200',
    };
  }

  // Default / General
  return {
    icon: Sparkles,
    label: service || 'সার্ভিস',
    category: 'general',
    colorClass: 'text-emerald-600',
    bgClass: 'bg-emerald-50',
    borderClass: 'border-emerald-200',
  };
}

interface ServiceIconProps {
  service?: string;
  className?: string;
  showBadge?: boolean;
}

export const ServiceIcon: React.FC<ServiceIconProps> = ({
  service,
  className = 'w-4 h-4',
  showBadge = false,
}) => {
  const info = getServiceIconInfo(service);
  const IconComp = info.icon;

  if (showBadge) {
    return (
      <span
        className={`inline-flex items-center gap-1 text-[10px] font-extrabold px-2 py-0.5 rounded-full border ${info.bgClass} ${info.colorClass} ${info.borderClass} shrink-0`}
        title={service || info.label}
      >
        <IconComp className={className} />
        <span>{info.label}</span>
      </span>
    );
  }

  return <IconComp className={className} />;
};

export default ServiceIcon;
