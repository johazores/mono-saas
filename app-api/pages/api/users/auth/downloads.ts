import { purchaseDownloadsController } from "@/controllers/purchase-file-controller";
import { withRequestScope } from "@/lib/api-request-scope";

export default withRequestScope(purchaseDownloadsController);
