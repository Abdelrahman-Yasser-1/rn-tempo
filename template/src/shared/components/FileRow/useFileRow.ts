import { useTranslation } from 'react-i18next';

import { splitFileSize } from '@services/files/fileRules';
import { formatNumber } from '@shared/utils/format';

import type { FileRowProps } from './types';

/** The size of a file as translated text ("1.5 MB", with the locale's digits). */
export function useFileRow({ file }: Pick<FileRowProps, 'file'>) {
  const { t, i18n } = useTranslation();
  const { value, unit } = splitFileSize(file.size);
  const amount = formatNumber(value, i18n.language);

  const sizeText = {
    B: t(($) => $.filePicker.units.b, { size: amount }),
    KB: t(($) => $.filePicker.units.kb, { size: amount }),
    MB: t(($) => $.filePicker.units.mb, { size: amount }),
    GB: t(($) => $.filePicker.units.gb, { size: amount }),
  }[unit];

  return { sizeText, removeLabel: t(($) => $.filePicker.remove, { name: file.name }) };
}
