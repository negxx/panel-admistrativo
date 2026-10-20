import { useEffect } from "react";
import { useNavigate } from "react-router";
import {
  AlertTriangle,
  ArrowLeftRight,
  Inbox,
  LayoutDashboard,
  Lock,
  LogOut,
  Moon,
  Receipt,
  Settings,
  Shield,
  Sun,
  Tag,
  UserCircle,
  Users,
} from "lucide-react";
import { useTheme } from "next-themes";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { useAuth } from "@/hooks/useAuth";

type Command = {
  label: string;
  icon: typeof LayoutDashboard;
  path?: string;
  action?: "logout" | "theme";
  adminOnly?: boolean;
};

const GROUPS: { heading: string; commands: Command[] }[] = [
  {
    heading: "Gestión",
    commands: [
      { label: "Panel", icon: LayoutDashboard, path: "/" },
      { label: "Socios", icon: Users, path: "/socios" },
      { label: "Familias", icon: UserCircle, path: "/familias" },
      { label: "Cuotas y pagos", icon: Receipt, path: "/cuotas" },
      { label: "Pagos a confirmar", icon: Inbox, path: "/pagos-pendientes" },
      { label: "Deudores", icon: AlertTriangle, path: "/deudores" },
    ],
  },
  {
    heading: "Finanzas",
    commands: [
      { label: "Cierre de caja", icon: Lock, path: "/cierre-caja" },
      { label: "Ingresos y egresos", icon: ArrowLeftRight, path: "/ingresos-egresos" },
      { label: "Categorías", icon: Tag, path: "/categorias" },
    ],
  },
  {
    heading: "Sistema",
    commands: [
      { label: "Usuarios", icon: Shield, path: "/usuarios", adminOnly: true },
      { label: "Configuración", icon: Settings, path: "/configuracion" },
    ],
  },
  {
    heading: "Atajos",
    commands: [
      { label: "Cambiar tema", icon: Sun, action: "theme" },
      { label: "Cerrar sesión", icon: LogOut, action: "logout" },
    ],
  },
];

/**
 * Paleta de comandos (Ctrl+K): salta a cualquier pantalla sin tocar el menú.
 * El atajo de teclado se registra acá adentro para que el layout quede limpio.
 */
export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { resolvedTheme, setTheme } = useTheme();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, [open, onOpenChange]);

  if (!user) return null;

  const run = (command: Command) => {
    onOpenChange(false);
    if (command.path) {
      navigate(command.path);
    } else if (command.action === "logout") {
      logout();
    } else if (command.action === "theme") {
      setTheme(resolvedTheme === "dark" ? "light" : "dark");
    }
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title="Navegación rápida">
      <CommandInput placeholder="Buscar pantalla o acción…" />
      <CommandList>
        <CommandEmpty>Sin resultados.</CommandEmpty>
        {GROUPS.map(({ heading, commands }, i) => {
          const visible = commands.filter((c) => !c.adminOnly || user.role === "admin");
          if (visible.length === 0) return null;
          return (
            <div key={heading}>
              {i > 0 && <CommandSeparator />}
              <CommandGroup heading={heading}>
                {visible.map((command) => {
                  const Icon =
                    command.action === "theme"
                      ? resolvedTheme === "dark"
                        ? Sun
                        : Moon
                      : command.icon;
                  return (
                    <CommandItem key={command.label} onSelect={() => run(command)}>
                      <Icon className="text-muted-foreground" />
                      <span>{command.label}</span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </div>
          );
        })}
      </CommandList>
    </CommandDialog>
  );
}
