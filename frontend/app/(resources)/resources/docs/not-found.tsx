"use client"

import Link from 'next/link'
import { FileSearch, ArrowLeft } from 'lucide-react'

export default function DocsNotFound() {
    return (
        <div className="flex flex-col items-center justify-center text-center py-24 px-6">
            <div className="rounded-full bg-purple-50 p-5 mb-6">
                <FileSearch className="h-10 w-10 text-purple-400" />
            </div>

            <span className="inline-block mb-3 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-500 tracking-widest">
                404
            </span>

            <h1 className="text-2xl font-semibold tracking-tight text-slate-900 mb-2">
                Page not found
            </h1>

            <p className="text-sm text-slate-500 mb-8 max-w-sm">
                This doc may have moved or been removed. Try browsing the docs from the sidebar.
            </p>

            <div className="flex flex-col sm:flex-row gap-3">
                <Link
                    href="/resources/docs"
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-80"
                >
                    Browse Docs
                </Link>

                <button
                    onClick={() => window.history.back()}
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
                >
                    <ArrowLeft className="h-4 w-4" />
                    Go Back
                </button>
            </div>
        </div>
    )
}
