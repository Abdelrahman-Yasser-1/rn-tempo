/* eslint-disable project-structure/folder-structure -- Codegen specs must use a Native-prefixed filename. */
import { TurboModuleRegistry, type TurboModule } from 'react-native';

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- RN Codegen requires an interface extending TurboModule.
export interface Spec extends TurboModule {
  isSupported(): boolean;
  getIcon(): Promise<string | null>;
  setIcon(name: string | null): Promise<void>;
}

// eslint-disable-next-line import-x/no-default-export -- RN Codegen reads the registry call from the default export.
export default TurboModuleRegistry.get<Spec>('AppIconModule');
