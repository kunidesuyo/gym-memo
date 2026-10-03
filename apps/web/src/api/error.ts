/**
 * サーバーが返すエラーメッセージを拾う。落ちたら既定文言にフォールバックする。
 *
 * 引数を `Response` にしないのは、web の tsconfig が worker-configuration.d.ts を
 * 読んでいるため `Response` が Worker 版（webSocket / cf を持つ）になり、
 * Hono の ClientResponse を受け取れないから。必要な形だけを構造的に受ける。
 */
export async function errorFrom(
  res: { json(): Promise<unknown> },
  fallback: string,
) {
  try {
    const body = (await res.json()) as { error?: string }
    return new Error(body.error ?? fallback)
  } catch {
    return new Error(fallback)
  }
}
