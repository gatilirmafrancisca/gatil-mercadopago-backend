import { Router } from "express";
import * as rifaController from "../controllers/rifa.controller.js";
import { requirePaymentToken, requireResendToken } from "../middlewares/token.middleware.js";
import {
    criarLimiteConsultaReserva,
    criarLimiteCriarPix,
    criarLimiteLiberar,
    criarLimiteReenvio,
    criarLimiteReserva,
    criarLimiteStatusPix,
} from "../middlewares/rateLimitPix.js";
import { exigirTurnstile } from "../middlewares/turnstile.js";

const router = Router();

// Compra com reserva: escolhe os números, reserva e paga o total.
router.post("/reservar", criarLimiteReserva(), exigirTurnstile, rifaController.reservar);
router.get("/reserva/:reservaId", criarLimiteConsultaReserva(), rifaController.buscarReserva);
router.post("/liberar-reserva", criarLimiteLiberar(), rifaController.liberarReserva);
router.post("/criar-pagamento", criarLimiteCriarPix(), rifaController.criarPagamentoCartao);
router.get("/compra", criarLimiteConsultaReserva(), rifaController.consultarCompra);

// Pix: com reservaId é da compra com reserva; sem, é o fluxo antigo.
router.get("/criar-pagamento", rifaController.getPreferencia);
router.post("/criar-pix", criarLimiteCriarPix(), rifaController.criarPix);
router.get("/status-pix/:paymentId", criarLimiteStatusPix(), rifaController.statusPix);
router.post("/confirmar-numero", requirePaymentToken, rifaController.confirmarNumero);
router.get("/numeros-ocupados", rifaController.getAllRifas);
router.post("/reenviar-email", criarLimiteReenvio(), requireResendToken, rifaController.reenviarEmail);
router.get("/tarefas-diarias", rifaController.tarefasDiarias);

export default router;
