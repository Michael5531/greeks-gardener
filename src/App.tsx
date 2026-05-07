import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Index from "./pages/Index.tsx";
import NotFound from "./pages/NotFound.tsx";
import AuthPage from "./pages/Auth.tsx";
import AppLayout from "./components/AppLayout.tsx";
import ProtectedRoute from "./components/ProtectedRoute.tsx";
import { AuthProvider } from "./hooks/useAuth.tsx";
import Dashboard from "./pages/app/Dashboard.tsx";
import Chain from "./pages/app/Chain.tsx";
import Greeks3D from "./pages/app/Greeks3D.tsx";
import GEX from "./pages/app/GEX.tsx";
import Backtest from "./pages/app/Backtest.tsx";
import Signals from "./pages/app/Signals.tsx";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/auth" element={<AuthPage />} />
            <Route path="/app" element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
              <Route index element={<Dashboard />} />
              <Route path="chain" element={<Chain />} />
              <Route path="greeks" element={<Greeks3D />} />
              <Route path="gex" element={<GEX />} />
              <Route path="backtest" element={<Backtest />} />
              <Route path="signals" element={<Signals />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
