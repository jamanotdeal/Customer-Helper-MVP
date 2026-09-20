'use client';

import React, { useState, useMemo } from 'react';
import { OrderFeedback } from '@/types';
import {
  TrendingUp,
  Star,
  Calendar,
  Sparkles,
  Smile,
  Meh,
  Frown,
  MessageSquare,
  BarChart2,
  CheckCircle2,
} from 'lucide-react';

interface OrderFeedbackAnalyticsProps {
  feedbacks: OrderFeedback[];
}

type TimePreset = '7D' | '14D' | '30D' | 'ALL';

export const OrderFeedbackAnalytics: React.FC<OrderFeedbackAnalyticsProps> = ({ feedbacks }) => {
  const [timePreset, setTimePreset] = useState<TimePreset>('14D');
  const [hoveredDayIndex, setHoveredDayIndex] = useState<number | null>(null);

  // Series visibility toggles
  const [activeSeries, setActiveSeries] = useState({
    overall: true,
    rider: true,
    service: true,
    shop: true,
  });

  const toggleSeries = (key: keyof typeof activeSeries) => {
    setActiveSeries((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Helper date formatter
  const getLocalDateStr = (d: Date) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Process data according to selected time range
  const {
    dayPoints,
    distribution,
    overallAvg,
    riderAvg,
    serviceAvg,
    shopAvg,
    totalCount,
    positivePercent,
    neutralPercent,
    negativePercent,
  } = useMemo(() => {
    const now = new Date();
    let dayCount = 14;
    if (timePreset === '7D') dayCount = 7;
    else if (timePreset === '14D') dayCount = 14;
    else if (timePreset === '30D') dayCount = 30;
    else if (timePreset === 'ALL') dayCount = 60; // Max 60 days on timeline for ALL

    // Generate dates list
    const dates: string[] = [];
    for (let i = dayCount - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(now.getDate() - i);
      dates.push(getLocalDateStr(d));
    }

    // Filter feedbacks within timeframe if not 'ALL'
    const cutoffMs = timePreset === 'ALL'
      ? 0
      : new Date().getTime() - dayCount * 24 * 60 * 60 * 1000;

    const relevantFeedbacks = feedbacks.filter((f) => {
      const t = new Date(f.createdAt).getTime();
      return isNaN(t) || t >= cutoffMs;
    });

    // Rating distributions
    const dist = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    let riderSum = 0;
    let serviceSum = 0;
    let shopSum = 0;
    let overallSum = 0;

    const dayMap = new Map<
      string,
      {
        date: string;
        label: string;
        count: number;
        riderSum: number;
        serviceSum: number;
        shopSum: number;
        overallSum: number;
      }
    >();

    dates.forEach((dateStr) => {
      const parts = dateStr.split('-');
      const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
      const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      dayMap.set(dateStr, {
        date: dateStr,
        label,
        count: 0,
        riderSum: 0,
        serviceSum: 0,
        shopSum: 0,
        overallSum: 0,
      });
    });

    relevantFeedbacks.forEach((f) => {
      const r = f.riderRating || 0;
      const s = f.serviceRating || 0;
      const sh = f.shopRating || 0;
      const countFactors = (r > 0 ? 1 : 0) + (s > 0 ? 1 : 0) + (sh > 0 ? 1 : 0);
      const avg = countFactors > 0 ? (r + s + sh) / countFactors : 0;
      const roundedStar = Math.min(5, Math.max(1, Math.round(avg)));

      if (dist[roundedStar as keyof typeof dist] !== undefined) {
        dist[roundedStar as keyof typeof dist]++;
      }

      riderSum += r;
      serviceSum += s;
      shopSum += sh;
      overallSum += avg;

      const dateStr = getLocalDateStr(new Date(f.createdAt));
      const entry = dayMap.get(dateStr);
      if (entry) {
        entry.count += 1;
        entry.riderSum += r;
        entry.serviceSum += s;
        entry.shopSum += sh;
        entry.overallSum += avg;
      }
    });

    const dayPointsList = Array.from(dayMap.values()).map((d) => ({
      date: d.date,
      label: d.label,
      count: d.count,
      avgOverall: d.count > 0 ? Number((d.overallSum / d.count).toFixed(2)) : null,
      avgRider: d.count > 0 ? Number((d.riderSum / d.count).toFixed(2)) : null,
      avgService: d.count > 0 ? Number((d.serviceSum / d.count).toFixed(2)) : null,
      avgShop: d.count > 0 ? Number((d.shopSum / d.count).toFixed(2)) : null,
    }));

    const total = relevantFeedbacks.length;
    const pos = dist[5] + dist[4];
    const neu = dist[3];
    const neg = dist[2] + dist[1];

    return {
      dayPoints: dayPointsList,
      distribution: dist,
      overallAvg: total > 0 ? (overallSum / total).toFixed(1) : '0.0',
      riderAvg: total > 0 ? (riderSum / total).toFixed(1) : '0.0',
      serviceAvg: total > 0 ? (serviceSum / total).toFixed(1) : '0.0',
      shopAvg: total > 0 ? (shopSum / total).toFixed(1) : '0.0',
      totalCount: total,
      positivePercent: total > 0 ? Math.round((pos / total) * 100) : 0,
      neutralPercent: total > 0 ? Math.round((neu / total) * 100) : 0,
      negativePercent: total > 0 ? Math.round((neg / total) * 100) : 0,
    };
  }, [feedbacks, timePreset]);

  // Chart dimensions & scaling
  const chartWidth = 700;
  const chartHeight = 220;
  const padding = { top: 20, right: 25, bottom: 30, left: 35 };
  const innerWidth = chartWidth - padding.left - padding.right;
  const innerHeight = chartHeight - padding.top - padding.bottom;

  // Max count for background volume bars
  const maxBarCount = Math.max(1, ...dayPoints.map((d) => d.count));

  // Coordinates helper for rating (0 to 5.0)
  const getX = (index: number) => {
    if (dayPoints.length <= 1) return padding.left + innerWidth / 2;
    return padding.left + (index / (dayPoints.length - 1)) * innerWidth;
  };

  const getY = (rating: number) => {
    const clamped = Math.max(0, Math.min(5, rating));
    return padding.top + innerHeight - (clamped / 5) * innerHeight;
  };

  // Build SVG path strings for each series
  const buildLinePath = (key: 'avgOverall' | 'avgRider' | 'avgService' | 'avgShop') => {
    let path = '';
    let started = false;

    dayPoints.forEach((d, idx) => {
      const val = d[key];
      if (val !== null && val !== undefined) {
        const x = getX(idx);
        const y = getY(val);
        if (!started) {
          path += `M ${x} ${y}`;
          started = true;
        } else {
          path += ` L ${x} ${y}`;
        }
      }
    });

    return path;
  };

  const buildAreaPath = (key: 'avgOverall' | 'avgRider' | 'avgService' | 'avgShop') => {
    const line = buildLinePath(key);
    if (!line) return '';

    let firstX = padding.left;
    let lastX = padding.left + innerWidth;
    let hasPoint = false;

    dayPoints.forEach((d, idx) => {
      if (d[key] !== null && d[key] !== undefined) {
        if (!hasPoint) {
          firstX = getX(idx);
          hasPoint = true;
        }
        lastX = getX(idx);
      }
    });

    const bottomY = padding.top + innerHeight;
    return `${line} L ${lastX} ${bottomY} L ${firstX} ${bottomY} Z`;
  };

  const hoveredDay = hoveredDayIndex !== null ? dayPoints[hoveredDayIndex] : null;

  return (
    <div className="bg-white rounded-3xl border border-gray-100 shadow-soft overflow-hidden p-5 sm:p-6 space-y-6">
      {/* Header with Title & Time Range Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-100 pb-4">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-600 shadow-xs">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-extrabold text-base sm:text-lg text-gray-900 flex items-center gap-2">
              <span>Customer Satisfaction & Feedback Progress</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-900">
                Visual Analytics
              </span>
            </h3>
            <p className="text-xs text-gray-500 font-medium mt-0.5">
              Track overall satisfaction progress, rating trends, and category performance over time.
            </p>
          </div>
        </div>

        {/* Time Preset Buttons */}
        <div className="flex items-center bg-gray-100/80 p-1 rounded-2xl border border-gray-200/80 self-start sm:self-auto">
          {(['7D', '14D', '30D', 'ALL'] as const).map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => {
                setTimePreset(preset);
                setHoveredDayIndex(null);
              }}
              className={`px-3 py-1.5 rounded-xl font-black text-xs transition-all ${
                timePreset === preset
                  ? 'bg-white text-purple-950 shadow-xs scale-100'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'
              }`}
            >
              {preset === '7D'
                ? '7 Days'
                : preset === '14D'
                ? '14 Days'
                : preset === '30D'
                ? '30 Days'
                : 'All Time'}
            </button>
          ))}
        </div>
      </div>

      {/* Main Visual Section: Chart on Left, Distribution / CSAT on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Visual SVG Graph */}
        <div className="lg:col-span-8 space-y-4">
          {/* Series Toggles */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1">
              <BarChart2 className="w-3.5 h-3.5 text-purple-600" />
              <span>Progress Trend Curves</span>
            </span>

            <div className="flex flex-wrap items-center gap-1.5 text-xs font-extrabold">
              <button
                type="button"
                onClick={() => toggleSeries('overall')}
                className={`px-2.5 py-1 rounded-xl transition-all flex items-center gap-1.5 border ${
                  activeSeries.overall
                    ? 'bg-indigo-50 border-indigo-300 text-indigo-900 shadow-2xs'
                    : 'bg-gray-50 border-gray-200 text-gray-400 opacity-60'
                }`}
              >
                <span className="w-2.5 h-2.5 rounded-full bg-indigo-600 inline-block" />
                <span>Overall Avg (⭐ {overallAvg})</span>
              </button>

              <button
                type="button"
                onClick={() => toggleSeries('rider')}
                className={`px-2.5 py-1 rounded-xl transition-all flex items-center gap-1.5 border ${
                  activeSeries.rider
                    ? 'bg-amber-50 border-amber-300 text-amber-900 shadow-2xs'
                    : 'bg-gray-50 border-gray-200 text-gray-400 opacity-60'
                }`}
              >
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" />
                <span>Rider (⭐ {riderAvg})</span>
              </button>

              <button
                type="button"
                onClick={() => toggleSeries('service')}
                className={`px-2.5 py-1 rounded-xl transition-all flex items-center gap-1.5 border ${
                  activeSeries.service
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-900 shadow-2xs'
                    : 'bg-gray-50 border-gray-200 text-gray-400 opacity-60'
                }`}
              >
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
                <span>Service (⭐ {serviceAvg})</span>
              </button>

              <button
                type="button"
                onClick={() => toggleSeries('shop')}
                className={`px-2.5 py-1 rounded-xl transition-all flex items-center gap-1.5 border ${
                  activeSeries.shop
                    ? 'bg-purple-50 border-purple-300 text-purple-900 shadow-2xs'
                    : 'bg-gray-50 border-gray-200 text-gray-400 opacity-60'
                }`}
              >
                <span className="w-2.5 h-2.5 rounded-full bg-purple-500 inline-block" />
                <span>Shop (⭐ {shopAvg})</span>
              </button>
            </div>
          </div>

          {/* SVG Canvas Container */}
          <div className="relative bg-gradient-to-b from-gray-50/70 to-white rounded-3xl border border-gray-200/80 p-3 pt-4 overflow-hidden">
            <svg
              viewBox={`0 0 ${chartWidth} ${chartHeight}`}
              className="w-full h-auto overflow-visible select-none"
            >
              <defs>
                {/* Indigo Overall Area Gradient */}
                <linearGradient id="overallGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#4f46e5" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#4f46e5" stopOpacity="0.0" />
                </linearGradient>

                {/* Amber Rider Gradient */}
                <linearGradient id="riderGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.2" />
                  <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {/* Horizontal Grid lines (0 to 5 rating scale) */}
              {[5, 4, 3, 2, 1, 0].map((score) => {
                const y = getY(score);
                return (
                  <g key={score}>
                    <line
                      x1={padding.left}
                      y1={y}
                      x2={padding.left + innerWidth}
                      y2={y}
                      stroke="#e5e7eb"
                      strokeDasharray={score > 0 && score < 5 ? '3 3' : undefined}
                      strokeWidth={score === 0 ? '1.5' : '1'}
                    />
                    <text
                      x={padding.left - 8}
                      y={y + 3.5}
                      textAnchor="end"
                      className="text-[9px] font-bold fill-gray-400"
                    >
                      {score}★
                    </text>
                  </g>
                );
              })}

              {/* Background Volume Bars (Review count per day) */}
              {dayPoints.map((d, idx) => {
                const x = getX(idx);
                const barWidth = Math.max(8, innerWidth / (dayPoints.length * 2.2));
                const barHeight = d.count > 0 ? (d.count / maxBarCount) * (innerHeight * 0.45) : 0;
                const barY = padding.top + innerHeight - barHeight;

                return (
                  <g key={`bar-${d.date}`}>
                    <rect
                      x={x - barWidth / 2}
                      y={barY}
                      width={barWidth}
                      height={barHeight}
                      rx="3"
                      fill="#e0e7ff"
                      opacity={hoveredDayIndex === idx ? '0.85' : '0.45'}
                      className="transition-all"
                    />
                  </g>
                );
              })}

              {/* Area fills */}
              {activeSeries.overall && (
                <path d={buildAreaPath('avgOverall')} fill="url(#overallGradient)" />
              )}
              {activeSeries.rider && (
                <path d={buildAreaPath('avgRider')} fill="url(#riderGradient)" />
              )}

              {/* Multi-series Lines */}
              {activeSeries.shop && (
                <path
                  d={buildLinePath('avgShop')}
                  fill="none"
                  stroke="#a855f7"
                  strokeWidth="2"
                  strokeDasharray="4 4"
                  className="transition-all"
                />
              )}
              {activeSeries.service && (
                <path
                  d={buildLinePath('avgService')}
                  fill="none"
                  stroke="#10b981"
                  strokeWidth="2.5"
                  className="transition-all"
                />
              )}
              {activeSeries.rider && (
                <path
                  d={buildLinePath('avgRider')}
                  fill="none"
                  stroke="#f59e0b"
                  strokeWidth="2.5"
                  className="transition-all"
                />
              )}
              {activeSeries.overall && (
                <path
                  d={buildLinePath('avgOverall')}
                  fill="none"
                  stroke="#4f46e5"
                  strokeWidth="3.5"
                  className="transition-all"
                />
              )}

              {/* Data points & interactive hit areas */}
              {dayPoints.map((d, idx) => {
                const x = getX(idx);
                const isHovered = hoveredDayIndex === idx;

                return (
                  <g key={`points-${d.date}`}>
                    {/* Hover Guide Line */}
                    {isHovered && (
                      <line
                        x1={x}
                        y1={padding.top}
                        x2={x}
                        y2={padding.top + innerHeight}
                        stroke="#6366f1"
                        strokeWidth="1.5"
                        strokeDasharray="2 2"
                      />
                    )}

                    {/* Overall Circle point */}
                    {activeSeries.overall && d.avgOverall !== null && (
                      <circle
                        cx={x}
                        cy={getY(d.avgOverall)}
                        r={isHovered ? 5.5 : 3.5}
                        fill="#ffffff"
                        stroke="#4f46e5"
                        strokeWidth={isHovered ? 3 : 2}
                      />
                    )}

                    {/* X-axis date labels */}
                    {(dayPoints.length <= 14 || idx % Math.ceil(dayPoints.length / 8) === 0 || idx === dayPoints.length - 1) && (
                      <text
                        x={x}
                        y={padding.top + innerHeight + 16}
                        textAnchor="middle"
                        className={`text-[9px] font-bold ${
                          isHovered ? 'fill-indigo-900 font-black' : 'fill-gray-400'
                        }`}
                      >
                        {d.label}
                      </text>
                    )}

                    {/* Invisible full height hit area for easy hover/touch */}
                    <rect
                      x={x - (innerWidth / dayPoints.length) / 2}
                      y={padding.top}
                      width={innerWidth / dayPoints.length}
                      height={innerHeight + 25}
                      fill="transparent"
                      className="cursor-pointer"
                      onMouseEnter={() => setHoveredDayIndex(idx)}
                      onClick={() => setHoveredDayIndex(idx)}
                    />
                  </g>
                );
              })}
            </svg>

            {/* Hover Tooltip Overlay */}
            {hoveredDay && (
              <div className="mt-2 p-3 bg-indigo-950 text-white rounded-2xl shadow-xl flex items-center justify-between gap-4 flex-wrap text-xs animate-in fade-in duration-150">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-indigo-300" />
                  <span className="font-extrabold text-sm">{hoveredDay.label}</span>
                  <span className="px-2 py-0.5 rounded-full bg-indigo-800 text-indigo-200 text-[10px] font-bold">
                    {hoveredDay.count} {hoveredDay.count === 1 ? 'review' : 'reviews'}
                  </span>
                </div>

                {hoveredDay.count > 0 ? (
                  <div className="flex items-center gap-3 font-bold text-xs flex-wrap">
                    <span className="text-indigo-200">
                      Overall: <strong className="text-white text-sm">⭐ {hoveredDay.avgOverall}</strong>
                    </span>
                    <span className="text-amber-300">
                      Rider: <strong>⭐ {hoveredDay.avgRider}</strong>
                    </span>
                    <span className="text-emerald-300">
                      Service: <strong>⭐ {hoveredDay.avgService}</strong>
                    </span>
                    <span className="text-purple-300">
                      Shop: <strong>⭐ {hoveredDay.avgShop}</strong>
                    </span>
                  </div>
                ) : (
                  <span className="text-indigo-300 italic text-[11px]">No feedback entries recorded on this day</span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Rating Distribution & Sentiment Progress */}
        <div className="lg:col-span-4 space-y-4">
          <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1">
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            <span>Satisfaction Breakdown</span>
          </span>

          {/* Star Distribution Progress Bars */}
          <div className="bg-gray-50/80 rounded-3xl border border-gray-200/80 p-4 space-y-2.5">
            {[5, 4, 3, 2, 1].map((star) => {
              const count = distribution[star as keyof typeof distribution] || 0;
              const percent = totalCount > 0 ? Math.round((count / totalCount) * 100) : 0;
              const barColor =
                star >= 4
                  ? 'bg-amber-400'
                  : star === 3
                  ? 'bg-blue-400'
                  : 'bg-rose-400';

              return (
                <div key={star} className="flex items-center gap-2 text-xs font-bold">
                  <div className="flex items-center gap-1 w-10 text-gray-700 shrink-0">
                    <span>{star}</span>
                    <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                  </div>

                  <div className="flex-1 bg-gray-200/80 rounded-full h-2.5 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                      style={{ width: `${percent}%` }}
                    />
                  </div>

                  <div className="w-16 text-right shrink-0 text-[11px] font-semibold text-gray-500">
                    <span className="font-extrabold text-gray-800">{percent}%</span>
                    <span className="text-gray-400 ml-1">({count})</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Sentiment Health Meters */}
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200/80">
              <Smile className="w-4 h-4 text-emerald-600 mx-auto" />
              <span className="text-xs font-black text-emerald-950 block mt-1">{positivePercent}%</span>
              <span className="text-[9px] font-bold text-emerald-700 uppercase block">Positive (4-5★)</span>
            </div>

            <div className="p-3 rounded-2xl bg-blue-50 border border-blue-200/80">
              <Meh className="w-4 h-4 text-blue-600 mx-auto" />
              <span className="text-xs font-black text-blue-950 block mt-1">{neutralPercent}%</span>
              <span className="text-[9px] font-bold text-blue-700 uppercase block">Neutral (3★)</span>
            </div>

            <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200/80">
              <Frown className="w-4 h-4 text-rose-600 mx-auto" />
              <span className="text-xs font-black text-rose-950 block mt-1">{negativePercent}%</span>
              <span className="text-[9px] font-bold text-rose-700 uppercase block">Negative (1-2★)</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
