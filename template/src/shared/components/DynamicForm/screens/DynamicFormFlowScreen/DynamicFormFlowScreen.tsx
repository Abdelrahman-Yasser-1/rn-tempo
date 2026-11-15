import { useTranslation } from 'react-i18next';

import { ErrorState, Header, Screen } from '@shared/components';
import { FormFlow } from '@shared/components/DynamicForm/components/FormFlow';
import type { DynamicFormFlowParams } from '@shared/components/DynamicForm/types';

import { styles } from './styles';
import { useDynamicFormFlowScreen } from './useDynamicFormFlowScreen';

type DynamicFormFlowScreenProps = Readonly<{
  route: { params: DynamicFormFlowParams };
}>;

/** Opens a flow by id: `navigate('DynamicFormFlow', { flowId })`. See `bootstrap/formFlows.ts`. */
export function DynamicFormFlowScreen({ route }: DynamicFormFlowScreenProps) {
  const { t } = useTranslation();
  const vm = useDynamicFormFlowScreen(route);

  return (
    <Screen
      preset="scroll"
      keyboardAware
      contentContainerStyle={styles.content}
      testID="dynamic-form-flow-screen"
    >
      <Header
        title={t('formBuilder.flow.header')}
        onBack={vm.onBack}
        testID="dynamic-form-flow.header"
      />
      {vm.flow ? (
        <FormFlow flow={vm.flow} onSubmit={vm.onSubmit} />
      ) : (
        <ErrorState
          title={t('formBuilder.flow.header')}
          message={t('formBuilder.flow.unknown')}
          testID="dynamic-form-flow.unknown"
        />
      )}
    </Screen>
  );
}
