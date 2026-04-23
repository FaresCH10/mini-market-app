import { SignUpForm } from "@/components/sign-up-form";
import { createClient } from "@/lib/supabase/server";
import { FaShoppingBag } from "react-icons/fa";
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
            <FaShoppingBag className="text-white" size={24} />
          </div>
          <h1 className="text-2xl font-bold text-white">NavyBits Market</h1>
          <p className="text-blue-200 text-sm mt-1">Create your account</p>
        </div>

        <SignUpForm />

        <p className="text-center text-blue-200 text-xs mt-6">
          <Link href="/" className="hover:text-white transition-colors">
            ← Back to store
          </Link>
        </p>
      </div>
    </div>
  );
}
