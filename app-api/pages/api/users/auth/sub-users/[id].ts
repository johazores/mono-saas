import { subUserItemController } from "@/controllers/sub-user-controller";
import { withRequestScope } from "@/lib/api-request-scope";

export default withRequestScope(subUserItemController);
