import { MetadataRoute } from 'next'
import { getPlatformSiteOrigin } from '@/config/platform-domain'

export default function robots(): MetadataRoute.Robots {
  const baseUrl = getPlatformSiteOrigin()
  
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/api/',
          '/d/',
          '/demo/',
          '/system/',
          '/signin',
          '/signup',
          '/auth/',
          '/waitlist',
        ],
      },
      {
        userAgent: 'Googlebot',
        allow: '/',
        disallow: [
          '/api/',
          '/d/',
          '/demo/',
          '/system/',
          '/signin',
          '/signup',
          '/auth/',
          '/waitlist',
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  }
}
