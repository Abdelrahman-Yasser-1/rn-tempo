import { useTranslation } from 'react-i18next';

import { isCrashReportingConfigured } from '@services/crash-reporting/crashReporting';
import { Icon, ListItem } from '@shared/components';

import { useCrashReportsRow } from './useCrashReportsRow';

/**
 * Settings row where the user opts out of crash reports. Hidden when this environment does not
 * report crashes (`CRASH_REPORTING_ENABLED`, a provider other than `none`).
 */
export function CrashReportsRow() {
  const { t } = useTranslation('settings');
  const vm = useCrashReportsRow();

  if (!isCrashReportingConfigured()) {
    return null;
  }

  return (
    <ListItem
      title={t(($) => $.crashReports.title)}
      subtitle={t(($) => $.crashReports.description)}
      left={<Icon name="alert-circle" />}
      trailing={{ type: 'switch', value: vm.isShared, onValueChange: vm.onToggle }}
      accessibilityLabel={t(($) => $.crashReports.title)}
      showDivider
      testID="settings.crash-reports"
    />
  );
}
