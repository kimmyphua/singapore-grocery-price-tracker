import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Nunito } from "next/font/google";
import { requireAppSession } from "@/lib/auth/session";
import "./globals.css";

const nunito = Nunito({ subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: "Singapore Grocery Price Tracker",
  description: "Compare Singapore supermarket prices for recurring grocery items."
};

export default async function RootLayout({
  children
}: {
  children: ReactNode;
}) {
  const session = await requireAppSession().catch(() => null);

  return (
    <html lang="en">
      <body className={nunito.className}>
        <div className="min-h-screen bg-mist">
          <header className="border-b border-sage bg-white/90">
            <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-5">
              <a href="/" className="text-sm font-extrabold text-ink">
                SG Grocery Tracker
              </a>
              {session ? (
                <div className="flex items-center gap-3 text-sm font-bold text-ink sm:gap-5">
                  <a href="/">Dashboard</a>
                  <a href="/products">Products</a>
                  <a href="/account">Account</a>
                  <form action="/auth/signout" method="post">
                    <button type="submit">Sign out</button>
                  </form>
                </div>
              ) : null}
            </nav>
          </header>
          <main className="mx-auto max-w-6xl px-4 py-6 sm:px-5 sm:py-8">{children}</main>
          <footer className="border-t border-teal/15 bg-white">
            <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-5 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <p>Made by Kimberly Phua</p>
              <a
                href="https://github.com/kimmyphua/singapore-grocery-price-tracker"
                target="_blank"
                rel="noreferrer"
                className="font-semibold text-teal transition hover:text-ink"
              >
                View on GitHub
              </a>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
