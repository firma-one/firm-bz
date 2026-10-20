"use client"

import { ArrowLeft } from "lucide-react"
import { PillLink } from "@/components/marketing/v2/primitives"
import "@/components/marketing/v2/docs/docs.css"

export default function DocsNotFound() {
    return (
        <div className="mk-docs-404">
            <span className="mk-docs-404-chip">404</span>

            <h1 className="mk-article mk-docs-404-title">Page not found</h1>

            <p className="mk-docs-404-copy">
                This doc may have moved or been removed. Try browsing the docs from the sidebar.
            </p>

            <div className="mk-docs-404-actions">
                <PillLink href="/resources/docs">Browse Docs</PillLink>
                <button type="button" onClick={() => window.history.back()} className="mk-docs-404-back">
                    <ArrowLeft size={16} strokeWidth={2.4} aria-hidden />
                    Go Back
                </button>
            </div>
        </div>
    )
}
