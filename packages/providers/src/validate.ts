const EVM_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

/**
 * Validates (does not checksum-verify) an EVM address before it is ever
 * interpolated into a provider URL. This is the boundary input-validation
 * point referenced throughout the product spec (§8, §33) — malformed
 * input never reaches a provider call.
 */
export function isValidEvmAddress(address: string): boolean {
  return EVM_ADDRESS_RE.test(address);
}

export function normalizeEvmAddress(address: string): string {
  return address.toLowerCase();
}
