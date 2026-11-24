// Module declarations for the static assets that webpack will rewrite.
//
// The Remotion + webpack setup lets a component import an image or a font
// directly (`import logo from '../assets/logo.png'`); TypeScript needs to be
// told what such an import evaluates to. These are the shapes the asset modules
// actually return.
//
// Note the split from `public/`: files under `public/` are NOT imported, they
// are referenced at render time through `staticFile('…')`. Importing them gives
// a bundler URL and silently breaks. See docs/05-素材管线.md.

declare module '*.png' {
  const src: string;
  export default src;
}

declare module '*.jpg' {
  const src: string;
  export default src;
}

declare module '*.jpeg' {
  const src: string;
  export default src;
}

declare module '*.webp' {
  const src: string;
  export default src;
}

declare module '*.svg' {
  const src: string;
  export default src;
}

declare module '*.woff2' {
  const src: string;
  export default src;
}

declare module '*.mp3' {
  const src: string;
  export default src;
}

declare module '*.wav' {
  const src: string;
  export default src;
}
