import React from "react"
import { cn } from "@/lib/utils"

interface GoogleDriveIconProps {
  size?: number
  className?: string
}

/** Google's current (2026) Drive product mark, served from Google's own brand-assets CDN. */
export const GOOGLE_DRIVE_PRODUCT_MARK_SRC =
  "https://www.gstatic.com/images/branding/productlogos/drive_2026/v2/web/192px.svg" as const

type GoogleDriveProductMarkProps = Omit<React.ImgHTMLAttributes<HTMLImageElement>, "src"> & {
  className?: string
}

/**
 * Google-supplied Drive product mark (PNG). Used on marketing and in-app UI via
 * {@link GoogleDriveIcon} so the mark matches Trust Architecture everywhere.
 */
export function GoogleDriveProductMark({
  className,
  alt = "Google Drive",
  width = 48,
  height = 48,
  decoding = "async",
  ...rest
}: GoogleDriveProductMarkProps) {
  return (
    <img
      src={GOOGLE_DRIVE_PRODUCT_MARK_SRC}
      alt={alt}
      width={width}
      height={height}
      decoding={decoding}
      className={cn("object-contain", className)}
      {...rest}
    />
  )
}

/**
 * Same 48dp product mark as the landing page ({@link GoogleDriveProductMark}), scaled for inline UI.
 */
export function GoogleDriveIcon({ size = 20, className = "" }: GoogleDriveIconProps) {
  return (
    <img
      src={GOOGLE_DRIVE_PRODUCT_MARK_SRC}
      alt=""
      width={size}
      height={size}
      decoding="async"
      className={cn("object-contain shrink-0", className)}
      aria-hidden
    />
  )
}
