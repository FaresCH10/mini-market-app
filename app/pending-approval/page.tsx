"use client";
import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Suspense } from "react";

function PendingApprovalContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const isSignup = searchParams.get("source") === "signup";
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    // If user somehow lands here without being logged in, send them to login
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) router.replace("/auth/login");
    });
  }, [router]);

  const handleSignOut = async () => {
    setSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/auth/login");
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        {/* Icon */}
        <div className="flex justify-center mb-6">
          <div className="w-16 h-16 rounded-2xl bg-amber-50 border-2 border-amber-100 flex items-center justify-center">
            <svg className="w-8 h-8 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-xl shadow-black/5 border border-gray-100 p-8 text-center">
          {/* Logo / Brand */}
          <div className="flex items-center justify-center gap-2 mb-6">
            <div className="w-6 h-6 bg-[#1B2D72] rounded-lg flex items-center justify-center">
              <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
              </svg>
            </div>
            <span className="font-bold text-gray-900 text-sm">NavyBits Market</span>
          </div>

          <h1 className="text-xl font-bold text-gray-900 mb-2">
            {isSignup ? "Account Created!" : "Account Under Review"}
          </h1>

          {isSignup ? (
            <div className="space-y-3 mb-6">
              <p className="text-sm text-gray-500 leading-relaxed">
                Your account has been created and is awaiting admin approval.
              </p>
              <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 text-left">
                <p className="text-xs font-semibold text-amber-700 mb-0.5">Waiting for admin approval</p>
                <p className="text-xs text-amber-600">
                  An admin will review and approve your account before you can access the store.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-3 mb-6">
              <p className="text-sm text-gray-500 leading-relaxed">
                Your profile is currently under review. You&apos;ll be able to access the store once an admin approves your account.
              </p>
              <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-left">
                <p className="text-xs font-semibold text-[#1B2D72] mb-0.5">What happens next?</p>
                <p className="text-xs text-blue-600">
                  An admin will review your account shortly. Try signing in again after some time to check your status.
                </p>
              </div>
            </div>
          )}

          {/* Steps for signup state */}
          {isSignup && (
            <div className="grid grid-cols-2 gap-3 mb-6">
              {[
                { step: "1", label: "Account created", done: true },
                { step: "2", label: "Admin approval", done: false },
              ].map((s) => (
                <div key={s.step} className="flex flex-col items-center gap-1.5">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${s.done ? "bg-emerald-500 text-white" : "bg-gray-100 text-gray-400"}`}>
                    {s.done ? (
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : s.step}
                  </div>
                  <span className="text-xs text-gray-400 text-center leading-tight">{s.label}</span>
                </div>
              ))}
            </div>
          )}

          <button
            onClick={handleSignOut}
            disabled={signingOut}
            className="w-full py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            {signingOut ? "Signing out..." : "Sign out"}
          </button>
        </div>

        <p className="text-center text-xs text-gray-400 mt-4">
          Need help? Contact your store administrator.
        </p>
      </div>
    </div>
  );
}

export default function PendingApprovalPage() {
  return (
    <Suspense>
      <PendingApprovalContent />
    </Suspense>
  );
}
