import { NextResponse } from "next/server";
import { createClient as createServerSupabase } from "@/lib/supabase/server";
import { createClient as createServiceSupabase } from "@supabase/supabase-js";

export async function POST() {
  try {
    const authClient = await createServerSupabase();
    const { data: { user } } = await authClient.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json({ error: "Server not configured." }, { status: 500 });
    }

    const adminClient = createServiceSupabase(supabaseUrl, serviceRoleKey);

    // Insert profile only if it doesn't already exist (preserve existing approved status)
    await adminClient.from("profiles").upsert(
      { id: user.id, email: user.email, role: "user", approved: false },
      { onConflict: "id", ignoreDuplicates: true },
    );

    // Read the current approved status (may have been set by DB trigger or previous insert)
    const { data: profile, error } = await adminClient
      .from("profiles")
      .select("approved")
      .eq("id", user.id)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ approved: profile?.approved ?? false });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
