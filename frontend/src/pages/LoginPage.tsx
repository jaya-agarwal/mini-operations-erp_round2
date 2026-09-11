import { FormEvent, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Container, Boxes, Wrench, ArrowLeftRight, ShoppingCart, ArrowRight } from "lucide-react";
import { useAuth } from "../lib/auth";
import { apiErrorMessage } from "../lib/api";

const FLOW = [
  { icon: Boxes, label: "Inventory" },
  { icon: Wrench, label: "Work Order" },
  { icon: ArrowLeftRight, label: "Transfer" },
  { icon: ShoppingCart, label: "Reservation" },
];

const SEEDED = [
  { email: "admin@minierp.test", role: "Admin", note: "creates work orders, full access" },
  { email: "ops@minierp.test", role: "Operations", note: "manages inventory & transfers" },
  { email: "sales@minierp.test", role: "Sales", note: "creates orders, reserves stock" },
];

export default function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("admin@minierp.test");
  const [password, setPassword] = useState("password123");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (user) return <Navigate to="/dashboard" replace />;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
      navigate("/dashboard");
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex">
      <div className="hidden lg:flex lg:w-[46%] bg-steel-900 text-steel-200 flex-col justify-between px-12 py-12">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded bg-amber-500 flex items-center justify-center text-steel-950">
            <Container size={18} strokeWidth={2.25} />
          </div>
          <span className="font-display font-semibold text-white text-lg">Freighthold</span>
        </div>

        <div>
          <h1 className="font-display text-3xl font-semibold text-white leading-tight max-w-sm">
            One ledger, from the shelf to the customer.
          </h1>
          <p className="text-steel-400 text-sm mt-3 max-w-sm">
            Every reservation, transfer, and shortage is tracked against the same
            source of truth — no spreadsheets reconciled by hand.
          </p>

          <div className="mt-10 flex items-center gap-1">
            {FLOW.map((step, i) => (
              <div key={step.label} className="flex items-center gap-1">
                <div className="flex flex-col items-center gap-2 w-20">
                  <div className="h-10 w-10 rounded-md bg-steel-800 border border-steel-700 flex items-center justify-center text-amber-400">
                    <step.icon size={17} />
                  </div>
                  <span className="text-[11px] text-steel-400 text-center leading-tight">{step.label}</span>
                </div>
                {i < FLOW.length - 1 && <ArrowRight size={14} className="text-steel-600 mb-5" />}
              </div>
            ))}
          </div>
        </div>

        <p className="text-[11px] text-steel-500 font-mono">v1.0 · role-based access · transaction-safe stock</p>
      </div>

      <div className="flex-1 flex items-center justify-center bg-paper px-6">
        <div className="w-full max-w-sm">
          <div className="lg:hidden flex items-center gap-2 mb-8 justify-center">
            <div className="h-7 w-7 rounded bg-amber-500 flex items-center justify-center text-steel-950">
              <Container size={16} />
            </div>
            <span className="font-display font-semibold text-lg">Freighthold</span>
          </div>

          <h2 className="text-lg font-semibold">Sign in</h2>
          <p className="text-sm text-ink-muted mt-1 mb-6">Use a seeded account below, or your own credentials.</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-sm font-medium text-ink">Email</label>
              <input
                className="input mt-1"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="text-sm font-medium text-ink">Password</label>
              <input
                className="input mt-1"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            {error && <div className="text-sm text-danger-600 flag-row px-2.5 py-1.5">{error}</div>}
            <button className="btn-primary w-full" type="submit" disabled={loading}>
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <div className="mt-6 pt-5 border-t border-paper-border">
            <p className="text-xs font-medium text-ink-faint uppercase tracking-wider mb-2">Seeded accounts</p>
            <div className="space-y-1.5">
              {SEEDED.map((s) => (
                <button
                  key={s.email}
                  type="button"
                  onClick={() => {
                    setEmail(s.email);
                    setPassword("password123");
                  }}
                  className="w-full text-left px-2.5 py-1.5 rounded hover:bg-paper-border/50 transition-colors flex items-center justify-between group"
                >
                  <span>
                    <span className="text-xs font-medium text-ink">{s.role}</span>
                    <span className="text-xs text-ink-faint"> · {s.note}</span>
                  </span>
                  <span className="text-[11px] font-mono text-ink-faint group-hover:text-amber-600">{s.email}</span>
                </button>
              ))}
            </div>
            <p className="text-[11px] text-ink-faint mt-2">Password for all: <code className="font-mono">password123</code></p>
          </div>
        </div>
      </div>
    </div>
  );
}
