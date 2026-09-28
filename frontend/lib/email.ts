import nodemailer from 'nodemailer'
import { logger } from './logger'
import { BRAND_NAME } from '@/config/brand'

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
})

// Fallback sender, used only when SMTP_FROM is unset. Must stay on a domain we control —
// mail from an unowned domain fails SPF/DKIM and lands in spam. Warned about once per
// process so a missing env var is visible rather than silent.
const DEFAULT_EMAIL_FROM = `"${BRAND_NAME}" <info@firmaone.com>`
let warnedMissingFrom = false

export interface EmailAttachment {
    filename: string
    content: Buffer
    contentType: string
}

export async function sendEmail(to: string, subject: string, html: string, attachments?: EmailAttachment[]) {
    if (!process.env.SMTP_HOST) {
        logger.warn("SMTP_HOST not configured. Email not sent", 'Email', { subject, to })
        return
    }

    if (!process.env.SMTP_FROM && !warnedMissingFrom) {
        warnedMissingFrom = true
        logger.warn(`SMTP_FROM not configured — falling back to ${DEFAULT_EMAIL_FROM}`, 'Email')
    }

    try {
        const info = await transporter.sendMail({
            from: process.env.SMTP_FROM || DEFAULT_EMAIL_FROM,
            to,
            subject,
            html,
            ...(attachments?.length ? { attachments } : {}),
        })
        // Log email delivery without exposing full email address
        const emailDomain = to.split('@')[1] || 'unknown'
        logger.info(`Email sent successfully`, 'Email', { toDomain: `***@${emailDomain}`, subject, messageId: info.messageId })
        return info
    } catch (error) {
        logger.error("Failed to send email", error instanceof Error ? error : new Error(String(error)), 'Email', { to, subject })
        throw error
    }
}
