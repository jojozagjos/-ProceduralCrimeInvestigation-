// Image provider module – pluggable backends
export interface ImageResult {
  url: string;
  credit?: string;
  source: 'dicebear' | 'pexels' | 'unsplash';
}

export class ImageProvider {
  private pexelsKey: string;
  private unsplashKey: string;

  constructor(pexelsKey?: string, unsplashKey?: string) {
    this.pexelsKey = pexelsKey || '';
    this.unsplashKey = unsplashKey || '';
  }

  async getPortrait(seed: string): Promise<ImageResult> {
    if (this.pexelsKey) {
      try {
        const res = await fetch(`https://api.pexels.com/v1/search?query=person+portrait&per_page=1&page=${Math.abs(hashCode(seed)) % 50 + 1}`, {
          headers: { Authorization: this.pexelsKey },
        });
        if (res.ok) {
          const data = await res.json() as any;
          if (data.photos?.[0]) {
            return {
              url: data.photos[0].src.medium,
              credit: 'Photos provided by Pexels',
              source: 'pexels',
            };
          }
        }
      } catch { /* fallback */ }
    }

    if (this.unsplashKey) {
      try {
        const res = await fetch(`https://api.unsplash.com/search/photos?query=person+portrait&per_page=1&page=${Math.abs(hashCode(seed)) % 30 + 1}`, {
          headers: { Authorization: `Client-ID ${this.unsplashKey}` },
        });
        if (res.ok) {
          const data = await res.json() as any;
          if (data.results?.[0]) {
            return {
              url: data.results[0].urls.small,
              credit: `Photo by ${data.results[0].user.name} on Unsplash`,
              source: 'unsplash',
            };
          }
        }
      } catch { /* fallback */ }
    }

    // DiceBear fallback (always works, no key needed)
    return {
      url: `https://api.dicebear.com/7.x/personas/svg?seed=${encodeURIComponent(seed)}`,
      source: 'dicebear',
    };
  }

  async getLocation(seed: string): Promise<ImageResult> {
    if (this.pexelsKey) {
      try {
        const res = await fetch(`https://api.pexels.com/v1/search?query=dark+building+night&per_page=1&page=${Math.abs(hashCode(seed)) % 30 + 1}`, {
          headers: { Authorization: this.pexelsKey },
        });
        if (res.ok) {
          const data = await res.json() as any;
          if (data.photos?.[0]) {
            return {
              url: data.photos[0].src.large,
              credit: 'Photos provided by Pexels',
              source: 'pexels',
            };
          }
        }
      } catch { /* fallback */ }
    }

    return {
      url: `https://api.dicebear.com/7.x/shapes/svg?seed=${encodeURIComponent(seed)}`,
      source: 'dicebear',
    };
  }

  async getScene(query: string, seed: string): Promise<ImageResult> {
    const pageSeed = Math.abs(hashCode(seed + query)) % 30 + 1;

    if (this.pexelsKey) {
      try {
        const res = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=1&page=${pageSeed}`, {
          headers: { Authorization: this.pexelsKey },
        });
        if (res.ok) {
          const data = await res.json() as any;
          if (data.photos?.[0]) {
            return {
              url: data.photos[0].src.large,
              credit: 'Photos provided by Pexels',
              source: 'pexels',
            };
          }
        }
      } catch { /* fallback */ }
    }

    if (this.unsplashKey) {
      try {
        const res = await fetch(`https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=1&page=${pageSeed}`, {
          headers: { Authorization: `Client-ID ${this.unsplashKey}` },
        });
        if (res.ok) {
          const data = await res.json() as any;
          if (data.results?.[0]) {
            return {
              url: data.results[0].urls.regular,
              credit: `Photo by ${data.results[0].user.name} on Unsplash`,
              source: 'unsplash',
            };
          }
        }
      } catch { /* fallback */ }
    }

    return {
      url: '',
      source: 'unsplash',
    };
  }
}

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return hash;
}
