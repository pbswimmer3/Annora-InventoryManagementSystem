import type { Metadata } from "next";
import "./globals.css";
import Nav from "@/components/Nav";

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
      <body className="bg-gradient-to-br from-orange-50 via-white to-pink-50 min-h-screen">
        <Nav />
        <main className="no-print max-w-2xl mx-auto px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
