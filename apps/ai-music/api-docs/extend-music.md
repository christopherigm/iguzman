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

# Extend Music

> Extend or modify existing music tracks.

### Parameter Usage Guide

* When defaultParamFlag is true (Custom Parameters):
  * prompt, style, title and continueAt are required
  * Prompt length limit:
    * For V4 model: 3000 characters
    * For V4\_5, V4\_5PLUS, V4\_5ALL, V5 and V5\_5 models: 5000 characters
  * Style length limit:
    * For V4 model: 200 characters
    * For V4\_5, V4\_5PLUS, V4\_5ALL, V5 and V5\_5 models: 1000 characters
  * Title length limit:
    * For V4 and V4\_5ALL model: 80 characters
    * For V4\_5, V4\_5PLUS, V5 and V5\_5 models: 100 characters

* When defaultParamFlag is false (Use Default Parameters):
  * Only audioId is required
  * Other parameters will use the original audio's parameters

### Developer Notes

1. Generated files are retained for 15 days
2. Model version must be consistent with the source music
3. This feature is ideal for creating longer compositions by extending existing tracks


## OpenAPI

````yaml /suno-api/suno-api.json POST /api/v1/generate/extend
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
  /api/v1/generate/extend:
    post:
      summary: Extend Music
      operationId: extend-music
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required:
                - defaultParamFlag
                - audioId
                - callBackUrl
                - model
              properties:
                defaultParamFlag:
                  type: boolean
                  description: >-
                    Controls parameter usage mode.  

                    - `true`: Use custom parameters (requires `continueAt`,
                    `prompt`, `style`, and `title`).  

                    - `false`: Use original audio parameters (only `audioId` is
                    required).
                  example: true
                audioId:
                  type: string
                  description: >-
                    Audio ID of the track to extend. This is the source track
                    that will be continued.
                  example: e231****-****-****-****-****8cadc7dc
                prompt:
                  type: string
                  description: >-
                    Description of how the music should be extended. Required
                    when defaultParamFlag is true.
                  example: Extend the music with more relaxing notes
                style:
                  type: string
                  description: Music style, e.g., Jazz, Classical, Electronic
                  example: Classical
                title:
                  type: string
                  description: Music title
                  example: Peaceful Piano Extended
                continueAt:
                  type: number
                  description: >-
                    The time point (in seconds) from which to start extending
                    the music.  

                    - Required when `defaultParamFlag` is `true`.  

                    - Value range: greater than 0 and less than the total
                    duration of the generated audio.  

                    - Specifies the position in the original track where the
                    extension should begin.
                  example: 60
                personaId:
                  type: string
                  description: >-
                    Only available when Custom Mode (`customMode: true`) is
                    enabled. Persona ID to apply to the generated music.
                    Optional. Use this to apply a specific persona style to your
                    music generation. 


                    To generate a persona ID, use the [Generate
                    Persona](https://docs.sunoapi.org/suno-api/generate-persona)
                    endpoint to create a personalized music Persona based on
                    generated music.
                  example: persona_123
                personaModel:
                  type: string
                  description: >-
                    Persona model type to apply when using `personaId`.
                    Optional.  

                    - `style_persona` (default): Applies style-focused persona
                    characteristics.  

                    - `voice_persona`: Applies voice-focused persona
                    characteristics (only available with V5 model).
                  enum:
                    - style_persona
                    - voice_persona
                  default: style_persona
                  example: style_persona
                model:
                  type: string
                  description: >-
                    Model version to use, must be consistent with the source
                    audio.  

                    - Available options:  
                      - **`V5_5`**: Unleash Your Voice: Custom Models Tailored to Your Unique Taste.  
                      - **`V5`**: Superior musical expression, faster generation.  
                      - **`V4_5PLUS`**: V4.5+ is richer sound, new waysto create, max 8 min.  
                      - **`V4_5ALL`**: V4.5-all is better song structure, max 8 min.  
                      - **`V4_5`**: V4.5 is smarter prompts, fastergenerations, max 8 min.  
                      - **`V4`**: V4 is improved vocal quality,max 4 min.
                  enum:
                    - V4
                    - V4_5
                    - V4_5PLUS
                    - V4_5ALL
                    - V5
                    - V5_5
                  example: V4_5ALL
                negativeTags:
                  type: string
                  description: Music styles to exclude from generation
                  example: Relaxing Piano
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
                    The URL to receive task completion notifications when music
                    extension is complete.

                    - For detailed callback format and implementation guide, see
                    [Music Extension
                    Callbacks](https://docs.sunoapi.org/suno-api/extend-music-callbacks)

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
        audioExtend:
          '{$request.body#/callBackUrl}':
            post:
              description: >-
                System will call this callback when audio generation is
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