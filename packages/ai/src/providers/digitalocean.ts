import type { ProviderPackage } from "../provider-package.js"
import { OpenAIChat } from "../protocols/openai-chat.js"
import { newBreakpoints, ttlBucket } from "../protocols/utils/cache.js"
import { AuthOptions, type ProviderAuthOption } from "../route/auth-options.js"
import { Route, type RouteDefaultsInput } from "../route/client.js"
import { Endpoint } from "../route/endpoint.js"
import { Protocol } from "../route/protocol.js"
import { ProviderID, type CacheHint, type ModelID } from "../schema/index.js"
import type { OpenAIProviderOptionsInput } from "./openai-options.js"

export const id = ProviderID.make("digitalocean")
const baseURL = "https://inference.do-ai.run/v1"

export type LanguageModelOptions = Omit<RouteDefaultsInput, "providerOptions"> &
  ProviderAuthOption<"optional"> & {
    readonly baseURL?: string
    readonly providerOptions?: OpenAIProviderOptionsInput
  }

export type Settings = ProviderPackage.Settings &
  OpenAIProviderOptionsInput & {
    readonly apiKey?: string
    readonly baseURL?: string
  }

const cacheControl = () => {
  const breakpoints = newBreakpoints(4)
  return (cache: CacheHint | undefined) => {
    if (cache === undefined || breakpoints.remaining === 0) return undefined
    breakpoints.remaining -= 1
    return {
      type: "ephemeral" as const,
      ...(ttlBucket(cache.ttlSeconds) === "1h" ? { ttl: "1h" } : {}),
    }
  }
}

export const protocol = Protocol.make({
  id: "digitalocean-chat",
  body: {
    schema: OpenAIChat.protocol.body.schema,
    from: (request) => OpenAIChat.fromRequest(request, { cacheControl: cacheControl() }),
  },
  stream: OpenAIChat.protocol.stream,
})

export const route = Route.make({
  id: "digitalocean",
  provider: id,
  providerMetadataKey: "digitalocean",
  protocol,
  endpoint: Endpoint.path("/chat/completions", { baseURL }),
  framing: OpenAIChat.framing,
})

export const routes = [route]

export const configure = (input: LanguageModelOptions = {}) => {
  const { apiKey: _apiKey, auth: _auth, baseURL: endpoint, ...defaults } = input
  const configured = route.with({
    ...defaults,
    endpoint: { baseURL: endpoint ?? baseURL },
    auth: AuthOptions.bearer(input, ["DIGITALOCEAN_ACCESS_TOKEN", "DIGITALOCEAN_API_KEY", "DO_INFERENCE_API_KEY"]),
  })
  return {
    id,
    model: (modelID: string | ModelID) =>
      configured.model<OpenAIProviderOptionsInput>({
        id: modelID,
        compatibility: {
          supportsPromptCacheKey: true,
        },
      }),
    configure,
  }
}

export const provider = configure()

export const model: ProviderPackage.Definition<Settings, OpenAIProviderOptionsInput>["model"] = (
  modelID,
  { apiKey, baseURL, body, headers, ...providerOptions },
) =>
  configure({
    apiKey,
    baseURL,
    headers: headers === undefined ? undefined : { ...headers },
    http: body === undefined ? undefined : { body: { ...body } },
    providerOptions,
  }).model(modelID)

export * as DigitalOcean from "./digitalocean.js"
