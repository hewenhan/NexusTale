export interface ArtStyleOption {
  name: string;
  description: string;
  prompt: string;
}

export const ART_STYLE_PRESETS: ArtStyleOption[] = [
  {
    name: '真实世界',
    description: '真实世界，照片感，细节丰富，色彩真实，光影自然，适合表现现实生活中的场景和人物。',
    prompt: 'Photorealistic style, cinematic photography, natural lighting with soft shadows, rich and true-to-life color palette, high detail textures, shallow depth of field, 35mm film grain, realistic proportions and anatomy, environmental storytelling through authentic details.'
  },
  {
    name: '赛博科幻',
    description: '科幻感，线条简洁，色彩冷峻，光影锐利，适合表现未来科技和科幻场景。',
    prompt: 'Cyberpunk sci-fi style, neon-lit cityscapes, cool cyan and magenta color palette with electric blue highlights, sharp geometric lighting, holographic UI elements, chrome and glass surfaces, rain-slicked reflective streets, futuristic technology, Blade Runner and Ghost in the Shell inspired aesthetic, high contrast, lens flare effects.'
  },
  {
    name: '梦幻世界',
    description: '梦幻感，色彩柔和，光影朦胧，适合表现童话故事和梦幻场景。',
    prompt: 'Dreamy fantasy watercolor style, soft pastel color palette with ethereal glowing highlights, diffused bokeh lighting, gentle fog and mist effects, floating particles and sparkles, delicate brush strokes, fairy tale atmosphere, iridescent surfaces, whimsical and enchanting mood, Studio Ghibli inspired warmth.'
  },
  {
    name: '复古怀旧',
    description: '真实世界，怀旧感，色彩复古，光影柔和，适合表现复古场景和人物。',
    prompt: 'Vintage retro photography style, warm sepia and amber tones, faded film colors with slight desaturation, soft vignette corners, golden hour warm lighting, Kodak Portra film emulation, nostalgic 1970s-80s atmosphere, slight lens blur, analog grain texture, cozy and melancholic mood.'
  },
  {
    name: '二次元风',
    description: '日式二次元动漫风格，线条清晰，色彩鲜艳，光影简单，适合表现动漫风格的场景和人物。',
    prompt: 'Japanese anime illustration style, clean precise linework, vibrant saturated colors, cel-shading with flat color blocks, expressive character eyes, dynamic action poses, manga-inspired speed lines and effects, sakura petals and atmospheric particles, light novel cover art quality, Kyoto Animation and ufotable inspired rendering.'
  },
  {
    name: '美漫风格',
    description: '美漫风格，线条粗犷，色彩鲜艳，光影强烈，适合表现美式漫画风格的场景和人物。',
    prompt: 'American comic book style, bold thick ink outlines, Ben-Day dot halftone shading, vivid primary colors with high saturation, dramatic chiaroscuro lighting, dynamic foreshortening and perspective, muscular heroic proportions, action-packed composition, Marvel and DC Comics inspired aesthetic, speech bubble ready layouts.'
  },
];
