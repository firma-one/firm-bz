/**
 * Where the caret sits inside a textarea, in px from its top-left — measured with a mirror div
 * styled like the textarea, so a mention or document menu can open right where "@" or "#" was typed.
 * Shared by the comment composers (the app's and the tour's).
 */
export function caretOffset(el: HTMLTextAreaElement, position: number): { left: number; top: number } {
    const style = window.getComputedStyle(el)
    const mirror = document.createElement('div')
    const props = ['boxSizing', 'width', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth', 'fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'wordSpacing', 'textTransform'] as const
    for (const p of props) mirror.style[p] = style[p]
    mirror.style.position = 'absolute'
    mirror.style.visibility = 'hidden'
    mirror.style.whiteSpace = 'pre-wrap'
    mirror.style.overflowWrap = 'break-word'
    mirror.textContent = el.value.slice(0, position)
    const marker = document.createElement('span')
    marker.textContent = '​'
    mirror.appendChild(marker)
    document.body.appendChild(mirror)
    const offset = { left: marker.offsetLeft, top: marker.offsetTop - el.scrollTop }
    document.body.removeChild(mirror)
    return offset
}
