import { publicBlockTemplateController } from "@/controllers/block-template-controller";
import { withRequestScope } from "@/lib/api-request-scope";

export default withRequestScope(publicBlockTemplateController);
