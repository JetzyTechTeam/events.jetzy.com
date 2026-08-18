import type React from "react"

/**
 * Stop a `<input type="number">` from changing its value when the pointer happens to be over
 * it during a scroll.
 *
 * A focused number input treats the wheel as increment/decrement. Nobody expects that: a host
 * types a ticket price, scrolls down the form to carry on, and the price silently walks — $29
 * became $28.30 on a live event this way, which read as a pricing bug for weeks. The host is
 * scrolling the PAGE; the input is simply in the way.
 *
 * Blurring is the fix rather than `preventDefault()`, because React attaches `onWheel` at the
 * root as a PASSIVE listener and passive handlers cannot cancel the default action. Blurring
 * first means the input is no longer focused when that default runs, so the value stands and
 * the page scrolls as intended.
 *
 * Attach to every numeric input: `onWheel={blurOnWheel}`.
 */
export const blurOnWheel = (event: React.WheelEvent<HTMLInputElement>) => {
	event.currentTarget.blur()
}
