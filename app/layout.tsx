import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Help Me Write",
  description: "A local-friendly writing assistant with collaboration, editing, and character continuity.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
