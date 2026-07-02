// ─── Google Fonts list (top 100) ─────────────────────────────────────────────

export const GOOGLE_FONTS = [
  'Inter','Roboto','Open Sans','Lato','Montserrat','Poppins','Raleway','Oswald',
  'Source Sans 3','Merriweather','Nunito','Ubuntu','Playfair Display','Rubik',
  'PT Sans','Mukta','Noto Sans','Work Sans','Quicksand','Fira Sans',
  'Titillium Web','Barlow','DM Sans','Josefin Sans','Inconsolata',
  'Libre Baskerville','Arimo','Cabin','Nanum Gothic','Mulish',
  'Hind Siliguri','Karla','Heebo','Jost','Exo 2','Manrope','Bitter',
  'Space Grotesk','Figtree','Plus Jakarta Sans','Outfit','Sora','Albert Sans',
  'Lexend','Instrument Sans','Kanit','Oxanium','Urbanist','Be Vietnam Pro',
  'Noto Serif','Cormorant Garamond','EB Garamond','Spectral','Crimson Text',
  'Lora','Libre Franklin','Source Serif 4','PT Serif','Zilla Slab',
  'Arvo','Rokkitt','Cardo','Vollkorn','Domine','Neuton','Glegoo',
  'DM Serif Display','Abril Fatface','Alfa Slab One','Fjalla One',
  'Anton','Black Han Sans','Righteous','Russo One','Teko','Passion One',
  'Bebas Neue','Boogaloo','Acme','Fredoka One','Nunito Sans','Varela Round',
  'Comfortaa','Pacifico','Lobster','Dancing Script','Caveat','Sacramento',
  'Great Vibes','Satisfy','Kaushan Script','Permanent Marker','Shadows Into Light',
  'Amatic SC','Indie Flower','Patrick Hand','Architects Daughter','Just Another Hand',
  'JetBrains Mono','Fira Code','Source Code Pro','IBM Plex Mono','Space Mono',
  'Courier Prime','Share Tech Mono','Roboto Mono','Noto Sans Mono','Overpass Mono',
]

export function googleFontsUrl(name: string): string {
  return `https://fonts.googleapis.com/css2?family=${name.replace(/ /g, '+')}:wght@400;500;600;700&display=swap`
}
