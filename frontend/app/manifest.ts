import type { MetadataRoute } from 'next'
import { BRAND_NAME, FIRMA_COLOR } from '@/config/brand'

export default function manifest(): MetadataRoute.Manifest {
  const brandCap = BRAND_NAME.charAt(0).toUpperCase() + BRAND_NAME.slice(1)
  return {
    name: brandCap,
    short_name: brandCap,
    description: `${brandCap} — shared workspaces, secure document exchange, and real-time visibility into every engagement.`,
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: FIRMA_COLOR,
    icons: [
      {
        // TODO: swap for a proper 192x192 export once design supplies one — this is the
        // existing 120x120 logo scaled up, which browsers will accept but render softly.
        src: '/logo-120x120.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        // TODO: swap for a proper 512x512 export once design supplies one.
        src: '/logo-120x120.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  }
}
