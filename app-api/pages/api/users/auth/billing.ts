import { billingController } from "@/controllers/billing-controller";
import { withRequestScope } from "@/lib/api-request-scope";

export default withRequestScope(billingController);
