/**
 * Bistec Studio logo (public/BistecStudioLogo.png).
 *
 * The asset is a transparent PNG whose black wordmark occupies a sub-region of a
 * 1536×1024 canvas (content box ≈ x[0.24–0.65] y[0.38–0.58], aspect ≈ 3:1, pure
 * black). We CSS-crop to that region so the logo isn't a small mark floating in a
 * large transparent box. The logo is solid black, so on the dark theme we invert
 * it to white (`dark:invert`) to keep it visible on dark surfaces.
 */
export function Logo({
  height = 32,
  className = '',
}: {
  height?: number
  className?: string
}) {
  return (
    <div
      role="img"
      aria-label="Bistec Studio"
      className={`bg-no-repeat dark:invert shrink-0 ${className}`}
      style={{
        height,
        width: Math.round(height * 3), // content aspect ≈ 3:1
        backgroundImage: 'url(/BistecStudioLogo.png)',
        backgroundSize: '235%', // content is ~41% of image width → fills with a small margin
        backgroundPosition: '45% 48%', // content center ≈ (0.446, 0.478)
      }}
    />
  )
}
