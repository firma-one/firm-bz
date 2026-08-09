import React from 'react'

interface MyDriveIconProps {
    size?: number
    className?: string
}

/** Google's "My Drive" glyph (Material Symbols) — distinct from the multicolor Drive
 * triangle logo (GoogleDriveIcon), which represents the Drive product/connector as a
 * whole, not this specific personal-storage location. Matches the icon shown in
 * Google's own Drive/Picker UI next to the "My Drive" entry. */
export function MyDriveIcon({ size = 20, className = "" }: MyDriveIconProps) {
    return (
        <svg
            viewBox="0 -960 960 960"
            height={size}
            width={size}
            focusable="false"
            fill="currentColor"
            xmlns="http://www.w3.org/2000/svg"
            className={className}
        >
            <path d="M376-400H584q53,0 79-45t0-90L558-715q-26-45-78-45t-78,45L298-535q-26,45-0.5,90T376-400Zm104-70L417-580H544L480-470ZM120-280V-800q0-33 23.5-56.5T200-880H760q33,0 56.5,23.5T840-800v520H120ZM200-80q-33,0-56.5-23.5T120-160v-40H840v40q0,33-23.5,56.5T760-80H200Z" />
        </svg>
    )
}
