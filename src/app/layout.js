import "./globals.css";

export const metadata = {
  title: "AgendaPsi",
  description: "Agenda clínica para psicólogos (SaaS)",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }) {
  return (
    // O 'suppressHydrationWarning' impede o erro vermelho causado por extensões do navegador
    <html lang="pt-BR" suppressHydrationWarning={true}>
      <body className="tone-soft">
        {children}
      </body>
    </html>
  );
}