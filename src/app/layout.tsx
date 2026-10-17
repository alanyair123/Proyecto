import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "PulseMarket",
  description: "Juego multijugador PulseMarket",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
