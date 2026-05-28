import { ProductPreview } from "@/components/marketing/app-carousel"
import { Header } from "@/components/layout/Header"
import { Footer } from "@/components/layout/Footer"

export const metadata = {
  title: "Product Tour — Firma",
  description: "Watch how top consultants use Firma to deliver premium client work.",
}

export default function PreviewPage() {
  return (
    <>
      <Header />
      <main>
        <ProductPreview />
      </main>
      <Footer />
    </>
  )
}
