import type { Metadata } from "next";
import "./globals.css";
import Nav from "@/components/Nav";

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
      <body className="bg-[#1F3864] text-white min-h-screen">
        <Nav />
        {children}
      </body>
    </html>
  );
}
