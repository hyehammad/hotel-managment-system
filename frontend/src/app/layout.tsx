import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Grand Horizon Hotel & Suites",
    template: "%s | Grand Horizon Hotel & Suites",
  },
  description:
    "Experience sophisticated luxury and unmatched comfort at Grand Horizon Hotel & Suites in Karachi. Book your stay directly with zero booking fees.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full antialiased font-sans">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
