import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Singapore Grocery Price Tracker",
  description: "Compare Singapore supermarket prices for recurring grocery items."
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="min-h-screen bg-mist">
          <header className="border-b border-teal/15 bg-white">
            <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-5">
              <a href="/" className="text-sm font-semibold text-ink">
                SG Grocery Tracker
              </a>
              <div className="flex gap-4 text-sm text-slate-600">
                <a href="/products">Products</a>
                <a href="/deals">Deals</a>
                <a href="/admin/promotions">Review</a>
                <a
                  href="https://github.com/kimmyphua/singapore-grocery-price-tracker"
                  target="_blank"
                  rel="noreferrer"
                >
                  GitHub
                </a>
              </div>
            </nav>
          </header>
          <main className="mx-auto max-w-6xl px-4 py-6 sm:px-5 sm:py-8">{children}</main>
        </div>
      </body>
    </html>
  );
}
