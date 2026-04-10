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
      <body className="bg-[#F5F5F5] text-[#1A1A1A] min-h-screen">
        <Nav />
        {children}
      </body>
    </html>
  );
}
