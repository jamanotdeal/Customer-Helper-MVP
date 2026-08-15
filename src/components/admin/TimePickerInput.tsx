'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Clock, ChevronDown, Check } from 'lucide-react';

interface TimePickerInputProps {
  value: string; // 24-hr HH:mm format e.g. "08:00", "22:30"
  onChange: (newValue: string) => void;
  label?: string;
  placeholder?: string;
}

// Utility: Convert "HH:mm" (24h) to { hour12: 1-12, minute: 0-59, ampm: 'AM'|'PM' }
export function parse24HourTime(timeStr: string) {
  if (!timeStr || !timeStr.includes(':')) {
    return { hour12: 8, minute: 0, ampm: 'AM' as const };
  }
  const [hStr, mStr] = timeStr.split(':');
  let h = parseInt(hStr, 10);
  let m = parseInt(mStr, 10);
  if (isNaN(h) || h < 0 || h > 23) h = 8;
  if (isNaN(m) || m < 0 || m > 59) m = 0;

  const ampm: 'AM' | 'PM' = h >= 12 ? 'PM' : 'AM';
  let hour12 = h % 12;
  if (hour12 === 0) hour12 = 12;

  return { hour12, minute: m, ampm };
}

// Utility: Convert { hour12: 1-12, minute: 0-59, ampm: 'AM'|'PM' } to "HH:mm" (24h)
export function format24HourTime(hour12: number, minute: number, ampm: 'AM' | 'PM'): string {
  let h24 = hour12;
  if (ampm === 'AM') {
    if (hour12 === 12) h24 = 0;
  } else {
    if (hour12 !== 12) h24 = hour12 + 12;
  }
  const hFormatted = String(h24).padStart(2, '0');
  const mFormatted = String(minute).padStart(2, '0');
  return `${hFormatted}:${mFormatted}`;
}

// Utility: Format for display e.g. "08:00 AM"
export function formatDisplayTime(timeStr: string): string {
  const { hour12, minute, ampm } = parse24HourTime(timeStr);
  const hStr = String(hour12).padStart(2, '0');
  const mStr = String(minute).padStart(2, '0');
  return `${hStr}:${mStr} ${ampm}`;
}

