import { initPinning } from '@services/security/pinning'; // @tempo-feature:ssl-pinning
import { initIntegrity } from '@services/security/integrity'; // @tempo-feature:device-integrity

export async function bootstrap() {
  // @tempo-feature:ssl-pinning:start
  await initPinning();
  // @tempo-feature:ssl-pinning:end
  // @tempo-feature:device-integrity:start
  await initIntegrity();
  // @tempo-feature:device-integrity:end
}
