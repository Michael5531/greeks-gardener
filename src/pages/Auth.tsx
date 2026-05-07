import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { TrendingUp } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

export default function AuthPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
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
    toast.success("注册成功，请检查邮箱验证后登录。");
  }
  async function google() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/app` },
    });
    if (error) toast.error(error.message);
  }

  return (
    <div className="min-h-screen grid place-items-center px-4 relative overflow-hidden">
      <div className="absolute inset-0 grid-bg opacity-30 pointer-events-none" />
      <div className="relative z-10 w-full max-w-sm rounded-xl border border-border bg-card/70 backdrop-blur p-6 elevated">
        <div className="flex items-center gap-2 mb-6">
          <div className="h-9 w-9 rounded-md grid place-items-center" style={{ background: "var(--gradient-primary)" }}>
            <TrendingUp className="h-5 w-5 text-background" />
          </div>
          <div className="font-semibold tracking-tight">OPTIX</div>
        </div>
        <Tabs defaultValue="signin">
          <TabsList className="grid grid-cols-2 mb-4 w-full">
            <TabsTrigger value="signin">登录</TabsTrigger>
            <TabsTrigger value="signup">注册</TabsTrigger>
          </TabsList>
          <TabsContent value="signin" className="space-y-3">
            <FormFields email={email} setEmail={setEmail} password={password} setPassword={setPassword} />
            <Button className="w-full" disabled={loading} onClick={signIn}>登录</Button>
          </TabsContent>
          <TabsContent value="signup" className="space-y-3">
            <FormFields email={email} setEmail={setEmail} password={password} setPassword={setPassword} />
            <Button className="w-full" disabled={loading} onClick={signUp}>创建账号</Button>
          </TabsContent>
        </Tabs>
        <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground">
          <div className="h-px flex-1 bg-border" /> 或 <div className="h-px flex-1 bg-border" />
        </div>
        <Button variant="outline" className="w-full" onClick={google}>使用 Google 登录</Button>
      </div>
    </div>
  );
}

function FormFields({ email, setEmail, password, setPassword }: any) {
  return (
    <>
      <div className="space-y-1">
        <Label htmlFor="email">邮箱</Label>
        <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" />
      </div>
      <div className="space-y-1">
        <Label htmlFor="password">密码</Label>
        <Input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="至少 6 位" />
      </div>
    </>
  );
}