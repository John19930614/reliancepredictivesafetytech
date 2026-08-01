const AVATAR_TONES = ["tone-a", "tone-b", "tone-c", "tone-d", "tone-e", "tone-f"] as const;

function getInitials(name: string) {
  const parts = name
    .replace(/[^\p{L}\p{N}\s@._-]/gu, " ")
    .split(/[\s@._-]+/)
    .filter(Boolean);

  if (parts.length === 0) {
    return "?";
  }

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

/** Stable per-person tint so the same colleague keeps the same colour everywhere. */
function getTone(seed: string) {
  let hash = 0;

  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) % 100000;
  }

  return AVATAR_TONES[hash % AVATAR_TONES.length];
}

type MobileAvatarProps = {
  name: string;
  seed?: string;
  size?: "sm" | "md" | "lg";
  icon?: React.ReactNode;
};

export function MobileAvatar({ name, seed, size = "md", icon }: MobileAvatarProps) {
  return (
    <span aria-hidden="true" className={`m-avatar m-avatar-${size} ${getTone(seed ?? name)}`}>
      {icon ?? getInitials(name)}
    </span>
  );
}
