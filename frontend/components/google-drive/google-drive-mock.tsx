"use client"

import { useState, useEffect } from "react"
import { Play, Pause, RotateCcw } from "lucide-react"

type Stage = "shared-drives" | "clicking-drive" | "inside-drive" | "new-menu" | "dialog" | "done"

const SEQUENCE: Stage[] = ["shared-drives", "clicking-drive", "inside-drive", "new-menu", "dialog", "done"]

const DURATIONS: Record<Stage, number> = {
    "shared-drives": 1800,
    "clicking-drive": 1500,
    "inside-drive": 1600,
    "new-menu": 1500,
    "dialog": 2200,
    "done": 0,
}

export const CALLOUTS: Record<Stage, { text: string; done: boolean }> = {
    "shared-drives": { text: 'In the left sidebar, click "Shared drives"', done: false },
    "clicking-drive": { text: "Double-click the Shared Drive where your workspace will live", done: false },
    "inside-drive": { text: 'Click the "+ New" button in the top-left', done: false },
    "new-menu": { text: 'Select "New folder" from the menu', done: false },
    "dialog": { text: "Paste the name you copied and click Create", done: false },
    "done": { text: "Folder created successfully ✓", done: true },
}

// Maps each animation stage to the roman-numeral instruction step (1–5) that is currently active
export const STAGE_TO_STEP: Record<Stage, number> = {
    "shared-drives": 1,
    "clicking-drive": 2,
    "inside-drive": 3,
    "new-menu": 3,
    "dialog": 4,
    "done": 5,
}

const CURSOR: Record<Stage, { top: string; left: string }> = {
    "shared-drives": { top: "59%", left: "11%" },
    "clicking-drive": { top: "46%", left: "60%" },
    "inside-drive": { top: "20%", left: "9%" },
    "new-menu": { top: "35%", left: "18%" },
    "dialog": { top: "60%", left: "52%" },
    "done": { top: "38%", left: "55%" },
}

interface GoogleDriveMockProps {
    folderName: string
    onStageChange?: (stage: Stage, callout: { text: string; done: boolean }, activeStep: number) => void
}

