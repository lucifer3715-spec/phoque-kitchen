import { handleApiRequest } from "../../server/router.js";

export async function onRequest(context) {
  return handleApiRequest(context);
}
