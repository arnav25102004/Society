import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SocietyHub Portal — Smart Resident Management",
  description: "Secure Admin and Super Admin console for SocietyHub.",
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
