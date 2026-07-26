import { publicPageListController } from "@/controllers/public-content-controller";
import { withRequestScope } from "@/lib/api-request-scope";

export default withRequestScope(publicPageListController);
