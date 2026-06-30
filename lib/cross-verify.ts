import { ApifyClient } from "apify-client";
import type { SpotCheckReport } from "./spot-check";
import { VERIFICATION_THRESHOLDS } from "./verification";

function pickSamples<T>(items: T[], size: number): T[] {
  if (items.length <= size) return [...items];
  const copy = [...items];
  const out: T[] = [];
  while (out.length < size && copy.length) {
    const i = Math.floor(Math.random() * copy.length);
    out.push(copy.splice(i, 1)[0]);
  }
  return out;
}

function digitsOnly(phone: string): string {
  return phone.replace(/\D/g, "");
}

function namesSimilar(a: string, b: string): boolean {
  const na = a.toLowerCase().replace(/[^a-z0-9]/g, "");
  const nb = b.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!na || !nb) return false;
  return na.includes(nb) || nb.includes(na) || na.slice(0, 6) === nb.slice(0, 6);
}

/** Re-query Google Places for sample businesses and confirm phone/name match. */
export async function crossVerifyLocalLeads(
  leads: { name: string; phone: string; address: string }[],
  city: string
): Promise<SpotCheckReport> {
  const token = process.env.APIFY_API_TOKEN;
  const actorId = process.env.APIFY_VERIFY_ACTOR_ID || process.env.APIFY_ACTOR_ID || "compass~crawler-google-places";
  if (!token || leads.length === 0) {
    return { samplesChecked: 0, passed: true, issues: [] };
  }

  const samples = pickSamples(leads, 3);
  const client = new ApifyClient({ token });
  const issues: string[] = [];
  let matched = 0;

  for (const sample of samples) {
    try {
      const run = await client.actor(actorId).call(
        {
          searchStringsArray: [`${sample.name} ${city}, Ontario`],
          maxCrawledPlacesPerSearch: 5,
          language: "en",
          countryCode: "ca",
        },
        { waitSecs: 90 }
      );
      const { items } = await client.dataset(run.defaultDatasetId).listItems();
      const samplePhone = digitsOnly(sample.phone);
      const hit = (items as Record<string, unknown>[]).some((item) => {
        const itemPhone = digitsOnly(String(item.phone || ""));
        const title = String(item.title || "");
        return (
          (itemPhone.length >= 10 && itemPhone.slice(-10) === samplePhone.slice(-10)) ||
          namesSimilar(title, sample.name)
        );
      });

      if (hit) matched += 1;
      else issues.push(`"${sample.name}": not confirmed by secondary Google Places lookup`);
    } catch (err) {
      issues.push(`"${sample.name}": verify lookup failed (${err instanceof Error ? err.message : "error"})`);
    }
  }

  const ratio = samples.length ? matched / samples.length : 1;
  return {
    samplesChecked: samples.length,
    passed: ratio >= VERIFICATION_THRESHOLDS.minCrossMatchRatio,
    issues,
    rescrapeChecked: samples.length,
    rescrapeMatched: matched,
  };
}
