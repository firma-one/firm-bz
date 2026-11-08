/**
 * When a plan button's checkout can't open, `/api/checkout` sends the tab back to the page it came from
 * with the reason in this query param, and Billing shows it. The button navigates the whole tab, so a
 * JSON answer would otherwise land on a bare page.
 */
export const CHECKOUT_ERROR_PARAM = 'checkout_error'

/** The notice Billing shows for a checkout that didn't open. */
export function checkoutErrorNotice(reason: string): string {
    const r = reason.trim().replace(/\.?$/, '.')
    return `Checkout didn't open · ${r} You have not been charged.`
}
