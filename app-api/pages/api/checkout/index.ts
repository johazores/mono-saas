import { checkoutController } from "@/controllers/checkout-controller";
import { withRequestScope } from "@/lib/api-request-scope";

export default withRequestScope(checkoutController);
