import { userProfileController } from "@/controllers/profile-controller";
import { withRequestScope } from "@/lib/api-request-scope";

export default withRequestScope(userProfileController);
