import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import * as doacaoController from "../controllers/doacao.controller.js";

const router = Router();

// Cada Pix gerado é um pagamento criado no Mercado Pago.
const limiteCriarPix = rateLimit({
    windowMs: 15 * 60_000,
    max: 10,
    message: { message: "Muitos Pix gerados seguidos. Aguarde alguns minutos e tente de novo." },
});

// O front consulta a cada 4s enquanto o Pix está na tela (~15 por minuto).
const limiteStatusPix = rateLimit({
    windowMs: 60_000,
    max: 60,
    message: { message: "Muitas consultas seguidas. Aguarde um minuto." },
});

router.post("/criar-pagamento", doacaoController.criarPagamento);
router.get("/arrecadado-mes", doacaoController.arrecadadoMes);
router.post("/criar-pix", limiteCriarPix, doacaoController.criarPix);
router.get("/status/:paymentId", limiteStatusPix, doacaoController.statusPix);

export default router;
