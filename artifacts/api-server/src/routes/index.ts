import { Router, type IRouter } from "express";
import healthRouter from "./health";
import productsRouter from "./products";
import recommendationsRouter from "./recommendations";
import cartRouter from "./cart";
import authRouter from './auth';
import { checkoutRouter } from './checkout';
import { ordersRouter } from './orders';
import { aiRouter } from './ai';
import { reviewsRouter } from './reviews';
import { couponsRouter } from './coupons';
import { gamingRouter } from './gaming';
import { paymentsRouter } from './payments';
import { preferenceEventsRouter } from './preference-events';

const router: IRouter = Router();

router.use(healthRouter);
router.use(reviewsRouter);
router.use(productsRouter);
router.use(recommendationsRouter);
router.use(cartRouter);
router.use(authRouter);
router.use(checkoutRouter);
router.use(ordersRouter);
router.use('/ai', aiRouter);
router.use(couponsRouter);
router.use(gamingRouter);
router.use('/payments', paymentsRouter);
router.use('/preferences', preferenceEventsRouter);

export default router;

