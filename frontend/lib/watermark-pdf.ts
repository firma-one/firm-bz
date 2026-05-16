import { PDFDocument, rgb, degrees, StandardFonts } from 'pdf-lib'

/**
 * Apply a diagonal semi-transparent text watermark to a PDF.
 * @param pdfBytes - PDF buffer to watermark
 * @param text - Text to apply as watermark (e.g., organization name)
 * @returns Modified PDF buffer with watermark applied
 */
export async function applyDiagonalWatermark(pdfBytes: Buffer, text: string): Promise<Buffer> {
  const doc = await PDFDocument.load(pdfBytes)
  const font = await doc.embedFont(StandardFonts.HelveticaBold)
  const pages = doc.getPages()

  for (const page of pages) {
    const { width, height } = page.getSize()
    page.drawText(text, {
      x: width / 6,
      y: height / 2,
      size: 48,
      font,
      color: rgb(0.75, 0.75, 0.75),
      opacity: 0.3,
      rotate: degrees(45),
    })
  }

  return Buffer.from(await doc.save())
}
