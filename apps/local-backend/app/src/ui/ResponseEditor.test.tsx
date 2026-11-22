import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';

import { fakeEditorLog } from '../test/fakeEditor';

import { ResponseEditor } from './ResponseEditor';

const schema = { type: 'object', required: ['name'], properties: { name: { type: 'string' }, price: { type: 'number' }, kind: { type: 'string', enum: ['a', 'b'] }, on: { type: 'boolean' } } };

function Harness({ initial, saved }: { initial: string; saved?: string }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <ResponseEditor label="Body" value={value} onChange={setValue} schema={schema} {...(saved === undefined ? {} : { saved })} />
      <output aria-label="current">{value}</output>
    </>
  );
}
const current = (): string => screen.getByLabelText('current').textContent;

beforeEach(() => {
  fakeEditorLog.schemas.length = 0;
  fakeEditorLog.diffs.length = 0;
});

describe('AC-LP-6 the Form and JSON tabs', () => {
  it('AC-LP-6 edits the same value in both tabs and keeps the edits when switching', async () => {
    render(<Harness initial={'{\n  "name": "Ada"\n}'} />);
    // JSON first.
    fireEvent.input(screen.getByLabelText('Body'), { target: { value: '{"name":"Bo","price":3}' } });
    await userEvent.click(screen.getByRole('tab', { name: 'Form' }));
    expect(screen.getByLabelText(/^name/)).toHaveValue('Bo');
    expect(screen.getByLabelText('price')).toHaveValue('3');
    // Then the form.
    await userEvent.clear(screen.getByLabelText(/^name/));
    await userEvent.type(screen.getByLabelText(/^name/), 'Cy');
    await userEvent.selectOptions(screen.getByLabelText('kind'), 'b');
    await userEvent.click(screen.getByLabelText('on'));
    expect(JSON.parse(current())).toEqual({ name: 'Cy', price: 3, kind: 'b', on: true });
    await userEvent.click(screen.getByRole('tab', { name: 'JSON' }));
    expect(JSON.parse(screen.getByLabelText<HTMLTextAreaElement>('Body').value)).toEqual({ name: 'Cy', price: 3, kind: 'b', on: true });
  });

  it('AC-LP-6 refuses to switch to the form while the JSON is invalid, and says what is wrong', async () => {
    render(<Harness initial={'{"name": '} />);
    await userEvent.click(screen.getByRole('tab', { name: 'Form' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/Fix the JSON before using the form/);
    expect(screen.getByRole('tab', { name: 'JSON' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByLabelText('Body')).toBeInTheDocument();
    // Fixing it lets the switch through.
    fireEvent.input(screen.getByLabelText('Body'), { target: { value: '{"name":"ok"}' } });
    await userEvent.click(screen.getByRole('tab', { name: 'Form' }));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByLabelText(/^name/)).toHaveValue('ok');
  });

  it('AC-LP-6 lets a number box hold a placeholder and refuses other text', async () => {
    render(<Harness initial={'{"name":"x"}'} />);
    await userEvent.click(screen.getByRole('tab', { name: 'Form' }));
    const price = screen.getByLabelText('price');
    // user-event writes `{{` for one brace.
    await userEvent.type(price, '{{{{random.int 1 9}}');
    expect(JSON.parse(current())).toEqual({ name: 'x', price: '{{random.int 1 9}}' });
    await userEvent.clear(price);
    await userEvent.type(price, 'abc');
    expect(screen.getByText(/Enter a number or a \{\{placeholder\}\}/)).toBeInTheDocument();
    // The last good value stays; nothing invalid is written.
    expect(JSON.parse(current())).toEqual({ name: 'x' });
  });

  it('AC-LP-6 formats the JSON with the Format button', async () => {
    render(<Harness initial={'{"name":"x","price":1}'} />);
    await userEvent.click(screen.getByRole('button', { name: 'Format' }));
    expect(current()).toBe('{\n  "name": "x",\n  "price": 1\n}');
  });

  it('AC-LP-6 gives the editor the schema, and opens a diff against the last saved text only when it changed', async () => {
    render(<Harness initial={'{"name":"x"}'} saved={'{"name":"x"}'} />);
    expect(fakeEditorLog.schemas.at(-1)).toEqual(schema);
    const diff = screen.getByRole('button', { name: 'Show changes' });
    expect(diff).toBeDisabled();
    fireEvent.input(screen.getByLabelText('Body'), { target: { value: '{"name":"y"}' } });
    expect(diff).toBeEnabled();
    await userEvent.click(diff);
    expect(fakeEditorLog.diffs.at(-1)).toBe('{"name":"x"}');
    await userEvent.click(screen.getByRole('button', { name: 'Back to editing' }));
    expect(fakeEditorLog.diffs.at(-1)).toBeNull();
  });

  it('AC-LP-6 shows a form from the value itself when there is no schema, and says so for a non-object', async () => {
    function Bare({ initial }: { initial: string }) {
      const [value, setValue] = useState(initial);
      return <ResponseEditor label="Free" value={value} onChange={setValue} />;
    }
    const { unmount } = render(<Bare initial={'{"id": 1, "title": "t"}'} />);
    await userEvent.click(screen.getByRole('tab', { name: 'Form' }));
    expect(screen.getByLabelText('id')).toHaveValue('1');
    expect(screen.getByLabelText('title')).toHaveValue('t');
    unmount();
    render(<Bare initial={'[1,2]'} />);
    await userEvent.click(screen.getByRole('tab', { name: 'Form' }));
    expect(screen.getByText(/The form is for a JSON object/)).toBeInTheDocument();
  });
});
