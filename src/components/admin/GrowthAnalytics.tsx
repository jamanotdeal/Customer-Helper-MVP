'use client';

import React, { useState, useMemo } from 'react';
import { Order, UserProfile, OrderFeedback } from '@/types';
import { getElapsedMinutes } from '@/lib/timeUtils';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Calendar,
  ShoppingBag,
  Users,
  Clock,
  Star,
  DollarSign,
  Filter,
  ArrowUpRight,
  ArrowDownRight,
  Download,
  Check
} from 'lucide-react';

interface GrowthAnalyticsProps {
  orders: Order[];
  users: UserProfile[];
  feedbacks: OrderFeedback[];
}

type PresetType = 'TODAY' | 'YESTERDAY' | 'LAST_7' | 'LAST_30' | 'THIS_MONTH' | 'CUSTOM';

interface MetricSeriesConfig {
  id: string;
  name: string;
  unit: string;
  color: string;
  enabled: boolean;
}

export const GrowthAnalytics: React.FC<GrowthAnalyticsProps> = ({
  orders,
  users,
  feedbacks
}) => {
  // Local Date Helper (YYYY-MM-DD)
  const getLocalYYYYMMDD = (d: Date = new Date()): string => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const getTodayStr = () => getLocalYYYYMMDD(new Date());
  const getDaysAgoStr = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return getLocalYYYYMMDD(d);
  };
  const getStartOfMonthStr = () => {
    const d = new Date();
    d.setDate(1);
    return getLocalYYYYMMDD(d);
  };

  // Safe timestamp parser
  const getTimestamp = (val: any): number => {
    if (!val) return 0;
    if (typeof val === 'number') return val;
    if (typeof val === 'string') {
      const t = new Date(val).getTime();
      return isNaN(t) ? 0 : t;
    }
    if (typeof val === 'object' && val !== null && 'seconds' in val) {
      return (val as any).seconds * 1000;
    }
    return 0;
  };

  // Date Filter State
  const [activePreset, setActivePreset] = useState<PresetType>('LAST_7');
  const [startDate, setStartDate] = useState<string>(getDaysAgoStr(6));
  const [endDate, setEndDate] = useState<string>(getTodayStr());
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  // Active Series Toggles for Single Combined Chart
  const [activeSeries, setActiveSeries] = useState<{ [key: string]: boolean }>({
    orders: true,
    customers: true,
    deliveryTime: true,
    revenue: true,
    reviews: true
  });

  const toggleSeries = (id: string) => {
    setActiveSeries((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // Quick Preset Handler
  const handlePresetSelect = (preset: PresetType) => {
    setActivePreset(preset);
    const today = getTodayStr();

    if (preset === 'TODAY') {
      setStartDate(today);
      setEndDate(today);
    } else if (preset === 'YESTERDAY') {
      const y = getDaysAgoStr(1);
      setStartDate(y);
      setEndDate(y);
    } else if (preset === 'LAST_7') {
      setStartDate(getDaysAgoStr(6));
      setEndDate(today);
    } else if (preset === 'LAST_30') {
      setStartDate(getDaysAgoStr(29));
      setEndDate(today);
    } else if (preset === 'THIS_MONTH') {
      setStartDate(getStartOfMonthStr());
      setEndDate(today);
    }
  };

  // Generate Date Range Array & Previous Period Boundaries
  const dateRangeData = useMemo(() => {
    const startMs = new Date(`${startDate}T00:00:00`).getTime();
    const endMs = new Date(`${endDate}T23:59:59.999`).getTime();

    const diffTime = Math.abs(endMs - startMs);
    const dayCount = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));

    const currentDates: string[] = [];
    const curr = new Date(startMs);
    while (curr.getTime() <= endMs) {
      currentDates.push(getLocalYYYYMMDD(curr));
      curr.setDate(curr.getDate() + 1);
    }

    const prevEndMs = startMs - 1;
    const prevStartMs = prevEndMs - (dayCount * 24 * 60 * 60 * 1000) + 1;

    return {
      startMs,
      endMs,
      prevStartMs,
      prevEndMs,
      dayCount,
      currentDates
    };
  }, [startDate, endDate]);

  // Aggregate Data Day-by-Day and Calculate Overall Growth Rates
  const analytics = useMemo(() => {
    const { startMs, endMs, prevStartMs, prevEndMs, currentDates } = dateRangeData;

    const dayMetricsMap: {
      [dateStr: string]: {
        date: string;
        formattedDate: string;
        totalOrders: number;
        deliveredOrders: number;
        newCustomers: number;
        deliveryDurationsMins: number[];
        revenue: number;
        reviewCount: number;
        ratingSum: number;
      };
    } = {};

    currentDates.forEach((dStr) => {
      const dObj = new Date(`${dStr}T00:00:00`);
      const formattedDate = dObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      dayMetricsMap[dStr] = {
        date: dStr,
        formattedDate,
        totalOrders: 0,
        deliveredOrders: 0,
        newCustomers: 0,
        deliveryDurationsMins: [],
        revenue: 0,
        reviewCount: 0,
        ratingSum: 0
      };
    });

    // Totals for Current Period
    let currentPeriodOrders = 0;
    let currentPeriodNewCustomers = 0;
    const currentPeriodDeliveryTimes: number[] = [];
    let currentPeriodRevenue = 0;
    let currentPeriodReviewCount = 0;
    let currentPeriodRatingSum = 0;

    // Totals for Previous Period
    let prevPeriodOrders = 0;
    let prevPeriodNewCustomers = 0;
    const prevPeriodDeliveryTimes: number[] = [];
    let prevPeriodRevenue = 0;
    let prevPeriodReviewCount = 0;
    let prevPeriodRatingSum = 0;

    // 1. Process Orders & Revenue
    orders.forEach((o) => {
      const createdTime = getTimestamp(o.createdAt);
      const deliveredTime = o.status === 'DELIVERED' ? getTimestamp(o.deliveredAt || o.updatedAt) : 0;
      const orderDateStr = createdTime ? getLocalYYYYMMDD(new Date(createdTime)) : '';
      const orderFee = o.deliveryFee || 0;

      // Orders created
      if (createdTime >= startMs && createdTime <= endMs) {
        currentPeriodOrders++;
        if (orderDateStr && dayMetricsMap[orderDateStr]) {
          dayMetricsMap[orderDateStr].totalOrders++;
        }
      } else if (createdTime >= prevStartMs && createdTime <= prevEndMs) {
        prevPeriodOrders++;
      }

      // Delivered order metrics (Delivery time & Revenue)
      if (o.status === 'DELIVERED') {
        const timeForDelivery = deliveredTime || createdTime;
        const delDateStr = timeForDelivery ? getLocalYYYYMMDD(new Date(timeForDelivery)) : '';
        const durMins = getElapsedMinutes(o);

        if (timeForDelivery >= startMs && timeForDelivery <= endMs) {
          currentPeriodRevenue += orderFee;
          if (durMins > 0 && durMins < 1440) {
            currentPeriodDeliveryTimes.push(durMins);
          }
          if (delDateStr && dayMetricsMap[delDateStr]) {
            dayMetricsMap[delDateStr].deliveredOrders++;
            dayMetricsMap[delDateStr].revenue += orderFee;
            if (durMins > 0 && durMins < 1440) {
              dayMetricsMap[delDateStr].deliveryDurationsMins.push(durMins);
            }
          }
        } else if (timeForDelivery >= prevStartMs && timeForDelivery <= prevEndMs) {
          prevPeriodRevenue += orderFee;
          if (durMins > 0 && durMins < 1440) {
            prevPeriodDeliveryTimes.push(durMins);
          }
        }
      }
    });

    // 2. Process Users (Customer Registrations)
    users.forEach((u) => {
      if (u.isHelper) return;
      const regTime = getTimestamp(u.createdAt);
      const regDateStr = regTime ? getLocalYYYYMMDD(new Date(regTime)) : '';

      if (regTime >= startMs && regTime <= endMs) {
        currentPeriodNewCustomers++;
        if (regDateStr && dayMetricsMap[regDateStr]) {
          dayMetricsMap[regDateStr].newCustomers++;
        }
      } else if (regTime >= prevStartMs && regTime <= prevEndMs) {
        prevPeriodNewCustomers++;
      }
    });

    // 3. Process Feedbacks / Reviews
    feedbacks.forEach((f) => {
      const fbTime = getTimestamp(f.createdAt);
      const fbDateStr = fbTime ? getLocalYYYYMMDD(new Date(fbTime)) : '';
      const avgRating = (f.riderRating + f.serviceRating + f.shopRating) / 3;

      if (fbTime >= startMs && fbTime <= endMs) {
        currentPeriodReviewCount++;
        currentPeriodRatingSum += avgRating;
        if (fbDateStr && dayMetricsMap[fbDateStr]) {
          dayMetricsMap[fbDateStr].reviewCount++;
          dayMetricsMap[fbDateStr].ratingSum += avgRating;
        }
      } else if (fbTime >= prevStartMs && fbTime <= prevEndMs) {
        prevPeriodReviewCount++;
        prevPeriodRatingSum += avgRating;
      }
    });

    // Process order embedded feedback
    orders.forEach((o) => {
      if (o.feedback) {
        const fbTime = getTimestamp(o.feedback.createdAt || o.deliveredAt);
        const fbDateStr = fbTime ? getLocalYYYYMMDD(new Date(fbTime)) : '';
        const avgRating = (o.feedback.riderRating + o.feedback.serviceRating + o.feedback.shopRating) / 3;
        const alreadyCounted = feedbacks.some((f) => f.orderId === o.id || f.id === o.feedback?.id);

        if (!alreadyCounted) {
          if (fbTime >= startMs && fbTime <= endMs) {
            currentPeriodReviewCount++;
            currentPeriodRatingSum += avgRating;
            if (fbDateStr && dayMetricsMap[fbDateStr]) {
              dayMetricsMap[fbDateStr].reviewCount++;
              dayMetricsMap[fbDateStr].ratingSum += avgRating;
            }
          } else if (fbTime >= prevStartMs && fbTime <= prevEndMs) {
            prevPeriodReviewCount++;
            prevPeriodRatingSum += avgRating;
          }
        }
      }
    });

    // Daily Timeline Data Points
    const dailyPoints = currentDates.map((dStr) => {
      const m = dayMetricsMap[dStr];
      const avgDelMins = m.deliveryDurationsMins.length > 0
        ? Math.round(m.deliveryDurationsMins.reduce((a, b) => a + b, 0) / m.deliveryDurationsMins.length)
        : 0;
      const avgRating = m.reviewCount > 0 ? parseFloat((m.ratingSum / m.reviewCount).toFixed(1)) : 0;

      return {
        date: dStr,
        formattedDate: m.formattedDate,
        totalOrders: m.totalOrders,
        deliveredOrders: m.deliveredOrders,
        newCustomers: m.newCustomers,
        avgDeliveryMins: avgDelMins,
        revenue: m.revenue,
        reviewCount: m.reviewCount,
        avgRating: avgRating
      };
    });

    // Growth Rate Helper
    const calcGrowth = (currVal: number, prevVal: number): { pct: number; isPositive: boolean; isEqual: boolean } => {
      if (prevVal === 0) {
        if (currVal === 0) return { pct: 0, isPositive: true, isEqual: true };
        return { pct: 100, isPositive: true, isEqual: false };
      }
      const pct = parseFloat((((currVal - prevVal) / prevVal) * 100).toFixed(1));
      return {
        pct: Math.abs(pct),
        isPositive: pct >= 0,
        isEqual: pct === 0
      };
    };

    const currentAvgDeliveryTime = currentPeriodDeliveryTimes.length > 0
      ? Math.round(currentPeriodDeliveryTimes.reduce((a, b) => a + b, 0) / currentPeriodDeliveryTimes.length)
      : 0;
    const prevAvgDeliveryTime = prevPeriodDeliveryTimes.length > 0
      ? Math.round(prevPeriodDeliveryTimes.reduce((a, b) => a + b, 0) / prevPeriodDeliveryTimes.length)
      : 0;

    const currentAvgRating = currentPeriodReviewCount > 0 ? parseFloat((currentPeriodRatingSum / currentPeriodReviewCount).toFixed(1)) : 0;
    const prevAvgRating = prevPeriodReviewCount > 0 ? parseFloat((prevPeriodRatingSum / prevPeriodReviewCount).toFixed(1)) : 0;

    return {
      dailyPoints,
      totals: {
        orders: {
          current: currentPeriodOrders,
          prev: prevPeriodOrders,
          growth: calcGrowth(currentPeriodOrders, prevPeriodOrders)
        },
        customers: {
          current: currentPeriodNewCustomers,
          prev: prevPeriodNewCustomers,
          growth: calcGrowth(currentPeriodNewCustomers, prevPeriodNewCustomers)
        },
        deliveryTime: {
          currentMins: currentAvgDeliveryTime,
          prevMins: prevAvgDeliveryTime,
          growth: {
            pct: prevAvgDeliveryTime > 0
              ? parseFloat((Math.abs((currentAvgDeliveryTime - prevAvgDeliveryTime) / prevAvgDeliveryTime) * 100).toFixed(1))
              : 0,
            isFaster: currentAvgDeliveryTime <= prevAvgDeliveryTime,
            isEqual: currentAvgDeliveryTime === prevAvgDeliveryTime
          }
        },
        revenue: {
          current: currentPeriodRevenue,
          prev: prevPeriodRevenue,
          growth: calcGrowth(currentPeriodRevenue, prevPeriodRevenue)
        },
        reviews: {
          currentCount: currentPeriodReviewCount,
          prevCount: prevPeriodReviewCount,
          currentAvgRating,
          prevAvgRating,
          growth: calcGrowth(currentPeriodReviewCount, prevPeriodReviewCount)
        }
      }
    };
  }, [dateRangeData, orders, users, feedbacks]);

  // Export CSV Data
  const handleExportCSV = () => {
    const headers = ['Date', 'Total Orders', 'Delivered Orders', 'New Customers', 'Avg Delivery Time (mins)', 'Total Revenue (Tk)', 'Reviews Count', 'Avg Rating'];
    const rows = analytics.dailyPoints.map((p) => [
      p.date,
      p.totalOrders,
      p.deliveredOrders,
      p.newCustomers,
      p.avgDeliveryMins,
      p.revenue,
      p.reviewCount,
      p.avgRating
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `growth_trend_${startDate}_to_${endDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Render Single Combined Multi-Metric Trend SVG Chart
  const renderCombinedChart = () => {
    const points = analytics.dailyPoints;
    if (points.length === 0) return null;

    const width = 850;
    const height = 300;
    const paddingX = 45;
    const paddingTop = 25;
    const paddingBottom = 40;

    const chartW = width - paddingX * 2;
    const chartH = height - paddingTop - paddingBottom;

    // Series Definitions
    const seriesList: {
      id: string;
      name: string;
      unit: string;
      color: string;
      values: number[];
    }[] = [
      {
        id: 'orders',
        name: 'Total Orders',
        unit: 'orders',
        color: '#6366f1', // Indigo
        values: points.map((p) => p.totalOrders)
      },
      {
        id: 'customers',
        name: 'New Customers',
        unit: 'users',
        color: '#0284c7', // Sky Blue
        values: points.map((p) => p.newCustomers)
      },
      {
        id: 'deliveryTime',
        name: 'Avg Delivery Time',
        unit: 'mins',
        color: '#d97706', // Amber
        values: points.map((p) => p.avgDeliveryMins)
      },
      {
        id: 'revenue',
        name: 'Total Revenue',
        unit: '৳',
        color: '#10b981', // Emerald
        values: points.map((p) => p.revenue)
      },
      {
        id: 'reviews',
        name: 'Reviews Count',
        unit: 'reviews',
        color: '#f43f5e', // Rose
        values: points.map((p) => p.reviewCount)
      }
    ];

    // Compute Bezier Paths for each active series
    const activeSeriesPaths = seriesList
      .filter((s) => activeSeries[s.id])
      .map((s) => {
        const maxVal = Math.max(...s.values, 1);
        const coords = s.values.map((val, idx) => {
          const x = points.length === 1
            ? width / 2
            : paddingX + (idx / (points.length - 1)) * chartW;
          const normalizedRatio = val / maxVal;
          const y = paddingTop + chartH - normalizedRatio * chartH;
          return { x, y, val, idx };
        });

        let pathD = '';
        if (coords.length > 0) {
          pathD = `M ${coords[0].x} ${coords[0].y}`;
          for (let i = 0; i < coords.length - 1; i++) {
            const curr = coords[i];
            const next = coords[i + 1];
            const cp1x = curr.x + (next.x - curr.x) / 2;
            const cp1y = curr.y;
            const cp2x = curr.x + (next.x - curr.x) / 2;
            const cp2y = next.y;
            pathD += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${next.x} ${next.y}`;
          }
        }

        return { ...s, coords, pathD };
      });

    const xCoords = points.map((_, idx) =>
      points.length === 1 ? width / 2 : paddingX + (idx / (points.length - 1)) * chartW
    );

    return (
      <div className="relative w-full overflow-x-auto select-none">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto min-w-[650px] overflow-visible"
        >
          {/* Horizontal Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((lvl, i) => {
            const y = paddingTop + chartH - lvl * chartH;
            return (
              <line
                key={i}
                x1={paddingX}
                y1={y}
                x2={width - paddingX}
                y2={y}
                stroke="#e5e7eb"
                strokeDasharray="4 4"
                strokeWidth="1"
              />
            );
          })}

          {/* Render Active Series Lines */}
          {activeSeriesPaths.map((s) => (
            <g key={s.id}>
              {s.pathD && (
                <path
                  d={s.pathD}
                  fill="none"
                  stroke={s.color}
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="transition-all duration-300"
                />
              )}
              {s.coords.map((c) => (
                <circle
                  key={c.idx}
                  cx={c.x}
                  cy={c.y}
                  r={hoveredIndex === c.idx ? 6 : 4}
                  fill="#ffffff"
                  stroke={s.color}
                  strokeWidth={hoveredIndex === c.idx ? 3 : 2}
                  className="transition-all duration-150"
                />
              ))}
            </g>
          ))}

          {/* X Axis Interactive Hover Bars & Labels */}
          {xCoords.map((x, idx) => {
            const isHovered = hoveredIndex === idx;
            return (
              <g key={idx} className="cursor-pointer">
                {/* Vertical hover guide */}
                {isHovered && (
                  <line
                    x1={x}
                    y1={paddingTop}
                    x2={x}
                    y2={paddingTop + chartH}
                    stroke="#4b5563"
                    strokeDasharray="2 2"
                    strokeWidth="1.5"
                  />
                )}

                {/* Invisible hover trigger area */}
                <rect
                  x={x - (chartW / Math.max(1, points.length)) / 2}
                  y={paddingTop}
                  width={chartW / Math.max(1, points.length)}
                  height={chartH + 20}
                  fill="transparent"
                  onMouseEnter={() => setHoveredIndex(idx)}
                  onMouseLeave={() => setHoveredIndex(null)}
                />

                {/* X Axis Date Label */}
                <text
                  x={x}
                  y={height - 10}
                  textAnchor="middle"
                  fill={isHovered ? '#111827' : '#6b7280'}
                  fontSize="11"
                  fontWeight={isHovered ? '800' : '500'}
                >
                  {points[idx].formattedDate}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Floating Multi-Metric Tooltip */}
        {hoveredIndex !== null && points[hoveredIndex] && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-gray-900/95 backdrop-blur-md text-white p-4 rounded-2xl shadow-2xl border border-gray-700 pointer-events-none z-30 min-w-[280px] animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-gray-800 pb-2 mb-2">
              <span className="font-extrabold text-sm text-indigo-300">
                {points[hoveredIndex].formattedDate} ({points[hoveredIndex].date})
              </span>
              <span className="text-[10px] font-bold text-gray-400">Daily Trend</span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              {activeSeries.orders && (
                <div className="flex items-center space-x-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 shrink-0"></span>
                  <span className="text-gray-300 font-medium">Orders:</span>
                  <span className="font-bold text-white ml-auto">{points[hoveredIndex].totalOrders}</span>
                </div>
              )}

              {activeSeries.customers && (
                <div className="flex items-center space-x-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-sky-500 shrink-0"></span>
                  <span className="text-gray-300 font-medium">Customers:</span>
                  <span className="font-bold text-white ml-auto">{points[hoveredIndex].newCustomers}</span>
                </div>
              )}

              {activeSeries.deliveryTime && (
                <div className="flex items-center space-x-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0"></span>
                  <span className="text-gray-300 font-medium">Delivery:</span>
                  <span className="font-bold text-white ml-auto">{points[hoveredIndex].avgDeliveryMins}m</span>
                </div>
              )}

              {activeSeries.revenue && (
                <div className="flex items-center space-x-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0"></span>
                  <span className="text-gray-300 font-medium">Revenue:</span>
                  <span className="font-bold text-emerald-300 ml-auto">৳{points[hoveredIndex].revenue}</span>
                </div>
              )}

              {activeSeries.reviews && (
                <div className="flex items-center space-x-2 col-span-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shrink-0"></span>
                  <span className="text-gray-300 font-medium">Reviews & Rating:</span>
                  <span className="font-bold text-rose-300 ml-auto">
                    {points[hoveredIndex].reviewCount} reviews ({points[hoveredIndex].avgRating} ★)
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Clean Control Bar & Date Filters (Without Banner Text) */}
      <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-soft flex flex-col lg:flex-row items-center justify-between gap-4">
        {/* Preset Range Selector */}
        <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
          <span className="text-xs font-extrabold text-gray-500 mr-1 flex items-center space-x-1">
            <Filter className="w-3.5 h-3.5 text-purple-600" />
            <span>Range:</span>
          </span>

          <button
            onClick={() => handlePresetSelect('TODAY')}
            className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all ${
              activePreset === 'TODAY'
                ? 'bg-purple-950 text-white shadow-sm'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900'
            }`}
          >
            Today
          </button>

          <button
            onClick={() => handlePresetSelect('YESTERDAY')}
            className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all ${
              activePreset === 'YESTERDAY'
                ? 'bg-purple-950 text-white shadow-sm'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900'
            }`}
          >
            Yesterday
          </button>

          <button
            onClick={() => handlePresetSelect('LAST_7')}
            className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all ${
              activePreset === 'LAST_7'
                ? 'bg-purple-950 text-white shadow-sm'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900'
            }`}
          >
            Last 7 Days
          </button>

          <button
            onClick={() => handlePresetSelect('LAST_30')}
            className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all ${
              activePreset === 'LAST_30'
                ? 'bg-purple-950 text-white shadow-sm'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900'
            }`}
          >
            Last 30 Days
          </button>

          <button
            onClick={() => handlePresetSelect('THIS_MONTH')}
            className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all ${
              activePreset === 'THIS_MONTH'
                ? 'bg-purple-950 text-white shadow-sm'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900'
            }`}
          >
            This Month
          </button>
        </div>

        {/* Custom Date Pickers & CSV Export */}
        <div className="flex items-center space-x-3 w-full lg:w-auto justify-between lg:justify-end">
          <div className="flex items-center space-x-2 bg-gray-50 border border-gray-200 px-3 py-1.5 rounded-xl">
            <Calendar className="w-4 h-4 text-purple-700" />
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setActivePreset('CUSTOM');
              }}
              className="bg-transparent text-gray-900 text-xs font-bold focus:outline-none cursor-pointer"
            />
            <span className="text-gray-400 text-xs font-bold">to</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setActivePreset('CUSTOM');
              }}
              className="bg-transparent text-gray-900 text-xs font-bold focus:outline-none cursor-pointer"
            />
          </div>

          <button
            onClick={handleExportCSV}
            className="px-3.5 py-2 bg-purple-50 hover:bg-purple-100 text-purple-900 rounded-xl font-extrabold text-xs transition-all flex items-center space-x-1.5 shrink-0"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* KPI Growth Cards Grid (Revenue replaces Working Hours) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Card 1: Total Orders */}
        <div className="p-5 rounded-3xl border border-gray-100 bg-white shadow-soft">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Total Orders</span>
            <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <ShoppingBag className="w-4 h-4" />
            </div>
          </div>

          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-2xl font-black text-gray-900">{analytics.totals.orders.current}</span>
            <div className={`inline-flex items-center space-x-0.5 px-2 py-0.5 rounded-full text-xs font-extrabold ${
              analytics.totals.orders.growth.isEqual
                ? 'bg-gray-100 text-gray-600'
                : analytics.totals.orders.growth.isPositive
                ? 'bg-emerald-50 text-emerald-700'
                : 'bg-rose-50 text-rose-700'
            }`}>
              {analytics.totals.orders.growth.isEqual ? (
                <Minus className="w-3 h-3" />
              ) : analytics.totals.orders.growth.isPositive ? (
                <TrendingUp className="w-3 h-3" />
              ) : (
                <TrendingDown className="w-3 h-3" />
              )}
              <span>{analytics.totals.orders.growth.pct}%</span>
            </div>
          </div>
          <p className="text-[11px] font-medium text-gray-400 mt-2">vs {analytics.totals.orders.prev} previously</p>
        </div>

        {/* Card 2: New Customers */}
        <div className="p-5 rounded-3xl border border-gray-100 bg-white shadow-soft">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">New Customers</span>
            <div className="w-8 h-8 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
          </div>

          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-2xl font-black text-gray-900">{analytics.totals.customers.current}</span>
            <div className={`inline-flex items-center space-x-0.5 px-2 py-0.5 rounded-full text-xs font-extrabold ${
              analytics.totals.customers.growth.isEqual
                ? 'bg-gray-100 text-gray-600'
                : analytics.totals.customers.growth.isPositive
                ? 'bg-emerald-50 text-emerald-700'
                : 'bg-rose-50 text-rose-700'
            }`}>
              {analytics.totals.customers.growth.isEqual ? (
                <Minus className="w-3 h-3" />
              ) : analytics.totals.customers.growth.isPositive ? (
                <TrendingUp className="w-3 h-3" />
              ) : (
                <TrendingDown className="w-3 h-3" />
              )}
              <span>{analytics.totals.customers.growth.pct}%</span>
            </div>
          </div>
          <p className="text-[11px] font-medium text-gray-400 mt-2">vs {analytics.totals.customers.prev} previously</p>
        </div>

        {/* Card 3: Avg Delivery Time */}
        <div className="p-5 rounded-3xl border border-gray-100 bg-white shadow-soft">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Avg Delivery Time</span>
            <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </div>

          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-2xl font-black text-gray-900">
              {analytics.totals.deliveryTime.currentMins} <span className="text-sm font-semibold text-gray-500">mins</span>
            </span>
            <div className={`inline-flex items-center space-x-0.5 px-2 py-0.5 rounded-full text-xs font-extrabold ${
              analytics.totals.deliveryTime.growth.isEqual
                ? 'bg-gray-100 text-gray-600'
                : analytics.totals.deliveryTime.growth.isFaster
                ? 'bg-emerald-50 text-emerald-700'
                : 'bg-amber-50 text-amber-700'
            }`}>
              {analytics.totals.deliveryTime.growth.isFaster ? (
                <ArrowDownRight className="w-3 h-3" />
              ) : (
                <ArrowUpRight className="w-3 h-3" />
              )}
              <span>{analytics.totals.deliveryTime.growth.pct}%</span>
            </div>
          </div>
          <p className="text-[11px] font-medium text-gray-400 mt-2">
            {analytics.totals.deliveryTime.growth.isFaster ? '⚡ Faster delivery speed' : 'Slower delivery speed'}
          </p>
        </div>

        {/* Card 4: Total Revenue (Replaces Working Hours) */}
        <div className="p-5 rounded-3xl border border-gray-100 bg-white shadow-soft">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Total Revenue</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>

          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-2xl font-black text-gray-900">
              ৳{analytics.totals.revenue.current}
            </span>
            <div className={`inline-flex items-center space-x-0.5 px-2 py-0.5 rounded-full text-xs font-extrabold ${
              analytics.totals.revenue.growth.isEqual
                ? 'bg-gray-100 text-gray-600'
                : analytics.totals.revenue.growth.isPositive
                ? 'bg-emerald-50 text-emerald-700'
                : 'bg-rose-50 text-rose-700'
            }`}>
              {analytics.totals.revenue.growth.isEqual ? (
                <Minus className="w-3 h-3" />
              ) : analytics.totals.revenue.growth.isPositive ? (
                <TrendingUp className="w-3 h-3" />
              ) : (
                <TrendingDown className="w-3 h-3" />
              )}
              <span>{analytics.totals.revenue.growth.pct}%</span>
            </div>
          </div>
          <p className="text-[11px] font-medium text-gray-400 mt-2">vs ৳{analytics.totals.revenue.prev} previously</p>
        </div>

        {/* Card 5: Reviews & Rating */}
        <div className="p-5 rounded-3xl border border-gray-100 bg-white shadow-soft">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Reviews & Ratings</span>
            <div className="w-8 h-8 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
              <Star className="w-4 h-4 fill-rose-500" />
            </div>
          </div>

          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-2xl font-black text-gray-900">
              {analytics.totals.reviews.currentAvgRating} <span className="text-xs font-bold text-amber-500">★</span>
            </span>
            <span className="text-xs font-extrabold bg-rose-50 text-rose-700 px-2 py-0.5 rounded-full">
              {analytics.totals.reviews.currentCount} reviews
            </span>
          </div>
          <p className="text-[11px] font-medium text-gray-400 mt-2">
            vs {analytics.totals.reviews.prevAvgRating} ★ ({analytics.totals.reviews.prevCount} prev)
          </p>
        </div>
      </div>

      {/* Single Combined Trend Chart Visual Card */}
      <div className="bg-white rounded-3xl border border-gray-100 shadow-soft p-6 space-y-4">
        {/* Interactive Legend Toggles Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-100 pb-4">
          <div>
            <h3 className="font-extrabold text-base text-gray-900">Unified Growth & Rate Trend</h3>
            <p className="text-xs text-gray-500 font-medium mt-0.5">
              Toggle data series below to customize the combined timeline graph.
            </p>
          </div>

          {/* Legend Checkboxes */}
          <div className="flex flex-wrap items-center gap-2">
            {[
              { id: 'orders', name: 'Orders', color: 'bg-indigo-500 text-indigo-700 border-indigo-200' },
              { id: 'customers', name: 'Customers', color: 'bg-sky-500 text-sky-700 border-sky-200' },
              { id: 'deliveryTime', name: 'Delivery Time', color: 'bg-amber-500 text-amber-700 border-amber-200' },
              { id: 'revenue', name: 'Revenue', color: 'bg-emerald-500 text-emerald-700 border-emerald-200' },
              { id: 'reviews', name: 'Reviews', color: 'bg-rose-500 text-rose-700 border-rose-200' },
            ].map((item) => {
              const active = activeSeries[item.id];
              return (
                <button
                  key={item.id}
                  onClick={() => toggleSeries(item.id)}
                  className={`px-2.5 py-1 rounded-xl text-xs font-extrabold border transition-all flex items-center space-x-1.5 ${
                    active
                      ? `${item.color} bg-opacity-15 font-black shadow-sm`
                      : 'bg-gray-50 text-gray-400 border-gray-200 line-through opacity-60'
                  }`}
                >
                  <span className={`w-2.5 h-2.5 rounded-full ${item.color.split(' ')[0]}`}></span>
                  <span>{item.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Combined SVG Chart */}
        {renderCombinedChart()}
      </div>
    </div>
  );
};
