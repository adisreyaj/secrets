import {
    apiFetch,
    unwrapCursorPage,
    type CursorPage,
} from '../clients/api.js'
import { loadClient } from '../core/context.js'
import { outputSuccess } from '../core/output.js'
import type { CommandContext } from '../core/types.js'

export async function listCommand(ctx: CommandContext) {
  const { client, baseUrl, token } = await loadClient(ctx.flags)
  const envId = await client.resolveEnvironmentId()
  const secrets = unwrapCursorPage(
    await apiFetch<CursorPage<{ key: string; value?: string }>>(
      baseUrl,
      token,
      `/environments/${envId}/secrets?includeValues=true`,
      ctx.debug,
    ),
  )

  if (ctx.flags.json) {
    outputSuccess(ctx.flags, { data: secrets.map((s) => ({ key: s.key })) })
    return
  }

  for (const secret of secrets) {
    console.log(secret.key)
  }
}
