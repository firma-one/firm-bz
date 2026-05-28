import { PreviewIntro } from "./PreviewIntro"
import { PreviewCarousel } from "./PreviewCarousel"

export function ProductPreview() {
  return (
    <div style={{ width: "100%", position: "relative" }}>
      <PreviewIntro />
      <PreviewCarousel />
    </div>
  )
}
