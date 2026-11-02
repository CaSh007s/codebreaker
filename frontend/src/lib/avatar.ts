const AVATAR_STYLES = ["pixel-art", "adventurer", "bottts", "fun-emoji", "lorelei", "notionists"];

export function avatarUrl(seed: string, style = AVATAR_STYLES[0]): string {
  return `https://api.dicebear.com/9.x/${style}/svg?seed=${encodeURIComponent(seed)}`;
}

export function nextAvatar(seed: string, current?: string): string {
  const currentStyle = AVATAR_STYLES.find((style) => current?.includes(`/9.x/${style}/`));
  const start = Math.max(0, currentStyle ? AVATAR_STYLES.indexOf(currentStyle) + 1 : 0);
  const style = AVATAR_STYLES[start % AVATAR_STYLES.length];
  return avatarUrl(`${seed}-${Date.now()}`, style);
}
