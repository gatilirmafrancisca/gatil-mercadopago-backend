import { Router } from "express";
import * as rifaController from "../controllers/rifa.controller.js";
import { requirePaymentToken, requireResendToken } from "../middlewares/token.middleware.js";
import { criarLimiteCriarPix, criarLimiteStatusPix, criarLimiteReenvio } from "../middlewares/rateLimitPix.js";

const router = Router();

router.get("/criar-pagamento", rifaController.getPreferencia);
router.post("/criar-pix", criarLimiteCriarPix(), rifaController.criarPix);
router.get("/status-pix/:paymentId", criarLimiteStatusPix(), rifaController.statusPix);
router.post("/confirmar-numero", requirePaymentToken, rifaController.confirmarNumero);
router.get("/numeros-ocupados", rifaController.getAllRifas);
router.post("/reenviar-email", criarLimiteReenvio(), requireResendToken, rifaController.reenviarEmail);
router.get("/tarefas-diarias", rifaController.tarefasDiarias);

export default router;
