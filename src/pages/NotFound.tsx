import { Button } from "@/components/ui/button";
import { Link } from "react-router";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm animate-fade-in-up space-y-4 text-center">
        <p className="brand-text text-6xl font-bold tracking-tight">404</p>
        <p className="text-muted-foreground">Página no encontrada</p>
        <Button asChild className="w-full">
          <Link to="/">Volver al inicio</Link>
        </Button>
      </div>
    </div>
  );
}
