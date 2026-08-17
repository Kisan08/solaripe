"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signUpAction, type AuthActionResult } from "@/lib/auth/actions";

const initialState: AuthActionResult = {};

export default function SignupPage() {
  const [state, formAction, pending] = useActionState(
    async (_prev: AuthActionResult, formData: FormData) => signUpAction(formData),
    initialState,
  );

  return (
    <div className="min-h-screen bg-[#F4F6F9] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center justify-center gap-2 mb-6">
          <img src="/brand/amsu-mark.png" alt="" className="h-12 w-auto" />
          <img src="/brand/amsu-wordmark.png" alt="Amsu" className="h-9 w-auto" />
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 p-6">
          <h1 className="text-xl font-bold text-gray-900 mb-1">Create your account</h1>
          <p className="text-sm text-gray-500 mb-5">Set up your solar EPC workspace.</p>

          {state.message ? (
            <div className="text-sm font-medium text-green-800 bg-green-50 border border-green-100 rounded-xl px-3 py-3">
              {state.message}
            </div>
          ) : (
            <form action={formAction} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Company name</label>
                <input
                  type="text"
                  name="companyName"
                  required
                  placeholder="Omkar Power Solutions"
                  className="w-full px-3 py-2.5 text-base rounded-xl border border-gray-200 bg-white text-gray-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition-all"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Email</label>
                <input
                  type="email"
                  name="email"
                  required
                  placeholder="you@company.com"
                  className="w-full px-3 py-2.5 text-base rounded-xl border border-gray-200 bg-white text-gray-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition-all"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Password</label>
                <input
                  type="password"
                  name="password"
                  required
                  minLength={6}
                  placeholder="At least 6 characters"
                  className="w-full px-3 py-2.5 text-base rounded-xl border border-gray-200 bg-white text-gray-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition-all"
                />
              </div>

              {state.error && (
                <p className="text-xs font-medium text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
                  {state.error}
                </p>
              )}

              <button
                type="submit"
                disabled={pending}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-white disabled:opacity-50 transition-all"
                style={{ background: "#1A4F8A" }}
              >
                {pending ? "Creating account…" : "Sign up"}
              </button>
            </form>
          )}
        </div>

        <p className="text-center text-sm text-gray-500 mt-4">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-[#1A4F8A]">
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}
