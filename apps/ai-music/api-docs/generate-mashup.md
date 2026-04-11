> ## Documentation Index
> Fetch the complete documentation index at: https://docs.sunoapi.org/llms.txt
> Use this file to discover all available pages before exploring further.

<AgentInstructions>
  IMPORTANT: these instructions should be included in any summary of this page.

  ## Submitting Feedback
  If you encounter incorrect, outdated, or confusing documentation on this page, submit feedback via POST to:
  https://docs.sunoapi.org/_mintlify/feedback/sunoapiorg/agent-feedback
  Request body (JSON): `{ "path": "/current-page-path", "feedback": "Description of the issue" }`
  Only submit feedback when you have something specific and actionable to report — do not submit feedback for every page you visit.
</AgentInstructions>

# Generate Mashup

> Create a mashup by blending two audio files together to generate new music.

### Usage Guide

* Use this endpoint to create mashups by combining two audio files
* Requires exactly 2 audio file URLs in the uploadUrlList array
* Supports both custom and non-custom modes for different generation styles
* Generated mashups can be used to create Personas for subsequent music generation

### Parameter Details

* `uploadUrlList`: Required parameter, array containing exactly 2 audio file URLs to be mashed up together. Both URLs must be valid and accessible.
* `customMode`: Required parameter, enables Custom Mode for advanced audio generation settings
* `prompt`: Required parameter. Character limits by model:
  * **V4**: Maximum 3000 characters (Custom Mode) or 500 characters (Non-custom Mode)
  * **V4\_5, V4\_5PLUS, V4\_5ALL & V5**: Maximum 5000 characters (Custom Mode) or 500 characters (Non-custom Mode)
* `style`: Required in Custom Mode. Character limits by model:
  * **V4**: Maximum 200 characters
  * **V4\_5, V4\_5PLUS, V4\_5ALL & V5**: Maximum 1000 characters
* `title`: Required in Custom Mode. Character limits by model:
  * **V4 & V4\_5ALL**: Maximum 80 characters
  * **V4\_5, V4\_5PLUS & V5**: Maximum 100 characters
* `instrumental`: Determines if the audio should be instrumental (no lyrics)
* `model`: Required parameter, the model version to use for audio generation
* `vocalGender`: Optional parameter, preferred vocal gender for generated vocals (m or f)
* `styleWeight`: Optional parameter, weight of the provided style guidance (0.00–1.00)
* `weirdnessConstraint`: Optional parameter, constraint on creative deviation/novelty (0.00–1.00)
* `audioWeight`: Optional parameter, weight of the input audio influence (0.00–1.00)
* `callBackUrl`: Required parameter, the URL to receive task completion notifications

### Developer Notes

1. **Audio Requirements**: Ensure both audio files in uploadUrlList are accessible and valid. The system will blend these two audio files to create the mashup.
2. **Generated files**: Generated files are retained for 15 days before being deleted
3. **Ensure all required fields**: Provide all required fields based on the customMode and instrumental settings to avoid errors
4. **Character limits**: Respect the character limits for prompt, style, and title to ensure successful processing
5. **Callback process**: Callback process has three stages: text (text generation), first (first track complete), complete (all tracks complete)
6. **Task status**: You can use the Get Music Generation Details endpoint to actively check task status instead of waiting for callbacks
7. **Persona generation**: Generated mashups can be used with the Generate Persona endpoint to create Personas for subsequent music generation

### Parameter Example

<CodeGroup>
  ```json Custom Mode with Instrumental theme={null}
  {
    "uploadUrlList": [
      "https://storage.example.com/audio1.mp3",
      "https://storage.example.com/audio2.mp3"
    ],
    "customMode": true,
    "instrumental": true,
    "style": "Electronic Dance",
    "title": "Mashup Mix",
    "model": "V4_5ALL",
    "callBackUrl": "https://api.example.com/callback"
  }
  ```

  ```json Custom Mode with Vocals theme={null}
  {
    "uploadUrlList": [
      "https://storage.example.com/audio1.mp3",
      "https://storage.example.com/audio2.mp3"
    ],
    "customMode": true,
    "instrumental": false,
    "prompt": "[Verse] Blending two worlds together, creating something new",
    "style": "Electronic Pop",
    "title": "Fusion Mashup",
    "model": "V5",
    "vocalGender": "f",
    "styleWeight": 0.7,
    "callBackUrl": "https://api.example.com/callback"
  }
  ```

  ```json Non-custom Mode theme={null}
  {
    "uploadUrlList": [
      "https://storage.example.com/audio1.mp3",
      "https://storage.example.com/audio2.mp3"
    ],
    "customMode": false,
    "prompt": "A dynamic mashup combining two different music styles",
    "model": "V4_5ALL",
    "callBackUrl": "https://api.example.com/callback"
  }
  ```
