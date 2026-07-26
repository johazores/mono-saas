import { featureController } from "@/controllers/feature-controller";
import { withRequestScope } from "@/lib/api-request-scope";

export default withRequestScope(featureController);
