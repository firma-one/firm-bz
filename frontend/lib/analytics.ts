import { logger } from './logger'

type GTagEvent = {
    action: string
    category?: string
    label?: string
    value?: number
    [key: string]: any
}

export const sendEvent = ({ action, category, label, value, ...props }: GTagEvent) => {
    if (typeof window !== 'undefined' && (window as any).gtag) {
        ; (window as any).gtag('event', action, {
            event_category: category,
            event_label: label,
            value: value,
            ...props,
        })
    } else {
        // Debug mode or dev environment fallbacks
        logger.debug('Analytics event', 'Analytics', { action, category, label, value, ...props })
    }
}

export const ANALYTICS_EVENTS = {
    /** Fired when the server accepts the form (intent / lead). */
    CONTACT_SUBMIT: 'contact_submit',
    /** Fired once when the thank-you UI is shown — pair with `CONTACT_SUBMIT` in funnels. Requires `window.gtag` (GA4 or GTM). */
    CONTACT_THANK_YOU_VIEW: 'contact_thank_you',
    SIGN_UP: 'sign_up',
    LOGIN: 'login',
    ADD_CONNECTOR_START: 'add_connector_start',
    ADD_CONNECTOR_COMPLETE: 'add_connector_complete',
    RESEARCH_FORM_LOADED: 'research_form_loaded',
    RESEARCH_FORM_STARTED: 'research_form_started',
    RESEARCH_FORM_SUBMITTED: 'research_form_submitted',
}
