import { Router, type Request, type Response } from "express";
import { obterTagsAtivas } from "../services/utm.service.js";

/**
 * Tags de UTM ativas, para o site decidir quais parâmetros do link repassar
 * aos pagamentos (o que não estiver aqui vai como nulo, sem bloquear nada).
 * Pública e sem dados sensíveis; cacheável por alguns minutos.
 */
const router = Router();

router.get("/tags", async (_req: Request, res: Response) => {
    const tags = await obterTagsAtivas();
    res.set("Cache-Control", "public, max-age=120");
    res.json({
        message: "Tags de UTM ativas.",
        data: { source: tags.SOURCE, medium: tags.MEDIUM, campaign: tags.CAMPAIGN },
    });
});

export default router;
