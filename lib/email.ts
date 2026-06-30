import { Resend } from "resend";

export async function sendLeadList({
  to,
  industry,
  city,
  csvData,
  count,
  qualityNote = "",
}: {
  to: string;
  industry: string;
  city: string;
  csvData: string;
  count: number;
  qualityNote?: string;
}) {
  const resend = new Resend(process.env.RESEND_API_KEY);
  const filename = `${industry.replace(/\s+/g, "-")}-${city.replace(/\s+/g, "-")}-leads.csv`;

  await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL!,
    to,
    subject: `Your ${industry} leads in ${city} — ${count} contacts`,
    html: `
      <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto;">
        <h2 style="color: #111;">Your lead list is ready</h2>
        <p>Here are your <strong>${count} ${industry}</strong> contacts in <strong>${city}, Ontario</strong>.</p>
        <p>The CSV file is attached. Open it in Excel, Google Sheets, or any spreadsheet app.</p>
        <p style="color: #555; font-size: 14px;">Each row includes: Business Name · Phone · Address · Website · Google Rating · Review Count · Category</p>
        ${qualityNote}
        <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
        <p style="font-size: 13px; color: #888;">
          Need a different city or industry? Visit 
          <a href="${process.env.NEXT_PUBLIC_SITE_URL}" style="color: #2563eb;">localleads.findbizz.online</a>
        </p>
      </div>
    `,
    attachments: [
      {
        filename,
        content: Buffer.from(csvData).toString("base64"),
      },
    ],
  });
}
