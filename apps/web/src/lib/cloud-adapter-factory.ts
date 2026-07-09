import { BaiduPanAdapter } from "@langtube/core";
import { getSessionSecrets } from "./cloud-session-service";

export function getBaiduAdapterForProvider(providerId: string): BaiduPanAdapter {
  const adapter = new BaiduPanAdapter();
  const secrets = getSessionSecrets(providerId);
  if (secrets) {
    adapter.setSession(secrets);
  }
  return adapter;
}
