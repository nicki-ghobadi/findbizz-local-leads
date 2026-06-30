import { NextRequest, NextResponse } from "next/server";
import { createOrder } from "@/lib/orders";
import { getErrorMessage } from "@/lib/env";
import { INDUSTRY_CATEGORIES, ONTARIO_REGIONS } from "@/lib/ontario-cities";
import { clientIp, enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { clampString } from "@/lib/sanitize";
import { UserFacingError } from "@/lib/user-error";
import { emailsMatch, isValidEmail, normalizeEmail } from "@/lib/validate-email";

const VALID_CITIES = new Set(ONTARIO_REGIONS.map((r) => r.value));
const VALID_INDUSTRIES = new Set(INDUSTRY_CATEGORIES.map((c) => c.value));

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const email = normalizeEmail(body.email);
    const confirmEmail = normalizeEmail(body.confirmEmail);
    const city = clampString(body.city, 80);
    const industry = clampString(body.industry, 80);
    const industryLabel =
      INDUSTRY_CATEGORIES.find((c) => c.value === industry)?.label ||
      clampString(body.industryLabel, 80);

    if (!email || !confirmEmail || !city || !industry) {
      return NextResponse.json({ error: "Fill in all fields including email confirmation." }, { status: 400 });
    }

    if (!isValidEmail(email)) {
      return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    }

    if (!emailsMatch(email, confirmEmail)) {
      return NextResponse.json({ error: "Email addresses do not match." }, { status: 400 });
    }

    if (!VALID_CITIES.has(city)) {
      return NextResponse.json({ error: "Select a valid Ontario city." }, { status: 400 });
    }

    if (!VALID_INDUSTRIES.has(industry)) {
      return NextResponse.json({ error: "Select a valid industry." }, { status: 400 });
    }

    const ip = clientIp(req);
    await enforceRateLimit(`request:ip:${ip}`, RATE_LIMITS.requestByIp);
    await enforceRateLimit(`request:email:${email}`, RATE_LIMITS.requestByEmail);

    const { orderId } = await createOrder({
      email,
      requestPayload: { city, industry, industryLabel: industryLabel || industry },
    });

    return NextResponse.json({ orderId, email });
  } catch (err) {
    console.error("Request error:", err);
    const status = err instanceof UserFacingError ? 429 : 500;
    return NextResponse.json(
      { error: getErrorMessage(err, "Unable to start your request. Please try again.") },
      { status }
    );
  }
}
