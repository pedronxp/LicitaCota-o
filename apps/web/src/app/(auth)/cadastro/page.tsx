'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Eye, EyeOff, Gavel, Loader2, UserCheck } from 'lucide-react';
import { apiFetch } from '@/lib/api';

const ESTADOS_BR = [
  'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS',
  'MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC',
  'SP','SE','TO',
];

const schema = z.object({
  nome: z.string().min(2, 'Nome deve ter ao menos 2 caracteres'),
  email: z.string().email('E-mail inválido'),
  senha: z.string().min(8, 'Mínimo 8 caracteres'),
  confirmar: z.string(),
  municipio: z.string().optional(),
  uf: z.string().optional(),
  cargo: z.string().optional(),
}).refine((d) => d.senha === d.confirmar, { message: 'As senhas não coincidem', path: ['confirmar'] });

type Form = z.infer<typeof schema>;

export default function CadastroPage() {
  const router = useRouter();
  const [showPass, setShowPass] = useState(false);
  const [done, setDone] = useState(false);

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Form>({
    resolver: zodResolver(schema),
  });

  async function onSubmit(values: Form) {
    try {
      const { confirmar: _c, ...dados } = values;
      await apiFetch('/api/auth/cadastro', {
        method: 'POST',
        body: JSON.stringify(dados),
        skipAuth: true,
      });
      setDone(true);
      toast.success('Conta criada! Redirecionando para o login…');
      setTimeout(() => router.replace('/login'), 2500);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao criar conta.');
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50 dark:from-zinc-950 dark:via-blue-950/20 dark:to-zinc-950 p-4">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-blue-400/20 blur-3xl" />
        <div className="absolute -bottom-32 -right-32 w-96 h-96 rounded-full bg-indigo-400/20 blur-3xl" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.34, 1.56, 0.64, 1] }}
        className="relative w-full max-w-lg"
      >
        <div className="glass-strong rounded-3xl p-8 space-y-7">
          {/* Header */}
          <div className="flex flex-col items-center gap-3">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/30">
              <Gavel className="w-8 h-8 text-white" strokeWidth={1.5} />
            </div>
            <div className="text-center">
              <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-white">Criar conta</h1>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">LicitaPreço — Pesquisa de preços</p>
            </div>
          </div>

          {done ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center gap-4 py-6"
            >
              <div className="w-14 h-14 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                <UserCheck className="w-7 h-7 text-emerald-500" />
              </div>
              <p className="text-center text-sm text-zinc-600 dark:text-zinc-400">
                Conta criada com sucesso! Redirecionando para o login…
              </p>
            </motion.div>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              {/* Nome */}
              <div>
                <label className="label">Nome completo <span className="text-red-400">*</span></label>
                <input {...register('nome')} type="text" autoFocus placeholder="Seu nome" className="input" />
                {errors.nome && <p className="mt-1 text-xs text-red-500">{errors.nome.message}</p>}
              </div>

              {/* E-mail */}
              <div>
                <label className="label">E-mail <span className="text-red-400">*</span></label>
                <input {...register('email')} type="email" autoComplete="email" placeholder="nome@municipio.gov.br" className="input" />
                {errors.email && <p className="mt-1 text-xs text-red-500">{errors.email.message}</p>}
              </div>

              {/* Cargo */}
              <div>
                <label className="label">Cargo / Função</label>
                <input {...register('cargo')} type="text" placeholder="Ex: Pregoeiro, Analista..." className="input" />
              </div>

              {/* Município + UF */}
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="label">Município</label>
                  <input {...register('municipio')} type="text" placeholder="Nome do município" className="input" />
                </div>
                <div>
                  <label className="label">UF</label>
                  <select {...register('uf')} className="input">
                    <option value="">—</option>
                    {ESTADOS_BR.map((uf) => (
                      <option key={uf} value={uf}>{uf}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Senha */}
              <div>
                <label className="label">Senha <span className="text-red-400">*</span></label>
                <div className="relative">
                  <input
                    {...register('senha')}
                    type={showPass ? 'text' : 'password'}
                    autoComplete="new-password"
                    placeholder="Mínimo 8 caracteres"
                    className="input pr-10"
                  />
                  <button type="button" onClick={() => setShowPass((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 transition-colors">
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {errors.senha && <p className="mt-1 text-xs text-red-500">{errors.senha.message}</p>}
              </div>

              {/* Confirmar senha */}
              <div>
                <label className="label">Confirmar senha <span className="text-red-400">*</span></label>
                <input {...register('confirmar')} type="password" autoComplete="new-password" placeholder="Repita a senha" className="input" />
                {errors.confirmar && <p className="mt-1 text-xs text-red-500">{errors.confirmar.message}</p>}
              </div>

              <motion.button
                type="submit"
                disabled={isSubmitting}
                whileTap={{ scale: 0.97 }}
                className="btn-primary w-full h-11 text-base mt-2"
              >
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Criar conta'}
              </motion.button>

              <p className="text-center text-sm text-zinc-500 dark:text-zinc-400">
                Já tem conta?{' '}
                <Link href="/login" className="text-blue-500 hover:text-blue-700 font-medium transition-colors">
                  Entrar
                </Link>
              </p>
            </form>
          )}
        </div>
      </motion.div>
    </main>
  );
}
