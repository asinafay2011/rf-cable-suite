const MEDIA_SLOT_OPTIONS = [
  'suite_home_hero',
  'rf_home_hero',
  'rf_launch_explainer',
  'rf_shielding_explainer',
  'rf_build_process',
  'highspeed_home_hero',
  'highspeed_build_process',
  'highspeed_eye_tdr_explainer',
  'generic',
]

const VIDEO_MODEL_OPTIONS = ['veo3_1', 'seedance_2_0', 'kling3_0']

export const HIGGSFIELD_TOOLS = [
  {
    name: 'higgsfield_account_status',
    description:
      'Check whether Higgsfield CLI is connected and how many credits are available. Use before generating media when the user asks about credits or whether Higgsfield is ready.',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'higgsfield_recent_videos',
    description:
      'List recent Higgsfield video jobs and result URLs. Use to find an existing generated video before making a new one.',
    input_schema: {
      type: 'object',
      properties: {
        size: { type: 'number', description: 'How many recent video jobs to return. Default 8, max 50.' },
      },
      required: [],
    },
  },
  {
    name: 'higgsfield_video_cost',
    description:
      'Estimate Higgsfield credits for a video prompt without creating a job. Use this before spending credits unless the user explicitly said to generate the video now.',
    input_schema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'Detailed video prompt. Include no captions/no text/no logos when that matters.' },
        model: { type: 'string', description: `Video model: ${VIDEO_MODEL_OPTIONS.join(', ')}. Default veo3_1.` },
        duration: { type: 'number', description: 'Duration in seconds. Veo 3.1 supports 4/6/8.' },
        aspect_ratio: { type: 'string', description: 'Aspect ratio, normally 16:9 for app hero/explainer video.' },
        quality: { type: 'string', description: 'Veo quality: basic, high, ultra. Default ultra for hero work.' },
        resolution: { type: 'string', description: 'Seedance resolution: 480p, 720p, 1080p.' },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'generate_higgsfield_video',
    description:
      'Generate a Higgsfield video end-to-end from the agent thread, wait for completion, download it into public/generated/higgsfield, and return an Apply button for supported app slots. Only call this after the user explicitly asks to generate/replace a video or confirms spending Higgsfield credits.',
    input_schema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'Production-ready prompt. Be specific about subject, camera, action, materials, and forbid text/logos/captions if not wanted.' },
        confirmed: { type: 'boolean', description: 'Must be true only when the user explicitly confirmed generating media/spending credits.' },
        slot: { type: 'string', description: `Where this video should be usable: ${MEDIA_SLOT_OPTIONS.join(', ')}.` },
        filename: { type: 'string', description: 'Optional local filename hint, without extension.' },
        model: { type: 'string', description: `Video model: ${VIDEO_MODEL_OPTIONS.join(', ')}. Default veo3_1 for best quality.` },
        duration: { type: 'number', description: 'Duration in seconds. Use 6 or 8 for hero videos, 4 for quick layer tests.' },
        aspect_ratio: { type: 'string', description: 'Use 16:9 for RF/Highspeed pages.' },
        quality: { type: 'string', description: 'For veo3_1: basic, high, or ultra. Use ultra for final hero assets.' },
        veo_model: { type: 'string', description: 'For veo3_1: veo-3-1-preview or veo-3-1-fast. Use preview for best quality.' },
        timeout_minutes: { type: 'number', description: 'How long backend should wait for completion. Default 20.' },
      },
      required: ['prompt', 'confirmed'],
    },
  },
]

export function isHiggsfieldTool(name) {
  return HIGGSFIELD_TOOLS.some((tool) => tool.name === name)
}

async function readJsonResponse(response) {
  const text = await response.text()
  try {
    return text ? JSON.parse(text) : {}
  } catch {
    return { raw: text }
  }
}

function slotLabel(slot) {
  return {
    suite_home_hero: 'Suite homepage hero',
    rf_home_hero: 'RF home hero',
    rf_launch_explainer: 'RF connector launch explainer',
    rf_shielding_explainer: 'RF shielding explainer',
    rf_build_process: 'RF build process',
    highspeed_home_hero: 'Highspeed home hero',
    highspeed_build_process: 'Highspeed build process',
    highspeed_eye_tdr_explainer: 'Highspeed Eye + TDR explainer',
    generic: 'generated media folder',
  }[slot] || slot || 'generated media'
}

export async function dispatchHiggsfieldTool(name, input = {}) {
  if (name === 'higgsfield_account_status') {
    const response = await fetch('/api/higgsfield/status')
    const body = await readJsonResponse(response)
    if (!response.ok) return { error: body.error || 'Higgsfield status failed' }
    return body
  }

  if (name === 'higgsfield_recent_videos') {
    const size = Math.max(1, Math.min(50, Number(input.size) || 8))
    const response = await fetch(`/api/higgsfield/jobs?type=video&size=${size}`)
    const body = await readJsonResponse(response)
    if (!response.ok) return { error: body.error || 'Higgsfield job list failed' }
    return { count: Array.isArray(body) ? body.length : 0, jobs: body }
  }

  if (name === 'higgsfield_video_cost') {
    const response = await fetch('/api/higgsfield/video-cost', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    const body = await readJsonResponse(response)
    if (!response.ok) return { error: body.error || 'Higgsfield cost estimate failed' }
    return body
  }

  if (name === 'generate_higgsfield_video') {
    const slot = input.slot || 'generic'
    const response = await fetch('/api/higgsfield/generate-video', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...input, slot }),
    })
    const body = await readJsonResponse(response)
    if (!response.ok) return { error: body.error || 'Higgsfield video generation failed' }
    const publicUrl = body.saved?.public_url
    return {
      ...body,
      label: `Higgsfield video -> ${slotLabel(slot)}`,
      local_asset: publicUrl,
      note: publicUrl
        ? `Saved locally at ${publicUrl}. Click Apply to use it for ${slotLabel(slot)}.`
        : 'Generation returned no local asset. Inspect recent videos.',
      _section: 'media-asset',
      ...(publicUrl ? {
        _apply_preset: {
          slot,
          mp4: publicUrl,
          webm: '',
          source: 'higgsfield',
          job_id: body.job?.id,
          prompt: input.prompt,
        },
      } : {}),
    }
  }

  return { error: `Unknown Higgsfield tool: ${name}` }
}
