/**
 * When visitors open the Trust Architecture or Reality Check full-screen modals from
 * `FirmTransformationSection`, we hide the duplicate inline sections lower on the landing page.
 */

export const LANDING_TRUST_ARCH_MODAL_VIEWED_EVENT = "fm-landing-trust-arch-transformation-modal-viewed"
export const LANDING_REALITY_MODAL_VIEWED_EVENT = "fm-landing-reality-transformation-modal-viewed"

const LS_HIDE_TRUST_SECTION = "fm_landing_hide_trust_section_after_transformation_modal"
const LS_HIDE_REALITY_SECTION = "fm_landing_hide_reality_section_after_transformation_modal"

export function markTrustArchitectureViewedFromTransformationModal(): void {
  if (typeof window === "undefined") return
  localStorage.setItem(LS_HIDE_TRUST_SECTION, "1")
  window.dispatchEvent(new CustomEvent(LANDING_TRUST_ARCH_MODAL_VIEWED_EVENT))
}

export function markRealityCheckViewedFromTransformationModal(): void {
  if (typeof window === "undefined") return
  localStorage.setItem(LS_HIDE_REALITY_SECTION, "1")
  window.dispatchEvent(new CustomEvent(LANDING_REALITY_MODAL_VIEWED_EVENT))
}

export function readHideTrustArchitectureSectionAfterModal(): boolean {
  if (typeof window === "undefined") return false
  return localStorage.getItem(LS_HIDE_TRUST_SECTION) === "1"
}

export function readHideRealityCheckSectionAfterModal(): boolean {
  if (typeof window === "undefined") return false
  return localStorage.getItem(LS_HIDE_REALITY_SECTION) === "1"
}
