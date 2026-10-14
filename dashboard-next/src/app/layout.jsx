import "./globals.css";

export const metadata = {
  title: "DeFiSentinel — Local Security Simulation",
  description:
    "A local DeFi security simulation prototype. Demo data only; no contract is compiled or attacked.",
  icons: {
    icon:
      "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' fill='%2308080A'/%3E%3Cpath d='M13 13h17a19 19 0 1 1 0 38H13z' fill='none' stroke='%238B5CF6' stroke-width='3'/%3E%3C/svg%3E",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#08080A",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
