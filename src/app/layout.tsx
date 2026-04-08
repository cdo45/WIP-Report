import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Vance Corp — WIP Report",
  description: "Work-in-Progress Report",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
