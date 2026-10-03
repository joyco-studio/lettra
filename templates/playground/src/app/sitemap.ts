import type { MetadataRoute } from 'next'
import { absolute } from '@/lib/site'

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: absolute('/'),
      changeFrequency: 'monthly',
      priority: 1,
    },
  ]
}
