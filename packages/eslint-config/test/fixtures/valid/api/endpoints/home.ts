import { HOME_PAGE_SIZE } from '@features/home/api/schemas';
import { formatName } from '@shared/utils/formatName';

/** An endpoint file may read plain feature modules and shared code. */
export const homeLimit = HOME_PAGE_SIZE + formatName('x').length;
