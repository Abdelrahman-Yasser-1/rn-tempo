import type { ReactNode } from 'react';
import type { DeepPartial, FieldValues } from 'react-hook-form';
import { View } from 'react-native';

import { BoundField } from '@shared/components/DynamicForm/components/BoundField';
import type { FormField } from '@shared/components/DynamicForm/components/FieldRegistry';
import { RepeatField } from '@shared/components/DynamicForm/components/RepeatField';
import { useFormBuilderContext } from '@shared/components/DynamicForm/hooks/useFormBuilderContext';
import { getFieldKey } from '@shared/components/DynamicForm/utils/fieldTree';

import { styles } from './styles';

type FormFieldRendererProps<T extends FieldValues> = Readonly<{
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
}: FormFieldRendererProps<T>): ReactNode {
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
