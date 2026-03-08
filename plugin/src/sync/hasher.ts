export async function md5(data: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest("MD5", data);
  return [...new Uint8Array(hashBuffer)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
