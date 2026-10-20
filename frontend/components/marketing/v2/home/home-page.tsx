/**
 * The home page, v2: the silk-ribbon variant from the Design canvas, section by section.
 * Surfaces alternate in flat blocks: white hero and trust strip, dark Meet Brio, white How it works,
 * gray feature bento (slanted), white Drive, gray audiences, white proof, gray pricing, white FAQ, dark CTA.
 */
import { BuiltOnDriveSection } from './built-on-drive';
import { FaqSection } from './faq';
import { FeatureBentoSection } from './feature-bento';
import { FinalCtaSection } from './final-cta';
import { HeroSection } from './hero';
import { MeetBrioSection } from './meet-brio';
import { PricingTeaserSection } from './pricing-teaser';
import { ProductStorySection } from './product-story';
import { ProofSection } from './proof';
import { TrustStrip } from './trust-strip';
import { WhoItsForSection } from './who-its-for';

export function HomePageV2() {
  return (
    <>
      <HeroSection />
      <TrustStrip />
      <MeetBrioSection />
      <ProductStorySection />
      <FeatureBentoSection />
      <BuiltOnDriveSection />
      <WhoItsForSection />
      <ProofSection />
      <PricingTeaserSection />
      <FaqSection />
      <FinalCtaSection />
    </>
  );
}
