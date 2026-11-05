import { BottomSheetModal } from '@gorhom/bottom-sheet';
import { zodResolver } from '@hookform/resolvers/zod';
import { act, screen, waitFor } from '@testing-library/react-native';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { renderWithProviders } from '@test-utils/renderWithProviders';

import { Button } from '../Button';

import { FormMapPicker } from './FormMapPicker';

const locationSchema = z.object({ latitude: z.number(), longitude: z.number() });
const schema = z.object({
  field: locationSchema.nullable().refine((value) => value !== null, 'username.required'),
});
type FormValues = { field: z.infer<typeof locationSchema> | null };

function Harness({
  onValid,
  initial = null,
}: Readonly<{ onValid: (values: FormValues) => void; initial?: FormValues['field'] }>) {
  const { control, handleSubmit } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { field: initial },
  });

  return (
    <>
      <FormMapPicker<FormValues, 'field'> name="field" control={control} label="Pickup" />
      <Button
        title="Submit"
        onPress={() => {
          void handleSubmit((values) => {
            onValid(values);
          })();
        }}
      />
    </>
  );
}

type ModalInstance = { props: { onDismiss?: () => void } };
type MapProps = { onRegionChangeComplete: (region: object) => void };

describe('FormMapPicker', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('shows the prefilled location and submits it', async () => {
    const onValid = jest.fn();
    const initial = { latitude: 24.7136, longitude: 46.6753 };
    const { user } = await renderWithProviders(<Harness initial={initial} onValid={onValid} />);
    expect(screen.getByRole('button', { name: 'Pickup' })).toHaveAccessibilityValue({
      text: '24.71360, 46.67530',
    });
    await user.press(screen.getByRole('button', { name: 'Submit' }));
    await waitFor(() => {
      expect(onValid).toHaveBeenCalledWith({ field: initial });
    });
  });

  it('shows the translated error when nothing is chosen', async () => {
    const onValid = jest.fn();
    const { user } = await renderWithProviders(<Harness onValid={onValid} />);
    await user.press(screen.getByRole('button', { name: 'Submit' }));
    expect(await screen.findByText('Enter your username.')).toBeOnTheScreen();
    expect(onValid).not.toHaveBeenCalled();
  });

  it('writes the confirmed place into the form value', async () => {
    jest.spyOn(BottomSheetModal.prototype, 'dismiss').mockImplementation(function dismiss(
      this: ModalInstance,
    ) {
      this.props.onDismiss?.();
    });
    const onValid = jest.fn();
    const { user } = await renderWithProviders(<Harness onValid={onValid} />);
    await user.press(screen.getByRole('button', { name: 'Pickup' }));
    await act(() => {
      (screen.getByLabelText('Map').props as MapProps).onRegionChangeComplete({
        latitude: 21.5433,
        longitude: 39.1728,
      });
    });
    await user.press(screen.getByRole('button', { name: 'Confirm' }));
    await user.press(screen.getByRole('button', { name: 'Submit' }));
    await waitFor(() => {
      expect(onValid).toHaveBeenCalledWith({ field: { latitude: 21.5433, longitude: 39.1728 } });
    });
  });
});
