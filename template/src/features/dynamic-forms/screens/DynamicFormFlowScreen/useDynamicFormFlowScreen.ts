import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';

import { getFlow } from '@features/dynamic-forms/utils/flows';
import type { RootStackParamList } from '@navigation/types';
import { toast } from '@services/toast/toast';

/**
 * Logic of the flow screen: finds the flow of the route, and on submit shows a toast (the values
 * are never logged or shown) and goes back.
 */
export function useDynamicFormFlowScreen(route: { params: RootStackParamList['DynamicFormFlow'] }) {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList, 'DynamicFormFlow'>>();
  const { t } = useTranslation('forms');

  return {
    flow: getFlow(route.params.flowId),
    onBack: navigation.goBack,
    onSubmit: () => {
      toast.success(t('flow.submitted'));
      navigation.goBack();
    },
  };
}
