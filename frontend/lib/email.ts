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

    try {
        const info = await transporter.sendMail({
            from: process.env.SMTP_FROM || `"${BRAND_NAME}" <noreply@pockett.app>`,
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
