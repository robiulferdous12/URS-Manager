import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/components/auth/AuthProvider";
import PageWrapper from "@/components/layout/PageWrapper";
import ThemeProvider from "@/components/ThemeProvider";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "URS Management",
  description:
    "Compare vendor quotations against User Requirement Specifications. Upload URS, manage quotations, and generate side-by-side comparisons.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.className} antialiased`} suppressHydrationWarning>
        <ThemeProvider>
          <AuthProvider>
            <PageWrapper>
              {children}
            </PageWrapper>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
