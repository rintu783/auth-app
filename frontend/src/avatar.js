export const AVATAR_OPTIONS = [
  "Felix", "Aneka", "Milo", "Zoe", "Oscar", "Luna",
  "Leo", "Nova", "Max", "Ruby", "Sam", "Willow",
];

export function avatarUrl(seed) {
  return `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(seed || "Felix")}`;
}