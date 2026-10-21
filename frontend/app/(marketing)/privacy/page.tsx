import type { Metadata } from "next"

import { PrivacyPolicy } from "@/components/legal/privacy-policy"
import { BRAND_NAME } from "@/config/brand"

export const metadata: Metadata = {
  title: `Privacy Policy | ${BRAND_NAME}`,
  description: `How ${BRAND_NAME} collects, uses and safeguards your information, what its AI assistant sends, and the rights you have.`,
}

/** Renders inside the v2 marketing shell; the policy brings its own reading-template layout. */
export default function PrivacyPolicyPage() {
  return <PrivacyPolicy variant="page" />
}
