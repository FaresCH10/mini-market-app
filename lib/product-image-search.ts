import Groq from "groq-sdk";

const GROQ_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";

type OFFProduct = { image_front_url?: string; image_url?: string };

/**
 * Normalize with Groq, then query Open Food Facts. Returns unique image URLs (front preferred).
 * Throws if GROQ_API_KEY is not set (callers map to 503).
 */
export async function searchProductImageUrls(productName: string): Promise<string[]> {
  const trimmed = productName.trim();
  if (!trimmed) return [];

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("GROQ_API_KEY not configured");
  }

  const groq = new Groq({ apiKey });

  let searchTerm = trimmed;
  try {
    const aiRes = await groq.chat.completions.create({
      model: GROQ_MODEL,
      messages: [
        {
          role: "system",
          content:
            "You are a product name normalizer for Open Food Facts search. Given any product name (in any language), reply with ONLY the best short English search term to find it on Open Food Facts (e.g. 'كيتكات' → 'KitKat', 'شيبس' → 'chips', 'مياه نستله' → 'Nestle water'). One term only, no explanation.",
        },
        { role: "user", content: trimmed },
      ],
      max_tokens: 20,
      temperature: 0,
    });
    const normalized = aiRes.choices[0]?.message?.content?.trim();
    if (normalized) searchTerm = normalized.replace(/\+/g, " ").trim();
  } catch {
    // fall through with original name
  }

  const queries = [searchTerm, trimmed].filter((q, i, arr) => arr.indexOf(q) === i);

  for (const query of queries) {
    try {
      const url = new URL("https://world.openfoodfacts.org/cgi/search.pl");
      url.searchParams.set("search_terms", query);
      url.searchParams.set("search_simple", "1");
      url.searchParams.set("action", "process");
      url.searchParams.set("json", "1");
      url.searchParams.set("page_size", "10");
      url.searchParams.set("fields", "product_name,image_front_url,image_url");

      const res = await fetch(url.toString(), {
        headers: {
          "User-Agent": "NavyBits-Market/1.0 (product image lookup)",
          Accept: "application/json",
        },
      });

      if (!res.ok) continue;

      const contentType = res.headers.get("content-type") ?? "";
      if (!contentType.includes("json")) continue;

      const data = (await res.json()) as { products?: OFFProduct[] };
      const products = data.products ?? [];

      const seen = new Set<string>();
      const imageUrls: string[] = [];
      for (const p of products) {
        const img = p.image_front_url || p.image_url;
        if (img && !seen.has(img)) {
          seen.add(img);
          imageUrls.push(img);
        }
      }

      if (imageUrls.length > 0) return imageUrls;
    } catch (err) {
      console.error(`[search-product-image] OFF fetch failed for "${query}":`, err);
    }
  }

  return [];
}
