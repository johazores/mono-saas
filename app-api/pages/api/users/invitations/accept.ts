import { acceptInvitationController } from "@/controllers/invitation-controller";
import { withRequestScope } from "@/lib/api-request-scope";

export default withRequestScope(acceptInvitationController);
