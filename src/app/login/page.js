import ProfessionalLoginClient from "@/components/Auth/ProfessionalLoginClient";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }) {
  // Next.js may provide searchParams as a Promise in newer versions.
  const sp = await searchParams;

  const nextRaw = sp?.next;
  const nextCandidate = Array.isArray(nextRaw) ? nextRaw[0] : nextRaw;

  // Prevent open-redirects: only allow internal paths.
  const nextPath =
    typeof nextCandidate === "string" && nextCandidate.startsWith("/")
      ? nextCandidate
      : "/profissional";

  return (
    <div className="min-h-[100dvh] bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
        <div className="mb-5">
          <div className="text-sm text-slate-500">AgendaPsi</div>
          <h1 className="text-xl font-semibold text-slate-900">Entrar</h1>
          <p className="text-sm text-slate-600 mt-1">
            Acesso exclusivo para profissionais vinculados ao tenant.
          </p>
        </div>

        <ProfessionalLoginClient nextPath={nextPath} />

        <div className="mt-6 text-xs text-slate-500">
          Se você não tem acesso, fale com o administrador da clínica para ser vinculado.
        </div>
      </div>
    </div>
  );
}
