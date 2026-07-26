import { purchaseCollectionController } from "@/controllers/purchase-controller";
import { withRequestScope } from "@/lib/api-request-scope";

export default withRequestScope(purchaseCollectionController);
