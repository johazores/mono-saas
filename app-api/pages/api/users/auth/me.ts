import { userMeController } from "@/controllers/user-auth-controller";
import { withRequestScope } from "@/lib/api-request-scope";

export default withRequestScope(userMeController);
