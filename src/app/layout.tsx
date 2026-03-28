import type { Metadata } from "next";
import "./globals.css";
import Nav from "@/components/Nav";
import AuthGate from "@/components/AuthGate";

export const metadata: Metadata = {
  title: "Annora Boutique — Inventory",
  description: "Indian Clothing Inventory Management",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-gray-950 min-h-screen text-gray-100">
        <AuthGate>
          <Nav />
          <main className="max-w-2xl mx-auto px-4 py-6">{children}</main>
        </AuthGate>
      </body>
    </html>
  );
}