export const TimePickerInput: React.FC<TimePickerInputProps> = ({
  value,
  onChange,
  label,
  placeholder = 'Select Time',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const initial = parse24HourTime(value || '08:00');
  const [selectedHour, setSelectedHour] = useState<number>(initial.hour12);
  const [selectedMinute, setSelectedMinute] = useState<number>(initial.minute);
  const [selectedAmPm, setSelectedAmPm] = useState<'AM' | 'PM'>(initial.ampm);

  // Sync internal state when value prop changes externally
  useEffect(() => {
    const parsed = parse24HourTime(value || '08:00');
    setSelectedHour(parsed.hour12);
    setSelectedMinute(parsed.minute);
    setSelectedAmPm(parsed.ampm);
  }, [value]);

  // Close popover when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const updateTime = (h12: number, min: number, ampmVal: 'AM' | 'PM') => {
    setSelectedHour(h12);
    setSelectedMinute(min);
    setSelectedAmPm(ampmVal);
    const new24 = format24HourTime(h12, min, ampmVal);
    onChange(new24);
  };

  const handleHourChange = (h12: number) => {
    updateTime(h12, selectedMinute, selectedAmPm);
  };

  const handleMinuteChange = (min: number) => {
    updateTime(selectedHour, min, selectedAmPm);
  };

  const handleAmPmChange = (ampmVal: 'AM' | 'PM') => {
    updateTime(selectedHour, selectedMinute, ampmVal);
  };

  const handlePresetSelect = (time24: string) => {
    const parsed = parse24HourTime(time24);
    updateTime(parsed.hour12, parsed.minute, parsed.ampm);
    setIsOpen(false);
  };

  // Generate 30-minute interval presets (12:00 AM to 11:30 PM)
  const presets: { value: string; label: string }[] = [];
  for (let h = 0; h < 24; h++) {
    for (const m of [0, 30]) {
      const hStr = String(h).padStart(2, '0');
      const mStr = String(m).padStart(2, '0');
      const val24 = `${hStr}:${mStr}`;
      presets.push({ value: val24, label: formatDisplayTime(val24) });
    }
  }

  const hoursList = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  const minutesList = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

  const current24 = format24HourTime(selectedHour, selectedMinute, selectedAmPm);

  return (
    <div className="w-full relative" ref={containerRef}>
      {label && (
        <label className="text-xs font-bold text-gray-700 block mb-1.5">{label}</label>
      )}

      {/* Trigger Input Button (Click to Open Dropdown, No typing required) */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={`w-full p-3.5 rounded-2xl border bg-white flex items-center justify-between text-sm font-extrabold text-gray-900 transition-all shadow-xs ${
          isOpen
            ? 'border-purple-600 ring-4 ring-purple-600/10'
            : 'border-gray-200 hover:border-purple-500'
        }`}
      >
        <div className="flex items-center space-x-2.5">
          <div className="p-2 rounded-xl bg-purple-50 text-purple-700">
            <Clock className="w-4 h-4" />
          </div>
          <span>{value ? formatDisplayTime(value) : placeholder}</span>
        </div>
        <ChevronDown
          className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${
            isOpen ? 'rotate-180 text-purple-600' : ''
          }`}
        />
      </button>

      {/* Dropdown Popover Menu */}
      {isOpen && (
        <div className="absolute top-full left-0 mt-2 w-full min-w-[300px] bg-white rounded-2xl p-4 shadow-2xl border border-purple-100 z-50 animate-in fade-in slide-in-from-top-2 duration-150 space-y-4">
          {/* Quick Slot Dropdown Select */}
          <div>
            <label className="text-[10px] font-extrabold text-gray-500 uppercase tracking-wider block mb-1">
              Quick Time Slot Dropdown (দ্রুত সময় নির্বাচন)
            </label>
            <select
              value={current24}
              onChange={(e) => handlePresetSelect(e.target.value)}
              className="w-full p-2.5 rounded-xl border border-purple-200 bg-purple-50/50 text-xs font-extrabold text-purple-900 focus:outline-none focus:border-purple-600 cursor-pointer"
            >
              <option value="" disabled>
                -- Select Time Slot --
              </option>
              {presets.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          <div className="relative flex items-center justify-center my-2">
            <div className="border-t border-gray-100 w-full" />
            <span className="bg-white px-2 text-[10px] font-extrabold text-gray-400 uppercase tracking-wider whitespace-nowrap absolute">
              OR Custom Select
            </span>
          </div>

          {/* Explicit Dropdown Selectors: Hour, Minute, AM/PM */}
          <div className="grid grid-cols-3 gap-2">
            {/* Hour Select */}
            <div>
              <label className="text-[10px] font-extrabold text-gray-500 uppercase tracking-wider block mb-1">
                Hour
              </label>
              <select
                value={selectedHour}
                onChange={(e) => handleHourChange(Number(e.target.value))}
                className="w-full p-2.5 rounded-xl border border-gray-200 bg-gray-50 text-xs font-black text-gray-900 focus:outline-none focus:border-purple-600 cursor-pointer"
              >
                {hoursList.map((h) => (
                  <option key={h} value={h}>
                    {String(h).padStart(2, '0')}
                  </option>
                ))}
              </select>
            </div>

            {/* Minute Select */}
            <div>
              <label className="text-[10px] font-extrabold text-gray-500 uppercase tracking-wider block mb-1">
                Minute
              </label>
              <select
                value={selectedMinute}
                onChange={(e) => handleMinuteChange(Number(e.target.value))}
                className="w-full p-2.5 rounded-xl border border-gray-200 bg-gray-50 text-xs font-black text-gray-900 focus:outline-none focus:border-purple-600 cursor-pointer"
              >
                {minutesList.map((m) => (
                  <option key={m} value={m}>
                    :{String(m).padStart(2, '0')}
                  </option>
                ))}
              </select>
            </div>

            {/* AM / PM Select */}
            <div>
              <label className="text-[10px] font-extrabold text-gray-500 uppercase tracking-wider block mb-1">
                AM / PM
              </label>
              <select
                value={selectedAmPm}
                onChange={(e) => handleAmPmChange(e.target.value as 'AM' | 'PM')}
                className="w-full p-2.5 rounded-xl border border-purple-200 bg-purple-100/70 text-xs font-black text-purple-950 focus:outline-none focus:border-purple-600 cursor-pointer"
              >
                <option value="AM">AM</option>
                <option value="PM">PM</option>
              </select>
            </div>
          </div>

          {/* Visual Pills selection for Hour & Minute */}
          <div className="space-y-2 pt-1 border-t border-gray-100">
            {/* AM / PM Pills */}
            <div className="flex bg-gray-100 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => handleAmPmChange('AM')}
                className={`flex-1 py-1.5 rounded-lg font-extrabold text-xs transition-all ${
                  selectedAmPm === 'AM'
                    ? 'bg-purple-900 text-white shadow-xs'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                AM (সকাল)
              </button>
              <button
                type="button"
                onClick={() => handleAmPmChange('PM')}
                className={`flex-1 py-1.5 rounded-lg font-extrabold text-xs transition-all ${
                  selectedAmPm === 'PM'
                    ? 'bg-purple-900 text-white shadow-xs'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                PM (রাত/দুপুর)
              </button>
            </div>

            {/* Hour Pills Grid */}
            <div>
              <span className="text-[9px] font-extrabold text-gray-400 uppercase tracking-wider block mb-1">
                Select Hour:
              </span>
              <div className="grid grid-cols-6 gap-1">
                {hoursList.map((h) => (
                  <button
                    key={h}
                    type="button"
                    onClick={() => handleHourChange(h)}
                    className={`py-1.5 rounded-lg text-xs font-black transition-all ${
                      selectedHour === h
                        ? 'bg-purple-600 text-white shadow-xs'
                        : 'bg-gray-50 text-gray-800 hover:bg-gray-200'
                    }`}
                  >
                    {String(h).padStart(2, '0')}
                  </button>
                ))}
              </div>
            </div>

            {/* Minute Pills Grid */}
            <div>
              <span className="text-[9px] font-extrabold text-gray-400 uppercase tracking-wider block mb-1">
                Select Minute:
              </span>
              <div className="grid grid-cols-6 gap-1">
                {minutesList.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => handleMinuteChange(m)}
                    className={`py-1.5 rounded-lg text-xs font-bold transition-all ${
                      selectedMinute === m
                        ? 'bg-emerald-600 text-white font-black shadow-xs'
                        : 'bg-gray-50 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    :{String(m).padStart(2, '0')}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Close / Done Action Button */}
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="w-full py-2.5 rounded-xl bg-purple-900 hover:bg-purple-950 text-white font-extrabold text-xs shadow-md transition-all flex items-center justify-center space-x-1.5 mt-2"
          >
            <Check className="w-4 h-4" />
            <span>Done ({formatDisplayTime(current24)})</span>
          </button>
        </div>
      )}
    </div>
  );
};

