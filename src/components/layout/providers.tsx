"use client";
import { ThemeProvider, useTheme } from "next-themes";
import { Toaster } from "sonner";
function Notifications() {
  const { resolvedTheme } = useTheme();
  return (
    <Toaster
      theme={resolvedTheme === "dark" ? "dark" : "light"}
      richColors
      closeButton
      toastOptions={{ closeButtonAriaLabel: "Fermer la notification" }}
      position="top-right"
    />
  );
}
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <Notifications />
      {children}
    </ThemeProvider>
  );
}
