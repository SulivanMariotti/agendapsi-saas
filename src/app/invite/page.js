import InviteAcceptClient from "@/components/Auth/InviteAcceptClient";

export const dynamic = "force-dynamic";

export default async function InvitePage() {
  return (
    <div className="min-h-[100dvh] bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
        <div className="mb-5">
          <div className="text-sm text-slate-500">AgendaPsi</div>
          <h1 className="text-xl font-semibold text-slate-900">Convite de acesso</h1>
          <p className="text-sm text-slate-600 mt-1">
            Use este link para criar sua conta (ou entrar) e ativar o acesso ao tenant.
          </p>
        </div>

        <InviteAcceptClient />

        <div className="mt-6 text-xs text-slate-500">
          Dica: este convite é pessoal e expira. Se o e-mail não bater, solicite um novo convite.
        </div>
      </div>
    </div>
  );
}
