"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import * as Popover from "@radix-ui/react-popover"
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
    <span className={`rounded-control bg-surface-muted px-1 py-0.5 text-caption font-medium tabular-nums text-fg-subtle ${className}`}>
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
  placeholder = "Select date & time",
  className = "",
  disabled = false,
  defaultTime,
  allowFutureDateTimes = true,
  allowPastDateTimes = true,
}: DateTimePickerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [timeExpanded, setTimeExpanded] = useState(false)
  const [viewMode, setViewMode] = useState<'calendar' | 'month-year'>('calendar')
  const [selectedDate, setSelectedDate] = useState<string>("")
  const [selectedTime, setSelectedTime] = useState<string>("")
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const monthYearScrollRef = useRef<HTMLDivElement>(null)
  const onChangeRef = useRef(onChange)
  useEffect(() => { onChangeRef.current = onChange }, [onChange])
  const lastEmittedRef = useRef<string>("")

  const handleOpenChange = (open: boolean) => {
    if (open && disabled) return
    setIsOpen(open)
    if (!open) setViewMode('calendar')
  }

  // Initialize from value prop — skip if we emitted this value (prevents timezone round-trip loop)
  useEffect(() => {
    if (value === lastEmittedRef.current) return
    if (value) {
      const date = new Date(value)
      if (!isNaN(date.getTime())) {
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

  // Update parent only when the value actually changed
  useEffect(() => {
    if (selectedDate && selectedTime) {
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

  // Auto-scroll to current year when month-year view opens
  useEffect(() => {
    if (viewMode !== 'month-year' || !monthYearScrollRef.current) return
    const el = document.getElementById(`month-year-${currentMonth.getFullYear()}`)
    if (el) el.scrollIntoView({ block: 'start' })
  }, [viewMode]) // eslint-disable-line react-hooks/exhaustive-deps

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

  return (
    <Popover.Root open={isOpen} onOpenChange={handleOpenChange}>
      <Popover.Trigger asChild disabled={disabled}>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          className={`h-8 w-full justify-start px-2.5 text-left text-ui font-normal ${value ? 'text-fg' : 'text-fg-subtle'} ${disabled ? 'cursor-not-allowed bg-surface-subtle' : ''} ${className}`}
        >
          <Calendar className="h-3.5 w-3.5 shrink-0 text-fg-subtle" />
          <span className="flex-1 whitespace-nowrap overflow-hidden text-ellipsis">{formatDisplayValue()}</span>
          <span
            title={getUtcOffsetLabel()}
            className="ml-2 shrink-0 rounded-control bg-surface-muted px-1 text-caption font-medium text-fg-subtle"
          >
            TZ
          </span>
        </Button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          align="start"
          side="bottom"
          sideOffset={4}
          onOpenAutoFocus={(e) => e.preventDefault()}
          className="z-[1100000] w-72 rounded-card border border-line bg-surface p-3 shadow-popover"
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold text-fg">Select Date & Time</h3>
            <TimezoneOffsetBadge />
          </div>

          {/* Calendar */}
          <div className="mb-3">
            {/* Month/year header */}
            <div className="flex items-center justify-between mb-2">
              {viewMode === 'calendar' && (
                <button type="button" onClick={() => navigateMonth('prev')} className="p-1 hover:bg-surface-hover rounded text-sm leading-none">‹</button>
              )}
              <button
                type="button"
                onClick={() => setViewMode(v => v === 'calendar' ? 'month-year' : 'calendar')}
                className="flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded hover:bg-surface-hover transition-colors mx-auto"
              >
                {currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                <ChevronDown className={`h-3 w-3 text-fg-subtle transition-transform duration-150 ${viewMode === 'month-year' ? 'rotate-180' : ''}`} />
              </button>
              {viewMode === 'calendar' && (
                <button type="button" onClick={() => navigateMonth('next')} className="p-1 hover:bg-surface-hover rounded text-sm leading-none">›</button>
              )}
            </div>

            {viewMode === 'month-year' ? (() => {
              const today = new Date()
              const todayYear = today.getFullYear()
              const todayMonth = today.getMonth()
              const minYear = allowPastDateTimes ? todayYear - 50 : todayYear
              const maxYear = allowFutureDateTimes ? todayYear + 20 : todayYear
              const years = Array.from({ length: maxYear - minYear + 1 }, (_, i) => minYear + i)
              const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

              return (
                <div
                  ref={monthYearScrollRef}
                  className="max-h-52 overflow-y-auto -mx-1 px-1"
                >
                  {years.map(y => {
                    const isCurrentYear = y === currentMonth.getFullYear()
                    return (
                      <div key={y} id={`month-year-${y}`}>
                        <div className={`text-xs font-semibold px-1 py-1.5 ${isCurrentYear ? 'text-fg' : 'text-fg-subtle'}`}>
                          {y}
                        </div>
                        <div className="grid grid-cols-4 gap-1 mb-2">
                          {MONTHS.map((m, mi) => {
                            const isFutureDisabled = !allowFutureDateTimes && (y > todayYear || (y === todayYear && mi > todayMonth))
                            const isPastDisabled = !allowPastDateTimes && (y < todayYear || (y === todayYear && mi < todayMonth))
                            const isDisabled = isFutureDisabled || isPastDisabled
                            const isSelected = y === currentMonth.getFullYear() && mi === currentMonth.getMonth()
                            const isToday = y === todayYear && mi === todayMonth
                            return (
                              <button
                                key={m}
                                type="button"
                                disabled={isDisabled}
                                onClick={() => {
                                  setCurrentMonth(new Date(y, mi, 1))
                                  setViewMode('calendar')
                                }}
                                className={`
                                  text-xs py-1.5 rounded transition-colors
                                  ${isSelected ? 'bg-action text-action-fg font-medium'
                                    : isToday ? 'font-medium text-action hover:bg-surface-hover'
                                    : isDisabled ? 'text-fg-subtle' : 'text-fg-muted hover:bg-surface-hover'}
                                  ${isDisabled ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'}
                                `}
                              >
                                {m}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            })() : (
              <>
                {/* Day headers */}
                <div className="grid grid-cols-7 gap-1 mb-1">
                  {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(day => (
                    <div key={day} className="text-xs text-fg-muted text-center p-1">{day}</div>
                  ))}
                </div>
                {/* Calendar days */}
                <div className="grid grid-cols-7 gap-1">
                  {generateCalendarDays().map((day, index) => (
                    <button
                      key={index}
                      type="button"
                      onClick={() => setSelectedDate(day.fullDate)}
                      disabled={day.isDisabled}
                      className={`
                        text-xs p-2 rounded transition-colors
                        ${day.isSelected ? 'bg-action text-action-fg font-medium hover:bg-action-hover'
                          : day.isToday ? 'font-medium text-action hover:bg-surface-hover'
                          : day.isCurrentMonth ? 'text-fg hover:bg-surface-hover' : 'text-fg-subtle hover:bg-surface-hover'}
                        ${day.isDisabled ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'}
                      `}
                    >
                      {day.date}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="border-t border-line my-2" />

          {/* Time picker */}
          <div className="mb-3">
            <button
              type="button"
              onClick={() => setTimeExpanded((v) => !v)}
              className="flex items-center justify-between w-full mb-1.5 group"
            >
              <span className="text-xs font-medium text-fg-muted flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Time
                {selectedTime && (
                  <span className="ml-1 font-mono text-fg-muted">{selectedTime}</span>
                )}
              </span>
              {timeExpanded
                ? <ChevronUp className="h-3.5 w-3.5 text-fg-subtle" />
                : <ChevronDown className="h-3.5 w-3.5 text-fg-subtle" />
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
                const nowT = now.toTimeString().slice(0, 5)
                const isToday = !allowFutureDateTimes && selectedDate === todayStr
                setSelectedTime(isToday && t > nowT ? nowT : t)
              }

              const cellCls = (active: boolean) =>
                `text-xs p-1.5 rounded transition-colors w-full text-center ${
                  active
                    ? 'bg-action text-action-fg font-medium'
                    : 'text-fg-muted hover:bg-surface-hover cursor-pointer'
                }`

              return (
                <div className="flex gap-1 px-0.5">
                  {/* Hours 0–23 */}
                  <div className="flex-1 flex flex-col gap-0.5">
                    <div className="pb-0.5 text-center text-caption text-fg-subtle">Hrs</div>
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
                    <div className="pb-0.5 text-center text-caption text-fg-subtle">Mins</div>
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
              <button type="button" onClick={setToday} className="px-2 h-7 text-xs bg-surface-muted hover:bg-surface-hover rounded text-fg-muted transition-colors">
                Today
              </button>
              <button type="button" onClick={() => { const n = new Date(); const d = `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}`; setSelectedDate(d); setSelectedTime(nowTime()) }} className="px-2 h-7 text-xs bg-surface-muted hover:bg-surface-hover rounded text-fg-muted transition-colors">
                Now
              </button>
            </div>
            <div className="flex space-x-1.5">
              {selectedDate && (
                <button type="button" onClick={clearSelection} className="px-2 h-7 text-xs bg-surface-muted hover:bg-surface-hover rounded text-fg-muted transition-colors">
                  Clear
                </button>
              )}
              <Button type="button" size="sm" onClick={() => handleOpenChange(false)} className="h-7 px-3 text-xs">
                Done
              </Button>
            </div>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
