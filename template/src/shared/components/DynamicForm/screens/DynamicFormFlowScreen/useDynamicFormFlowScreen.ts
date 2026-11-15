import { useNavigation } from '@react-navigation/native';
import type { ParamListBase } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';

import { toast } from '@services/toast/toast';
import { getFlow } from '@shared/components/DynamicForm/flows/flows';
import type { DynamicFormFlowParams } from '@shared/components/DynamicForm/types';

/**
 * Logic of the flow screen: finds the flow of the route, and on submit shows a toast (the values
 * are never logged or shown) and goes back.
 */
export function useDynamicFormFlowScreen(route: { params: DynamicFormFlowParams }) {
  const navigation = useNavigation<NativeStackNavigationProp<ParamListBase>>();
  const { t } = useTranslation();

  return {
    flow: getFlow(route.params.flowId),
    onBack: navigation.goBack,
    onSubmit: () => {
      toast.success(t('formBuilder.flow.submitted'));
      navigation.goBack();
    },
  };
}
