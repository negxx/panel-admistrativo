import { createTRPCReact } from "@trpc/react-query";
import { httpBatchLink } from "@trpc/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import superjson from "superjson";
import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../server/router";
import type { ReactNode } from "react";

/**
 * Tipos de entrada y salida de cada endpoint, inferidos del router del backend.
 *
 * Sirven para tipar props de componentes sin repetir la forma de los datos:
 *
 *     type Socio = RouterOutputs["player"]["list"]["players"][number];
 */
export type RouterOutputs = inferRouterOutputs<AppRouter>;
export type RouterInputs = inferRouterInputs<AppRouter>;

/**
 * Cliente tRPC tipado con el router del backend.
 *
 * eslint-disable: la regla de Fast Refresh pide que un archivo exporte sólo
 * componentes. Acá conviven el cliente y el provider a propósito — separarlos
 * obligaría a tocar el import de todas las pantallas sin ninguna ganancia real,
 * y el cliente es un objeto estable que no participa del refresco en caliente.
 */
// eslint-disable-next-line react-refresh/only-export-components
export const trpc = createTRPCReact<AppRouter>();

/**
 * En el plan gratuito, la primera petición tras un rato sin uso paga el arranque
 * en frío de la función y de la base: puede tardar varios segundos o directamente
 * agotar el tiempo. La segunda ya responde en menos de un segundo.
 *
 * Por eso se reintenta ante fallas de red y errores del servidor, incluidas las
 * **mutaciones**: sin esto, la primera persona que entra al día se encontraba con
 * un login que fallaba sin explicación.
 *
 * No se reintenta ante errores del cliente (401, 403, 409…): esos no mejoran
 * repitiendo y sólo harían esperar de gusto.
 */
function shouldRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= 2) return false;
  const status = (error as { data?: { httpStatus?: number } })?.data?.httpStatus;
  if (status === undefined) return true; // falla de red o tiempo agotado
  return status >= 500;
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: shouldRetry,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 4000),
    },
    mutations: {
      retry: shouldRetry,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 4000),
    },
  },
});
const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      fetch(input, init) {
        return globalThis.fetch(input, {
          ...(init ?? {}),
          credentials: "include",
        });
      },
    }),
  ],
});

export function TRPCProvider({ children }: { children: ReactNode }) {
  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </trpc.Provider>
  );
}
