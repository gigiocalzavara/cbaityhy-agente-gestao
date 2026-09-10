export const APP_BASE_PATH = "";

export function appPath(path = "/") {
  if (!path) return "/";
  return path.startsWith("/") ? path : `/${path}`;
}
