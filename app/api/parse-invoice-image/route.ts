import Groq from "groq-sdk";
import { NextRequest, NextResponse } from "next/server";

type ParsedProduct = { name: string; price: number; quantity: number };

function getGroq() {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY is not set");
  return new Groq({ apiKey });
}

function sanitizeProducts(raw: unknown[]): { valid: ParsedProduct[]; errors: { row: number; reason: string }[] } {
  const valid: ParsedProduct[] = [];
  const errors: { row: number; reason: string }[] = [];

  raw.forEach((item, idx) => {
    const row = idx + 1;
    if (!item || typeof item !== "object") {
      errors.push({ row, reason: "Invalid row shape" });
      return;
    }
    const p = item as { name?: unknown; price?: unknown; quantity?: unknown };
    const name = String(p.name ?? "").trim();
    const price = Number(String(p.price ?? "").replace(/,/g, ""));
    const quantity = Number.parseInt(String(p.quantity ?? "0"), 10);

    if (!name) {
      errors.push({ row, reason: "Missing product name" });
      return;
    }
    if (!Number.isFinite(price) || price < 0) {
      errors.push({ row, reason: "Invalid price" });
      return;
    }
    if (!Number.isFinite(quantity) || quantity < 0) {
      errors.push({ row, reason: "Invalid quantity" });
      return;
    }
    valid.push({ name, price, quantity });
  });

  return { valid, errors };
}

export async function POST(req: NextRequest) {
  try {
    const { imageDataUrl } = (await req.json()) as { imageDataUrl?: string };
    if (!imageDataUrl || typeof imageDataUrl !== "string" || !imageDataUrl.startsWith("data:image/")) {
      return NextResponse.json({ error: "A valid invoice image is required." }, { status: 400 });
    }

    const groq = getGroq();
    const completion = await groq.chat.completions.create({
      model: "meta-llama/llama-4-scout-17b-16e-instruct",
      messages: [
        {
          role: "system",
          content:
            "You extract products from invoice images. Return ONLY a valid JSON array with this exact shape: " +
            '[{"name":"Product Name","price":5,"quantity":2}]. ' +
            "Rules: price must be in K L.L. If invoice price is in L.L, divide by 1000. If quantity is missing, use 1. " +
            "Ignore totals/subtotals/taxes/discount rows and non-product text.",
        },
        {
          role: "user",
          content: [
            { type: "text", text: "Extract all invoice product rows from this image." },
            { type: "image_url", image_url: { url: imageDataUrl } },
          ],
        },
      ],
      temperature: 0.1,
      max_tokens: 2048,
    });

    const rawContent = completion.choices[0]?.message?.content?.trim() ?? "";
    const jsonStr = rawContent.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      return NextResponse.json({ error: "AI returned invalid JSON", raw: rawContent }, { status: 422 });
    }

    if (!Array.isArray(parsed)) {
      return NextResponse.json({ error: "AI output must be an array." }, { status: 422 });
    }

    const { valid, errors } = sanitizeProducts(parsed);
    return NextResponse.json({ products: valid, errors });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
