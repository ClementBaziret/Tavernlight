import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Logo } from "@/components/Layout";
import { Alert, Button, Card, TextField } from "@/components/ui";
import { errorMessage } from "@/lib/api";
import { useAuthActions } from "@/lib/auth";

function AuthCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-6 py-8">
      <Logo className="h-16 w-16" />
      <Card className="w-full">
        <h1 className="mb-4 font-display text-2xl font-semibold">{title}</h1>
        {children}
      </Card>
    </div>
  );
}

export function LoginPage() {
  const { t } = useTranslation();
  const { login } = useAuthActions();
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { redirect?: string };
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await login({ email, password });
      void navigate({ to: search.redirect ?? "/" });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthCard title={t("auth.loginTitle", "Log in to Tavernlight")}>
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        {error && <Alert tone="danger">{error}</Alert>}
        <TextField label={t("auth.email", "Email")} type="email" autoComplete="email" value={email} onChange={setEmail} isRequired autoFocus />
        <TextField label={t("auth.password", "Password")} type="password" autoComplete="current-password" value={password} onChange={setPassword} isRequired />
        <Button type="submit" variant="primary" loading={loading}>
          {t("auth.login", "Log in")}
        </Button>
        <p className="text-sm text-muted">
          {t("auth.noAccount", "No account yet?")}{" "}
          <Link to="/register" className="font-semibold text-accent underline underline-offset-2">
            {t("auth.createAccount", "Create an account")}
          </Link>
        </p>
        <Alert tone="info" title={t("auth.demoTitle", "Demo accounts")}>
          <p className="text-sm">{t("auth.demoText", "gm@tavernlight.test (game master) or alex@, sam@, robin@, charlie@tavernlight.test (players) — password: tavernlight")}</p>
        </Alert>
      </form>
    </AuthCard>
  );
}

export function RegisterPage() {
  const { t } = useTranslation();
  const { register } = useAuthActions();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await register({ email, displayName, password });
      void navigate({ to: "/" });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthCard title={t("auth.registerTitle", "Create your account")}>
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        {error && <Alert tone="danger">{error}</Alert>}
        <TextField label={t("auth.displayName", "Display name")} autoComplete="nickname" value={displayName} onChange={setDisplayName} isRequired autoFocus description={t("auth.displayNameHelp", "Shown to the other people at your table.")} />
        <TextField label={t("auth.email", "Email")} type="email" autoComplete="email" value={email} onChange={setEmail} isRequired />
        <TextField
          label={t("auth.password", "Password")}
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={setPassword}
          isRequired
          description={t("auth.passwordHelp", "At least 8 characters.")}
        />
        <Button type="submit" variant="primary" loading={loading}>
          {t("auth.register", "Create account")}
        </Button>
        <p className="text-sm text-muted">
          {t("auth.haveAccount", "Already registered?")}{" "}
          <Link to="/login" className="font-semibold text-accent underline underline-offset-2">
            {t("auth.login", "Log in")}
          </Link>
        </p>
      </form>
    </AuthCard>
  );
}
