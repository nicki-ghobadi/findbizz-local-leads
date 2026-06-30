import { ApifyClient } from "apify-client";



export interface BusinessLead {
  name: string;
  phone: string;
  address: string;
  website: string;
  rating: number;
  reviewCount: number;
  category: string;
  email?: string;
}

export async function scrapeLocalBusinesses(
  industry: string,
  city: string
): Promise<BusinessLead[]> {
  const token = process.env.APIFY_API_TOKEN;
  const actorId = process.env.APIFY_ACTOR_ID || "compass~crawler-google-places";
  if (!token) throw new Error("Missing APIFY_API_TOKEN");

  const client = new ApifyClient({ token });
  const searchTerms = [
    `${industry} in ${city}, Ontario, Canada`,
  ];

  const run = await client.actor(actorId).call({
    searchStringsArray: searchTerms,
    maxCrawledPlacesPerSearch: 100,
    language: "en",
    countryCode: "ca",
    includeHistogram: false,
    includeOpeningHours: false,
    includePeopleAlsoSearch: false,
    exportPlaceUrls: false,
    additionalInfo: false,
  });

  const { items } = await client.dataset(run.defaultDatasetId).listItems();

  const seen = new Set<string>();
  const results: BusinessLead[] = [];

  for (const item of items as Record<string, unknown>[]) {
    const phone = String(item.phone || "").replace(/\D/g, "");
    if (!phone || seen.has(phone)) continue;
    seen.add(phone);

    results.push({
      name: String(item.title || ""),
      phone: String(item.phone || ""),
      address: String(item.address || ""),
      website: String(item.website || ""),
      rating: Number(item.totalScore || 0),
      reviewCount: Number(item.reviewsCount || 0),
      category: String(item.categoryName || industry),
    });
  }

  return results;
}

import { sanitizeCsvCell } from "./sanitize";

export function toCSV(leads: BusinessLead[]): string {
  const header = ["Name", "Phone", "Address", "Website", "Rating", "Reviews", "Category"];
  const rows = leads.map((l) => [
    sanitizeCsvCell(l.name),
    sanitizeCsvCell(l.phone),
    sanitizeCsvCell(l.address),
    sanitizeCsvCell(l.website),
    String(l.rating),
    String(l.reviewCount),
    sanitizeCsvCell(l.category),
  ]);
  return [header.join(","), ...rows.map((r) => r.join(","))].join("\n");
}
