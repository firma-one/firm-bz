// Cancels the (marketing) layout's pt-24/pt-28 — the /go pages have their own brand header
export default function GoLayout({ children }: { children: React.ReactNode }) {
    return <div className="-mt-24 lg:-mt-28">{children}</div>
}
