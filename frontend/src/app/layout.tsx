import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";
import { APIProvider } from "@/contexts/APIContext";
import { NotificationProvider } from "@/contexts/NotificationContext";
import { DiscoveryFilterProvider } from "@/contexts/DiscoveryFilterContext";
import { AIChatSessionsProvider } from "@/contexts/AIChatSessionsContext";
import { AIChatProvider } from "@/contexts/AIChatContext";
import ClientWrapper from "@/components/ClientWrapper";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`antialiased`}>
        <script
          defer
          data-domain="index.network"
          src="https://plausible.io/js/script.outbound-links.js"
        />
        <AuthProvider>
          <APIProvider>
            <NotificationProvider>
              <DiscoveryFilterProvider>
                <AIChatSessionsProvider>
                  <AIChatProvider>
                    <ClientWrapper>
                      {children}
                    </ClientWrapper>
                  </AIChatProvider>
                </AIChatSessionsProvider>
              </DiscoveryFilterProvider>
            </NotificationProvider>
          </APIProvider>
        </AuthProvider>
      </body>
    </html>
  );
}

