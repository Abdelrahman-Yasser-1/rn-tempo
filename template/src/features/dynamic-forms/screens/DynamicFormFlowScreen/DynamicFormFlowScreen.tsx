import { useTranslation } from 'react-i18next';

import { FormFlow } from '@features/dynamic-forms/components/FormFlow';
import type { RootStackParamList } from '@navigation/types';
import { ErrorState, Header, Screen } from '@shared/components';

import { styles } from './styles';
import { useDynamicFormFlowScreen } from './useDynamicFormFlowScreen';

type DynamicFormFlowScreenProps = Readonly<{
  route: { params: RootStackParamList['DynamicFormFlow'] };
}>;

/** Opens a flow by id: `navigate('DynamicFormFlow', { flowId })`. See `utils/flows.ts`. */
export function DynamicFormFlowScreen({ route }: DynamicFormFlowScreenProps) {
  const { t } = useTranslation('forms');
  const vm = useDynamicFormFlowScreen(route);

  return (
    <Screen
      preset="scroll"
      keyboardAware
      contentContainerStyle={styles.content}
      testID="dynamic-form-flow-screen"
    >
      <Header title={t('flow.header')} onBack={vm.onBack} testID="dynamic-form-flow.header" />
      {vm.flow ? (
        <FormFlow flow={vm.flow} onSubmit={vm.onSubmit} />
      ) : (
        <ErrorState
          title={t('flow.header')}
          message={t('flow.unknown')}
          testID="dynamic-form-flow.unknown"
        />
      )}
    </Screen>
  );
}
