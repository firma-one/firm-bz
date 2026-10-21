import type { Metadata } from "next"

import { TermsOfService } from "@/components/legal/terms-of-service"
import { BRAND_NAME } from "@/config/brand"

export const metadata: Metadata = {
  title: `Terms of Service | ${BRAND_NAME}`,
  description: `The terms that govern your use of ${BRAND_NAME}: the non-custodial service model, subscriptions, the AI assistant and liability.`,
}

/** Renders inside the v2 marketing shell; the Terms bring their own reading-template layout. */
export default function TermsOfServicePage() {
  return <TermsOfService variant="page" />
}
