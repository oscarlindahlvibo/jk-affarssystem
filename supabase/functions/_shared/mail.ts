// Kopplar ihop mailer.ts med nodemailer (SMTP) för edge-funktionerna.
import nodemailer from "npm:nodemailer@6.9.16";
import { configuredTransports, mailAvailable, sendMail as send, type MailMessage, type MailResult, type SmtpSender } from "./mailer.ts";

export type { MailMessage, MailResult };

const smtp: SmtpSender = async (message, env) => {
  const port = Number(env.get("SMTP_PORT") ?? "587");
  const transport = nodemailer.createTransport({
    host: env.get("SMTP_HOST"), port, secure: port === 465, requireTLS: port !== 465,
    auth: { user: env.get("SMTP_USER"), pass: env.get("SMTP_PASS") },
  });
  const result = await transport.sendMail({
    from: { name: message.fromName, address: message.fromAddress }, replyTo: message.replyTo,
    to: message.to, subject: message.subject, text: message.text, html: message.html,
  });
  return { messageId: result.messageId ?? null };
};

export const mailConfigured = () => mailAvailable(Deno.env);
export const mailTransports = () => configuredTransports(Deno.env);
export const sendMail = (message: MailMessage): Promise<MailResult> => send(message, Deno.env, smtp);
