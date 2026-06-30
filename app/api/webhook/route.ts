import { NextRequest, NextResponse } from "next/server";
import { scrapeLocalBusinesses, toCSV } from "@/lib/apify";
import {
  autoFulfill,
  sendVerificationFailureEmail,
  VerificationFailedError,
} from "@/lib/auto-fulfill";
import { crossVerifyLocalLeads } from "@/lib/cross-verify";
import { validateLocalLeads, validationSummaryHtml } from "@/lib/fulfillment-validate";
import { getErrorMessage, requireEnv } from "@/lib/env";
import { markFailed, markPaidFromSession } from "@/lib/orders";
import { escapeHtml, sanitizeFilename } from "@/lib/sanitize";
import {
  claimStripeEvent,
  getOrderForWebhook,
  shouldSkipFulfillment,
} from "@/lib/webhook-guard";
import { getStripe } from "@/lib/stripe";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_ATTEMPTS = 2;

export async function POST(req: NextRequest) {
  let orderId: string | undefined;

  try {
    const stripe = getStripe();
    requireEnv("APIFY_API_TOKEN");
    requireEnv("APIFY_ACTOR_ID");
    requireEnv("RESEND_API_KEY");
    requireEnv("RESEND_FROM_EMAIL");

    const body = await req.text();
    const sig = req.headers.get("stripe-signature");
    if (!sig) {
      return NextResponse.json({ error: "Missing Stripe signature" }, { status: 400 });
    }

    let event;
    try {
      event = stripe.webhooks.constructEvent(body, sig, requireEnv("STRIPE_WEBHOOK_SECRET"));
    } catch {
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }

    if (event.type !== "checkout.session.completed") {
      return NextResponse.json({ received: true });
    }

    const session = event.data.object;
    orderId = session.metadata?.orderId;

    const claimed = await claimStripeEvent({
      eventId: event.id,
      eventType: event.type,
      orderId,
    });
    if (!claimed) {
      return NextResponse.json({ received: true, duplicate: true });
    }

    const existing = orderId ? await getOrderForWebhook(orderId) : null;
    const skip = shouldSkipFulfillment(existing, session.payment_status);
    if (skip === "already_fulfilled") {
      return NextResponse.json({ received: true, skipped: skip });
    }
    if (skip === "unpaid") {
      return NextResponse.json({ received: true, skipped: skip });
    }

    if (orderId) {
      await markPaidFromSession(session);
    }

    const email = session.metadata?.email;
    const city = session.metadata?.city;
    const industry = session.metadata?.industry;
    const industryLabel = session.metadata?.industryLabel;

    if (!email || !city || !industry || !orderId) {
      console.error("Missing checkout metadata", session.metadata);
      if (orderId) await markFailed(orderId, "Missing order metadata");
      return NextResponse.json({ received: true, error: "missing_metadata" });
    }

    const safeCity = escapeHtml(city);
    const safeIndustry = escapeHtml(industryLabel || industry);
    let lastError: VerificationFailedError | null = null;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      try {
        const rawLeads = await scrapeLocalBusinesses(industry, city);
        const { items: leads, report } = validateLocalLeads(rawLeads);
        const crossCheck = await crossVerifyLocalLeads(leads, city);
        const csv = toCSV(leads);
        const filename = sanitizeFilename(
          `${industry}-${city}-leads.csv`
        );

        await autoFulfill({
          orderId,
          validationReport: report,
          crossCheckReport: crossCheck,
          aiSamples: leads.slice(0, 8) as unknown as Record<string, unknown>[],
          fulfillment: {
            customerEmail: email,
            subject: `Your ${industryLabel || industry} leads in ${city} — ${leads.length} contacts`,
            htmlBody: `
              <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto;">
                <h2 style="color: #111;">Your lead list is ready</h2>
                <p>Here are your <strong>${leads.length} ${safeIndustry}</strong> contacts in <strong>${safeCity}, Ontario</strong>.</p>
                <p>The CSV file is attached. Open it in Excel, Google Sheets, or any spreadsheet app.</p>
                <p style="color: #555; font-size: 14px;">Each row includes: Business Name · Phone · Address · Website · Google Rating · Review Count · Category</p>
                ${validationSummaryHtml(report)}
              </div>
            `,
            csvFilename: filename,
            csvContent: csv,
            rowCount: leads.length,
          },
        });
        lastError = null;
        break;
      } catch (err) {
        if (err instanceof VerificationFailedError) {
          lastError = err;
          console.warn(`Local leads verification attempt ${attempt + 1} failed:`, err.reasons);
          continue;
        }
        throw err;
      }
    }

    if (lastError) {
      await sendVerificationFailureEmail({
        customerEmail: email,
        productLabel: "Local Leads",
      });
      await markFailed(orderId, lastError.message);
      return NextResponse.json({ received: true, failed: true });
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("Fulfillment error:", err);
    if (orderId) {
      await markFailed(orderId, getErrorMessage(err, "Fulfillment failed")).catch(() => {});
    }
    return NextResponse.json({ received: true, error: "internal" });
  }
}
