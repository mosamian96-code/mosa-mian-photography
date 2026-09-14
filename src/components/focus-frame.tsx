/** The signature "focus pull" hover/focus treatment -- four viewfinder-style corner
 * brackets, pure CSS (see .focus-frame/.focus-bracket in globals.css), triggered by
 * the parent's :hover/:focus-visible via the shared "group" class. Zero JS per
 * instance, so it's safe to place inside every thumbnail in a large gallery grid
 * without per-item listeners or observers. */
export function FocusFrame() {
  return (
    <span className="focus-frame" aria-hidden="true">
      <span className="focus-bracket tl" />
      <span className="focus-bracket tr" />
      <span className="focus-bracket bl" />
      <span className="focus-bracket br" />
    </span>
  );
}
