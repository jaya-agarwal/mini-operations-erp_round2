import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import {
  LayoutDashboard,
  Boxes,
  Wrench,
  ArrowLeftRight,
  ShoppingCart,
  LogOut,
  Sun,
  Moon,
  Container,
} from "lucide-react";
import { useAuth } from "./lib/auth";
import { useTheme } from "./lib/theme";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import InventoryPage from "./pages/InventoryPage";
import WorkOrdersPage from "./pages/WorkOrdersPage";
import TransfersPage from "./pages/TransfersPage";
import OrdersPage from "./pages/OrdersPage";

function Protected({ children }: { children: JSX.Element }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

const ROLE_LABEL: Record<string, string> = {
  ADMIN: "Admin",
  OPERATIONS: "Operations",
  SALES: "Sales",
};

function Shell({ children }: { children: JSX.Element }) {
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const nav = [
    { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { to: "/inventory", label: "Inventory", icon: Boxes },
    { to: "/work-orders", label: "Work Orders", icon: Wrench },
    { to: "/transfers", label: "Transfers", icon: ArrowLeftRight },
    { to: "/orders", label: "Customer Orders", icon: ShoppingCart },
  ];
  const initials = user?.name
    ? user.name
        .split(" ")
        .map((p) => p[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : "?";

  return (
    <div className="min-h-screen flex">
      <aside className="w-60 shrink-0 bg-steel-900 text-steel-200 flex flex-col">
        <div className="px-4 py-4 flex items-center gap-2 border-b border-steel-700">
          <div className="h-7 w-7 rounded bg-amber-500 flex items-center justify-center text-steel-950">
            <Container size={16} strokeWidth={2.25} />
          </div>
          <div>
            <div className="font-display font-semibold text-white leading-none">Freighthold</div>
            <div className="text-[10px] text-steel-400 mt-0.5 tracking-wide">OPERATIONS CONSOLE</div>
          </div>
        </div>

        <nav className="flex-1 p-2 space-y-0.5 mt-1">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-2.5 rounded px-3 py-2 text-sm font-medium transition-colors relative ${
                  isActive
                    ? "bg-steel-800 text-white"
                    : "text-steel-400 hover:bg-steel-800/60 hover:text-steel-100"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 bg-amber-500 rounded-full" />}
                  <item.icon size={16} strokeWidth={2} />
                  {item.label}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="p-2 border-t border-steel-700 space-y-2">
          <div className="flex items-center gap-2 px-2 py-1.5">
            <div className="h-7 w-7 rounded-full bg-steel-700 text-steel-100 text-xs font-semibold flex items-center justify-center shrink-0">
              {initials}
            </div>
            <div className="min-w-0">
              <div className="text-xs font-medium text-steel-100 truncate">{user?.name}</div>
              <div className="text-[11px] text-steel-400">{user ? ROLE_LABEL[user.role] : ""}</div>
            </div>
            <button
              onClick={toggle}
              aria-label="Toggle color theme"
              className="ml-auto text-steel-400 hover:text-amber-400 transition-colors p-1"
            >
              {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
            </button>
          </div>
          <button
            className="w-full flex items-center justify-center gap-1.5 rounded px-3 py-2 text-sm font-medium text-steel-300 hover:bg-steel-800 hover:text-white transition-colors"
            onClick={logout}
          >
            <LogOut size={14} />
            Log out
          </button>
        </div>
      </aside>
      <main className="flex-1 p-6 overflow-auto">{children}</main>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/dashboard"
        element={
          <Protected>
            <Shell>
              <DashboardPage />
            </Shell>
          </Protected>
        }
      />
      <Route
        path="/inventory"
        element={
          <Protected>
            <Shell>
              <InventoryPage />
            </Shell>
          </Protected>
        }
      />
      <Route
        path="/work-orders"
        element={
          <Protected>
            <Shell>
              <WorkOrdersPage />
            </Shell>
          </Protected>
        }
      />
      <Route
        path="/transfers"
        element={
          <Protected>
            <Shell>
              <TransfersPage />
            </Shell>
          </Protected>
        }
      />
      <Route
        path="/orders"
        element={
          <Protected>
            <Shell>
              <OrdersPage />
            </Shell>
          </Protected>
        }
      />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
