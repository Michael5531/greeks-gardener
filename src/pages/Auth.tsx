import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { TrendingUp } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useT } from "@/i18n";

export default function AuthPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const t = useT();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => { if (user) navigate("/app", { replace: true }); }, [user, navigate]);

  async function signIn() {
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) return toast.error(error.message);
    navigate("/app");
  }
  async function signUp() {
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email, password,
      options: { emailRedirectTo: `${window.location.origin}/app` },
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success(t.auth.signupOk);
  }
  async function google() {
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: `${window.location.origin}/app`,
    });
    if (result.error) return toast.error((result.error as Error).message);
    if (result.redirected) return;
    navigate("/app");
  }

  return (
    <div className="min-h-screen grid place-items-center px-4 relative overflow-hidden">
      <div className="absolute inset-0 grid-bg opacity-30 pointer-events-none" />
      <div className="relative z-10 w-full max-w-sm rounded-xl border border-border bg-card/70 backdrop-blur p-6 elevated">
        <div className="flex items-center gap-2 mb-6">
          <div className="h-9 w-9 rounded-md grid place-items-center" style={{ background: "var(--gradient-primary)" }}>
            <TrendingUp className="h-5 w-5 text-background" />
          </div>
          <div className="font-semibold tracking-tight">OPTI-X</div>
        </div>
        <Tabs defaultValue="signin">
          <TabsList className="grid grid-cols-2 mb-4 w-full">
            <TabsTrigger value="signin">{t.auth.signIn}</TabsTrigger>
            <TabsTrigger value="signup">{t.auth.signUp}</TabsTrigger>
          </TabsList>
          <TabsContent value="signin" className="space-y-3">
            <FormFields email={email} setEmail={setEmail} password={password} setPassword={setPassword} t={t} />
            <Button className="w-full" disabled={loading} onClick={signIn}>{t.auth.signIn}</Button>
          </TabsContent>
          <TabsContent value="signup" className="space-y-3">
            <FormFields email={email} setEmail={setEmail} password={password} setPassword={setPassword} t={t} />
            <Button className="w-full" disabled={loading} onClick={signUp}>{t.auth.create}</Button>
          </TabsContent>
        </Tabs>
        <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground">
          <div className="h-px flex-1 bg-border" /> {t.auth.or} <div className="h-px flex-1 bg-border" />
        </div>
        <Button variant="outline" className="w-full" onClick={google}>{t.auth.google}</Button>
      </div>
    </div>
  );
}

function FormFields({ email, setEmail, password, setPassword, t }: any) {
  return (
    <>
      <div className="space-y-1">
        <Label htmlFor="email">{t.auth.email}</Label>
        <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" />
      </div>
      <div className="space-y-1">
        <Label htmlFor="password">{t.auth.password}</Label>
        <Input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder={t.auth.pwHint} />
      </div>
    </>
  );
}