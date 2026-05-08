import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useT } from "@/i18n";

export default function ProtectedRoute({ children }: { children: JSX.Element }) {
  const { user, loading } = useAuth();
  const t = useT();
  if (loading) return <div className="min-h-screen grid place-items-center text-muted-foreground font-mono text-sm">{t.protected.loading}</div>;
  if (!user) return <Navigate to="/auth" replace />;
  return children;
}