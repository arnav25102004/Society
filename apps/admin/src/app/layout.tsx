import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Urban Hub Portal — Smart Resident Management",
  description: "Secure Admin and Super Admin console for Urban Hub.",
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
