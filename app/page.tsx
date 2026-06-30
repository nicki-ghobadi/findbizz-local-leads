"use client";

import { useState } from "react";
import { EmailVerifyStep } from "@/components/email-verify-step";
import { LandingShell } from "@/components/landing-shell";
import {
  ErrorBox,
  FieldInput,
  FieldSelect,
  FormHint,
  Label,
  PreviewBox,
  SubmitButton,
} from "@/components/form-ui";
import { ONTARIO_REGIONS, INDUSTRY_CATEGORIES } from "@/lib/ontario-cities";
import { features, hero, theme } from "@/lib/theme";

export default function Home() {
  const [industry, setIndustry] = useState("");
  const [city, setCity] = useState("");
  const [email, setEmail] = useState("");
  const [confirmEmail, setConfirmEmail] = useState("");
  const [orderId, setOrderId] = useState("");
  const [step, setStep] = useState<"form" | "verify">("form");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const selectedIndustryLabel =
    INDUSTRY_CATEGORIES.find((c) => c.value === industry)?.label || industry;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!industry || !city || !email || !confirmEmail) {
      setError("Please fill in all fields.");
      return;
    }
    if (email.trim().toLowerCase() !== confirmEmail.trim().toLowerCase()) {
      setError("Email addresses do not match.");
      return;
    }
    setError("");
    setLoading(true);

    const res = await fetch("/api/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        confirmEmail,
        city,
        industry,
        industryLabel: selectedIndustryLabel,
      }),
    });

    const data = await res.json();
    if (data.orderId) {
      setOrderId(data.orderId);
      setStep("verify");
      setLoading(false);
      return;
    }

    setError(data.error || "Something went wrong. Please try again.");
    setLoading(false);
  }

  return (
    <LandingShell
      productName={theme.productName}
      footer={theme.footer}
      accent={theme.accent}
      accentSoft={theme.accentSoft}
      accentBorder={theme.accentBorder}
      glow={theme.glow}
      badge={hero.badge}
      headline={hero.headline}
      accentIndex={hero.accentIndex}
      description={hero.description}
      price={hero.price}
      featuresTitle={features.title}
      features={features.items}
      trustItems={hero.trustItems}
    >
      {step === "verify" ? (
        <EmailVerifyStep
          theme={theme}
          email={email}
          orderId={orderId}
          checkoutPath="/api/checkout"
          submitLabel="Continue to payment — $59 CAD"
          onBack={() => {
            setStep("form");
            setOrderId("");
          }}
        />
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <Label>Industry</Label>
            <FieldSelect theme={theme} value={industry} onChange={(e) => setIndustry(e.target.value)}>
              <option value="" disabled>
                Select an industry…
              </option>
              {INDUSTRY_CATEGORIES.map((cat) => (
                <option key={cat.value} value={cat.value}>
                  {cat.label}
                </option>
              ))}
            </FieldSelect>
          </div>

          <div>
            <Label>City</Label>
            <FieldSelect theme={theme} value={city} onChange={(e) => setCity(e.target.value)}>
              <option value="" disabled>
                Select a city…
              </option>
              {ONTARIO_REGIONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </FieldSelect>
          </div>

          <div>
            <Label>Your email</Label>
            <FieldInput
              theme={theme}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
            />
          </div>

          <div>
            <Label>Confirm email</Label>
            <FieldInput
              theme={theme}
              type="email"
              value={confirmEmail}
              onChange={(e) => setConfirmEmail(e.target.value)}
              placeholder="you@company.com"
            />
          </div>

          {industry && city && (
            <PreviewBox>
              {selectedIndustryLabel} in {city}, Ontario
            </PreviewBox>
          )}

          {error && <ErrorBox message={error} />}

          <SubmitButton theme={theme} loading={loading}>
            {loading ? "Sending verification code…" : "Verify email & continue — $59 CAD"}
          </SubmitButton>

          <FormHint>{hero.delivery}</FormHint>
        </form>
      )}
    </LandingShell>
  );
}
