import type { Metadata } from "next";
import { Providers } from "./providers";
import "@/styles/globals.scss";

export const metadata: Metadata = {
  title: "Comments",
  description: "A tree-structured comments SPA — dZENcode test assignment.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
