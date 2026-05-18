import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerSupabase } from "@/lib/supabase/server";
import { createClient as createServiceSupabase } from "@supabase/supabase-js";

const getServiceClient = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return null;
  return createServiceSupabase(supabaseUrl, serviceRoleKey);
};

const requireAdmin = async () => {
  const authClient = await createServerSupabase();
  const {
    data: { user },
  } = await authClient.auth.getUser();

  if (!user) {
    return { ok: false as const, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const { data: profile } = await authClient
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") {
    return { ok: false as const, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  const adminClient = getServiceClient();
  if (!adminClient) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Server is not configured." }, { status: 500 }),
    };
  }

  return { ok: true as const, adminClient };
};

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { data, error } = await auth.adminClient
    .from("profiles")
    .select("*")
    .order("approved", { ascending: true })
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ users: data ?? [] });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => null);
  const userId = typeof body?.userId === "string" ? body.userId : "";
  const updates: { role?: "admin" | "user"; approved?: boolean } = {};

  if (body?.role !== undefined) {
    if (body.role !== "admin" && body.role !== "user") {
      return NextResponse.json({ error: "Invalid role." }, { status: 400 });
    }
    updates.role = body.role;
  }

  if (body?.approved !== undefined) {
    if (typeof body.approved !== "boolean") {
      return NextResponse.json({ error: "Invalid approval value." }, { status: 400 });
    }
    updates.approved = body.approved;
  }

  if (!userId || Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid update provided." }, { status: 400 });
  }

  const { data, error } = await auth.adminClient
    .from("profiles")
    .update(updates)
    .eq("id", userId)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ user: data });
}
