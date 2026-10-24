import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { VoiceVisualizerAvatar } from './VoiceVisualizerAvatar'

describe('VoiceVisualizerAvatar', () => {
  it('merender avatar Nozomi mode stage dengan benar', () => {
    render(
      <VoiceVisualizerAvatar
        mode="stage"
        persona="nozomi"
        isSpeaking={false}
        isListening={false}
        voiceEnabled={true}
      />
    )
    expect(screen.getByText('🌸 Tachibana Nozomi')).toBeInTheDocument()
    expect(screen.getByText('Siaga')).toBeInTheDocument()
  })

  it('merender avatar Rexizo butler mode stage dengan benar', () => {
    render(
      <VoiceVisualizerAvatar
        mode="stage"
        persona="rexizo"
        isSpeaking={false}
        isListening={false}
        voiceEnabled={true}
      />
    )
    expect(screen.getByText('🎩 R.E.X.I.Z.O.')).toBeInTheDocument()
  })

  it('menampilkan status Bicara saat asisten sedang berbicara', () => {
    render(
      <VoiceVisualizerAvatar
        mode="stage"
        persona="nozomi"
        isSpeaking={true}
        isListening={false}
        voiceEnabled={true}
      />
    )
    expect(screen.getByText('Bicara')).toBeInTheDocument()
    expect(screen.getByText(/Nozomi sedang berbicara/i)).toBeInTheDocument()
  })

  it('menampilkan status Mendengarkan saat mikrofon aktif', () => {
    render(
      <VoiceVisualizerAvatar
        mode="stage"
        persona="nozomi"
        isSpeaking={false}
        isListening={true}
        voiceEnabled={true}
      />
    )
    expect(screen.getByText('Mendengarkan')).toBeInTheDocument()
  })

  it('merender mode compact tanpa crash', () => {
    const { container } = render(
      <VoiceVisualizerAvatar
        mode="compact"
        persona="nozomi"
        isSpeaking={true}
        isListening={false}
        voiceEnabled={true}
      />
    )
    expect(container.querySelector('svg')).toBeInTheDocument()
  })
})
