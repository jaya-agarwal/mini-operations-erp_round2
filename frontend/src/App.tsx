import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./lib/auth";
import LoginPage from "./pages/LoginPage";
import InventoryPage from "./pages/InventoryPage";
import WorkOrdersPage from "./pages/WorkOrdersPage";
import TransfersPage from "./pages/TransfersPage";
import OrdersPage from "./pages/OrdersPage";

function Protected({ children }: { children: JSX.Element }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function Shell({ children }: { children: JSX.Element }) {
  const { user, logout } = useAuth();
  const nav = [
    { to: "/inventory", label: "Inventory" },
    { to: "/work-orders", label: "Work Orders" },
    { to: "/transfers", label: "Transfers" },
    { to: "/orders", label: "Customer Orders" },
  ];

  return (
    <div className="min-h-screen flex">
      <aside className="w-56 bg-white border-r border-gray-200 flex flex-col">
        <div className="px-4 py-4 border-b border-gray-200">
          <div className="font-semibold text-brand-700">Mini Ops ERP</div>
          <div className="text-xs text-gray-500 mt-1">
            {user?.name} · <span className="badge bg-brand-50 text-brand-700">{user?.role}</span>
          </div>
        </div>
        <nav className="flex-1 p-2 space-y-1">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `block rounded-md px-3 py-2 text-sm font-medium ${
                  isActive ? "bg-brand-50 text-brand-700" : "text-gray-600 hover:bg-gray-50"
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="p-2 border-t border-gray-200">
          <button className="btn-secondary w-full" onClick={logout}>
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
      <Route path="*" element={<Navigate to="/inventory" replace />} />
    </Routes>
  );
}
