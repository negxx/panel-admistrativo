import { useEffect } from "react";
import { trpc } from "@/providers/trpc";

/** Fallbacks cuando el club todavía no cargó su identidad. */
export const DEFAULT_BRANDING = {
  clubName: "Club de Fútbol",
  logoUrl: "",
  primaryColor: "#0d1642",
  accentColor: "#ffc107",
};

/**
 * Identidad pública del club (nombre, logo, colores) tal como la ve el portal.
 *
 * Es la misma data para todo el sitio y casi nunca cambia, así que se pide una
 * vez y se deja en caché. También actualiza el título de la pestaña.
 */
export function useBranding(titleSuffix?: string) {
  const { data } = trpc.portal.bankInfo.useQuery(undefined, {
    staleTime: 5 * 60_000,
  });

  const branding = data
    ? {
        clubName: data.clubName || DEFAULT_BRANDING.clubName,
        logoUrl: data.logoUrl,
        primaryColor: data.primaryColor,
        accentColor: data.accentColor,
      }
    : null;

  useEffect(() => {
    if (branding?.clubName) {
      document.title = titleSuffix
        ? `${branding.clubName} — ${titleSuffix}`
        : branding.clubName;
    }
  }, [branding?.clubName, titleSuffix]);

  return branding ?? DEFAULT_BRANDING;
}
