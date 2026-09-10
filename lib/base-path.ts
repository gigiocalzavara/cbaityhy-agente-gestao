export const APP_BASE_PATH = "/gestao";

export function appPath(path = "/") {
  if (!path || path === "/") return APP_BASE_PATH;
  return `${APP_BASE_PATH}${path.startsWith("/") ? path : `/${path}`}`;
}
