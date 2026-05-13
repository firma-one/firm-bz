"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { createPortal } from "react-dom"
import { Button } from "@/components/ui/button"
import { Calendar, Clock, ChevronDown, ChevronUp } from "lucide-react"

function getUtcOffsetLabel() {
  const offset = -new Date().getTimezoneOffset()
  const h = String(Math.floor(Math.abs(offset) / 60)).padStart(2, '0')
  const m = String(Math.abs(offset) % 60).padStart(2, '0')
  return `UTC${offset >= 0 ? '+' : '-'}${h}:${m}`
}

export function TimezoneOffsetBadge({ className = '' }: { className?: string }) {
  return (
    <span className={`text-[10px] font-semibold font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200 ${className}`}>
      {getUtcOffsetLabel()}
    </span>
  )
}

interface DateTimePickerProps {
  value?: string
  onChange: (dateTime: string) => void
  placeholder?: string
  className?: string
  disabled?: boolean
  /**
   * Default time when a date is picked with no time set.
   * Pass a fixed "HH:MM" string, or omit to default to the current time of day.
   */
  defaultTime?: string
  /** Set false to disable future calendar days and clamp times to ≤ now. Default true. */
  allowFutureDateTimes?: boolean
  /** Set false to disable past calendar days. Default true. */
  allowPastDateTimes?: boolean
}

