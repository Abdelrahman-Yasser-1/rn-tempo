import type { ReactNode } from 'react';
import type { DeepPartial, FieldValues } from 'react-hook-form';
import { View } from 'react-native';

import { BoundField } from '@features/dynamic-forms/components/BoundField';
import { RepeatField } from '@features/dynamic-forms/components/RepeatField';
import { useFormBuilderContext } from '@features/dynamic-forms/hooks/useFormBuilderContext';
import type { FormField } from '@features/dynamic-forms/types';
import { getFieldKey } from '@features/dynamic-forms/utils/fieldTree';

import { styles } from './styles';

type FieldRendererProps<T extends FieldValues> = Readonly<{
  field: FormField<T>;
  values: T;
  /** False when a parent row or group is hidden: children render nothing but keep their behaviors. */
  isParentVisible?: boolean;
}>;

/**
 * Renders one entry of a `fields` array: a bound field through the registry, a `custom` render,
 * or a `row` / `group` layout that renders its children. A hidden layout still mounts its
 * children (as hidden) so `clearOnHidden` can run.
 */
// eslint-disable-next-line sonarjs/function-return-type -- renders nothing, one node or a list, depending on the layout
export function FieldRenderer<T extends FieldValues>({
  field,
  values,
  isParentVisible = true,
}: FieldRendererProps<T>): ReactNode {
  const { spacing } = useFormBuilderContext();
  const isVisible = isParentVisible && (field.visibleIf?.(values) ?? true);

  switch (field.type) {
    case 'custom':
      return isVisible ? field.render(values as DeepPartial<T>) : null;
    case 'row': {
      const cells = field.fields.map((child, index) => {
        const content = (
          <FieldRenderer
            key={getFieldKey(child, index)}
            field={child}
            values={values}
            isParentVisible={isVisible}
          />
        );
        return isVisible ? (
          <View key={getFieldKey(child, index)} style={styles.cell(field.flex?.[index] ?? 1)}>
            {content}
          </View>
        ) : (
          content
        );
      });
      return isVisible ? <View style={styles.row(field.spacing ?? spacing)}>{cells}</View> : cells;
    }
    case 'group': {
      const children = field.fields.map((child, index) => (
        <FieldRenderer
          key={getFieldKey(child, index)}
          field={child}
          values={values}
          isParentVisible={isVisible}
        />
      ));
      return isVisible ? (
        <View style={styles.stack(field.spacing ?? spacing)}>{children}</View>
      ) : (
        children
      );
    }
    case 'repeat':
      return <RepeatField field={field} isVisible={isVisible} />;
    default:
      return <BoundField field={field} values={values} isVisible={isVisible} />;
  }
}
