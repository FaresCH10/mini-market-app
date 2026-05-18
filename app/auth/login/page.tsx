import { LoginForm } from "@/components/login-form";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { redirect } from "next/navigation";

export default async function Page() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/");
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#1B2D72] via-[#1B2D72] to-[#00AECC] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-white/10 rounded-2xl mb-4">
            <svg className="h-6 w-6 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 8h12l1 13H5L6 8Z" />
              <path d="M9 8a3 3 0 0 1 6 0" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white">NavyBits Market</h1>
          <p className="text-blue-200 text-sm mt-1">Sign in to your account</p>
        </div>

        <LoginForm />

        <p className="text-center text-blue-200 text-xs mt-6">
          <Link href="/" className="hover:text-white transition-colors">
            ← Back to store
          </Link>
        </p>
      </div>
    </div>
  );
}
