import { mediaFileController } from "@/controllers/media-controller";
import { withRequestScope } from "@/lib/api-request-scope";

export default withRequestScope(mediaFileController);
