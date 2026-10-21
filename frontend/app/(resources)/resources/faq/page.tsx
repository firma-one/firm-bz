import { BRAND_NAME } from "@/config/brand"
import { FAQ_DATA } from "@/data/faq-data"
import { ReadingFinalCta } from "@/components/marketing/v2/reading/closing"
import { FaqList } from "@/components/marketing/v2/reading/faq-list"
import { ListingHeader } from "@/components/marketing/v2/reading/listing-header"

/**
 * FAQ, v2: the listing header, topic pills and the questions as disclosures on gray, a way to reach a
 * person, then the dark final CTA. Metadata and the FAQPage JSON-LD live in `layout.tsx`.
 */
export default function FAQPage() {
    return (
        <>
            <ListingHeader
                crumbs={[{ label: "Resources" }, { label: "FAQ", href: "/resources/faq" }]}
                title={
                    <>
                        Frequently asked <em>questions</em>
                    </>
                }
                lede={`Everything you need to know about ${BRAND_NAME}’s features, security, and Storage Drive integration.`}
            />
            <FaqList items={FAQ_DATA} />
            <ReadingFinalCta />
        </>
    )
}
