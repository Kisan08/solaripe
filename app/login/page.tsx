"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Sun } from "lucide-react";
import { signInAction, type AuthActionResult } from "@/lib/auth/actions";

const initialState: AuthActionResult = {};

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(
    async (_prev: AuthActionResult, formData: FormData) => signInAction(formData),
    initialState,
  );

  return (
    <div className="min-h-screen bg-[#F4F6F9] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center gap-2 mb-6">
          <div className="flex size-9 items-center justify-center rounded-lg bg-primary">
            <Sun className="size-5 text-primary-foreground" aria-hidden="true" />
          </div>
          <span className="text-lg font-bold tracking-tight text-gray-900">Solaripe</span>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 p-6">
          <h1 className="text-xl font-bold text-gray-900 mb-1">Log in</h1>
          <p className="text-sm text-gray-500 mb-5">Welcome back to your solar EPC workspace.</p>

          <form action={formAction} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Email</label>
              <input
                type="email"
                name="email"
                required
                placeholder="you@company.com"
                className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-200 bg-white text-gray-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition-all"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Password</label>
              <input
                type="password"
                name="password"
                required
                placeholder="••••••••"
                className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-200 bg-white text-gray-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition-all"
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
              {pending ? "Logging in…" : "Log in"}
            </button>
          </form>
        </div>

        <p className="text-center text-sm text-gray-500 mt-4">
          Don&apos;t have an account?{" "}
          <Link href="/signup" className="font-medium text-[#1A4F8A]">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}
