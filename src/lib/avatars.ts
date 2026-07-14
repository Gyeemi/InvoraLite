import { STORAGE_KEYS, storageGet, storageSet } from "./storage";

type AvatarMap = Record<string, string>;

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

export function defaultUserAvatar(username: string): string {
  return `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(username)}`;
}

function avatarKey(username: string): string {
  return username.trim().toLowerCase();
}

async function readAvatarMap(): Promise<AvatarMap> {
  const raw = await storageGet(STORAGE_KEYS.avatars);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as AvatarMap;
  } catch {
    return {};
  }
}

export async function getStoredAvatar(username: string): Promise<string | undefined> {
  const map = await readAvatarMap();
  return map[avatarKey(username)];
}

export async function migrateStoredAvatar(oldUsername: string, newUsername: string): Promise<void> {
  const oldKey = avatarKey(oldUsername);
  const newKey = avatarKey(newUsername);
  if (oldKey === newKey) return;

  const map = await readAvatarMap();
  if (!map[oldKey]) return;

  map[newKey] = map[oldKey];
  delete map[oldKey];
  await storageSet(STORAGE_KEYS.avatars, JSON.stringify(map));
}

export async function setStoredAvatar(username: string, dataUrl: string): Promise<void> {
  const map = await readAvatarMap();
  map[avatarKey(username)] = dataUrl;
  await storageSet(STORAGE_KEYS.avatars, JSON.stringify(map));
}

export async function resolveUserAvatar(username: string): Promise<string> {
  const stored = await getStoredAvatar(username);
  return stored ?? defaultUserAvatar(username);
}

export async function fileToAvatarDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Please choose an image file.");
  }
  if (file.size > MAX_AVATAR_BYTES) {
    throw new Error("Image must be 2 MB or smaller.");
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }
      reject(new Error("Could not read image."));
    };
    reader.onerror = () => reject(new Error("Could not read image."));
    reader.readAsDataURL(file);
  });
}
