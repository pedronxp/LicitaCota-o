'use client';
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Loader2, Save, Lock, Bell, User } from 'lucide-react';
import { useMe, useUpdateMe, useAlterarSenha } from '@/lib/queries';
import { useAuthStore } from '@/lib/auth';
import { initials } from '@/lib/utils';

const perfilSchema = z.object({
  nome: z.string().min(2, 'Nome muito curto'),
  cargo: z.string().optional(),
  setor: z.string().optional(),
  municipio: z.string().optional(),
  uf: z.string().max(2).optional(),
  prefNotifEmail: z.boolean(),
  prefNotifInApp: z.boolean(),
});
type PerfilForm = z.infer<typeof perfilSchema>;

const senhaSchema = z.object({
  senhaAtual: z.string().min(1, 'Obrigatório'),
  novaSenha: z.string().min(8, 'Mínimo 8 caracteres'),
  confirmar: z.string(),
}).refine((d) => d.novaSenha === d.confirmar, { message: 'Senhas não coincidem', path: ['confirmar'] });
type SenhaForm = z.infer<typeof senhaSchema>;

function Section({ icon: Icon, title, children }: { icon: React.ElementType; title: string; children: React.ReactNode }) {
  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-5 pb-4 border-b border-zinc-100 dark:border-zinc-800">
        <div className="w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center">
          <Icon className="w-4 h-4 text-blue-500" />
        </div>
        <h3 className="font-semibold text-sm text-zinc-900 dark:text-white">{title}</h3>
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

export default function PerfilPage() {
  const { data: me, isLoading } = useMe();
  const updateMe = useUpdateMe();
  const alterarSenha = useAlterarSenha();
  const { setUsuario, usuario } = useAuthStore();
  const [senhaOk, setSenhaOk] = useState(false);

  const { register, handleSubmit, reset, formState: { errors, isDirty, isSubmitting } } = useForm<PerfilForm>({
    resolver: zodResolver(perfilSchema),
    defaultValues: { prefNotifEmail: true, prefNotifInApp: true },
  });

  const { register: rSenha, handleSubmit: hSenha, reset: resetSenha, formState: { errors: eSenha, isSubmitting: isSenha } } = useForm<SenhaForm>({
    resolver: zodResolver(senhaSchema),
  });

  useEffect(() => {
    if (!me) return;
    reset({
      nome: me.nome,
      cargo: me.cargo ?? '',
      setor: me.setor ?? '',
      municipio: me.municipio ?? '',
      uf: me.uf ?? '',
      prefNotifEmail: me.prefNotifEmail,
      prefNotifInApp: me.prefNotifInApp,
    });
  }, [me, reset]);

  async function onPerfil(values: PerfilForm) {
    try {
      const updated = await updateMe.mutateAsync(values);
      if (usuario) setUsuario({ ...usuario, nome: updated.nome });
      toast.success('Perfil atualizado');
      reset(values);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao salvar');
    }
  }

  async function onSenha(values: SenhaForm) {
    try {
      await alterarSenha.mutateAsync({ senhaAtual: values.senhaAtual, novaSenha: values.novaSenha });
      toast.success('Senha alterada com sucesso');
      resetSenha();
      setSenhaOk(true);
      setTimeout(() => setSenhaOk(false), 3000);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Senha atual incorreta');
    }
  }

  if (isLoading) {
    return (
      <div className="max-w-xl mx-auto space-y-4">
        {[0, 1, 2].map((i) => <div key={i} className="card animate-pulse h-40" />)}
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto space-y-6">
      {/* Avatar hero */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-5">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-400 to-blue-500 flex items-center justify-center text-white text-xl font-bold shadow-lg shadow-blue-500/20">
          {initials(me?.nome ?? 'U')}
        </div>
        <div>
          <h2 className="text-xl font-semibold text-zinc-900 dark:text-white">{me?.nome}</h2>
          <p className="text-sm text-zinc-400">{me?.email}</p>
          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 mt-1 inline-block">
            {me?.role}
          </span>
        </div>
      </motion.div>

      {/* Dados pessoais */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
        <form onSubmit={handleSubmit(onPerfil)}>
          <Section icon={User} title="Dados pessoais">
            <div>
              <label className="label">Nome *</label>
              <input {...register('nome')} className="input" />
              {errors.nome && <p className="mt-1 text-xs text-red-500">{errors.nome.message}</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Cargo</label>
                <input {...register('cargo')} className="input" placeholder="Ex: Pregoeiro" />
              </div>
              <div>
                <label className="label">Setor</label>
                <input {...register('setor')} className="input" placeholder="Ex: Compras" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className="label">Município</label>
                <input {...register('municipio')} className="input" />
              </div>
              <div>
                <label className="label">UF</label>
                <input {...register('uf')} className="input" maxLength={2} />
              </div>
            </div>

            <div className="pt-1 border-t border-zinc-100 dark:border-zinc-800">
              <div className="flex items-center gap-2 mb-1">
                <Bell className="w-3.5 h-3.5 text-zinc-400" />
                <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Notificações</span>
              </div>
              <div className="flex flex-col gap-2 mt-2">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" {...register('prefNotifEmail')} className="w-4 h-4 rounded accent-blue-500" />
                  <span className="text-sm text-zinc-700 dark:text-zinc-300">Receber por e-mail</span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" {...register('prefNotifInApp')} className="w-4 h-4 rounded accent-blue-500" />
                  <span className="text-sm text-zinc-700 dark:text-zinc-300">Notificações no app</span>
                </label>
              </div>
            </div>

            <div className="flex justify-end pt-1">
              <button type="submit" disabled={!isDirty || isSubmitting} className="btn-primary gap-2">
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Salvar
              </button>
            </div>
          </Section>
        </form>
      </motion.div>

      {/* Alterar senha */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <form onSubmit={hSenha(onSenha)}>
          <Section icon={Lock} title="Alterar senha">
            <div>
              <label className="label">Senha atual *</label>
              <input {...rSenha('senhaAtual')} type="password" className="input" autoComplete="current-password" />
              {eSenha.senhaAtual && <p className="mt-1 text-xs text-red-500">{eSenha.senhaAtual.message}</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Nova senha *</label>
                <input {...rSenha('novaSenha')} type="password" className="input" autoComplete="new-password" />
                {eSenha.novaSenha && <p className="mt-1 text-xs text-red-500">{eSenha.novaSenha.message}</p>}
              </div>
              <div>
                <label className="label">Confirmar *</label>
                <input {...rSenha('confirmar')} type="password" className="input" autoComplete="new-password" />
                {eSenha.confirmar && <p className="mt-1 text-xs text-red-500">{eSenha.confirmar.message}</p>}
              </div>
            </div>
            <div className="flex justify-end">
              <button type="submit" disabled={isSenha} className={`btn-primary gap-2 ${senhaOk ? 'bg-emerald-500 hover:bg-emerald-600' : ''}`}>
                {isSenha ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                {senhaOk ? 'Senha alterada!' : 'Alterar senha'}
              </button>
            </div>
          </Section>
        </form>
      </motion.div>
    </div>
  );
}
