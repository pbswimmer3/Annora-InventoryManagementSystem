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
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-4 border-amber-900 border-t-amber-400" />
      </div>
    );
  }

  // Authenticated
  if (authed) {
    return <>{children}</>;
  }

  // Login screen
  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <img src="/annora-logo.jpg" alt="Annora" className="h-24 mx-auto rounded-lg mb-4" />
          <p className="text-gray-400">Enter password to continue</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-gray-950 rounded-2xl shadow-lg border border-amber-700/30 p-6 space-y-4"
        >
          {error && (
            <div className="bg-red-950/50 border border-red-800 text-red-400 rounded-xl p-3 text-center text-sm">
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
            className="w-full border border-amber-700/40 bg-black rounded-xl px-4 py-4 min-h-[56px] text-xl text-center text-white placeholder-gray-600 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 focus:outline-none transition-colors"
          />

          <button
            type="submit"
            disabled={checking}
            className="w-full bg-amber-600 hover:bg-amber-500 text-black px-6 py-4 rounded-xl min-h-[56px] text-xl font-bold disabled:opacity-50 shadow-lg hover:shadow-amber-500/20 transition-all"
          >
            {checking ? "Checking..." : "Enter"}
          </button>
        </form>
      </div>
    </div>
  );
}
