"use client";

import { useState, useEffect } from "react";

const AUTH_KEY = "annora-auth";

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    const saved = sessionStorage.getItem(AUTH_KEY);
    if (saved === "true") {
      setAuthed(true);
    } else {
      setAuthed(false);
    }
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setChecking(true);

    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();

      if (res.ok && data.success) {
        sessionStorage.setItem(AUTH_KEY, "true");
        setAuthed(true);
      } else {
        setError("Incorrect password");
        setPassword("");
      }
    } catch {
      setError("Connection error — please try again");
    } finally {
      setChecking(false);
    }
  }

  // Still loading
  if (authed === null) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-4 border-orange-200 border-t-orange-600" />
      </div>
    );
  }

  // Authenticated
  if (authed) {
    return <>{children}</>;
  }

  // Login screen
  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-pink-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-block bg-gradient-to-r from-orange-600 via-pink-600 to-purple-600 text-white px-6 py-3 rounded-2xl mb-4">
            <h1 className="text-2xl font-bold tracking-wide">Annora Boutique</h1>
          </div>
          <p className="text-gray-500">Enter password to continue</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6 space-y-4"
        >
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-center text-sm">
              {error}
            </div>
          )}

          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            autoFocus
            required
            className="w-full border border-gray-300 rounded-xl px-4 py-4 min-h-[56px] text-xl text-center focus:border-orange-400 focus:ring-2 focus:ring-orange-100 focus:outline-none transition-colors"
          />

          <button
            type="submit"
            disabled={checking}
            className="w-full bg-gradient-to-r from-orange-500 to-pink-500 text-white px-6 py-4 rounded-xl min-h-[56px] text-xl font-semibold disabled:opacity-50 shadow-lg hover:shadow-xl transition-all"
          >
            {checking ? "Checking..." : "Enter"}
          </button>
        </form>
      </div>
    </div>
  );
}