export function DateTimePicker({
  value,
  onChange,
  placeholder = "Select date and time",
  className = "",
  disabled = false,
  defaultTime,
  allowFutureDateTimes = true,
  allowPastDateTimes = true,
}: DateTimePickerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [timeExpanded, setTimeExpanded] = useState(false)
  const [selectedDate, setSelectedDate] = useState<string>("")
  const [selectedTime, setSelectedTime] = useState<string>("")
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 })
  const triggerRef = useRef<HTMLButtonElement>(null)
  const onChangeRef = useRef(onChange)
  useEffect(() => { onChangeRef.current = onChange }, [onChange])
  const lastEmittedRef = useRef<string>("")

  const updatePos = useCallback(() => {
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    setDropdownPos({ top: rect.bottom + window.scrollY + 4, left: rect.left + window.scrollX })
  }, [])

  useEffect(() => {
    if (isOpen) {
      updatePos()
      window.addEventListener('scroll', updatePos, true)
      window.addEventListener('resize', updatePos)
    }
    return () => {
      window.removeEventListener('scroll', updatePos, true)
      window.removeEventListener('resize', updatePos)
    }
  }, [isOpen, updatePos])

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return
    const handleClick = (e: MouseEvent) => {
      if (triggerRef.current && !triggerRef.current.contains(e.target as Node)) {
        // Check if click is inside the portal dropdown
        const portal = document.getElementById('date-time-picker-portal')
        if (portal && portal.contains(e.target as Node)) return
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [isOpen])

  // Initialize from value prop — skip if we emitted this value (prevents timezone round-trip loop)
  useEffect(() => {
    if (value === lastEmittedRef.current) return
    if (value) {
      const date = new Date(value)
      if (!isNaN(date.getTime())) {
        // Use local date and time consistently to avoid UTC/local mismatch
        const y = date.getFullYear()
        const m = String(date.getMonth() + 1).padStart(2, '0')
        const d = String(date.getDate()).padStart(2, '0')
        lastEmittedRef.current = value
        setSelectedDate(`${y}-${m}-${d}`)
        setSelectedTime(date.toTimeString().slice(0, 5))
      }
    } else {
      lastEmittedRef.current = ""
      setSelectedDate("")
      setSelectedTime("")
    }
  }, [value])

  // Update parent only when the value actually changed (prevents onChange reference loops)
  useEffect(() => {
    if (selectedDate && selectedTime) {
      // Construct as local datetime to stay consistent with how we parse value back
      const [h, min] = selectedTime.split(':').map(Number)
      const [y, mo, d] = selectedDate.split('-').map(Number)
      const dt = new Date(y, mo - 1, d, h, min)
      const iso = dt.toISOString()
      if (iso !== lastEmittedRef.current) {
        lastEmittedRef.current = iso
        onChangeRef.current(iso)
      }
    }
  }, [selectedDate, selectedTime])

  // Apply default time when a date is picked but no time has been set yet
  useEffect(() => {
    if (selectedDate && !selectedTime) {
      const resolved = defaultTime ?? new Date().toTimeString().slice(0, 5)
      setSelectedTime(resolved)
    }
  }, [selectedDate, selectedTime, defaultTime])

  const formatDisplayValue = () => {
    if (!selectedDate) return placeholder

    const [y, mo, d] = selectedDate.split('-').map(Number)
    const date = new Date(y, mo - 1, d)
    const dateStr = date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })

    if (selectedTime) {
      return `${dateStr} ${selectedTime}`
    }

    return `${dateStr} (time not set)`
  }

  const generateCalendarDays = () => {
    const year = currentMonth.getFullYear()
    const month = currentMonth.getMonth()
    const firstDay = new Date(year, month, 1)
    const startDate = new Date(firstDay)
    startDate.setDate(startDate.getDate() - firstDay.getDay())

    const days = []
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    for (let i = 0; i < 42; i++) {
      const date = new Date(startDate)
      date.setDate(startDate.getDate() + i)

      // Use local date string to avoid UTC off-by-one in non-UTC timezones
      const localDateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
      const isCurrentMonth = date.getMonth() === month
      const isToday = date.getTime() === today.getTime()
      const isSelected = selectedDate === localDateStr
      const isFuture = !allowFutureDateTimes && date > today
      const isPast = !allowPastDateTimes && date < today

      days.push({
        date: date.getDate(),
        fullDate: localDateStr,
        isCurrentMonth,
        isToday,
        isSelected,
        isDisabled: isFuture || isPast
      })
    }

    return days
  }

  const navigateMonth = (direction: 'prev' | 'next') => {
    setCurrentMonth(prev => {
      const newMonth = new Date(prev)
      if (direction === 'prev') {
        newMonth.setMonth(prev.getMonth() - 1)
      } else {
        newMonth.setMonth(prev.getMonth() + 1)
      }
      return newMonth
    })
  }

  const nowTime = () => {
    const now = new Date()
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  }

  const setToday = () => {
    const now = new Date()
    const localDateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    setSelectedDate(localDateStr)
    setSelectedTime(defaultTime ?? '23:59')
  }

  const clearSelection = () => {
    setSelectedDate("")
    setSelectedTime("")
    onChange("")
  }

  const dropdown = isOpen ? (
    <div
      id="date-time-picker-portal"
      style={{ position: 'absolute', top: dropdownPos.top, left: dropdownPos.left, zIndex: 1100000 }}
      className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 w-72"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold text-gray-900">Select Date & Time</h3>
        <div className="flex items-center gap-2">
          <TimezoneOffsetBadge />
          <button
            onClick={() => setIsOpen(false)}
            className="text-gray-400 hover:text-gray-600 text-sm leading-none"
          >
            ×
          </button>
        </div>
      </div>

      {/* Calendar */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-2">
          <button
            onClick={() => navigateMonth('prev')}
            className="p-1 hover:bg-gray-100 rounded text-sm leading-none"
          >
            ‹
          </button>
          <h4 className="text-xs font-medium">
            {currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </h4>
          <button
            onClick={() => navigateMonth('next')}
            className="p-1 hover:bg-gray-100 rounded text-sm leading-none"
          >
            ›
          </button>
        </div>

        {/* Day headers */}
        <div className="grid grid-cols-7 gap-1 mb-1">
          {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(day => (
            <div key={day} className="text-xs text-gray-500 text-center p-1">
              {day}
            </div>
          ))}
        </div>

        {/* Calendar days */}
        <div className="grid grid-cols-7 gap-1">
          {generateCalendarDays().map((day, index) => (
            <button
              key={index}
              onClick={() => setSelectedDate(day.fullDate)}
              disabled={day.isDisabled}
              className={`
                text-xs p-2 rounded transition-colors
                ${day.isCurrentMonth ? 'text-gray-900' : 'text-gray-400'}
                ${day.isToday ? 'bg-gray-100 text-gray-900 font-semibold ring-2 ring-gray-300' : ''}
                ${day.isSelected ? 'bg-gray-900 text-white hover:bg-gray-800 font-semibold' : ''}
                ${!day.isSelected && !day.isToday ? 'hover:bg-gray-100' : ''}
                ${day.isDisabled ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'}
              `}
            >
              {day.date}
            </button>
          ))}
        </div>
      </div>

      <div className="border-t border-gray-100 my-2" />

      {/* Time picker */}
      <div className="mb-3">
        <button
          type="button"
          onClick={() => setTimeExpanded((v) => !v)}
          className="flex items-center justify-between w-full mb-1.5 group"
        >
          <span className="text-xs font-medium text-gray-700 flex items-center gap-1">
            <Clock className="h-3 w-3" />
            Time
            {selectedTime && (
              <span className="ml-1 font-mono text-gray-500">{selectedTime}</span>
            )}
          </span>
          {timeExpanded
            ? <ChevronUp className="h-3.5 w-3.5 text-gray-400" />
            : <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
          }
        </button>
        {timeExpanded && (() => {
          const HOURS = Array.from({ length: 24 }, (_, i) => i)
          const MINUTES = Array.from({ length: 60 }, (_, i) => i)

          const [selH24, selMin] = selectedTime
            ? selectedTime.split(':').map(Number)
            : [0, 0]

          const applyTime = (h24: number, min: number) => {
            const t = `${String(h24).padStart(2, '0')}:${String(min).padStart(2, '0')}`
            const now = new Date()
            const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
            const nowTime = now.toTimeString().slice(0, 5)
            const isToday = !allowFutureDateTimes && selectedDate === todayStr
            setSelectedTime(isToday && t > nowTime ? nowTime : t)
          }

          const cellCls = (active: boolean) =>
            `text-xs p-1.5 rounded transition-colors w-full text-center ${
              active
                ? 'bg-gray-100 text-gray-900 font-semibold outline outline-2 outline-gray-400'
                : 'text-gray-700 hover:bg-gray-100 cursor-pointer'
            }`

          return (
            <div className="flex gap-1 px-0.5">
              {/* Hours 0–23 */}
              <div className="flex-1 flex flex-col gap-0.5">
                <div className="text-[10px] font-medium text-gray-400 text-center pb-0.5">Hrs</div>
                <div className="max-h-[120px] overflow-y-auto flex flex-col gap-0.5 p-0.5">
                  {HOURS.map((h) => (
                    <button key={h} type="button" className={cellCls(selH24 === h && !!selectedTime)} onClick={() => applyTime(h, selMin)}>
                      {String(h).padStart(2, '0')}
                    </button>
                  ))}
                </div>
              </div>
              {/* Minutes */}
              <div className="flex-1 flex flex-col gap-0.5">
                <div className="text-[10px] font-medium text-gray-400 text-center pb-0.5">Mins</div>
                <div className="max-h-[120px] overflow-y-auto flex flex-col gap-0.5 p-0.5">
                  {MINUTES.map((m) => (
                    <button key={m} type="button" className={cellCls(selMin === m && !!selectedTime)} onClick={() => applyTime(selH24, m)}>
                      {String(m).padStart(2, '0')}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )
        })()}
      </div>


      {/* Actions */}
      <div className="flex items-center justify-between pt-1">
        <div className="flex space-x-1.5">
          <button type="button" onClick={setToday} className="px-2 h-7 text-xs bg-gray-100 hover:bg-gray-200 rounded text-gray-700 transition-colors">
            Today
          </button>
          <button type="button" onClick={() => { const n = new Date(); const d = `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}`; setSelectedDate(d); setSelectedTime(nowTime()) }} className="px-2 h-7 text-xs bg-gray-100 hover:bg-gray-200 rounded text-gray-700 transition-colors">
            Now
          </button>
        </div>
        <div className="flex space-x-1.5">
          <button type="button" onClick={clearSelection} className="px-2 h-7 text-xs bg-gray-100 hover:bg-gray-200 rounded text-gray-700 transition-colors">
            Clear
          </button>
          <Button size="sm" onClick={() => setIsOpen(false)} disabled={!selectedDate} className="text-xs h-7 px-3 bg-gray-900 hover:bg-gray-800 text-white">
            Done
          </Button>
        </div>
      </div>
    </div>
  ) : null

  return (
    <div className={`relative ${className}`}>
      <Button
        ref={triggerRef}
        variant="outline"
        onClick={() => setIsOpen(!isOpen)}
        disabled={disabled}
        className="w-full justify-start text-left font-normal text-xs"
      >
        <Calendar className="mr-1.5 h-3 w-3 shrink-0" />
        <span className="flex-1">{formatDisplayValue()}</span>
        {selectedDate && (
          <span
            title={getUtcOffsetLabel()}
            className="ml-2 shrink-0 text-[10px] font-semibold font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 border border-slate-200"
          >
            TZ
          </span>
        )}
      </Button>

      {typeof document !== 'undefined' && createPortal(dropdown, document.body)}
    </div>
  )
}