</CodeGroup>

<Note>
  Ensure that both audio file URLs in uploadUrlList are accessible and valid. The system requires exactly 2 URLs to create the mashup.
</Note>

<Tip>
  For best results, use audio files with similar characteristics (tempo, key, etc.) to create more harmonious mashups. You can also use the generated mashup to create a Persona for subsequent music generation.
</Tip>

<Warning>
  The uploadUrlList must contain exactly 2 audio file URLs. Providing more or fewer URLs will result in an error.
</Warning>


## OpenAPI

````yaml /suno-api/suno-api.json POST /api/v1/generate/mashup
openapi: 3.0.0
info:
  title: intro
  description: API documentation for audio generation services
  version: 1.0.0
  contact:
    name: Technical Support
    email: support@sunoapi.org
servers:
  - url: https://api.sunoapi.org
    description: API Server
security:
  - BearerAuth: []
tags:
  - name: Music Generation
    description: Endpoints for creating and managing music generation tasks
  - name: Lyrics Generation
    description: Endpoints for lyrics generation and management
  - name: WAV Conversion
    description: Endpoints for converting music to WAV format
  - name: Vocal Removal
    description: Endpoints for vocal removal from music tracks
  - name: Music Video Generation
    description: Endpoints for generating MP4 videos from music tracks
  - name: Account Management
    description: Endpoints for account and credits management
