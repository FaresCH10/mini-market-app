import Groq from "groq-sdk";
import { NextRequest, NextResponse } from "next/server";

function getGroq() {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY is not set");
  return new Groq({ apiKey });
}

export async function POST(req: NextRequest) {
  try {
    const { sheetCsv } = await req.json();
    if (!sheetCsv) return NextResponse.json({ error: "No sheet data" }, { status: 400 });

    const groq = getGroq();

    const response = await groq.chat.completions.create({
      model: "meta-llama/llama-4-scout-17b-16e-instruct",
      messages: [
        {
          role: "system",
          content: `You are a product catalog extraction assistant.
Given raw spreadsheet data (CSV), extract every product entry and return structured JSON.

Rules:
- IGNORE category labels or section headers (short uppercase words like "SNAKZ", "DRINKZ", "CATEGORY", "ITEM", "PRICE" etc.)
- IGNORE empty rows and purely numeric row numbers
- Product names are descriptive text strings (may include weights, sizes, brand names, parentheses)
- Prices are numbers — they may be formatted with commas (5,000) or have a currency suffix (20,000L.L or 20,000 L.L). Strip commas and currency text and keep full L.L values (so 5,000 → 5000, 20,000 → 20000)
- The sheet may have multiple side-by-side product groups in the same row (e.g. columns A-C for one group, columns E-G for another) — extract ALL of them
- If no quantity column is present, set quantity to 0
- Return ONLY a valid JSON array with no explanation, no markdown, no code blocks:
[{"name": "Product Name", "price": 5000, "quantity": 0}, ...]`,
        },
        {
          role: "user",
          content: `Extract products from this sheet data:\n\n${sheetCsv}`,
        },
      ],
      max_tokens: 2048,
      temperature: 0.1,
    });

    const raw = response.choices[0].message.content?.trim() ?? "";

    // Strip markdown code fences if the model wrapped the output
    const jsonStr = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

    let products: { name: string; price: number; quantity: number }[];
    try {
      products = JSON.parse(jsonStr);
    } catch {
      return NextResponse.json({ error: "AI returned invalid JSON", raw }, { status: 422 });
    }

    // Basic sanitization
    const clean = products
      .filter((p) => p.name && typeof p.name === "string" && p.name.trim().length > 0)
      .map((p) => ({
        name: String(p.name).trim(),
        price: Math.max(0, parseFloat(String(p.price)) || 0),
        quantity: Math.max(0, parseInt(String(p.quantity)) || 0),
      }));

    return NextResponse.json({ products: clean });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
