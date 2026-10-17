import { signIn } from "@/auth";

interface LoginPageProps {
  searchParams: {
    error?: string | string[];
    callbackUrl?: string | string[];
  };
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default function LoginPage({ searchParams }: LoginPageProps) {
  const hasError = Boolean(firstParam(searchParams.error));
  const callbackUrl = firstParam(searchParams.callbackUrl) ?? "/";
  const showTestLogin = process.env.E2E_TEST_AUTH === "true";

  return (
    <main className="login">
      <h1>Iniciar sesión</h1>
      {hasError && (
        <p role="alert" data-testid="auth-error">
          No se pudo iniciar sesión. Revisa tus datos e inténtalo de nuevo.
        </p>
      )}
      <div className="providers">
        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: callbackUrl });
          }}
        >
          <button type="submit">Entrar con Google</button>
        </form>
        <form
          action={async () => {
            "use server";
            await signIn("github", { redirectTo: callbackUrl });
          }}
        >
          <button type="submit">Entrar con GitHub</button>
        </form>
      </div>

      {showTestLogin && (
        <form
          className="test-login"
          action={async (formData: FormData) => {
            "use server";
            await signIn("test", formData);
          }}
        >
          <h2>Acceso de pruebas</h2>
          <label>
            Usuario
            <input name="username" autoComplete="username" required />
          </label>
          <label>
            Contraseña
            <input name="password" type="password" autoComplete="current-password" required />
          </label>
          <input type="hidden" name="redirectTo" value={callbackUrl} />
          <button type="submit">Entrar con usuario de prueba</button>
        </form>
      )}

      <style>{`
        .login { min-height: 100vh; display: grid; align-content: center; justify-items: center; gap: 1.25rem; padding: 2rem; font-family: system-ui, sans-serif; }
        h1, h2 { margin: 0; }
        [role="alert"] { color: #b91c1c; }
        .providers, .test-login { display: grid; gap: .75rem; width: min(100%, 22rem); }
        button { width: 100%; border: 0; border-radius: .5rem; background: #4338ca; color: white; cursor: pointer; padding: .8rem 1rem; font: inherit; }
        .test-login { border-top: 1px solid #ddd; padding-top: 1.25rem; }
        label { display: grid; gap: .35rem; }
        input:not([type="hidden"]) { border: 1px solid #aaa; border-radius: .35rem; padding: .65rem; font: inherit; }
      `}</style>
    </main>
  );
}
