import { many, run } from './database.mjs';

const interpolate = (text, lead) => String(text || '').replace(/{{\s*(first_name|last_name|email|phone)\s*}}/g, (_, key) => lead[key] || '');

async function sendEmail(message, lead) {
  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) throw new Error('Resend is not configured');
  const response = await fetch('https://api.resend.com/emails', { method: 'POST', headers: {
    authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'content-type': 'application/json'
  }, body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [message.recipient], subject: interpolate(message.subject, lead),
    html: `<div style="font-family:Arial,sans-serif;white-space:pre-wrap">${interpolate(message.body, lead).replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))}</div>` }) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || `Resend HTTP ${response.status}`);
  return data.id;
}

async function sendSms(message, lead) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token || !process.env.TWILIO_FROM) throw new Error('Twilio is not configured');
  const form = new URLSearchParams({ To: message.recipient, From: process.env.TWILIO_FROM, Body: interpolate(message.body, lead) });
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, { method: 'POST',
    headers: { authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`, 'content-type': 'application/x-www-form-urlencoded' }, body: form });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || `Twilio HTTP ${response.status}`);
  return data.sid;
}

export async function processDueMessages() {
  const due = await many(`SELECT m.*,l.first_name,l.last_name,l.email,l.phone,l.unsubscribed,l.email_consent,l.sms_consent
    FROM messages m JOIN leads l ON l.id=m.lead_id WHERE m.status='scheduled' AND m.scheduled_at<=$1 LIMIT 20`,[new Date().toISOString()]);
  for (const message of due) {
    const allowed = !message.unsubscribed && (message.channel === 'sms' ? message.sms_consent : message.email_consent);
    if (!allowed) { await run("UPDATE messages SET status='cancelled',error='Consent withdrawn' WHERE id=$1",[message.id]); continue; }
    try {
      const providerId = message.channel === 'sms' ? await sendSms(message, message) : await sendEmail(message, message);
      await run("UPDATE messages SET status='sent',provider_id=$1,sent_at=$2 WHERE id=$3",[providerId,new Date().toISOString(),message.id]);
    } catch (error) {
      await run("UPDATE messages SET status='failed',error=$1 WHERE id=$2",[String(error.message).slice(0,500),message.id]);
    }
  }
}
