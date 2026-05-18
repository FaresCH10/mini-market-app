import { createClient } from "@supabase/supabase-js";
import ProductCatalog, { type Product } from "@/components/ProductCatalog";

export const revalidate = 30;

async function getProducts() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return { products: [] as Product[], error: "Supabase is not configured." };
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase
    .from("products")
    .select("id, name, quantity, price, sell_price, image_url")
    .order("created_at", { ascending: false });

  return {
    products: (data ?? []) as Product[],
    error: error?.message ?? null,
  };
}

export default async function Home() {
  const { products, error } = await getProducts();
  return <ProductCatalog initialProducts={products} error={error} />;
}