export function GoogleDriveMock({ folderName, onStageChange }: GoogleDriveMockProps) {
    const [stage, setStage] = useState<Stage>("shared-drives")
    const [playing, setPlaying] = useState(false)
    const [started, setStarted] = useState(false)

    // 3-second delay before auto-start
    useEffect(() => {
        const timer = setTimeout(() => { setStarted(true); setPlaying(true) }, 3000)
        return () => clearTimeout(timer)
    }, [])

    useEffect(() => {
        onStageChange?.(stage, CALLOUTS[stage], STAGE_TO_STEP[stage])
    }, [stage]) // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (!playing || !started) return
        const duration = DURATIONS[stage]
        if (duration === 0) { setPlaying(false); return }
        const timer = setTimeout(() => {
            const idx = SEQUENCE.indexOf(stage)
            if (idx < SEQUENCE.length - 1) setStage(SEQUENCE[idx + 1])
        }, duration)
        return () => clearTimeout(timer)
    }, [stage, playing])

    const replay = () => { setStage("shared-drives"); setStarted(true); setPlaying(true) }
    const togglePlay = () => stage === "done" ? replay() : setPlaying(p => !p)

    const stageIdx = SEQUENCE.indexOf(stage)
    const progress = Math.min(100, ((stageIdx + (playing && stage !== "done" ? 0.5 : 1)) / SEQUENCE.length) * 100)

    const cp = CURSOR[stage]
    const showList = stage === "shared-drives" || stage === "clicking-drive"
    const showInside = !showList

    return (
        /* Mock browser frame */
        <div className="relative overflow-hidden rounded-xl border border-slate-200 shadow-sm" style={{ height: 300 }}>

            {/* Top bar */}
            <div className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-2">
                <div className="flex items-center gap-1.5 shrink-0">
                    <img alt="" width="20" height="20" decoding="async" className="object-contain shrink-0" aria-hidden="true" src="https://ssl.gstatic.com/images/branding/product/1x/drive_2020q4_48dp.png"></img>
                    <span className="text-sm font-medium text-slate-700">Drive</span>
                </div>
                <div className="flex-1 rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-400">Search in Drive</div>
            </div>

            {/* Body */}
            <div className="flex" style={{ height: 224 }}>

                {/* Sidebar */}
                <div className="w-36 shrink-0 border-r border-slate-100 bg-[#f8f9fa] py-2">
                    <div className={`mx-2 mb-2 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium shadow-sm transition-all duration-300 ${
                        stage === "inside-drive" ? "scale-105 bg-blue-600 text-white ring-2 ring-blue-400 ring-offset-1" : "bg-white text-slate-700"
                    }`}>
                        <span className="text-base leading-none">+</span> New
                    </div>
                    {(
                        [
                            { label: "Home", icon: "🏠" },
                            { label: "My Drive", icon: "📁" },
                            { label: "Shared drives", icon: "🗂️", highlight: true },
                            { label: "Shared with me", icon: "👥" },
                            { label: "Recent", icon: "🕐" },
                        ] as { label: string; icon: string; highlight?: boolean }[]
                    ).map(item => (
                        <div key={item.label} className={`mx-1 flex items-center gap-1.5 rounded-full px-2 py-1 text-xs transition-all duration-300 ${
                            item.highlight && showList ? "bg-[#c2e7ff] font-semibold text-[#001d35]" : "text-slate-600"
                        }`}>
                            <span className="text-sm">{item.icon}</span>
                            <span className="truncate">{item.label}</span>
                        </div>
                    ))}
                </div>

                {/* Main content */}
                <div className="relative flex-1 overflow-hidden px-4 py-3">

                    {/* Shared Drives list */}
                    {showList && (
                        <div className="animate-in fade-in duration-200">
                            <p className="mb-2 text-xs font-semibold text-slate-800">Shared drives</p>
                            <div className="space-y-1">
                                {[
                                    { name: "Acme Legal", members: "2 members", initials: "AL" },
                                    { name: "Client Files", members: "4 members", initials: "CF" },
                                ].map((drive, i) => (
                                    <div key={drive.name} className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs transition-all duration-300 ${
                                        i === 0 && stage === "clicking-drive" ? "bg-blue-50 ring-2 ring-blue-300" : "hover:bg-slate-50"
                                    }`}>
                                        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-400 text-[9px] font-bold text-white">{drive.initials}</div>
                                        <span className="font-medium text-slate-800">{drive.name}</span>
                                        <span className="ml-auto text-slate-400">{drive.members}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Inside a drive */}
                    {showInside && (
                        <div className="animate-in fade-in duration-200">
                            <div className="mb-2 flex items-center gap-2">
                                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-slate-500 to-slate-700 text-[10px] font-bold text-white shadow-sm">AL</div>
                                <div>
                                    <p className="text-xs font-semibold leading-tight text-slate-900">Acme Legal</p>
                                    <p className="text-[10px] leading-tight text-slate-400">1 person</p>
                                </div>
                            </div>

                            {stage !== "done" && (
                                <div className="mt-4 flex flex-col items-center text-center text-slate-400">
                                    <span className="text-2xl">📁</span>
                                    <p className="mt-1 text-[10px]">Drop files here or use the &apos;New&apos; button.</p>
                                </div>
                            )}

                            {stage === "done" && (
                                <div className="mt-1">
                                    <div className="flex items-center gap-2 border-b border-slate-100 px-2 pb-1 text-[9px] font-semibold uppercase tracking-wide text-slate-400">
                                        <span className="flex-1">Name</span>
                                        <span className="w-16 text-right">Modified</span>
                                        <span className="w-12 text-right">Size</span>
                                    </div>
                                    <div className="mt-1 flex animate-in fade-in items-center gap-2 rounded-md bg-blue-50 px-2 py-1.5 ring-2 ring-blue-300 duration-300">
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="#5f6368" className="shrink-0"><path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" /></svg>
                                        <span className="flex-1 truncate text-[10px] font-medium text-slate-800">{folderName || "_firma_workspace_"}</span>
                                        <span className="w-16 text-right text-[9px] text-slate-400">just now</span>
                                        <span className="w-12 text-right text-[9px] text-slate-400">—</span>
                                    </div>
                                </div>
                            )}

                            {/* + New dropdown */}
                            {stage === "new-menu" && (
                                <div className="absolute left-0 top-10 z-10 w-44 animate-in fade-in rounded-lg border border-slate-200 bg-white py-1 shadow-xl duration-150">
                                    {[
                                        { label: "Upload files", icon: "📄" },
                                        { label: "Upload folder", icon: "📂" },
                                        { label: "New folder", icon: "📁", active: true },
                                        { label: "Google Docs", icon: "📝" },
                                        { label: "Google Sheets", icon: "📊" },
                                    ].map(item => (
                                        <div key={item.label} className={`flex items-center gap-2 px-3 py-1.5 text-xs ${
                                            item.active ? "bg-blue-50 font-semibold text-blue-700 ring-1 ring-inset ring-blue-200" : "text-slate-700"
                                        }`}>
                                            <span>{item.icon}</span>{item.label}
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* New folder dialog */}
                            {stage === "dialog" && (
                                <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/20 animate-in fade-in duration-150">
                                    <div className="w-60 rounded-2xl bg-white p-4 shadow-2xl">
                                        <p className="mb-2.5 text-sm font-semibold text-slate-900">New folder</p>
                                        <input readOnly value={folderName || "_firma_workspace_"} className="w-full rounded border border-blue-500 px-2 py-1.5 font-mono text-xs text-slate-900 outline-none ring-2 ring-blue-200" />
                                        <div className="mt-3 flex justify-end gap-2">
                                            <span className="rounded px-3 py-1 text-xs text-slate-500">Cancel</span>
                                            <span className="rounded bg-blue-600 px-3 py-1 text-xs font-semibold text-white">Create</span>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Cursor */}
                    <div className="pointer-events-none absolute z-30 transition-all duration-700 ease-in-out" style={{ top: cp.top, left: cp.left }}>
                        <svg width="16" height="20" viewBox="0 0 16 20" fill="none">
                            <path d="M1 1L1 15.5L4.5 12L7 18L9 17L6.5 11H12L1 1Z" fill="white" stroke="#222" strokeWidth="1.4" strokeLinejoin="round" />
                        </svg>
                    </div>
                </div>
            </div>

            {/* Video player controls bar */}
            <div className="absolute bottom-0 left-0 right-0 flex items-center gap-2 bg-black/40 px-3 py-1.5 backdrop-blur-sm">
                {/* Restart */}
                <button
                    type="button"
                    onClick={replay}
                    title="Restart"
                    className="flex items-center justify-center rounded p-0.5 text-white/70 transition-colors hover:text-white"
                >
                    <RotateCcw className="h-3 w-3" />
                </button>
                {/* Play / Pause */}
                <button
                    type="button"
                    onClick={togglePlay}
                    title={playing ? "Pause" : "Play"}
                    className="flex items-center justify-center rounded p-0.5 text-white transition-colors hover:text-white/80"
                >
                    {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                </button>
                {/* Progress bar */}
                <div className="flex-1 h-1 rounded-full bg-white/25 overflow-hidden">
                    <div
                        className="h-full rounded-full bg-white transition-all duration-700 ease-linear"
                        style={{ width: `${progress}%` }}
                    />
                </div>
                {/* Stage counter */}
                <span className="text-[10px] tabular-nums text-white/60">{STAGE_TO_STEP[stage]} / {Math.max(...Object.values(STAGE_TO_STEP))}</span>
            </div>
        </div>
    )
}
