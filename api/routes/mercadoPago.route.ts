import { Router } from "express";
import * as mercadoPagoController from "../controllers/mercadoPago.controller.js";
import { rateLimit } from "express-rate-limit";

const router = Router();
const limiteVerificacao = rateLimit({
    windowMs: 60_000,
    max: 20,
    message: { message: "Muitas verificações seguidas. Aguarde um minuto e tente de novo." },
});

router.post("/webhook", mercadoPagoController.WebhookController);
router.get("/verificar-pagamento", limiteVerificacao, mercadoPagoController.VerificarPagamentoController);


export default router;