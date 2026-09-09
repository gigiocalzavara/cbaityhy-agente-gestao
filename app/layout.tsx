import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CBAItyhy Inteligência APS",
  description: "Assistente conversacional para inteligência e gestão da Atenção Primária à Saúde.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