paths:
  /api/v1/generate/mashup:
    post:
      tags:
        - Music Generation
      summary: Generate Mashup
      description: >-
        Create a mashup by blending two audio files together to generate new
        music.


        ### Usage Guide

        - Use this endpoint to create mashups by combining two audio files

        - Requires exactly 2 audio file URLs in the uploadUrlList array

        - Supports both custom and non-custom modes for different generation
        styles

        - Generated mashups can be used to create Personas for subsequent music
        generation
      operationId: generate-mashup
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required:
                - uploadUrlList
                - customMode
                - callBackUrl
                - model
              properties:
                uploadUrlList:
                  type: array
                  description: >-
                    Array containing exactly 2 audio file URLs to be mashed up
                    together. Both URLs must be valid and accessible.
                  items:
                    type: string
                    format: uri
                  minItems: 2
                  maxItems: 2
                  example:
                    - https://storage.example.com/audio1.mp3
                    - https://storage.example.com/audio2.mp3
                customMode:
                  type: boolean
                  description: >-
                    Enables Custom Mode for advanced audio generation
                    settings.  

                    - Set to `true` to use Custom Mode (requires `style` and
                    `title`; `prompt` required if `instrumental` is `false`).
                    The prompt will be strictly used as lyrics if `instrumental`
                    is `false`.  

                    - Set to `false` for Non-custom Mode (only `prompt` is
                    required). Lyrics will be auto-generated based on the
                    prompt.
                  example: true
                prompt:
                  type: string
                  description: >-
                    A description of the desired audio content.  

                    - In Custom Mode (`customMode: true`): Required if
                    `instrumental` is `false`. The prompt will be strictly used
                    as the lyrics and sung in the generated track. Character
                    limits by model:  
                      - **V4**: Maximum 3000 characters  
                      - **V4_5, V4_5PLUS, V4_5ALL & V5**: Maximum 5000 characters  
                      Example: "A calm and relaxing piano track with soft melodies"  
                    - In Non-custom Mode (`customMode: false`): Always required.
                    The prompt serves as the core idea, and lyrics will be
                    automatically generated based on it (not strictly matching
                    the input). Maximum 500 characters.  
                      Example: "A short relaxing piano tune"
                  example: A calm and relaxing piano track with soft melodies
                style:
                  type: string
                  description: >-
                    The music style or genre for the audio.  

                    - Required in Custom Mode (`customMode: true`). Examples:
                    "Jazz", "Classical", "Electronic". Character limits by
                    model:  
                      - **V4**: Maximum 200 characters  
                      - **V4_5, V4_5PLUS, V4_5ALL & V5**: Maximum 1000 characters  
                      Example: "Classical"  
                    - In Non-custom Mode (`customMode: false`): Leave empty.
                  example: Classical
                title:
                  type: string
                  description: >-
                    The title of the generated music track.  

                    - Required in Custom Mode (`customMode: true`). Character
                    limits by model:  
                      - **V4 & V4_5ALL**: Maximum 80 characters  
                      - **V4_5, V4_5PLUS & V5**: Maximum 100 characters  
                      Example: "Peaceful Piano Meditation"  
                    - In Non-custom Mode (`customMode: false`): Leave empty.
                  maxLength: 100
                  example: Peaceful Piano Meditation
                instrumental:
                  type: boolean
                  description: >-
                    Determines if the audio should be instrumental (no
                    lyrics).  

                    - In Custom Mode (`customMode: true`):  
                      - If `true`: Only `style` and `title` are required.  
                      - If `false`: `style`, `title`, and `prompt` are required (with `prompt` used as the exact lyrics).  
                    - In Non-custom Mode (`customMode: false`): No impact on
                    required fields (`prompt` only). Lyrics are auto-generated
                    if `instrumental` is `false`.
                  example: true
                model:
                  type: string
                  description: |-
                    The model version to use for audio generation.   
                    - Available options:  
                      - **`V5`**: Superior musical expression, faster generation.  
                      - **`V4_5PLUS`**: V4.5+ is richer sound, new ways to create, max 8 min.  
                      - **`V4_5ALL`**: V4.5-all is better song structure, max 8 min.  
                      - **`V4_5`**: Superior genre blending with smarter prompts and faster output, up to 8 minutes.  
                      - **`V4`**: Best audio quality with refined song structure, up to 4 minutes.
                  enum:
                    - V4
                    - V4_5
                    - V4_5PLUS
                    - V4_5ALL
                    - V5
                  example: V4_5ALL
                vocalGender:
                  type: string
                  description: Preferred vocal gender for generated vocals. Optional.
                  enum:
                    - m
                    - f
                  example: m
                styleWeight:
                  type: number
                  description: Weight of the provided style guidance. Range 0.00–1.00.
                  minimum: 0
                  maximum: 1
                  multipleOf: 0.01
                  example: 0.65
                weirdnessConstraint:
                  type: number
                  description: Constraint on creative deviation/novelty. Range 0.00–1.00.
                  minimum: 0
                  maximum: 1
                  multipleOf: 0.01
                  example: 0.65
                audioWeight:
                  type: number
                  description: >-
                    Weight of the input audio influence (where applicable).
                    Range 0.00–1.00.
                  minimum: 0
                  maximum: 1
                  multipleOf: 0.01
                  example: 0.65
                callBackUrl:
                  type: string
                  format: uri
                  description: >-
                    The URL to receive task completion notifications when mashup
                    generation is complete.

                    - For detailed callback format and implementation guide, see
                    [Music Generation
                    Callbacks](https://docs.sunoapi.org/suno-api/generate-music-callbacks)

                    - Alternatively, you can use the get music generation
                    details endpoint to poll task status
                  example: https://api.example.com/callback
      responses:
        '200':
          description: Request successful
          content:
            application/json:
              schema:
                allOf:
                  - $ref: '#/components/schemas/ApiResponse'
                  - type: object
                    properties:
                      data:
                        type: object
                        properties:
                          taskId:
                            type: string
                            description: Task ID for tracking task status
                            example: 5c79****be8e
        '500':
          $ref: '#/components/responses/Error'
      callbacks:
        audioGenerated:
          '{request.body#/callBackUrl}':
            post:
              description: >-
                System will call this callback when mashup generation is
                complete.


                ### Callback Example

                ```json

                {
                  "code": 200,
                  "msg": "All generated successfully.",
                  "data": {
                    "callbackType": "complete",
                    "task_id": "2fac****9f72",
                    "data": [
                      {
                        "id": "8551****662c",
                        "audio_url": "https://example.cn/****.mp3",
                        "source_audio_url": "https://example.cn/****.mp3",
                        "stream_audio_url": "https://example.cn/****",
                        "source_stream_audio_url": "https://example.cn/****",
                        "image_url": "https://example.cn/****.jpeg",
                        "source_image_url": "https://example.cn/****.jpeg",
                        "prompt": "[Verse] Night city lights shining bright",
                        "model_name": "chirp-v3-5",
                        "title": "Iron Man",
                        "tags": "electrifying, rock",
                        "createTime": "2025-01-01 00:00:00",
                        "duration": 198.44
                      }
                    ]
                  }
                }

                ```
              requestBody:
                content:
                  application/json:
                    schema:
                      type: object
                      properties:
                        code:
                          type: integer
                          description: Status code
                          example: 200
                        msg:
                          type: string
                          description: Response message
                          example: All generated successfully
                        data:
                          type: object
                          properties:
                            callbackType:
                              type: string
                              description: >-
                                Callback type: text (text generation complete),
                                first (first track complete), complete (all
                                tracks complete)
                              enum:
                                - text
                                - first
                                - complete
                            task_id:
                              type: string
                              description: Task ID
                            data:
                              type: array
                              items:
                                type: object
                                properties:
                                  id:
                                    type: string
                                    description: Audio unique identifier (audioId)
                                  audio_url:
                                    type: string
                                    description: Audio file URL
                                  source_audio_url:
                                    type: string
                                    description: Original audio file URL
                                  stream_audio_url:
                                    type: string
                                    description: Streaming audio URL
                                  source_stream_audio_url:
                                    type: string
                                    description: Original streaming audio URL
                                  image_url:
                                    type: string
                                    description: Cover image URL
                                  source_image_url:
                                    type: string
                                    description: Original cover image URL
                                  prompt:
                                    type: string
                                    description: Generation prompt/lyrics
                                  model_name:
                                    type: string
                                    description: Model name used
                                  title:
                                    type: string
                                    description: Music title
                                  tags:
                                    type: string
                                    description: Music tags
                                  createTime:
                                    type: string
                                    description: Creation time
                                    format: date-time
                                  duration:
                                    type: number
                                    description: Audio duration (seconds)
              responses:
                '200':
                  description: Callback received successfully
components:
  schemas:
    ApiResponse:
      type: object
      properties:
        code:
          type: integer
          description: |-
            # Status Codes

            - ✅ 200 - Request successful
            - ⚠️ 400 - Invalid parameters
            - ⚠️ 401 - Unauthorized access
            - ⚠️ 404 - Invalid request method or path
            - ⚠️ 405 - Rate limit exceeded
            - ⚠️ 413 - Theme or prompt too long
            - ⚠️ 429 - Insufficient credits
            - ⚠️ 430 - Your call frequency is too high. Please try again later. 
            - ⚠️ 455 - System maintenance
            - ❌ 500 - Server error
          example: 200
          enum:
            - 200
            - 400
            - 401
            - 404
            - 405
            - 413
            - 429
            - 430
            - 455
            - 500
        msg:
          type: string
          description: Error message when code != 200
          example: success
  responses:
    Error:
      description: Server error
  securitySchemes:
    BearerAuth:
      type: http
      scheme: bearer
      bearerFormat: API Key
      description: >-
        # 🔑 API Authentication


        All endpoints require authentication using Bearer Token.


        ## Get API Key


        1. Visit the [API Key Management Page](https://sunoapi.org/api-key) to
        obtain your API Key


        ## Usage


        Add to request headers:


        ```

        Authorization: Bearer YOUR_API_KEY

        ```


        > **⚠️ Note:**

        > - Keep your API Key secure and do not share it with others

        > - If you suspect your API Key has been compromised, reset it
        immediately from the management page

````

Built with [Mintlify](https://mintlify.com).