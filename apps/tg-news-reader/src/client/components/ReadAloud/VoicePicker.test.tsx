import { screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../__tests__/renderWithProviders';
import { VoicePicker } from './VoicePicker';

describe('VoicePicker', () => {
  it('renders the label key and the currently-selected voice', () => {
    renderWithProviders(<VoicePicker voices={['nova', 'alloy', 'echo']} value="nova" onChange={vi.fn()} />);
    // Label key (mocked i18n returns keys verbatim)
    expect(screen.getByText('tts.voice_label')).toBeInTheDocument();
    // The currently-selected option label contains the voice name in <strong>
    const novaTags = screen.getAllByText('nova');
    expect(novaTags.length).toBeGreaterThan(0);
  });

  it('disables the underlying combobox when the disabled prop is true', () => {
    renderWithProviders(<VoicePicker voices={['nova']} value="nova" onChange={vi.fn()} disabled />);
    const combobox = screen.getByRole('combobox');
    expect(combobox).toBeDisabled();
  });

  it('does not call onChange on initial render', () => {
    const onChange = vi.fn();
    renderWithProviders(<VoicePicker voices={['nova', 'echo']} value="nova" onChange={onChange} />);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('reflects a different value when the parent updates it', () => {
    const { rerender } = renderWithProviders(<VoicePicker voices={['nova', 'echo']} value="nova" onChange={vi.fn()} />);
    expect(screen.getAllByText('nova').length).toBeGreaterThan(0);
    rerender(<VoicePicker voices={['nova', 'echo']} value="echo" onChange={vi.fn()} />);
    expect(screen.getAllByText('echo').length).toBeGreaterThan(0);
  });
});
