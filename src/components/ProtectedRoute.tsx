import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

export default function ProtectedRoute({ children }: { children: JSX.Element }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen grid place-items-center text-muted-foreground font-mono text-sm">加载中…</div>;
  if (!user) return <Navigate to="/auth" replace />;
  return children;
}