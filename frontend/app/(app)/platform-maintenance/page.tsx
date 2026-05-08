'use client'

import { useEffect, useState } from 'react'
import { usePlatformMaintenanceStatus } from '@/lib/hooks/use-platform-maintenance-status'
import Logo from '@/components/Logo'
import { Wrench, Clock, OctagonPause } from 'lucide-react'
import Link from 'next/link'

const H = '[font-family:var(--font-kinetic-headline),system-ui,sans-serif]'
const B = '[font-family:var(--font-kinetic-body),system-ui,sans-serif]'

function formatWindow(from: string | null, to: string | null): string | null {
  if (!from) return null
  const fmt = (d: string) =>
    new Date(d).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short', hour12: false })
  return to ? `${fmt(from)} — ${fmt(to)}` : `From ${fmt(from)}`
}

export default function PlatformMaintenancePage() {
  const status = usePlatformMaintenanceStatus(30_000)
  const [countdown, setCountdown] = useState<string | null>(null)

  useEffect(() => {
    if (status !== null && !status.active && !status.pendingGrace) {
      window.location.href = '/d'
    }
  }, [status])

  useEffect(() => {
    if (!status?.scheduledTo) { setCountdown(null); return }
    function tick() {
      const ms = new Date(status!.scheduledTo!).getTime() - Date.now()
      if (ms <= 0) { setCountdown(null); return }
      const h = Math.floor(ms / 3_600_000)
      const m = Math.floor((ms % 3_600_000) / 60_000)
      const s = Math.floor((ms % 60_000) / 1000)
      if (h > 0) setCountdown(`${h}h ${m}m`)
      else if (m > 0) setCountdown(`${m}m ${s}s`)
      else setCountdown(`${s}s`)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [status])

  const window_ = formatWindow(status?.scheduledFrom ?? null, status?.scheduledTo ?? null)

  return (
    <>
      <style>{`
        @keyframes wrench-twirl {
          0%   { transform: perspective(500px) rotateY(0deg)   rotate(-20deg); opacity: 0.18; }
          25%  { transform: perspective(500px) rotateY(90deg)  rotate(-20deg); opacity: 0.06; }
          50%  { transform: perspective(500px) rotateY(180deg) rotate(-20deg); opacity: 0.18; }
          75%  { transform: perspective(500px) rotateY(270deg) rotate(-20deg); opacity: 0.06; }
          100% { transform: perspective(500px) rotateY(360deg) rotate(-20deg); opacity: 0.18; }
        }
        @keyframes orb-drift-a {
          0%, 100% { transform: translate(0px, 0px) scale(1); }
          40% { transform: translate(18px, -14px) scale(1.07); }
          70% { transform: translate(-8px, 12px) scale(0.94); }
        }
        @keyframes orb-drift-b {
          0%, 100% { transform: translate(0px, 0px) scale(1); }
          35% { transform: translate(-22px, 16px) scale(1.05); }
          65% { transform: translate(12px, -10px) scale(0.96); }
        }
        @keyframes badge-glow {
          0%, 100% { box-shadow: 0 0 0 0px rgba(192,57,43,0); }
          50% { box-shadow: 0 0 0 5px rgba(192,57,43,0.22), 0 0 16px 2px rgba(192,57,43,0.16); }
        }
        @keyframes card-breathe {
          0%, 100% { box-shadow: 0 8px 40px -8px rgba(0,0,0,0.10); }
          50% { box-shadow: 0 12px 48px -8px rgba(0,0,0,0.14), 0 0 48px -12px rgba(114,255,112,0.07); }
        }
        @keyframes icon-spin-slow {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes status-ping-ring {
          0% { transform: scale(1); opacity: 0.6; }
          100% { transform: scale(2.8); opacity: 0; }
        }
        .anim-wrench-twirl { animation: wrench-twirl 6s ease-in-out infinite; }
        .anim-orb-a { animation: orb-drift-a 9s ease-in-out infinite; }
        .anim-orb-b { animation: orb-drift-b 11s ease-in-out infinite; }
        .anim-badge-glow { animation: badge-glow 2.8s ease-in-out infinite; }
        .anim-card-breathe { animation: card-breathe 3.5s ease-in-out infinite; }
        .anim-icon-spin { animation: icon-spin-slow 12s linear infinite; }
        .anim-status-ring {
          position: absolute; inset: 0; border-radius: 9999px;
          background: currentColor;
          animation: status-ping-ring 1.8s ease-out infinite;
        }
      `}</style>

      <div className={`relative min-h-screen w-full overflow-x-hidden bg-[#f0edee] text-[#1b1b1d] selection:bg-[#72ff70]/40 selection:text-[#002203] ${B}`}>

        {/* Animated ambient orbs */}
        <div className="anim-orb-a pointer-events-none fixed -top-32 -right-32 z-0 h-80 w-80 rounded-full bg-[#5a78ff]/10 blur-[100px]" aria-hidden />
        <div className="anim-orb-b pointer-events-none fixed -bottom-40 -left-40 z-0 h-96 w-96 rounded-full bg-[#72ff70]/8 blur-[120px]" aria-hidden />

        <div className="relative z-10 flex min-h-screen flex-col items-center justify-center px-6 py-16">

          {/* Logo */}
          <div className="mb-8">
            <Link href="/">
              <Logo size="md" />
            </Link>
          </div>

          {/* Outer card with breathing glow */}
          <div className="anim-card-breathe relative mx-auto w-full max-w-md rounded-3xl border border-black/[0.08] bg-white p-8 flex flex-col items-center gap-7 text-center overflow-hidden">

            {/* Wrench watermark — slow sway */}
            <Wrench
              className="anim-wrench-twirl pointer-events-none absolute -bottom-8 -right-8 h-52 w-52 text-[#006e16]"
              strokeWidth={1.25}
              aria-hidden
            />

            {/* Badge with red glow pulse */}
            <span className={`anim-badge-glow inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-bold uppercase tracking-[0.18em] bg-[#c0392b] text-white ${H}`}>
              <OctagonPause className="h-3.5 w-3.5 text-white stroke-[2]" aria-hidden />
              Maintenance mode
            </span>

            {/* Heading + message */}
            <div className="flex flex-col items-center gap-2">
              <h1 className={`text-4xl font-bold tracking-tight text-[#1b1b1d] sm:text-5xl ${H}`}>
                We&apos;ll be back shortly
              </h1>
              <p className="max-w-sm text-base leading-relaxed text-[#45474c]">
                {status?.message ??
                  'The platform is undergoing scheduled maintenance. We appreciate your patience.'}
              </p>
            </div>

            {/* Maintenance window card */}
            {window_ && (
              <div className="w-full rounded-xl border border-black/[0.07] bg-[#f0edee] px-5 py-4 text-left">
                <div className={`mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-[#45474c] ${H}`}>
                  <Clock className="h-3 w-3" />
                  Scheduled window
                </div>
                <p className={`text-sm font-semibold text-[#1b1b1d] ${H}`}>{window_}</p>
                {countdown !== null && (
                  <p className={`mt-1 text-xs text-[#45474c] ${B}`}>
                    Est. remaining:{' '}
                    <span className="font-mono font-semibold text-[#1b1b1d]">{countdown}</span>
                  </p>
                )}
              </div>
            )}

            {/* Auto-restore notice with multi-ring pulse */}
            <p className={`flex items-center gap-2 text-xs text-[#7c8496] ${B}`}>
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="anim-status-ring text-[#c0392b]" />
                <span className="anim-status-ring text-[#c0392b]" style={{ animationDelay: '0.6s' }} />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-[#c0392b]" />
              </span>
              This page redirects automatically when maintenance is complete
            </p>

          </div>
        </div>
      </div>
    </>
  )
}
