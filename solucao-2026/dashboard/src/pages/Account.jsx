import { auth } from '../lib/auth';
import ChangePasswordForm from '../components/ChangePasswordForm';

/**
 * Minha conta. Existe porque o superadmin não vê Configurações (o menu dele
 * só tem Administração) e, sem esta tela, trocar a senha da conta da
 * plataforma exigia SQL no banco — foi assim que ela ficou inacessível uma vez.
 */
export default function Account() {
  const user = auth.getUser();

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">🔑 Minha conta</h1>
        <p className="text-sm text-slate-500 mt-1">
          Acesso desta conta ao sistema.
        </p>
      </header>

      <section className="bg-white rounded-xl shadow-sm border border-slate-200 divide-y divide-slate-100">
        <div className="p-6 grid grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-xs text-slate-500 uppercase">Nome</p>
            <p className="font-medium text-slate-800">{user?.name || '—'}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500 uppercase">E-mail</p>
            <p className="font-medium text-slate-800 break-all">{user?.email || '—'}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500 uppercase">Papel</p>
            <p className="font-medium text-slate-800 capitalize">{user?.role || '—'}</p>
          </div>
        </div>

        <div className="p-6">
          <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-4">
            Alterar senha
          </h2>
          <ChangePasswordForm />
        </div>
      </section>
    </div>
  );
}
