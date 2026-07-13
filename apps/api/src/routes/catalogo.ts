import { Router } from 'express';
import { z } from 'zod';
import { autenticar } from '../middleware/auth.js';
import { buscarSugestoesCatalogo } from '../services/catalogo/catalogo.service.js';

const router: Router = Router();

router.get('/itens/sugestoes', autenticar, async (req, res, next) => {
  try {
    const { termo, limite } = z
      .object({
        termo: z.string().trim().min(3).max(200),
        limite: z.coerce.number().int().min(1).max(20).default(10),
      })
      .parse(req.query);
    const sugestoes = await buscarSugestoesCatalogo(termo, limite);
    res.json({ termo, sugestoes });
  } catch (e) {
    next(e);
  }
});

export default router;
