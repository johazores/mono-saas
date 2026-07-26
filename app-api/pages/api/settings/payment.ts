import { publicPaymentConfigController } from "@/controllers/setting-controller";
import { withRequestScope } from "@/lib/api-request-scope";

export default withRequestScope(publicPaymentConfigController);
