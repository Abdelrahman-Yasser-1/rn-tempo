import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { getErrorMessageKey } from '@services/http/errors';
import { toast } from '@services/toast/toast';

import { createItem } from './items.api';
import { itemKeys } from './keys';

export function useCreateItemMutation() {
  const queryClient = useQueryClient();
  const { t } = useTranslation('items');

  return useMutation({
    mutationFn: createItem,
    onSuccess: async () => {
      toast.show({ type: 'success', title: t('create.success') });
      await queryClient.invalidateQueries({ queryKey: itemKeys.lists() });
    },
    onError: (error) => {
      toast.show({ type: 'error', title: t(getErrorMessageKey(error), { ns: 'errors' }) });
    },
  });
}
