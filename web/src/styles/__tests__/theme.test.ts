/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { expect, it } from 'vitest'

const theme = readFileSync(resolve('src/styles/theme.css'), 'utf8')
const home = readFileSync(resolve('src/styles/home.css'), 'utf8')

function declarations(css: string, selector: string): Map<string, string> {
  const block = css.slice(css.indexOf(selector) + selector.length).split('}')[0]
  return new Map(
    [...block.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((match) => [
      match[1],
      match[2].trim(),
    ])
  )
}

function luminance(value: string): number {
  expect(value).toMatch(/^#[\da-f]{6}$/i)
  const [red, green, blue] = [1, 3, 5].map((offset) => {
    const channel = Number.parseInt(value.slice(offset, offset + 2), 16) / 255
    return channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue
}

function resolvedColor(tokens: Map<string, string>, name: string): string {
  const value = tokens.get(name)
  if (!value) throw new Error(`Missing theme color: ${name}`)
  const reference = value.match(/^var\(--([\w-]+)\)$/)
  return reference ? resolvedColor(tokens, reference[1]) : value
}

it.each([':root {', '.dark {'])(
  '%s keeps default surfaces and actions at readable text contrast',
  (selector) => {
    const tokens = declarations(theme, selector)
    for (const [foreground, background] of [
      ['foreground', 'background'],
      ['card-foreground', 'card'],
      ['popover-foreground', 'popover'],
      ['muted-foreground', 'muted'],
      ['primary-foreground', 'primary'],
      ['brand-foreground', 'brand'],
      ['brand', 'background'],
      ['sidebar-foreground', 'sidebar'],
      ['sidebar-accent-foreground', 'sidebar-accent'],
      ['sidebar-primary-foreground', 'sidebar-primary'],
    ]) {
      const a = luminance(resolvedColor(tokens, foreground))
      const b = luminance(resolvedColor(tokens, background))
      expect(
        (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
        foreground
      ).toBeGreaterThanOrEqual(4.5)
    }
  }
)

it('keeps the orange free-start action readable', () => {
  const tokens = declarations(home, '.home-primary-action {')
  const foreground = luminance(resolvedColor(tokens, 'primary-foreground'))
  const background = luminance(resolvedColor(tokens, 'primary'))
  expect((background + 0.05) / (foreground + 0.05)).toBeGreaterThanOrEqual(4.5)
})
