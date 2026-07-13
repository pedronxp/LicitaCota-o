'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { X, Loader2, Keyboard, FileSpreadsheet } from 'lucide-react';
import { toast } from 'sonner';
import { useConfig, useCreatePesquisa } from '@/lib/queries';
import { FieldHelp } from '@/components/common/FieldHelp';

const schema = z.object({
  titulo: z.string().min(3, 'Mínimo 3 caracteres'),
  descricao: z.string().optional(),
  municipio: z.string().optional(),
  uf: z.string().max(2).optional(),
  modoEntrada: z.enum(['MANUAL', 'PLANILHA']).default('MANUAL'),
  numeroProcesso: z.string().optional(),
  orgaoSetor: z.string().optional(),
  secretariaSolicitante: z.string().optional(),
  unidadeAdministrativa: z.string().optional(),
  exercicioFinanceiro: z.coerce.number().int().min(2000).max(2200).optional(),
  modalidade: z.string().optional(),
  dotacaoOrcamentaria: z.string().optional(),
  observacoesGerais: z.string().optional(),
});
type Form = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function NovaPesquisaModal({ open, onClose }: Props) {
  const router = useRouter();
  const create = useCreatePesquisa();
  const { data: config } = useConfig();

  const { register, handleSubmit, reset, watch, setValue, formState: { errors, isSubmitting } } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { modoEntrada: 'MANUAL' },
  });
  const modoEntrada = watch('modoEntrada');

  useEffect(() => {
    if (!open || !config) return;
    setValue('municipio', config.municipio ?? 'Cataguases');
    setValue('uf', config.uf ?? 'MG');
    setValue('exercicioFinanceiro', new Date().getFullYear());
  }, [open, config, setValue]);

  async function onSubmit(values: Form) {
    try {
      const p = await create.mutateAsync(values);
      toast.success('Pesquisa criada!');
      reset();
      onClose();
      router.push(`/pesquisas/${p.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao criar pesquisa');
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 16 }}
            transition={{ duration: 0.25, ease: [0.34, 1.56, 0.64, 1] }}
            className="fixed inset-0 flex items-center justify-center z-50 p-4 pointer-events-none"
          >
            <div className="glass-strong rounded-3xl w-full max-w-xl pointer-events-auto max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-zinc-100 dark:border-zinc-800">
                <h2 className="text-base font-semibold text-zinc-900 dark:text-white">Nova pesquisa de preços</h2>
                <button onClick={onClose} className="btn-ghost w-8 h-8 p-0"><X className="w-4 h-4" /></button>
              </div>

              <form onSubmit={handleSubmit(onSubmit)} className="px-6 py-5 space-y-4">
                <div>
                  <label className="label">Como deseja adicionar os itens?</label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setValue('modoEntrada', 'MANUAL')}
                      className={`rounded-2xl border p-4 text-left transition-colors ${modoEntrada === 'MANUAL' ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-zinc-200 dark:border-zinc-700'}`}
                    >
                      <Keyboard className="w-5 h-5 text-blue-500 mb-2" />
                      <p className="text-sm font-semibold">Cadastro manual</p>
                      <p className="text-xs text-zinc-500 mt-1">Digite o item e receba sugestões.</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => setValue('modoEntrada', 'PLANILHA')}
                      className={`rounded-2xl border p-4 text-left transition-colors ${modoEntrada === 'PLANILHA' ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-zinc-200 dark:border-zinc-700'}`}
                    >
                      <FileSpreadsheet className="w-5 h-5 text-emerald-500 mb-2" />
                      <p className="text-sm font-semibold">Importar planilha</p>
                      <p className="text-xs text-zinc-500 mt-1">Revise as linhas antes de aplicar.</p>
                    </button>
                  </div>
                </div>

                <div>
                  <label className="label">Título * <FieldHelp helpKey="tituloPesquisa" text="Identifique a pesquisa de forma objetiva. Exemplo: Aquisição de materiais de expediente – 2026." /></label>
                  <input {...register('titulo')} className="input" placeholder="Ex: Materiais de escritório 2025" autoFocus />
                  {errors.titulo && <p className="mt-1 text-xs text-red-500">{errors.titulo.message}</p>}
                </div>

                <div>
                  <label className="label">Descrição <FieldHelp text="Descreva o objeto e a finalidade da contratação. Esta informação será usada no relatório metodológico." /></label>
                  <textarea {...register('descricao')} rows={3} className="input resize-none" placeholder="Descrição ou observação da pesquisa…" />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">Município</label>
                    <input {...register('municipio')} className="input" placeholder="São Paulo" />
                  </div>
                  <div>
                    <label className="label">UF</label>
                    <input {...register('uf')} maxLength={2} className="input uppercase" placeholder="SP" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div><label className="label">Secretaria solicitante <FieldHelp text="Secretaria responsável pela demanda. O administrador pode manter a lista institucional nas configurações." /></label><input {...register('secretariaSolicitante')} className="input" list="secretarias-config" placeholder="Secretaria Municipal" /><datalist id="secretarias-config">{config?.secretarias?.map((valor) => <option key={valor} value={valor} />)}</datalist></div>
                  <div><label className="label">Unidade administrativa</label><input {...register('unidadeAdministrativa')} className="input" placeholder="Setor requisitante" /></div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div><label className="label">Exercício financeiro</label><input {...register('exercicioFinanceiro')} type="number" className="input" /></div>
                  <div><label className="label">Modalidade prevista</label><input {...register('modalidade')} className="input" placeholder="Ex.: Pregão eletrônico" /></div>
                </div>

                <div><label className="label">Dotação / informação orçamentária</label><input {...register('dotacaoOrcamentaria')} className="input" placeholder="Opcional nesta etapa" /></div>
                <div><label className="label">Observações gerais</label><textarea {...register('observacoesGerais')} rows={2} className="input resize-none" placeholder="Condições e orientações adicionais" /></div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">Número do processo</label>
                    <input {...register('numeroProcesso')} className="input" placeholder="Ex.: 012/2026" />
                  </div>
                  <div>
                    <label className="label">Órgão / setor</label>
                    <input {...register('orgaoSetor')} className="input" placeholder="Departamento de Compras" />
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancelar</button>
                  <button type="submit" disabled={isSubmitting} className="btn-primary flex-1">
                    {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Criar pesquisa'}
                  </button>
                </div>
              </form>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
